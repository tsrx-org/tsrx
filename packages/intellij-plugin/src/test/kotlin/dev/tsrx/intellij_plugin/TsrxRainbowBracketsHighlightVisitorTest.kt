package dev.tsrx.intellij_plugin

import com.intellij.codeInsight.daemon.impl.analysis.HighlightInfoHolder
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.editor.colors.TextAttributesScheme
import com.intellij.openapi.fileTypes.PlainTextFileType
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
		assertEquals(0, collect(source, settings = DEFAULT_SETTINGS.copy(enabled = false)).analyzerRuns)
		assertEquals(0, collect(source, settings = DEFAULT_SETTINGS.copy(languageBlacklist = setOf("tsrx"))).analyzerRuns)
		assertEquals(
			0,
			collect(
				source,
				settings = DEFAULT_SETTINGS.copy(skipLargeFiles = true, largeFileLineThreshold = 2),
			).analyzerRuns,
		)
		assertEquals(0, collect(source, settings = DEFAULT_SETTINGS.copy(numberOfColors = 0)).analyzerRuns)
		assertEquals(0, collect(source, settings = DEFAULT_SETTINGS.copy(numberOfColors = -1)).analyzerRuns)
		assertEquals(0, collect(source, settings = DEFAULT_SETTINGS.copy(enabledKinds = emptySet())).analyzerRuns)

		val atThreshold = collect(
			source,
			settings = DEFAULT_SETTINGS.copy(skipLargeFiles = true, largeFileLineThreshold = 3),
		)
		assertEquals(1, atThreshold.analyzerRuns)
		assertEquals(listOf(request(TsrxRainbowBracketKind.ROUND, 0)), atThreshold.runtime.requests)
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
			settings = DEFAULT_SETTINGS.copy(
				enabledKinds = TsrxRainbowBracketKind.entries.toSet() - TsrxRainbowBracketKind.SQUARE,
			),
		)

		assertTrue(allKinds.runtime.requests.contains(request(TsrxRainbowBracketKind.SQUARE, 4)))
		assertTrue(allKinds.runtime.requests.contains(request(TsrxRainbowBracketKind.ROUND, 5)))
		assertFalse(withoutSquares.runtime.requests.any { it.kind == TsrxRainbowBracketKind.SQUARE })
		assertTrue(withoutSquares.runtime.requests.contains(request(TsrxRainbowBracketKind.ROUND, 5)))
	}

	fun testPerFamilyDepthAndRoundColorOverride() {
		val source = """
			function View() @{
				return <Panel value={{ items: [call()] }} />;
			}
		""".trimIndent()
		val perFamily = collect(source, settings = DEFAULT_SETTINGS.copy(cycleAcrossAllKinds = false))
		assertEquals(
			listOf(
				request(TsrxRainbowBracketKind.ROUND, 0),
				request(TsrxRainbowBracketKind.CURLY, 0),
				request(TsrxRainbowBracketKind.ANGLE, 0),
				request(TsrxRainbowBracketKind.CURLY, 1),
				request(TsrxRainbowBracketKind.CURLY, 2),
				request(TsrxRainbowBracketKind.SQUARE, 0),
			),
			perFamily.runtime.requests,
		)

		val roundColors = collect(source, settings = DEFAULT_SETTINGS.copy(useRoundColorsForAllKinds = true))
		assertTrue(roundColors.runtime.requests.isNotEmpty())
		assertTrue(roundColors.runtime.requests.all { it.kind == TsrxRainbowBracketKind.ROUND })
		assertTrue(roundColors.highlights.any { it.structureKind == TsrxRainbowBracketKind.ANGLE })
	}

	fun testFirstLevelAndEmptyPairFilteringPreserveStructure() {
		val source = "[()]"
		val skipFirst = collect(
			source,
			settings = DEFAULT_SETTINGS.copy(cycleAcrossAllKinds = false, skipFirstLevel = true),
		)
		assertEquals(emptyList<RecordedColorRequest>(), skipFirst.runtime.requests)

		val mixedSkipFirst = collect(source, settings = DEFAULT_SETTINGS.copy(skipFirstLevel = true))
		assertEquals(listOf(request(TsrxRainbowBracketKind.ROUND, 1)), mixedSkipFirst.runtime.requests)

		val skipEmpty = collect(source, settings = DEFAULT_SETTINGS.copy(skipEmptyPairs = true))
		assertEquals(listOf(request(TsrxRainbowBracketKind.SQUARE, 0)), skipEmpty.runtime.requests)
		assertEquals(2, skipEmpty.highlights.size)
	}

	fun testHtmlAndTemplateSettingsSuppressOnlyTheirOwnStructures() {
		val html = collect(
			"const view = <Panel>{call()}</Panel>;",
			settings = DEFAULT_SETTINGS.copy(rainbowHtmlInsideJs = false),
		)
		assertFalse(html.highlights.any { it.structureKind == TsrxRainbowBracketKind.ANGLE })
		assertFalse(html.highlights.any { it.structureKind == TsrxRainbowBracketKind.CURLY })
		assertTrue(html.highlights.any { it.structureKind == TsrxRainbowBracketKind.ROUND && it.level == 2 })

		val template = collect(
			"const value = `prefix ${'$'}{items[0]}`;",
			settings = DEFAULT_SETTINGS.copy(skipTemplateStrings = true),
		)
		assertFalse(template.highlights.any { it.structureKind == TsrxRainbowBracketKind.CURLY })
		assertTrue(template.highlights.any { it.structureKind == TsrxRainbowBracketKind.SQUARE && it.level == 1 })
	}

	fun testMissingColorKeySkipsOnlyThatStructure() {
		val result = collect("([])", missingKeys = setOf(request(TsrxRainbowBracketKind.SQUARE, 1)))

		assertEquals(
			listOf(
				request(TsrxRainbowBracketKind.ROUND, 0),
				request(TsrxRainbowBracketKind.SQUARE, 1),
			),
			result.runtime.requests,
		)
		assertTrue(result.highlights.all { it.structureKind == TsrxRainbowBracketKind.ROUND })
	}

	fun testVisitorRunsOnceAtRootAndClearsStateAfterFailure() {
		val file = myFixture.configureByText(TsrxFileType.INSTANCE, "()")
		var analyzerRuns = 0
		var failAnalysis = false
		val runtime = RecordingRuntime(DEFAULT_SETTINGS)
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
		settings: TsrxRainbowBracketsSettings = DEFAULT_SETTINGS,
		runtime: RecordingRuntime? = RecordingRuntime(settings),
		missingKeys: Set<RecordedColorRequest> = emptySet(),
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

	private data class RecordedColorRequest(
		val kind: TsrxRainbowBracketKind,
		val level: Int,
	)

	private class RecordingRuntime(
		private val snapshot: TsrxRainbowBracketsSettings,
	) : TsrxRainbowBracketsRuntime {
		val requests = mutableListOf<RecordedColorRequest>()
		var missingKeys = emptySet<RecordedColorRequest>()

		override fun settings(): TsrxRainbowBracketsSettings = snapshot

		override fun colorKey(
			scheme: TextAttributesScheme,
			kind: TsrxRainbowBracketKind,
			level: Int,
		): TextAttributesKey? {
			val request = RecordedColorRequest(kind, level)
			requests += request
			return if (request in missingKeys) {
				null
			} else {
				TextAttributesKey.createTextAttributesKey("TSRX.TEST.${request.kind}:${request.level}")
			}
		}
	}

	private companion object {
		val DEFAULT_SETTINGS = TsrxRainbowBracketsSettings(
			enabled = true,
			enabledKinds = TsrxRainbowBracketKind.entries.toSet(),
			skipFirstLevel = false,
			skipEmptyPairs = false,
			languageBlacklist = emptySet(),
			skipLargeFiles = false,
			largeFileLineThreshold = 1_000,
			rainbowHtmlInsideJs = true,
			useRoundColorsForAllKinds = false,
			cycleAcrossAllKinds = true,
			skipTemplateStrings = false,
			numberOfColors = 5,
		)

		fun request(kind: TsrxRainbowBracketKind, level: Int) = RecordedColorRequest(kind, level)
	}
}
