package dev.tsrx.intellij_plugin

import com.intellij.psi.tree.IElementType

object TsrxTokenTypes {
    @JvmField
    val IDENTIFIER: IElementType = IElementType("TSRX_IDENTIFIER", TsrxLanguage)
}
