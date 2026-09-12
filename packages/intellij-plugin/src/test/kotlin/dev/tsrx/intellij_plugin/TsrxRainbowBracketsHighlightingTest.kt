package dev.tsrx.intellij_plugin

import com.github.izhangzhihao.rainbow.brackets.RainbowHighlighter
import com.github.izhangzhihao.rainbow.brackets.settings.RainbowSettings
import com.intellij.codeInsight.daemon.DaemonCodeAnalyzer
import com.intellij.codeInsight.daemon.impl.HighlightInfo
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.editor.colors.TextAttributesScheme
import com.intellij.psi.PsiDocumentManager
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.util.xmlb.XmlSerializerUtil

class TsrxRainbowBracketsHighlightingTest : BasePlatformTestCase() {
	private lateinit var rainbowSettings: RainbowSettings
	private lateinit var originalSettings: RainbowSettings

	override fun setUp() {
		super.setUp()
		rainbowSettings = ApplicationManager.getApplication().getService(RainbowSettings::class.java)
		originalSettings = XmlSerializerUtil.createCopy(rainbowSettings)
		configureEnabledSettings()
	}

	override fun tearDown() {
		try {
			rainbowSettings.loadState(originalSettings)
		} finally {
			super.tearDown()
		}
	}

	fun testRealAdapterSnapshotsRainbowBracketsSettings() {
		rainbowSettings.isRainbowEnabled = true
		rainbowSettings.isEnableRainbowRoundBrackets = true
		rainbowSettings.isEnableRainbowSquareBrackets = false
		rainbowSettings.isEnableRainbowSquigglyBrackets = true
		rainbowSettings.isEnableRainbowAngleBrackets = false
		rainbowSettings.isDoNOTRainbowifyTheFirstLevel = true
		rainbowSettings.isDoNOTRainbowifyBracketsWithoutContent = true
		rainbowSettings.languageBlacklist = setOf("TSRX", "Other")
		rainbowSettings.doNOTRainbowifyBigFiles = true
		rainbowSettings.bigFilesLinesThreshold = 321
		rainbowSettings.isRainbowifyHTMLInsideJS = false
		rainbowSettings.applyColorsOfRoundForAllBrackets = true
		rainbowSettings.cycleCountOnAllBrackets = false
		rainbowSettings.doNOTRainbowifyTemplateString = true
		rainbowSettings.numberOfColors = 7

		assertEquals(
			TsrxRainbowBracketsSettings(
				enabled = true,
				enabledKinds = setOf(TsrxRainbowBracketKind.ROUND, TsrxRainbowBracketKind.CURLY),
				skipFirstLevel = true,
				skipEmptyPairs = true,
				languageBlacklist = setOf("TSRX", "Other"),
				skipLargeFiles = true,
				largeFileLineThreshold = 321,
				rainbowHtmlInsideJs = false,
				useRoundColorsForAllKinds = true,
				cycleAcrossAllKinds = false,
				skipTemplateStrings = true,
				numberOfColors = 7,
			),
			checkNotNull(TsrxRainbowBracketsAdapter.load()).settings(),
		)
	}

	fun testRealPluginHighlightsOnlyExpectedMixedPunctuation() {
		val source = fixture("rainbow-brackets.tsrx")
		myFixture.configureByText(TsrxFileType.INSTANCE, source)
		val highlights = myFixture.doHighlighting()
		val scheme = EditorColorsManager.getInstance().globalScheme

		assertKeyAt(highlights, source.indexOf("()"), 1, rainbowKey(scheme, RainbowHighlighter.NAME_ROUND_BRACKETS, 0))
		assertKeyAt(highlights, source.indexOf("()") + 1, 1, rainbowKey(scheme, RainbowHighlighter.NAME_ROUND_BRACKETS, 0))
		assertKeyAt(highlights, source.indexOf("@{") + 1, 1, rainbowKey(scheme, RainbowHighlighter.NAME_SQUIGGLY_BRACKETS, 0))
		assertKeyAt(highlights, source.lastIndexOf('}'), 1, rainbowKey(scheme, RainbowHighlighter.NAME_SQUIGGLY_BRACKETS, 0))

		val fragmentOpen = source.indexOf("<>")
		assertKeyAt(highlights, fragmentOpen, 1, rainbowKey(scheme, RainbowHighlighter.NAME_ANGLE_BRACKETS, 1))
		assertKeyAt(highlights, fragmentOpen + 1, 1, rainbowKey(scheme, RainbowHighlighter.NAME_ANGLE_BRACKETS, 1))
		val fragmentClose = source.indexOf("</>")
		assertKeyAt(highlights, fragmentClose, 2, rainbowKey(scheme, RainbowHighlighter.NAME_ANGLE_BRACKETS, 1))
		assertKeyAt(highlights, fragmentClose + 2, 1, rainbowKey(scheme, RainbowHighlighter.NAME_ANGLE_BRACKETS, 1))

		val panelOpen = source.indexOf("<Panel")
		assertKeyAt(highlights, panelOpen, 1, rainbowKey(scheme, RainbowHighlighter.NAME_ANGLE_BRACKETS, 2))
		assertKeyAt(highlights, source.indexOf("/>", panelOpen), 2, rainbowKey(scheme, RainbowHighlighter.NAME_ANGLE_BRACKETS, 2))
		val attributeOpen = source.indexOf("{{")
		assertKeyAt(highlights, attributeOpen, 1, rainbowKey(scheme, RainbowHighlighter.NAME_SQUIGGLY_BRACKETS, 3))
		assertKeyAt(highlights, attributeOpen + 1, 1, rainbowKey(scheme, RainbowHighlighter.NAME_SQUIGGLY_BRACKETS, 4))
		val attributeClose = source.indexOf("}}", attributeOpen)
		assertKeyAt(highlights, attributeClose, 1, rainbowKey(scheme, RainbowHighlighter.NAME_SQUIGGLY_BRACKETS, 4))
		assertKeyAt(highlights, attributeClose + 1, 1, rainbowKey(scheme, RainbowHighlighter.NAME_SQUIGGLY_BRACKETS, 3))
		assertPairKey(highlights, source, "[call()]", '[', ']', rainbowKey(scheme, RainbowHighlighter.NAME_SQUARE_BRACKETS, 5))
		assertPairKey(highlights, source, "call()", '(', ')', rainbowKey(scheme, RainbowHighlighter.NAME_ROUND_BRACKETS, 6))

		val rainbowKeys = rainbowKeys(scheme, 0..6)
		assertNoRainbowKeyAt(highlights, source.indexOf("< limit"), rainbowKeys)
		assertNoRainbowKeyAt(highlights, source.indexOf("<T>"), rainbowKeys)
		assertNoRainbowKeyAt(highlights, source.indexOf("Panel") + 1, rainbowKeys)
	}

	fun testRealPluginHighlightsDocumentedDynamicTagPunctuation() {
		val source = """
			const view = <{tag}>content</{tag}>;
			const selfClosing = <{tag} />;
		""".trimIndent()
		myFixture.configureByText(TsrxFileType.INSTANCE, source)
		val highlights = myFixture.doHighlighting()
		val angleKey = rainbowKey(
			EditorColorsManager.getInstance().globalScheme,
			RainbowHighlighter.NAME_ANGLE_BRACKETS,
			0,
		)

		val pairedOpen = source.indexOf("<{tag}>")
		assertKeyAt(highlights, pairedOpen, 1, angleKey)
		assertKeyAt(highlights, pairedOpen + 1, 1, angleKey)
		assertKeyAt(highlights, source.indexOf('}', pairedOpen), 1, angleKey)
		assertKeyAt(highlights, source.indexOf('>', pairedOpen), 1, angleKey)
		val pairedClose = source.indexOf("</{tag}>")
		assertKeyAt(highlights, pairedClose, 2, angleKey)
		assertKeyAt(highlights, pairedClose + 2, 1, angleKey)
		assertKeyAt(highlights, source.indexOf('}', pairedClose), 1, angleKey)
		assertKeyAt(highlights, source.indexOf('>', pairedClose), 1, angleKey)

		val selfClosing = source.indexOf("<{tag} />")
		assertKeyAt(highlights, selfClosing, 1, angleKey)
		assertKeyAt(highlights, selfClosing + 1, 1, angleKey)
		assertKeyAt(highlights, source.indexOf('}', selfClosing), 1, angleKey)
		assertKeyAt(highlights, source.indexOf("/>", selfClosing), 2, angleKey)
	}

	fun testSettingAndMalformedEditTransitionsRemoveStaleOverlays() {
		val initial = "([value]); [later]"
		val file = myFixture.configureByText(TsrxFileType.INSTANCE, initial)
		val scheme = EditorColorsManager.getInstance().globalScheme
		val rainbowKeys = rainbowKeys(scheme, 0..2)

		assertTrue(myFixture.doHighlighting().any { it.forcedTextAttributesKey?.externalName in rainbowKeys })
		rainbowSettings.isRainbowEnabled = false
		DaemonCodeAnalyzer.getInstance(project).restart(file)
		assertFalse(myFixture.doHighlighting().any { it.forcedTextAttributesKey?.externalName in rainbowKeys })

		rainbowSettings.isRainbowEnabled = true
		val malformed = "([)]; [later]"
		WriteCommandAction.runWriteCommandAction(project) {
			myFixture.editor.document.setText(malformed)
		}
		PsiDocumentManager.getInstance(project).commitAllDocuments()
		DaemonCodeAnalyzer.getInstance(project).restart(file)
		val highlights = myFixture.doHighlighting()
		for (offset in 0..3) assertNoRainbowKeyAt(highlights, offset, rainbowKeys)
		assertPairKey(
			highlights,
			malformed,
			"[later]",
			'[',
			']',
			rainbowKey(scheme, RainbowHighlighter.NAME_SQUARE_BRACKETS, 0),
		)
	}

	private fun configureEnabledSettings() {
		rainbowSettings.isRainbowEnabled = true
		rainbowSettings.isEnableRainbowRoundBrackets = true
		rainbowSettings.isEnableRainbowSquareBrackets = true
		rainbowSettings.isEnableRainbowSquigglyBrackets = true
		rainbowSettings.isEnableRainbowAngleBrackets = true
		rainbowSettings.isDoNOTRainbowifyTheFirstLevel = false
		rainbowSettings.isDoNOTRainbowifyBracketsWithoutContent = false
		rainbowSettings.languageBlacklist = emptySet()
		rainbowSettings.doNOTRainbowifyBigFiles = false
		rainbowSettings.bigFilesLinesThreshold = 1_000
		rainbowSettings.isRainbowifyHTMLInsideJS = true
		rainbowSettings.applyColorsOfRoundForAllBrackets = false
		rainbowSettings.cycleCountOnAllBrackets = true
		rainbowSettings.doNOTRainbowifyTemplateString = false
		rainbowSettings.numberOfColors = 5
	}

	private fun assertPairKey(
		highlights: List<HighlightInfo>,
		source: String,
		container: String,
		opening: Char,
		closing: Char,
		key: TextAttributesKey,
	) {
		val containerStart = source.indexOf(container)
		assertKeyAt(highlights, containerStart + container.indexOf(opening), 1, key)
		assertKeyAt(highlights, containerStart + container.lastIndexOf(closing), 1, key)
	}

	private fun assertKeyAt(
		highlights: List<HighlightInfo>,
		start: Int,
		length: Int,
		key: TextAttributesKey,
	) {
		val actual = highlights
			.filter { it.startOffset == start && it.endOffset == start + length }
			.mapNotNull { it.forcedTextAttributesKey?.externalName }
		assertTrue("Expected ${key.externalName} at [$start, ${start + length}), got $actual", key.externalName in actual)
	}

	private fun assertNoRainbowKeyAt(
		highlights: List<HighlightInfo>,
		offset: Int,
		rainbowKeys: Set<String>,
	) {
		val actual = highlights
			.filter { it.startOffset <= offset && offset < it.endOffset }
			.mapNotNull { it.forcedTextAttributesKey?.externalName }
		assertTrue("Unexpected Rainbow key at $offset: $actual", actual.none { it in rainbowKeys })
	}

	private fun rainbowKey(
		scheme: TextAttributesScheme,
		family: String,
		level: Int,
	): TextAttributesKey = checkNotNull(
		RainbowHighlighter.INSTANCE.getRainbowColorByLevel(scheme, family, level),
	)

	private fun rainbowKeys(
		scheme: TextAttributesScheme,
		levels: IntRange,
	): Set<String> = buildSet {
		val families = listOf(
			RainbowHighlighter.NAME_ROUND_BRACKETS,
			RainbowHighlighter.NAME_SQUARE_BRACKETS,
			RainbowHighlighter.NAME_SQUIGGLY_BRACKETS,
			RainbowHighlighter.NAME_ANGLE_BRACKETS,
		)
		for (family in families) {
			for (level in levels) add(rainbowKey(scheme, family, level).externalName)
		}
	}

	private fun fixture(name: String): String =
		checkNotNull(javaClass.classLoader.getResource("highlighting/$name")) {
			"Missing highlighting fixture: $name"
		}.readText()

}
