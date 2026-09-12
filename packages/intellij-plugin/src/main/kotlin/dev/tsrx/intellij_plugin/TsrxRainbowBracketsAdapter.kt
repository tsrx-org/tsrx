package dev.tsrx.intellij_plugin

import com.github.izhangzhihao.rainbow.brackets.RainbowHighlighter
import com.github.izhangzhihao.rainbow.brackets.settings.RainbowSettings
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.editor.colors.TextAttributesScheme

internal data class TsrxRainbowBracketsSettings(
	val enabled: Boolean,
	val enabledKinds: Set<TsrxRainbowBracketKind>,
	val skipFirstLevel: Boolean,
	val skipEmptyPairs: Boolean,
	val languageBlacklist: Set<String>,
	val skipLargeFiles: Boolean,
	val largeFileLineThreshold: Int,
	val rainbowHtmlInsideJs: Boolean,
	val useRoundColorsForAllKinds: Boolean,
	val cycleAcrossAllKinds: Boolean,
	val skipTemplateStrings: Boolean,
	val numberOfColors: Int,
)

internal interface TsrxRainbowBracketsRuntime {
	fun settings(): TsrxRainbowBracketsSettings?

	fun colorKey(
		scheme: TextAttributesScheme,
		kind: TsrxRainbowBracketKind,
		level: Int,
	): TextAttributesKey?
}

internal object TsrxRainbowBracketsAdapter {
	fun load(): TsrxRainbowBracketsRuntime? = load(::DirectRainbowBracketsRuntime)

	internal fun load(factory: () -> TsrxRainbowBracketsRuntime): TsrxRainbowBracketsRuntime? = try {
		GuardedRainbowBracketsRuntime(factory())
	} catch (_: LinkageError) {
		null
	}
}

private class GuardedRainbowBracketsRuntime(
	private val delegate: TsrxRainbowBracketsRuntime,
) : TsrxRainbowBracketsRuntime {
	override fun settings(): TsrxRainbowBracketsSettings? = try {
		delegate.settings()
	} catch (_: LinkageError) {
		null
	} catch (_: RuntimeException) {
		null
	}

	override fun colorKey(
		scheme: TextAttributesScheme,
		kind: TsrxRainbowBracketKind,
		level: Int,
	): TextAttributesKey? = try {
		delegate.colorKey(scheme, kind, level)
	} catch (_: LinkageError) {
		null
	} catch (_: ArithmeticException) {
		null
	}
}

private class DirectRainbowBracketsRuntime : TsrxRainbowBracketsRuntime {
	override fun settings(): TsrxRainbowBracketsSettings? {
		val settings = ApplicationManager.getApplication().getService(RainbowSettings::class.java)
			?: return null
		return TsrxRainbowBracketsSettings(
			enabled = settings.isRainbowEnabled,
			enabledKinds = buildSet {
				if (settings.isEnableRainbowRoundBrackets) add(TsrxRainbowBracketKind.ROUND)
				if (settings.isEnableRainbowSquareBrackets) add(TsrxRainbowBracketKind.SQUARE)
				if (settings.isEnableRainbowSquigglyBrackets) add(TsrxRainbowBracketKind.CURLY)
				if (settings.isEnableRainbowAngleBrackets) add(TsrxRainbowBracketKind.ANGLE)
			},
			skipFirstLevel = settings.isDoNOTRainbowifyTheFirstLevel,
			skipEmptyPairs = settings.isDoNOTRainbowifyBracketsWithoutContent,
			languageBlacklist = settings.languageBlacklist.toSet(),
			skipLargeFiles = settings.doNOTRainbowifyBigFiles,
			largeFileLineThreshold = settings.bigFilesLinesThreshold,
			rainbowHtmlInsideJs = settings.isRainbowifyHTMLInsideJS,
			useRoundColorsForAllKinds = settings.applyColorsOfRoundForAllBrackets,
			cycleAcrossAllKinds = settings.cycleCountOnAllBrackets,
			skipTemplateStrings = settings.doNOTRainbowifyTemplateString,
			numberOfColors = settings.numberOfColors,
		)
	}

	override fun colorKey(
		scheme: TextAttributesScheme,
		kind: TsrxRainbowBracketKind,
		level: Int,
	): TextAttributesKey? = RainbowHighlighter.INSTANCE.getRainbowColorByLevel(
		scheme,
		when (kind) {
			TsrxRainbowBracketKind.ROUND -> RainbowHighlighter.NAME_ROUND_BRACKETS
			TsrxRainbowBracketKind.SQUARE -> RainbowHighlighter.NAME_SQUARE_BRACKETS
			TsrxRainbowBracketKind.CURLY -> RainbowHighlighter.NAME_SQUIGGLY_BRACKETS
			TsrxRainbowBracketKind.ANGLE -> RainbowHighlighter.NAME_ANGLE_BRACKETS
		},
		level,
	)
}
