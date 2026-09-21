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
 * would always fail — this generator relaxes the file check to "is it a .tsrx file?"
 * but still restricts expansion to appropriate template contexts: abbreviations
 * are NOT expanded inside line/block comments, string literals, or template
 * literal text (only markup and code positions qualify).
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
        val file = callback.file
        if (!isTsrxFile(file)) {
            val context = callback.context
            if (context == null || !isMyContext(context, expandPrimitive)) {
                return false
            }
        }
        // Restrict to appropriate template contexts: never expand inside
        // comments, string literals, or template-literal text.
        val editor = callback.editor
        if (editor != null) {
            val text = editor.document.charsSequence
            val offset = editor.caretModel.offset.coerceIn(0, text.length)
            if (!isExpandableContext(text, offset)) {
                return false
            }
        }
        return true
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

    companion object {
        /**
         * Returns false when [offset] sits inside a line/block comment, a
         * single/double-quoted string, or template-literal text (outside `${ }`).
         * Pure scan of the text before the caret; no PSI required.
         */
        internal fun isExpandableContext(text: CharSequence, offset: Int): Boolean {
        var i = 0
        var quote = '\u0000'
        var inBlockComment = false
        var inTemplate = false
        var templateDepth = 0
        val n = minOf(offset, text.length)
        while (i < n) {
            val c = text[i]
            when {
                inBlockComment -> {
                    if (c == '*' && i + 1 < text.length && text[i + 1] == '/') {
                        inBlockComment = false
                        i += 2
                        continue
                    }
                    i++
                }
                inTemplate && templateDepth == 0 -> {
                    when {
                        c == '\\' -> i += 2
                        c == '`' -> {
                            inTemplate = false
                            i++
                        }
                        c == '$' && i + 1 < text.length && text[i + 1] == '{' -> {
                            templateDepth++
                            i += 2
                        }
                        else -> i++
                    }
                }
                quote != '\u0000' -> {
                    if (c == '\\') {
                        i += 2
                    } else if (c == quote) {
                        quote = '\u0000'
                        i++
                    } else if (c == '\n') {
                        // Strings cannot span lines: an unterminated quote is
                        // an apostrophe in text (e.g. `don't`), not a string.
                        quote = '\u0000'
                        i++
                    } else {
                        i++
                    }
                }
                c == '/' && i + 1 < text.length && text[i + 1] == '/' -> {
                    // Skip to end of line; the caret is inside the comment only
                    // when no newline intervenes before the offset.
                    var j = i + 2
                    while (j < n && text[j] != '\n') j++
                    if (j >= n) return false
                    i = j
                }
                c == '/' && i + 1 < text.length && text[i + 1] == '*' -> {
                    inBlockComment = true
                    i += 2
                }
                c == '\'' || c == '"' -> {
                    quote = c
                    i++
                }
                c == '`' -> {
                    inTemplate = true
                    templateDepth = 0
                    i++
                }
                c == '{' && inTemplate -> {
                    templateDepth++
                    i++
                }
                c == '}' && inTemplate && templateDepth > 0 -> {
                    templateDepth--
                    i++
                }
                else -> i++
            }
        }
        // Inside a block comment, string, or template-literal text: no expansion.
        if (inBlockComment || quote != '\u0000') return false
        if (inTemplate && templateDepth == 0) return false
        return true
        }
    }
}
