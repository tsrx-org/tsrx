package dev.tsrx.intellij_plugin

import com.intellij.lexer.Lexer
import com.intellij.openapi.fileTypes.SyntaxHighlighterFactory
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.jetbrains.plugins.textmate.language.syntax.lexer.TextMateElementType
import org.jetbrains.plugins.textmate.language.syntax.lexer.TextMateScope

class TsrxRainbowBracketAnalyzerTest : BasePlatformTestCase() {
	fun testCharacterizesStructuralTextMateScopes() {
		val source = """
			function View() @{
				const value = ({ items: [1] });
				return <><Panel prop={{ x: [call()] }} /></>;
			}
		""".trimIndent()
		val tokens = scopedTokens(source)

		assertTrue(tokens.any { it.text == "(" && it.scopes.first() == "punctuation.definition.parameters.begin.js" })
		assertTrue(tokens.any { it.text == "{" && "punctuation.definition.block.tsrx" in it.scopes })
		assertTrue(tokens.any { it.text == "[" && it.scopes.first() == "meta.brace.square.js" })
		assertTrue(tokens.any { it.text == "{" && it.scopes.first() == "punctuation.section.embedded.begin.js" })
		assertTrue(tokens.any { it.text == "<" && it.scopes.first() == "punctuation.definition.tag.begin.js" })
		assertTrue(tokens.any { it.text == "/>" && it.scopes.first() == "punctuation.definition.tag.end.js" })
	}

	fun testBuildsOneMixedHierarchyAcrossTsrxJsxAndJavaScript() {
		val source = """
			function View() @{
				return <Panel value={{ items: [call()] }}><span>{value}</span></Panel>;
			}
		""".trimIndent()
		val structures = analyze(source).structures

		assertEquals(
			listOf(
				"ROUND:():0:0:ORDINARY",
				"CURLY:{}:0:0:TEMPLATE_BLOCK",
				"ANGLE:<></>:1:0:JSX_TAG",
				"CURLY:{}:2:1:JSX_EXPRESSION",
				"CURLY:{}:3:2:ORDINARY",
				"SQUARE:[]:4:0:ORDINARY",
				"ROUND:():5:0:ORDINARY",
				"ANGLE:<></>:2:1:JSX_TAG",
				"CURLY:{}:3:1:JSX_EXPRESSION",
			),
			structures.map { structure ->
				val punctuation = structure.punctuation.joinToString("") { range ->
					source.substring(range.startOffset, range.endOffset)
				}
				"${structure.kind}:$punctuation:${structure.mixedLevel}:${structure.familyLevel}:${structure.origin}"
			},
		)
	}

	fun testIgnoresLexicalNoiseAndRecoversAfterMalformedInput() {
		val source = """
			const ignored = "{[(<"; // ) ] } >
			const crossed = ([)];
			const later = [value];
			const template = `text { [ ( < ${'$'}{later[0]} end`;
		""".trimIndent()
		val structures = analyze(source).structures

		assertTrue(structures.none { structure ->
			structure.punctuation.any { it.startOffset < source.indexOf("const crossed") }
		})
		assertTrue(structures.describe(source), structures.none { structure ->
			structure.punctuation.any { it.startOffset in source.indexOf("([)") until source.indexOf("([)") + 3 }
		})
		assertTrue(structures.any { it.kind == TsrxRainbowBracketKind.SQUARE && it.span.substring(source) == "[value]" })
		assertTrue(structures.any { it.origin == TsrxRainbowBracketOrigin.TEMPLATE_SUBSTITUTION })
		assertTrue(structures.any { it.kind == TsrxRainbowBracketKind.SQUARE && it.span.substring(source) == "[0]" })
	}

	fun testPairsFragmentsSelfClosingTagsAndRecoversAfterMismatchedTags() {
		val source = """
			const valid = <><A /><B>{value}</B></>;
			const malformed = <A><B></A>;
			const later = <C />;
		""".trimIndent()
		val tags = analyze(source).structures.filter { it.kind == TsrxRainbowBracketKind.ANGLE }

		assertEquals(4, tags.size)
		assertTrue(tags.any { it.span.substring(source) == "<><A /><B>{value}</B></>" })
		assertTrue(tags.any { it.span.substring(source) == "<A />" })
		assertTrue(tags.any { it.span.substring(source) == "<B>{value}</B>" })
		assertTrue(tags.any { it.span.substring(source) == "<C />" })
		assertTrue(tags.none { it.span.substring(source).contains("malformed") })
	}

	fun testDoesNotTreatComparisonsOrTypeParametersAsTags() {
		val source = """
			type Box<T> = { value: T };
			const compared = left < right && right > left;
		""".trimIndent()

		assertTrue(analyze(source).structures.none { it.kind == TsrxRainbowBracketKind.ANGLE })
	}

	fun testMarksOnlyWhitespacePairsEmpty() {
		val source = "const pairs = [(), (  ), (/* content */)];"
		val roundPairs = analyze(source).structures.filter { it.kind == TsrxRainbowBracketKind.ROUND }

		assertEquals(listOf(true, true, false), roundPairs.map { it.isEmpty })
	}

	fun testOperationCountsScaleLinearly() {
		val small = analyze("()[]{}".repeat(200)).operations
		val large = analyze("()[]{}".repeat(400)).operations

		assertTrue("lexer advances must scale linearly", large.lexerAdvances <= small.lexerAdvances * 2 + 2)
		assertTrue("stack work must scale linearly", large.stackOperations <= small.stackOperations * 2 + 2)
		assertTrue("interval work must scale linearly", large.intervalComparisons <= small.intervalComparisons * 2 + 2)
	}

	fun testPropagatesCancellationWithoutRetainedState() {
		val source = "(".repeat(500) + ")".repeat(500)
		var checks = 0
		try {
			analyze(source) {
				checks += 1
				if (checks == 5) throw ProcessCanceledException()
			}
			fail("Expected cancellation")
		} catch (_: ProcessCanceledException) {
			assertEquals(5, checks)
		}

		assertEquals(1, analyze("()").structures.size)
	}

	private fun analyze(
		source: String,
		checkCanceled: () -> Unit = {},
	): TsrxRainbowBracketAnalysis = TsrxRainbowBracketAnalyzer.analyze(
		source,
		lexer(source),
		checkCanceled,
	)

	private fun scopedTokens(source: String): List<ScopedToken> {
		val lexer = lexer(source)
		return buildList {
			while (lexer.tokenType != null) {
				val tokenType = lexer.tokenType
				if (tokenType is TextMateElementType) {
					add(
						ScopedToken(
							text = source.substring(lexer.tokenStart, lexer.tokenEnd),
							scopes = tokenType.scope.names(),
						),
					)
				}
				lexer.advance()
			}
		}
	}

	private fun lexer(source: String): Lexer {
		val file = myFixture.configureByText("analyzer-${source.hashCode()}.tsrx", source)
		return SyntaxHighlighterFactory
			.getSyntaxHighlighter(TsrxLanguage, project, file.virtualFile)
			.highlightingLexer
			.also { it.start(source) }
	}

	private fun TextMateScope.names(): List<String> = buildList {
		var current: TextMateScope? = this@names
		while (current != null) {
			val name = current.scopeName.toString()
			if (name != "null") add(name)
			current = current.parent
		}
	}

	private fun List<TsrxRainbowBracketStructure>.describe(source: String): String = joinToString("\n") { structure ->
		"${structure.kind}:${structure.span.substring(source)}:${structure.punctuation}"
	}

	private data class ScopedToken(
		val text: String,
		val scopes: List<String>,
	)
}
