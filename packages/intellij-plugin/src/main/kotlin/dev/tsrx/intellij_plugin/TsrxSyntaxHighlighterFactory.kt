package dev.tsrx.intellij_plugin

import com.intellij.lexer.Lexer
import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.fileTypes.SyntaxHighlighter
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
		val scopes = textMateToken.scope.names()
		if (!scopes.containsAll(JSX_EXPRESSION_SCOPES)) return delegated

		return when {
			textMateToken.scope.scopeName in PROPERTY_SCOPES ->
				delegated.withMemberRole(
					DefaultLanguageHighlighterColors.INSTANCE_FIELD,
					TsrxMemberRoleKeys.INSTANCE_MEMBER_VARIABLE,
				)

			textMateToken.scope.scopeName == FUNCTION_SCOPE && FUNCTION_CALL_SCOPE in scopes ->
				delegated.withMemberRole(
					DefaultLanguageHighlighterColors.INSTANCE_METHOD,
					TsrxMemberRoleKeys.INSTANCE_MEMBER_FUNCTION,
				)

			else -> delegated
		}
	}

	private fun Array<TextAttributesKey>.withMemberRole(
		platformFallback: TextAttributesKey,
		targetRole: TextAttributesKey,
	): Array<TextAttributesKey> = this + platformFallback + targetRole

	private fun TextMateScope.names(): Set<String> = buildSet {
		var current: TextMateScope? = this@names
		while (current != null) {
			add(current.scopeName.toString())
			current = current.parent
		}
	}

	companion object {
		private val JSX_EXPRESSION_SCOPES = setOf(
			"source.tsrx",
			"meta.jsx.children.js",
			"meta.embedded.expression.js",
		)
		private val PROPERTY_SCOPES = setOf(
			"support.variable.property.js",
			"variable.other.property.js",
		)
		private const val FUNCTION_SCOPE = "entity.name.function.js"
		private const val FUNCTION_CALL_SCOPE = "meta.function-call.js"
	}
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
