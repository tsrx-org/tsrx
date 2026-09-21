package dev.tsrx.intellij_plugin

import com.intellij.lang.BracePair
import com.intellij.lang.PairedBraceMatcher
import com.intellij.psi.PsiFile
import com.intellij.psi.tree.IElementType

/**
 * Brace matching for `.tsrx` files.
 *
 * The matched types are the shared [TsrxTokenTypes] brace types emitted by
 * [TsrxBraceLexer] (wired via [TsrxParserDefinition.createLexer]), so matching
 * operates on actual tokens: braces inside strings, comments and template
 * literal text are lexed as opaque text and never match, while `${ ... }`
 * interpolation braces do.
 */
class TsrxBraceMatcher : PairedBraceMatcher {

	override fun getPairs(): Array<BracePair> = arrayOf(
		BracePair(TsrxTokenTypes.LBRACE, TsrxTokenTypes.RBRACE, false),
		BracePair(TsrxTokenTypes.LBRACKET, TsrxTokenTypes.RBRACKET, false),
		BracePair(TsrxTokenTypes.LPAREN, TsrxTokenTypes.RPAREN, false),
	)

	override fun isPairedBracesAllowedBeforeType(lbraceType: IElementType, contextType: IElementType?): Boolean = true

	override fun getCodeConstructStart(file: PsiFile, openingBraceOffset: Int): Int = openingBraceOffset
}
