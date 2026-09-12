package dev.tsrx.intellij_plugin

import com.intellij.lexer.Lexer
import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.fileTypes.PlainSyntaxHighlighter
import com.intellij.openapi.fileTypes.SyntaxHighlighter
import com.intellij.psi.TokenType
import com.intellij.psi.tree.IElementType
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.nio.file.Path
import kotlin.io.path.readText
import org.jetbrains.plugins.textmate.language.syntax.lexer.TextMateElementType
import org.jetbrains.plugins.textmate.language.syntax.lexer.TextMateScope

class TsrxSyntaxHighlightingTest : BasePlatformTestCase() {
	fun testIssue100RolesMatchTsxReference() {
		val tsx = capture("tsx")
		val tsrx = capture("tsrx")

		for (probe in ROLE_PROBES) {
			assertEquals(
				"Native TSX role for ${probe.text}",
				probe.expectedRole,
				tsx.getValue(probe).normalizedRole(FileKind.TSX),
			)
			assertEquals(
				"TSRX TextMate role for ${probe.text}",
				probe.expectedRole,
				tsrx.getValue(probe).normalizedRole(FileKind.TSRX),
			)
			assertTrue(
				"TSRX must use TextMate for ${probe.text}, not a plain-text fallback",
				tsrx.getValue(probe).tokenType is TextMateElementType,
			)
		}
	}

	fun testAdapterChangesOnlyMembersInsideJsxExpressions() {
		val delegated = TextAttributesKey.createTextAttributesKey("TSRX.TEST.DELEGATED")
		val highlighter = TsrxSyntaxHighlighter(object : SyntaxHighlighter {
			override fun getHighlightingLexer(): Lexer = PlainSyntaxHighlighter().highlightingLexer

			override fun getTokenHighlights(tokenType: IElementType): Array<TextAttributesKey> =
				arrayOf(delegated)
		})

		assertEquals(
			listOf(
				delegated,
				DefaultLanguageHighlighterColors.INSTANCE_FIELD,
				TsrxMemberRoleKeys.INSTANCE_MEMBER_VARIABLE,
			),
			highlighter.getTokenHighlights(textMateToken(*JSX_PROPERTY_SCOPES)).toList(),
		)
		assertEquals(
			listOf(
				delegated,
				DefaultLanguageHighlighterColors.INSTANCE_METHOD,
				TsrxMemberRoleKeys.INSTANCE_MEMBER_FUNCTION,
			),
			highlighter.getTokenHighlights(textMateToken(*JSX_METHOD_SCOPES)).toList(),
		)

		val unchangedTokens = listOf(
			textMateToken("source.tsrx", "support.variable.property.js"),
			textMateToken(*JSX_BASE_SCOPES, "entity.name.tag.js"),
			textMateToken(*JSX_BASE_SCOPES, "entity.other.attribute-name.js"),
			textMateToken(*JSX_BASE_SCOPES, "string.quoted.double.js"),
			textMateToken(*JSX_BASE_SCOPES, "comment.line.double-slash.js"),
			textMateToken(*JSX_BASE_SCOPES, "constant.numeric.decimal.js"),
			textMateToken(*JSX_BASE_SCOPES, "keyword.control.directive.tsrx"),
			textMateToken("source.tsrx", "meta.tag.js", "entity.name.tag.js"),
			textMateToken(*JSX_BASE_SCOPES, "variable.other.readwrite.js"),
			TokenType.BAD_CHARACTER,
		)
		for (token in unchangedTokens) {
			assertEquals(listOf(delegated), highlighter.getTokenHighlights(token).toList())
		}
	}

	private fun capture(extension: String): Map<RoleProbe, TokenEvidence> {
		val source = fixture("issue-100.$extension")
		myFixture.configureByText("issue-100.$extension", source)
		val editor = myFixture.editor as EditorEx
		// TSX member roles are semantic overlays, not EditorHighlighter lexer keys.
		// TSRX has no PSI overlay, so its TextMate syntax keys carry the role.
		val semanticHighlights = if (extension == "tsx") myFixture.doHighlighting() else emptyList()
		return ROLE_PROBES.associateWith { probe ->
			val offset = source.indexOfOccurrence(probe.text, probe.occurrence)
			val iterator = editor.highlighter.createIterator(offset)
			val semanticKeys = semanticHighlights
				.filter { it.startOffset <= offset && offset < it.endOffset }
				.mapNotNull { it.forcedTextAttributesKey ?: it.type.attributesKey }
			TokenEvidence(
				tokenType = iterator.tokenType,
				syntaxKeys = iterator.textAttributesKeys.toList(),
				semanticKeys = semanticKeys,
			)
		}
	}

	private fun TokenEvidence.normalizedRole(fileKind: FileKind): TokenRole? {
		val identities = (syntaxKeys + semanticKeys).flatMapTo(linkedSetOf()) { it.fallbackIdentities() }
		return when (fileKind) {
			FileKind.TSX -> when {
				"TS.INSTANCE_MEMBER_VARIABLE" in identities -> TokenRole.INSTANCE_FIELD
				"TS.INSTANCE_MEMBER_FUNCTION" in identities -> TokenRole.INSTANCE_METHOD
				"XML_TAG_NAME" in identities -> TokenRole.TAG
				"DEFAULT_ATTRIBUTE" in identities -> TokenRole.ATTRIBUTE
				"DEFAULT_TAG" in identities -> TokenRole.DELIMITER
				else -> null
			}

			FileKind.TSRX -> {
				val scopes = (tokenType as? TextMateElementType)?.scope?.names().orEmpty()
				when {
					"TS.INSTANCE_MEMBER_VARIABLE" in identities -> TokenRole.INSTANCE_FIELD
					"TS.INSTANCE_MEMBER_FUNCTION" in identities -> TokenRole.INSTANCE_METHOD
					"entity.name.tag.js" in scopes -> TokenRole.TAG
					"punctuation.definition.tag.begin.js" in scopes ||
						"punctuation.definition.tag.end.js" in scopes -> TokenRole.DELIMITER
					"entity.other.attribute-name.js" in scopes -> TokenRole.ATTRIBUTE
					else -> null
				}
			}
		}
	}

	private fun TextAttributesKey.fallbackIdentities(): List<String> =
		generateSequence(this) { it.fallbackAttributeKey }
			.map(TextAttributesKey::getExternalName)
			.toList()

	private fun TextMateScope.names(): Set<String> = buildSet {
		var current: TextMateScope? = this@names
		while (current != null) {
			add(current.scopeName.toString())
			current = current.parent
		}
	}

	private fun textMateToken(vararg scopes: String): TextMateElementType {
		var scope = TextMateScope.EMPTY
		for (name in scopes) scope = scope.add(name)
		return TextMateElementType(scope)
	}

	private fun fixture(name: String): String =
		Path.of("src/test/resources/highlighting", name).readText()

	private fun String.indexOfOccurrence(text: String, occurrence: Int): Int {
		var offset = -1
		repeat(occurrence + 1) {
			offset = indexOf(text, offset + 1)
			check(offset >= 0) { "Missing occurrence $occurrence of $text" }
		}
		return offset
	}

	private data class TokenEvidence(
		val tokenType: IElementType,
		val syntaxKeys: List<TextAttributesKey>,
		val semanticKeys: List<TextAttributesKey>,
	)

	private data class RoleProbe(
		val text: String,
		val expectedRole: TokenRole,
		val occurrence: Int = 0,
	)

	private enum class FileKind { TSX, TSRX }

	private enum class TokenRole { TAG, DELIMITER, ATTRIBUTE, INSTANCE_FIELD, INSTANCE_METHOD }

	companion object {
		private val ROLE_PROBES = listOf(
			RoleProbe("ul", TokenRole.TAG),
			RoleProbe("<", TokenRole.DELIMITER),
			RoleProbe("key", TokenRole.ATTRIBUTE),
			RoleProbe("className", TokenRole.ATTRIBUTE),
			RoleProbe("length", TokenRole.INSTANCE_FIELD),
			RoleProbe("map", TokenRole.INSTANCE_METHOD),
			RoleProbe("text", TokenRole.INSTANCE_FIELD),
		)
		private val JSX_BASE_SCOPES = arrayOf(
			"source.tsrx",
			"meta.jsx.children.js",
			"meta.embedded.expression.js",
			"source.js.embedded.tsrx",
		)
		private val JSX_PROPERTY_SCOPES = arrayOf(
			*JSX_BASE_SCOPES,
			"support.variable.property.js",
		)
		private val JSX_METHOD_SCOPES = arrayOf(
			*JSX_BASE_SCOPES,
			"meta.function-call.js",
			"entity.name.function.js",
		)
	}
}
