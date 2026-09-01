package dev.tsrx.intellij_plugin

import com.intellij.extapi.psi.PsiFileBase
import com.intellij.openapi.fileTypes.FileType
import com.intellij.psi.FileViewProvider

class TsrxFile(viewProvider: FileViewProvider) : PsiFileBase(viewProvider, TsrxLanguage) {
    override fun getFileType(): FileType = TsrxFileType.INSTANCE
    override fun toString(): String = "TSRX File"
}
