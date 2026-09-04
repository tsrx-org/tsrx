package dev.tsrx.intellij_plugin

import com.intellij.psi.PsiFile
import com.intellij.xml.HtmlXmlExtension

/**
 * Enables HTML/XML behavior (auto-close tag, sync editing, etc.) in .tsrx files.
 * Complementary to TsrxEmmetGenerator — Emmet uses ZenCodingGenerator, not HtmlXmlExtension,
 * but this extension improves general tag editing.
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
