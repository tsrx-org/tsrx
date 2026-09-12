package dev.tsrx.intellij_plugin

import com.intellij.codeInsight.daemon.impl.HighlightInfo
import com.intellij.codeInsight.daemon.impl.HighlightInfoType
import com.intellij.codeInsight.daemon.impl.HighlightVisitor
import com.intellij.codeInsight.daemon.impl.analysis.HighlightInfoHolder
import com.intellij.lexer.Lexer
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.editor.colors.TextAttributesScheme
import com.intellij.openapi.fileTypes.SyntaxHighlighterFactory
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile

class TsrxRainbowBracketsHighlightVisitor : HighlightVisitor {
	private val runtimeProvider: () -> TsrxRainbowBracketsRuntime?
	private val analyzer: (CharSequence, Lexer, () -> Unit) -> TsrxRainbowBracketAnalysis
	private val schemeProvider: () -> TextAttributesScheme
	private var holder: HighlightInfoHolder? = null
	private var activeFile: PsiFile? = null
	private var visitedRoot = false

	constructor() : this(
		runtimeProvider = TsrxRainbowBracketsAdapter::load,
		analyzer = TsrxRainbowBracketAnalyzer::analyze,
		schemeProvider = { EditorColorsManager.getInstance().globalScheme },
	)

	internal constructor(
		runtimeProvider: () -> TsrxRainbowBracketsRuntime?,
		analyzer: (CharSequence, Lexer, () -> Unit) -> TsrxRainbowBracketAnalysis,
		schemeProvider: () -> TextAttributesScheme,
	) {
		this.runtimeProvider = runtimeProvider
		this.analyzer = analyzer
		this.schemeProvider = schemeProvider
	}

	override fun suitableForFile(file: PsiFile): Boolean = file.virtualFile.fileType == TsrxFileType.INSTANCE

	override fun analyze(
		file: PsiFile,
		updateWholeFile: Boolean,
		holder: HighlightInfoHolder,
		action: Runnable,
	): Boolean {
		this.holder = holder
		activeFile = file
		visitedRoot = false
		try {
			action.run()
		} finally {
			this.holder = null
			activeFile = null
			visitedRoot = false
		}
		return true
	}

	override fun visit(element: PsiElement) {
		val file = activeFile ?: return
		if (visitedRoot || element !== file) return
		visitedRoot = true
		forEachHighlight(file) { range, key, _, _ ->
			ProgressManager.checkCanceled()
			val info = HighlightInfo
				.newHighlightInfo(HighlightInfoType.INFORMATION)
				.range(range)
				.textAttributes(key)
				.create()
			holder?.add(info)
		}
	}

	public override fun clone(): HighlightVisitor = TsrxRainbowBracketsHighlightVisitor(
		runtimeProvider = runtimeProvider,
		analyzer = analyzer,
		schemeProvider = schemeProvider,
	)

	internal fun collectHighlights(file: PsiFile): List<TsrxRainbowBracketHighlight> = buildList {
		forEachHighlight(file) { range, key, structureKind, level ->
			add(TsrxRainbowBracketHighlight(range, key, structureKind, level))
		}
	}

	private fun forEachHighlight(
		file: PsiFile,
		emit: (TextRange, TextAttributesKey, TsrxRainbowBracketKind, Int) -> Unit,
	) {
		if (!suitableForFile(file)) return
		val runtime = try {
			runtimeProvider()
		} catch (_: LinkageError) {
			return
		} ?: return
		val settings = runtime.settings() ?: return
		val source = file.viewProvider.contents
		if (!settings.isEligible(source, TsrxLanguage.id, ProgressManager::checkCanceled)) return

		val lexer = SyntaxHighlighterFactory
			.getSyntaxHighlighter(TsrxLanguage, file.project, file.virtualFile)
			.highlightingLexer
		val analysis = analyzer(source, lexer, ProgressManager::checkCanceled)
		val scheme = schemeProvider()
		val colorKeys = mutableMapOf<ColorRequest, TextAttributesKey?>()
		for (structure in analysis.structures) {
			ProgressManager.checkCanceled()
			val request = structure.colorRequest(settings) ?: continue
			if (request !in colorKeys) {
				colorKeys[request] = runtime.colorKey(scheme, request.colorKind, request.level)
			}
			val key = colorKeys[request] ?: continue
			for (range in structure.punctuation) {
				emit(range, key, structure.kind, request.level)
			}
		}
	}
}

internal data class TsrxRainbowBracketHighlight(
	val range: TextRange,
	val key: TextAttributesKey,
	val structureKind: TsrxRainbowBracketKind,
	val level: Int,
)

private data class ColorRequest(
	val colorKind: TsrxRainbowBracketKind,
	val level: Int,
)

private fun TsrxRainbowBracketsSettings.isEligible(
	source: CharSequence,
	languageId: String,
	checkCanceled: () -> Unit,
): Boolean {
	if (!enabled || enabledKinds.isEmpty() || numberOfColors <= 0) return false
	if (languageBlacklist.any { it.equals(languageId, ignoreCase = true) }) return false
	if (skipLargeFiles && source.exceedsLineThreshold(largeFileLineThreshold, checkCanceled)) return false
	return true
}

private fun TsrxRainbowBracketStructure.colorRequest(
	settings: TsrxRainbowBracketsSettings,
): ColorRequest? {
	if (kind !in settings.enabledKinds) return null
	if (!settings.rainbowHtmlInsideJs && origin in HTML_INSIDE_JS_ORIGINS) return null
	if (settings.skipTemplateStrings && origin == TsrxRainbowBracketOrigin.TEMPLATE_SUBSTITUTION) return null
	val level = if (settings.cycleAcrossAllKinds) mixedLevel else familyLevel
	if (settings.skipFirstLevel && level == 0) return null
	if (settings.skipEmptyPairs && isEmpty) return null
	return ColorRequest(
		colorKind = if (settings.useRoundColorsForAllKinds) TsrxRainbowBracketKind.ROUND else kind,
		level = level,
	)
}

private fun CharSequence.exceedsLineThreshold(
	threshold: Int,
	checkCanceled: () -> Unit,
): Boolean {
	var lines = 1
	if (lines > threshold) return true
	for (index in indices) {
		if (index % CANCELLATION_INTERVAL == 0) checkCanceled()
		if (this[index] == '\n' && ++lines > threshold) return true
	}
	return false
}

private const val CANCELLATION_INTERVAL = 1_024

private val HTML_INSIDE_JS_ORIGINS = setOf(
	TsrxRainbowBracketOrigin.JSX_EXPRESSION,
	TsrxRainbowBracketOrigin.JSX_TAG,
)
