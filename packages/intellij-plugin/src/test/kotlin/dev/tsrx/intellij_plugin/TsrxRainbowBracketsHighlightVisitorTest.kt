package dev.tsrx.intellij_plugin

import com.intellij.codeInsight.daemon.impl.analysis.HighlightInfoHolder
import com.intellij.lexer.Lexer
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.editor.colors.TextAttributesScheme
import com.intellij.openapi.fileTypes.PlainTextFileType
import com.intellij.psi.PsiFile
import com.intellij.testFramework.fixtures.BasePlatformTestCase

class TsrxRainbowBracketsHighlightVisitorTest : BasePlatformTestCase() {
	fun testCapabilityBoundaryRejectsLinkageFailures() {
		assertNull(
			TsrxRainbowBracketsAdapter.load {
				throw NoClassDefFoundError("incompatible Rainbow Brackets API")
			},
		)

		val runtime = TsrxRainbowBracketsAdapter.load {
			object : TsrxRainbowBracketsRuntime {
				override fun settings(): TsrxRainbowBracketsSettings =
					throw NoSuchMethodError("settings API drift")

				override fun colorKey(
					scheme: TextAttributesScheme,
					kind: TsrxRainbowBracketKind,
					level: Int,
				): TextAttributesKey = throw NoSuchMethodError("color API drift")
			}
		}
		assertNotNull(runtime)
		assertNull(runtime!!.settings())
		assertNull(
			runtime.colorKey(
				EditorColorsManager.getInstance().globalScheme,
				TsrxRainbowBracketKind.ROUND,
				0,
			),
		)
	}

	fun testUnavailableAndIneligiblePathsDoNotAnalyze() {
		val source = """
			(
			value
			)
		""".trimIndent()

		assertEquals(0, collect(source, runtime = null).analyzerRuns)
		assertEquals(0, collect(source, settings = settings(enabled = false)).analyzerRuns)
		assertEquals(0, collect(source, settings = settings(languageBlacklist = setOf("tsrx"))).analyzerRuns)
		assertEquals(
			0,
			collect(
				source,
				settings = settings(skipLargeFiles = true, largeFileLineThreshold = 2),
			).analyzerRuns,
		)
		assertEquals(0, collect(source, settings = settings(numberOfColors = 0)).analyzerRuns)
		assertEquals(0, collect(source, settings = settings(numberOfColors = -1)).analyzerRuns)
		assertEquals(0, collect(source, settings = settings(enabledKinds = emptySet())).analyzerRuns)

		val atThreshold = collect(
			source,
			settings = settings(skipLargeFiles = true, largeFileLineThreshold = 3),
		)
		assertEquals(1, atThreshold.analyzerRuns)
		assertEquals(listOf("ROUND:0"), atThreshold.runtime.requests)
	}

	fun testKindFilteringDoesNotRenumberMixedDepth() {
		val source = """
			function View() @{
				return <Panel value={{ items: [call()] }} />;
			}
		""".trimIndent()
		val allKinds = collect(source)
		val withoutSquares = collect(
			source,
			settings = settings(enabledKinds = TsrxRainbowBracketKind.entries.toSet() - TsrxRainbowBracketKind.SQUARE),
		)

		assertTrue(allKinds.runtime.requests.contains("SQUARE:4"))
		assertTrue(allKinds.runtime.requests.contains("ROUND:5"))
		assertFalse(withoutSquares.runtime.requests.any { it.startsWith("SQUARE:") })
		assertTrue(withoutSquares.runtime.requests.contains("ROUND:5"))
	}

	fun testPerFamilyDepthAndRoundColorOverride() {
		val source = """
			function View() @{
				return <Panel value={{ items: [call()] }} />;
			}
		""".trimIndent()
		val perFamily = collect(source, settings = settings(cycleAcrossAllKinds = false))
		assertEquals(
			listOf("ROUND:0", "CURLY:0", "ANGLE:0", "CURLY:1", "CURLY:2", "SQUARE:0", "ROUND:0"),
			perFamily.runtime.requests,
		)

		val roundColors = collect(source, settings = settings(useRoundColorsForAllKinds = true))
		assertTrue(roundColors.runtime.requests.isNotEmpty())
		assertTrue(roundColors.runtime.requests.all { it.startsWith("ROUND:") })
		assertTrue(roundColors.highlights.any { it.structureKind == TsrxRainbowBracketKind.ANGLE })
	}

	fun testFirstLevelAndEmptyPairFilteringPreserveStructure() {
		val source = "[()]"
		val skipFirst = collect(
			source,
			settings = settings(cycleAcrossAllKinds = false, skipFirstLevel = true),
		)
		assertEquals(emptyList<String>(), skipFirst.runtime.requests)

		val mixedSkipFirst = collect(source, settings = settings(skipFirstLevel = true))
		assertEquals(listOf("ROUND:1"), mixedSkipFirst.runtime.requests)

		val skipEmpty = collect(source, settings = settings(skipEmptyPairs = true))
		assertEquals(listOf("SQUARE:0"), skipEmpty.runtime.requests)
		assertEquals(2, skipEmpty.highlights.size)
	}

	fun testHtmlAndTemplateSettingsSuppressOnlyTheirOwnStructures() {
		val html = collect(
			"const view = <Panel>{call()}</Panel>;",
			settings = settings(rainbowHtmlInsideJs = false),
		)
		assertFalse(html.highlights.any { it.structureKind == TsrxRainbowBracketKind.ANGLE })
		assertFalse(html.highlights.any { it.structureKind == TsrxRainbowBracketKind.CURLY })
		assertTrue(html.highlights.any { it.structureKind == TsrxRainbowBracketKind.ROUND && it.level == 2 })

		val template = collect(
			"const value = `prefix ${'$'}{items[0]}`;",
			settings = settings(skipTemplateStrings = true),
		)
		assertFalse(template.highlights.any { it.structureKind == TsrxRainbowBracketKind.CURLY })
		assertTrue(template.highlights.any { it.structureKind == TsrxRainbowBracketKind.SQUARE && it.level == 1 })
	}

	fun testMissingColorKeySkipsOnlyThatStructure() {
		val result = collect("([])", missingKeys = setOf("SQUARE:1"))

		assertEquals(listOf("ROUND:0", "SQUARE:1"), result.runtime.requests)
		assertTrue(result.highlights.all { it.structureKind == TsrxRainbowBracketKind.ROUND })
	}

	fun testVisitorRunsOnceAtRootAndClearsStateAfterFailure() {
		val file = myFixture.configureByText(TsrxFileType.INSTANCE, "()")
		var analyzerRuns = 0
		var failAnalysis = false
		val runtime = RecordingRuntime(settings())
		val visitor = TsrxRainbowBracketsHighlightVisitor(
			runtimeProvider = { runtime },
			analyzer = { source, lexer, checkCanceled ->
				analyzerRuns += 1
				if (failAnalysis) error("analysis failed")
				TsrxRainbowBracketAnalyzer.analyze(source, lexer, checkCanceled)
			},
			schemeProvider = { EditorColorsManager.getInstance().globalScheme },
		)

		assertTrue(visitor.suitableForFile(file))
		assertFalse(visitor.suitableForFile(myFixture.configureByText(PlainTextFileType.INSTANCE, "()")))
		val holder = HighlightInfoHolder(file)
		visitor.analyze(file, true, holder) {
			visitor.visit(file)
			visitor.visit(file)
		}
		assertEquals(1, analyzerRuns)
		assertEquals(2, holder.size())
		visitor.visit(file)
		assertEquals(1, analyzerRuns)

		failAnalysis = true
		try {
			visitor.analyze(file, true, HighlightInfoHolder(file)) { visitor.visit(file) }
			fail("Expected analysis failure")
		} catch (_: IllegalStateException) {
			// Expected; analyze must still clear holder and root-visit state.
		}
		failAnalysis = false
		visitor.analyze(file, true, HighlightInfoHolder(file)) { visitor.visit(file) }
		assertEquals(3, analyzerRuns)
		assertNotSame(visitor, visitor.clone())
	}

	private fun collect(
		source: String,
		settings: TsrxRainbowBracketsSettings = settings(),
		runtime: RecordingRuntime? = RecordingRuntime(settings),
		missingKeys: Set<String> = emptySet(),
	): Result {
		val file = myFixture.configureByText(TsrxFileType.INSTANCE, source)
		val recordingRuntime = runtime ?: RecordingRuntime(settings)
		recordingRuntime.missingKeys = missingKeys
		var analyzerRuns = 0
		val visitor = TsrxRainbowBracketsHighlightVisitor(
			runtimeProvider = { runtime },
			analyzer = { text, lexer, checkCanceled ->
				analyzerRuns += 1
				TsrxRainbowBracketAnalyzer.analyze(text, lexer, checkCanceled)
			},
			schemeProvider = { EditorColorsManager.getInstance().globalScheme },
		)
		return Result(
			highlights = visitor.collectHighlights(file),
			runtime = recordingRuntime,
			analyzerRuns = analyzerRuns,
		)
	}

	private data class Result(
		val highlights: List<TsrxRainbowBracketHighlight>,
		val runtime: RecordingRuntime,
		val analyzerRuns: Int,
	)

	private class RecordingRuntime(
		private val snapshot: TsrxRainbowBracketsSettings,
	) : TsrxRainbowBracketsRuntime {
		val requests = mutableListOf<String>()
		var missingKeys = emptySet<String>()

		override fun settings(): TsrxRainbowBracketsSettings = snapshot

		override fun colorKey(
			scheme: TextAttributesScheme,
			kind: TsrxRainbowBracketKind,
			level: Int,
		): TextAttributesKey? {
			val request = "$kind:$level"
			requests += request
			return if (request in missingKeys) null else TextAttributesKey.createTextAttributesKey("TSRX.TEST.$request")
		}
	}

	private companion object {
		fun settings(
			enabled: Boolean = true,
			enabledKinds: Set<TsrxRainbowBracketKind> = TsrxRainbowBracketKind.entries.toSet(),
			skipFirstLevel: Boolean = false,
			skipEmptyPairs: Boolean = false,
			languageBlacklist: Set<String> = emptySet(),
			skipLargeFiles: Boolean = false,
			largeFileLineThreshold: Int = 1_000,
			rainbowHtmlInsideJs: Boolean = true,
			useRoundColorsForAllKinds: Boolean = false,
			cycleAcrossAllKinds: Boolean = true,
			skipTemplateStrings: Boolean = false,
			numberOfColors: Int = 5,
		) = TsrxRainbowBracketsSettings(
			enabled = enabled,
			enabledKinds = enabledKinds,
			skipFirstLevel = skipFirstLevel,
			skipEmptyPairs = skipEmptyPairs,
			languageBlacklist = languageBlacklist,
			skipLargeFiles = skipLargeFiles,
			largeFileLineThreshold = largeFileLineThreshold,
			rainbowHtmlInsideJs = rainbowHtmlInsideJs,
			useRoundColorsForAllKinds = useRoundColorsForAllKinds,
			cycleAcrossAllKinds = cycleAcrossAllKinds,
			skipTemplateStrings = skipTemplateStrings,
			numberOfColors = numberOfColors,
		)
	}
}
