package dev.tsrx.intellij_plugin

import com.intellij.psi.PsiFile
import com.intellij.xml.HtmlXmlExtension

/**
 * Habilita comportamiento HTML/XML (auto-close tag, sync editing, etc.) en archivos .tsrx
 * Complementario a TsrxEmmetGenerator — Emmet usa ZenCodingGenerator, no HtmlXmlExtension,
 * pero este extension mejora la edición general de tags.
 */
class TsrxXmlExtension : HtmlXmlExtension() {
    override fun isAvailable(file: PsiFile): Boolean {
        val lang = file.language
        if (lang.isKindOf(TsrxLanguage) || lang.id == "TSRX") return true
        val vf = file.viewProvider.virtualFile
        return vf.name.endsWith(".tsrx", ignoreCase = true) ||
            vf.extension?.equals("tsrx", ignoreCase = true) == true
    }
}
