package dev.tsrx.intellij_plugin

import com.intellij.application.options.emmet.EmmetOptions
import com.intellij.codeInsight.template.CustomTemplateCallback
import com.intellij.codeInsight.template.emmet.generators.XmlZenCodingGeneratorImpl
import com.intellij.lang.Language
import com.intellij.psi.PsiElement

/**
 * Emmet generator for .tsrx files.
 *
 * Enables abbreviation expansion like `div>ul>li*3` with Tab inside TSRX files.
 * Reuses the HTML generation logic from XmlZenCodingGeneratorImpl but matches TsrxLanguage
 * instead of XMLLanguage (which is what the built-in generator would do).
 *
 * TextMate-only: the .tsrx PSI is flat (FileElement without XmlTag), so HtmlTextContextType
 * would always fail — this generator relaxes the context check to "is it a .tsrx file?".
 */
class TsrxEmmetGenerator : XmlZenCodingGeneratorImpl() {

    override fun isMyLanguage(language: Language): Boolean {
        return language.isKindOf(TsrxLanguage) || language.id == "TSRX"
    }

    override fun isMyContext(element: PsiElement, expandPrimitive: Boolean): Boolean {
        // Direct language check (more reliable for TextMate PSI)
        if (element.language.isKindOf(TsrxLanguage) || element.language.id == "TSRX") {
            return true
        }
        val file = element.containingFile ?: return false
        return isTsrxFile(file)
    }

    override fun isMyContext(callback: CustomTemplateCallback, expandPrimitive: Boolean): Boolean {
        val context = callback.context
        if (context != null && isMyContext(context, expandPrimitive)) {
            return true
        }
        // Fallback: check file from callback (covers cases where context is null or is whitespace)
        val file = callback.file
        return isTsrxFile(file)
    }

    override fun isEnabled(): Boolean {
        return EmmetOptions.getInstance().isEmmetEnabled
    }

    override fun isAppliedByDefault(element: PsiElement): Boolean {
        return true
    }

    // XmlZenCodingGeneratorImpl.getSuffix() already returns "html" — we keep it
    // so html/bem filters apply.

    private fun isTsrxFile(file: com.intellij.psi.PsiFile): Boolean {
        if (file.language.isKindOf(TsrxLanguage) || file.language.id == "TSRX") return true
        val vf = file.virtualFile
        if (vf != null && vf.extension?.equals("tsrx", ignoreCase = true) == true) return true
        return file.name.endsWith(".tsrx", ignoreCase = true)
    }
}
