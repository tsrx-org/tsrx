package dev.tsrx.intellij_plugin

import com.intellij.lang.cacheBuilder.WordsScanner
import com.intellij.lang.findUsages.FindUsagesProvider
import com.intellij.psi.PsiElement

/**
 * Minimal FindUsagesProvider for TSRX.
 *
 * TSRX files are TextMate-only (no custom PSI/lexer). The actual
 * Go to Definition / Find Usages is handled by the LSP server
 * (textDocument/definition + textDocument/references via @tsrx/language-server).
 *
 * This provider only enables the IDE action for TSRX files so that
 * Edit | Find Usages and the context menu are not greyed out when the
 * LSP is still starting. LSP's Find References (2024.2+) will provide
 * the real results; this scanner is a fallback for word-based indexing.
 */
class TsrxFindUsagesProvider : FindUsagesProvider {
	override fun canFindUsagesFor(psiElement: PsiElement): Boolean {
		// Enable for any element inside a TSRX file. The LSP will handle
		// the actual reference search; returning true just makes the action available.
		val file = psiElement.containingFile
		if (file != null && file.language.`is`(TsrxLanguage)) return true
		if (psiElement.language.`is`(TsrxLanguage)) return true
		// Fallback: check file type
		return file?.fileType === TsrxFileType.INSTANCE
	}

	override fun getHelpId(psiElement: PsiElement): String? = null

	override fun getType(element: PsiElement): String = "TSRX symbol"

	override fun getDescriptiveName(element: PsiElement): String = element.text ?: ""

	override fun getNodeText(element: PsiElement, useFullName: Boolean): String = element.text ?: ""

	override fun getWordsScanner(): WordsScanner? {
		// No custom lexer for TextMate-only language; return null so that
		// the IDE delegates to LSP's textDocument/references.
		// A word-based fallback would be inaccurate for TSRX's JSX/template
		// syntax and is not needed when LSP is available.
		return null
	}
}
