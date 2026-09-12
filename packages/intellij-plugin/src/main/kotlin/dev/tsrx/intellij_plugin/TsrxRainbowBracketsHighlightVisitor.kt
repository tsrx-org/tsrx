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
		for (highlight in collectHighlights(file)) {
			ProgressManager.checkCanceled()
			val info = HighlightInfo
				.newHighlightInfo(HighlightInfoType.INFORMATION)
				.range(highlight.range)
				.textAttributes(highlight.key)
				.create()
			holder?.add(info)
		}
	}

	public override fun clone(): HighlightVisitor = TsrxRainbowBracketsHighlightVisitor(
		runtimeProvider = runtimeProvider,
		analyzer = analyzer,
		schemeProvider = schemeProvider,
	)

	internal fun collectHighlights(file: PsiFile): List<TsrxRainbowBracketHighlight> {
		if (!suitableForFile(file)) return emptyList()
		val runtime = try {
			runtimeProvider()
		} catch (_: LinkageError) {
			return emptyList()
		} ?: return emptyList()
		val settings = runtime.settings() ?: return emptyList()
		val source = file.viewProvider.contents
		if (!settings.isEligible(source, TsrxLanguage.id)) return emptyList()

		val lexer = SyntaxHighlighterFactory
			.getSyntaxHighlighter(TsrxLanguage, file.project, file.virtualFile)
			.highlightingLexer
		val analysis = analyzer(source, lexer, ProgressManager::checkCanceled)
		val scheme = schemeProvider()
		return buildList {
			for (structure in analysis.structures) {
				ProgressManager.checkCanceled()
				val request = structure.colorRequest(settings) ?: continue
				val key = runtime.colorKey(scheme, request.colorKind, request.level) ?: continue
				for (range in structure.punctuation) {
					add(
						TsrxRainbowBracketHighlight(
							range = range,
							key = key,
							structureKind = structure.kind,
							colorKind = request.colorKind,
							level = request.level,
						),
					)
				}
			}
		}
	}
}

internal data class TsrxRainbowBracketHighlight(
	val range: TextRange,
	val key: TextAttributesKey,
	val structureKind: TsrxRainbowBracketKind,
	val colorKind: TsrxRainbowBracketKind,
	val level: Int,
)

private data class ColorRequest(
	val colorKind: TsrxRainbowBracketKind,
	val level: Int,
)

private fun TsrxRainbowBracketsSettings.isEligible(
	source: CharSequence,
	languageId: String,
): Boolean {
	if (!enabled || enabledKinds.isEmpty() || numberOfColors <= 0) return false
	if (languageBlacklist.any { it.equals(languageId, ignoreCase = true) }) return false
	if (skipLargeFiles && source.lineCount() > largeFileLineThreshold) return false
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

private fun CharSequence.lineCount(): Int {
	var lines = 1
	for (character in this) if (character == '\n') lines += 1
	return lines
}

private val HTML_INSIDE_JS_ORIGINS = setOf(
	TsrxRainbowBracketOrigin.JSX_EXPRESSION,
	TsrxRainbowBracketOrigin.JSX_TAG,
)
