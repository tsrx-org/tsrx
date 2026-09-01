package dev.tsrx.intellij_plugin

import com.intellij.application.options.emmet.EmmetOptions
import com.intellij.codeInsight.template.CustomTemplateCallback
import com.intellij.codeInsight.template.emmet.generators.XmlZenCodingGeneratorImpl
import com.intellij.lang.Language
import com.intellij.psi.PsiElement

/**
 * Emmet generator para archivos .tsrx
 *
 * Habilita expansión de abreviaturas tipo `div>ul>li*3` con Tab dentro de archivos TSRX.
 * Reusa la lógica de generación HTML de XmlZenCodingGeneratorImpl pero matchea TsrxLanguage
 * en lugar de XMLLanguage (que es lo que haría el generador built-in).
 *
 * TextMate-only: la PSI de .tsrx es plana (FileElement sin XmlTag), por lo que HtmlTextContextType
 * siempre fallaría — este generador relaja el check de contexto a "¿es archivo .tsrx?".
 */
class TsrxEmmetGenerator : XmlZenCodingGeneratorImpl() {

    override fun isMyLanguage(language: Language): Boolean {
        return language.isKindOf(TsrxLanguage) || language.id == "TSRX"
    }

    override fun isMyContext(element: PsiElement, expandPrimitive: Boolean): Boolean {
        // Direct language check (más fiable para TextMate PSI)
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
        // Fallback: check file from callback (cubre casos donde context es null o es whitespace)
        val file = callback.file
        return isTsrxFile(file)
    }

    override fun isEnabled(): Boolean {
        return EmmetOptions.getInstance().isEmmetEnabled
    }

    override fun isAppliedByDefault(element: PsiElement): Boolean {
        return true
    }

    // XmlZenCodingGeneratorImpl.getSuffix() ya retorna "html" — lo mantenemos
    // para que filtros html/bem apliquen.

    private fun isTsrxFile(file: com.intellij.psi.PsiFile): Boolean {
        if (file.language.isKindOf(TsrxLanguage) || file.language.id == "TSRX") return true
        val vf = file.virtualFile
        if (vf != null && vf.extension?.equals("tsrx", ignoreCase = true) == true) return true
        return file.name.endsWith(".tsrx", ignoreCase = true)
    }
}
