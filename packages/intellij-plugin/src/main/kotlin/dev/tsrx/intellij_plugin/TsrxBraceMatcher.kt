package dev.tsrx.intellij_plugin

import com.intellij.lang.BracePair
import com.intellij.lang.PairedBraceMatcher
import com.intellij.psi.PsiFile
import com.intellij.psi.tree.IElementType

class TsrxBraceMatcher : PairedBraceMatcher {
	companion object {
		private val LBRACE = IElementType("LBRACE", TsrxLanguage)
		private val RBRACE = IElementType("RBRACE", TsrxLanguage)
		private val LBRACKET = IElementType("LBRACKET", TsrxLanguage)
		private val RBRACKET = IElementType("RBRACKET", TsrxLanguage)
		private val LPAREN = IElementType("LPAREN", TsrxLanguage)
		private val RPAREN = IElementType("RPAREN", TsrxLanguage)
	}

	override fun getPairs(): Array<BracePair> = arrayOf(
		BracePair(LBRACE, RBRACE, false),
		BracePair(LBRACKET, RBRACKET, false),
		BracePair(LPAREN, RPAREN, false),
	)

	override fun isPairedBracesAllowedBeforeType(lbraceType: IElementType, contextType: IElementType?): Boolean = true

	override fun getCodeConstructStart(file: PsiFile, openingBraceOffset: Int): Int = openingBraceOffset
}
