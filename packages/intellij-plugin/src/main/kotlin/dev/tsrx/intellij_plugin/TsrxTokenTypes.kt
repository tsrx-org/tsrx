package dev.tsrx.intellij_plugin

import com.intellij.psi.tree.IElementType

object TsrxTokenTypes {
    @JvmField
    val IDENTIFIER: IElementType = IElementType("TSRX_IDENTIFIER", TsrxLanguage)

    @JvmField
    val LBRACE: IElementType = IElementType("TSRX_LBRACE", TsrxLanguage)

    @JvmField
    val RBRACE: IElementType = IElementType("TSRX_RBRACE", TsrxLanguage)

    @JvmField
    val LBRACKET: IElementType = IElementType("TSRX_LBRACKET", TsrxLanguage)

    @JvmField
    val RBRACKET: IElementType = IElementType("TSRX_RBRACKET", TsrxLanguage)

    @JvmField
    val LPAREN: IElementType = IElementType("TSRX_LPAREN", TsrxLanguage)

    @JvmField
    val RPAREN: IElementType = IElementType("TSRX_RPAREN", TsrxLanguage)

    @JvmField
    val COMMENT: IElementType = IElementType("TSRX_COMMENT", TsrxLanguage)

    @JvmField
    val TEXT: IElementType = IElementType("TSRX_TEXT", TsrxLanguage)
}
