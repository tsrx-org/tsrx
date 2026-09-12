package dev.tsrx.intellij_plugin

import com.intellij.lexer.Lexer
import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.fileTypes.SyntaxHighlighter
import com.intellij.openapi.fileTypes.SyntaxHighlighterBase
import com.intellij.openapi.fileTypes.SyntaxHighlighterFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.tree.IElementType
import org.jetbrains.plugins.textmate.language.syntax.highlighting.TextMateSyntaxHighlighterFactory
import org.jetbrains.plugins.textmate.language.syntax.lexer.TextMateElementType
import org.jetbrains.plugins.textmate.language.syntax.lexer.TextMateScope

class TsrxSyntaxHighlighterFactory : SyntaxHighlighterFactory() {
	private val textMateFactory = TextMateSyntaxHighlighterFactory()

	override fun getSyntaxHighlighter(project: Project?, virtualFile: VirtualFile?): SyntaxHighlighter =
		TsrxSyntaxHighlighter(textMateFactory.getSyntaxHighlighter(project, virtualFile))
}

internal class TsrxSyntaxHighlighter(
	private val delegate: SyntaxHighlighter,
) : SyntaxHighlighter {
	override fun getHighlightingLexer(): Lexer = delegate.highlightingLexer

	override fun getTokenHighlights(tokenType: IElementType): Array<TextAttributesKey> {
		val delegated = delegate.getTokenHighlights(tokenType)
		val textMateToken = tokenType as? TextMateElementType ?: return delegated
		val leafScope = textMateToken.scope.scopeName.toString()
		val memberRole = when {
			leafScope in PROPERTY_SCOPES -> MemberRole.PROPERTY
			leafScope == FUNCTION_SCOPE -> MemberRole.FUNCTION
			else -> return delegated
		}
		if (!textMateToken.scope.isJsxExpressionMember(memberRole)) return delegated

		return when (memberRole) {
			MemberRole.PROPERTY ->
				SyntaxHighlighterBase.pack(
					delegated,
					DefaultLanguageHighlighterColors.INSTANCE_FIELD,
					TsrxMemberRoleKeys.INSTANCE_MEMBER_VARIABLE,
				)

			MemberRole.FUNCTION ->
				SyntaxHighlighterBase.pack(
					delegated,
					DefaultLanguageHighlighterColors.INSTANCE_METHOD,
					TsrxMemberRoleKeys.INSTANCE_MEMBER_FUNCTION,
				)
		}
	}

	private fun TextMateScope.isJsxExpressionMember(memberRole: MemberRole): Boolean {
		var hasSource = false
		var hasJsxContext = false
		var hasEmbeddedExpression = false
		var hasFunctionCall = memberRole != MemberRole.FUNCTION
		var current: TextMateScope? = this
		while (current != null) {
			when (current.scopeName.toString()) {
				SOURCE_SCOPE -> hasSource = true
				JSX_CHILDREN_SCOPE, JSX_ATTRIBUTES_SCOPE -> hasJsxContext = true
				EMBEDDED_EXPRESSION_SCOPE -> hasEmbeddedExpression = true
				FUNCTION_CALL_SCOPE -> hasFunctionCall = true
			}
			current = current.parent
		}
		return hasSource && hasJsxContext && hasEmbeddedExpression && hasFunctionCall
	}

	companion object {
		private val PROPERTY_SCOPES = setOf(
			"support.variable.property.js",
			"variable.other.property.js",
		)
		private const val SOURCE_SCOPE = "source.tsrx"
		private const val JSX_CHILDREN_SCOPE = "meta.jsx.children.js"
		private const val JSX_ATTRIBUTES_SCOPE = "meta.tag.attributes.js"
		private const val EMBEDDED_EXPRESSION_SCOPE = "meta.embedded.expression.js"
		private const val FUNCTION_SCOPE = "entity.name.function.js"
		private const val FUNCTION_CALL_SCOPE = "meta.function-call.js"
	}

	private enum class MemberRole { PROPERTY, FUNCTION }
}

internal object TsrxMemberRoleKeys {
	// Referencing WebStorm's role by external identity keeps this plugin loadable on
	// products that provide TextMate without the JavaScript plugin. The platform key
	// returned alongside it is the fallback when that optional role is not styled.
	val INSTANCE_MEMBER_VARIABLE: TextAttributesKey = TextAttributesKey.createTextAttributesKey(
		"TSRX.INSTANCE_MEMBER_VARIABLE",
		TextAttributesKey.find("TS.INSTANCE_MEMBER_VARIABLE"),
	)
	val INSTANCE_MEMBER_FUNCTION: TextAttributesKey = TextAttributesKey.createTextAttributesKey(
		"TSRX.INSTANCE_MEMBER_FUNCTION",
		TextAttributesKey.find("TS.INSTANCE_MEMBER_FUNCTION"),
	)
}
