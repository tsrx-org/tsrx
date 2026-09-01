package dev.tsrx.intellij_plugin

import com.intellij.lang.ASTNode
import com.intellij.lang.folding.CustomFoldingBuilder
import com.intellij.lang.folding.FoldingDescriptor
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Document
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile

/**
 * Code folding para archivos .tsrx
 *
 * TSRX es TextMate-only (PSI plana sin XmlTag/blocks), por lo que este builder no recorre el AST:
 * escanea el texto del documento en una pasada y emite FoldingDescriptor para:
 *  - Pares de tags `<tag ...> ... </tag>` (ignora self-closing y void elements)
 *  - Bloques balanceados `{ ... }` (@if/@for/@switch/@try/@{}, funciones, objetos)
 *  - Grupos contiguos de `import`
 *
 * El `<` sólo se trata como apertura de tag cuando el carácter previo no es identificador,
 * para no confundir genéricos tipo `Array<string>` con markup. Los template literals
 * (backticks) preservan su contexto: `${...}` vuelve a modo código.
 */
class TsrxFoldingBuilder : CustomFoldingBuilder(), DumbAware {

    init {
        LOG.warn("TSRX folding builder instantiated: ${this::class.qualifiedName}")
    }

    override fun isDumbAware(): Boolean {
        LOG.warn("TSRX folding isDumbAware check")
        return true
    }

    override fun buildLanguageFoldRegions(
        descriptors: MutableList<FoldingDescriptor>,
        root: PsiElement,
        document: Document,
        quick: Boolean
    ) {
        val before = descriptors.size
        val file = root.containingFile ?: (root as? PsiFile)
        LOG.warn(
            "TSRX folding invoked: root=${root::class.simpleName} lang=${root.language.id} " +
                "fileLang=${file?.language?.id} fileName=${file?.name} vf=${file?.virtualFile?.name} " +
                "ext=${file?.virtualFile?.extension} quick=$quick textLen=${document.textLength} lines=${document.lineCount} thread=${Thread.currentThread().name}"
        )
        if (!isTsrxElement(root)) {
            LOG.warn("TSRX folding skipped: isTsrxElement=false for ${file?.name} lang=${file?.language?.id} vfExt=${file?.virtualFile?.extension} rootLang=${root.language.id}")
            if (file?.virtualFile?.extension?.equals("tsrx", true) == true) {
                LOG.warn("TSRX folding forced for .tsrx extension despite language mismatch, proceeding")
            } else {
                return
            }
        }
        val node = root.node
        LOG.warn("TSRX folding node=${node != null} nodeTextLen=${node?.textLength} descriptorsBefore=$before")
        try {
            if (node != null) {
                addImportFolds(descriptors, document, node)
                addTagAndBraceFolds(descriptors, document, node)
            } else {
                LOG.warn("TSRX folding using PsiElement fallback (node null)")
                addImportFoldsForElement(descriptors, document, root)
                addTagAndBraceFoldsForElement(descriptors, document, root)
            }
        } catch (e: Exception) {
            LOG.warn("TSRX folding exception: ${e::class.simpleName}: ${e.message}", e)
        }
        val added = descriptors.size - before
        LOG.warn("TSRX folding done: added=$added total=${descriptors.size} for ${file?.name} quick=$quick")
        if (added == 0) {
            val preview = document.charsSequence.take(300).toString().replace("\n", "\\n")
            LOG.warn("TSRX folding zero descriptors: preview='$preview'")
        } else {
            descriptors.take(5).forEach { d ->
                LOG.warn("TSRX folding descriptor: range=${d.range} placeholder='${d.placeholderText}' element=${d.element?.text?.take(30)?.replace("\n","\\n")}")
            }
        }
    }

    override fun getLanguagePlaceholderText(node: ASTNode, range: TextRange): String = "..."

    override fun isRegionCollapsedByDefault(node: ASTNode): Boolean = false

    private sealed class Frame {
        class Tag(val name: String, val bodyStart: Int) : Frame()
        class Brace(val open: Int) : Frame()
        class Template : Frame()
    }

    private fun addTagAndBraceFolds(descriptors: MutableList<FoldingDescriptor>, document: Document, node: ASTNode) {
        val text = document.charsSequence
        val n = text.length
        val stack = ArrayDeque<Frame>()
        var i = 0
        while (i < n) {
            val inTemplate = stack.isNotEmpty() && stack.last() is Frame.Template
            val c = text[i]
            when {
                inTemplate -> when {
                    c == '\\' -> i += 2
                    c == '`' -> {
                        stack.removeLast()
                        i++
                    }
                    c == '$' && i + 1 < n && text[i + 1] == '{' -> {
                        stack.addLast(Frame.Brace(i))
                        i += 2
                    }
                    else -> i++
                }
                c == '/' && i + 1 < n && text[i + 1] == '/' -> i = skipLineComment(text, i)
                c == '/' && i + 1 < n && text[i + 1] == '*' -> i = skipBlockComment(text, i)
                c == '/' && i + 1 < n && prevAllowsRegex(text, i) -> i = skipRegex(text, i)
                c == '\'' || c == '"' -> i = skipQuoted(text, i, c)
                c == '`' -> {
                    stack.addLast(Frame.Template())
                    i++
                }
                c == '<' && i + 1 < n && text[i + 1] == '/' -> i =
                    handleClosingTag(text, i, stack, descriptors, document, node)
                c == '<' && i + 1 < n && isTagNameStart(text[i + 1]) && prevAllowsTag(text, i) -> {
                    val (endIdx, selfClose, name) = scanOpenTag(text, i + 1)
                    if (endIdx < 0) return
                    if (!selfClose && !isVoidTag(name)) {
                        stack.addLast(Frame.Tag(name, endIdx + 1))
                    }
                    i = endIdx + 1
                }
                c == '{' -> {
                    stack.addLast(Frame.Brace(i))
                    i++
                }
                c == '}' -> {
                    val top = stack.lastOrNull()
                    if (top is Frame.Brace) {
                        stack.removeLast()
                        addBraceFold(descriptors, document, node, top.open, i)
                    }
                    i++
                }
                else -> i++
            }
        }
    }

    private fun addTagAndBraceFoldsForElement(
        descriptors: MutableList<FoldingDescriptor>,
        document: Document,
        element: PsiElement
    ) {
        val text = document.charsSequence
        val n = text.length
        val stack = ArrayDeque<Frame>()
        var i = 0
        while (i < n) {
            val inTemplate = stack.isNotEmpty() && stack.last() is Frame.Template
            val c = text[i]
            when {
                inTemplate -> when {
                    c == '\\' -> i += 2
                    c == '`' -> {
                        stack.removeLast()
                        i++
                    }
                    c == '$' && i + 1 < n && text[i + 1] == '{' -> {
                        stack.addLast(Frame.Brace(i))
                        i += 2
                    }
                    else -> i++
                }
                c == '/' && i + 1 < n && text[i + 1] == '/' -> i = skipLineComment(text, i)
                c == '/' && i + 1 < n && text[i + 1] == '*' -> i = skipBlockComment(text, i)
                c == '/' && i + 1 < n && prevAllowsRegex(text, i) -> i = skipRegex(text, i)
                c == '\'' || c == '"' -> i = skipQuoted(text, i, c)
                c == '`' -> {
                    stack.addLast(Frame.Template())
                    i++
                }
                c == '<' && i + 1 < n && text[i + 1] == '/' -> i =
                    handleClosingTagForElement(text, i, stack, descriptors, document, element)
                c == '<' && i + 1 < n && isTagNameStart(text[i + 1]) && prevAllowsTag(text, i) -> {
                    val (endIdx, selfClose, name) = scanOpenTag(text, i + 1)
                    if (endIdx < 0) return
                    if (!selfClose && !isVoidTag(name)) {
                        stack.addLast(Frame.Tag(name, endIdx + 1))
                    }
                    i = endIdx + 1
                }
                c == '{' -> {
                    stack.addLast(Frame.Brace(i))
                    i++
                }
                c == '}' -> {
                    val top = stack.lastOrNull()
                    if (top is Frame.Brace) {
                        stack.removeLast()
                        addBraceFoldForElement(descriptors, document, element, top.open, i)
                    }
                    i++
                }
                else -> i++
            }
        }
    }

    private fun handleClosingTag(
        text: CharSequence,
        closeStart: Int,
        stack: ArrayDeque<Frame>,
        descriptors: MutableList<FoldingDescriptor>,
        document: Document,
        node: ASTNode
    ): Int {
        val n = text.length
        var j = closeStart + 2
        while (j < n && isTagNameChar(text[j])) j++
        val name = text.subSequence(closeStart + 2, j).toString()
        while (j < n && text[j] != '>') j++
        if (j >= n) return n
        val closeEnd = j + 1
        if (name.isNotEmpty()) {
            val tagIdx = stack.indexOfLast { it is Frame.Tag && it.name == name }
            if (tagIdx >= 0) {
                val tag = stack[tagIdx] as Frame.Tag
                addTagFold(descriptors, document, node, tag.bodyStart, closeStart)
                while (stack.size > tagIdx) stack.removeLast()
            }
        }
        return closeEnd
    }

    private fun handleClosingTagForElement(
        text: CharSequence,
        closeStart: Int,
        stack: ArrayDeque<Frame>,
        descriptors: MutableList<FoldingDescriptor>,
        document: Document,
        element: PsiElement
    ): Int {
        val n = text.length
        var j = closeStart + 2
        while (j < n && isTagNameChar(text[j])) j++
        val name = text.subSequence(closeStart + 2, j).toString()
        while (j < n && text[j] != '>') j++
        if (j >= n) return n
        val closeEnd = j + 1
        if (name.isNotEmpty()) {
            val tagIdx = stack.indexOfLast { it is Frame.Tag && it.name == name }
            if (tagIdx >= 0) {
                val tag = stack[tagIdx] as Frame.Tag
                addTagFoldForElement(descriptors, document, element, tag.bodyStart, closeStart)
                while (stack.size > tagIdx) stack.removeLast()
            }
        }
        return closeEnd
    }

    private fun scanOpenTag(text: CharSequence, nameStart: Int): Triple<Int, Boolean, String> {
        val n = text.length
        var j = nameStart
        while (j < n && isTagNameChar(text[j])) j++
        val name = text.subSequence(nameStart, j).toString()
        var quote = NULL_CHAR
        var brace = 0
        while (j < n) {
            val ch = text[j]
            when {
                quote != NULL_CHAR -> {
                    if (ch == '\\') j++
                    else if (ch == quote) quote = NULL_CHAR
                }
                brace > 0 -> when (ch) {
                    '{' -> brace++
                    '}' -> brace--
                    '\'', '"' -> quote = ch
                    '`' -> j = skipTemplateLiteral(text, j) - 1
                    else -> {}
                }
                ch == '\'' || ch == '"' -> quote = ch
                ch == '{' -> brace++
                ch == '>' -> return Triple(j, text[j - 1] == '/', name)
                else -> {}
            }
            j++
        }
        return Triple(-1, false, name)
    }

    private fun skipTemplateLiteral(text: CharSequence, start: Int): Int {
        val n = text.length
        var j = start + 1
        var brace = 0
        var quote = NULL_CHAR
        while (j < n) {
            val ch = text[j]
            when {
                quote != NULL_CHAR -> {
                    if (ch == '\\') j++
                    else if (ch == quote) quote = NULL_CHAR
                }
                ch == '\\' -> j++
                ch == '`' && brace == 0 -> return j + 1
                ch == '$' && j + 1 < n && text[j + 1] == '{' -> {
                    brace++
                    j++
                }
                ch == '{' && brace > 0 -> brace++
                ch == '}' && brace > 0 -> brace--
                ch == '\'' || ch == '"' -> quote = ch
                else -> {}
            }
            j++
        }
        return n
    }

    private fun skipQuoted(text: CharSequence, start: Int, quote: Char): Int {
        val n = text.length
        var j = start + 1
        while (j < n) {
            val ch = text[j]
            if (ch == '\\') {
                j += 2
                continue
            }
            if (ch == quote) return j + 1
            if (ch == '\n') return j
            j++
        }
        return n
    }

    private fun skipLineComment(text: CharSequence, start: Int): Int {
        val n = text.length
        var j = start + 2
        while (j < n && text[j] != '\n') j++
        return if (j < n) j + 1 else n
    }

    private fun skipBlockComment(text: CharSequence, start: Int): Int {
        val n = text.length
        var j = start + 2
        while (j + 1 < n) {
            if (text[j] == '*' && text[j + 1] == '/') return j + 2
            j++
        }
        return n
    }

    private fun skipRegex(text: CharSequence, start: Int): Int {
        val n = text.length
        var j = start + 1
        var inClass = false
        while (j < n) {
            val ch = text[j]
            when {
                ch == '\\' -> j++
                ch == '\n' -> return start + 1
                ch == '[' -> inClass = true
                ch == ']' -> inClass = false
                ch == '/' && !inClass -> {
                    j++
                    while (j < n && (text[j].isLetterOrDigit() || text[j] == '_')) j++
                    return j
                }
                else -> {}
            }
            j++
        }
        return start + 1
    }

    private fun addTagFold(
        descriptors: MutableList<FoldingDescriptor>,
        document: Document,
        node: ASTNode,
        bodyStart: Int,
        closeStart: Int
    ) {
        if (bodyStart < closeStart && isMultiline(document, bodyStart, closeStart)) {
            descriptors.add(FoldingDescriptor(node, TextRange(bodyStart, closeStart), null, "..."))
        }
    }

    private fun addTagFoldForElement(
        descriptors: MutableList<FoldingDescriptor>,
        document: Document,
        element: PsiElement,
        bodyStart: Int,
        closeStart: Int
    ) {
        if (bodyStart < closeStart && isMultiline(document, bodyStart, closeStart)) {
            descriptors.add(FoldingDescriptor(element, TextRange(bodyStart, closeStart)))
        }
    }

    private fun addBraceFold(
        descriptors: MutableList<FoldingDescriptor>,
        document: Document,
        node: ASTNode,
        open: Int,
        close: Int
    ) {
        val start = open + 1
        if (start < close && isMultiline(document, start, close)) {
            descriptors.add(FoldingDescriptor(node, TextRange(start, close), null, "..."))
        }
    }

    private fun addBraceFoldForElement(
        descriptors: MutableList<FoldingDescriptor>,
        document: Document,
        element: PsiElement,
        open: Int,
        close: Int
    ) {
        val start = open + 1
        if (start < close && isMultiline(document, start, close)) {
            descriptors.add(FoldingDescriptor(element, TextRange(start, close)))
        }
    }

    private fun addImportFolds(descriptors: MutableList<FoldingDescriptor>, document: Document, node: ASTNode) {
        val lineCount = document.lineCount
        var runStart = -1
        var runCount = 0
        var line = 0
        while (line <= lineCount) {
            val isImport = line < lineCount && isImportLine(document, line)
            if (isImport) {
                if (runStart < 0) runStart = line
                runCount++
            } else if (runCount >= 2) {
                val start = document.getLineStartOffset(runStart)
                val end = document.getLineEndOffset(runStart + runCount - 1)
                if (start < end) {
                    descriptors.add(FoldingDescriptor(node, TextRange(start, end), null, "$runCount imports"))
                }
                runStart = -1
                runCount = 0
            } else {
                runStart = -1
                runCount = 0
            }
            line++
        }
    }

    private fun addImportFoldsForElement(
        descriptors: MutableList<FoldingDescriptor>,
        document: Document,
        element: PsiElement
    ) {
        val lineCount = document.lineCount
        var runStart = -1
        var runCount = 0
        var line = 0
        while (line <= lineCount) {
            val isImport = line < lineCount && isImportLine(document, line)
            if (isImport) {
                if (runStart < 0) runStart = line
                runCount++
            } else if (runCount >= 2) {
                val start = document.getLineStartOffset(runStart)
                val end = document.getLineEndOffset(runStart + runCount - 1)
                if (start < end) {
                    descriptors.add(FoldingDescriptor(element, start, end, null, "$runCount imports"))
                }
                runStart = -1
                runCount = 0
            } else {
                runStart = -1
                runCount = 0
            }
            line++
        }
    }

    private fun isImportLine(document: Document, line: Int): Boolean {
        val start = document.getLineStartOffset(line)
        val end = document.getLineEndOffset(line)
        if (start >= end) return false
        val text = document.charsSequence
        var i = start
        while (i < end && (text[i] == ' ' || text[i] == '\t')) i++
        if (end - i < 6 || !text.subSequence(i, i + 6).contentEquals("import")) return false
        val next = i + 6
        return next == end || text[next] == ' ' || text[next] == '\t' || text[next] == '{' || text[next] == '('
    }

    private fun isMultiline(document: Document, start: Int, end: Int): Boolean {
        return document.getLineNumber(start) < document.getLineNumber(end)
    }

    private fun prevAllowsTag(text: CharSequence, ltOffset: Int): Boolean {
        if (ltOffset == 0) return true
        val prev = text[ltOffset - 1]
        return !(prev.isLetterOrDigit() || prev == '_' || prev == '$' || prev == ']' || prev == ')')
    }

    private fun prevAllowsRegex(text: CharSequence, slashOffset: Int): Boolean {
        var i = slashOffset - 1
        while (i >= 0 && (text[i] == ' ' || text[i] == '\t')) i--
        if (i < 0) return true
        return text[i] in REGEX_PREV_CHARS
    }

    private fun isTagNameStart(c: Char): Boolean = c.isLetter() || c == '_'

    private fun isTagNameChar(c: Char): Boolean =
        c.isLetterOrDigit() || c == '_' || c == '-' || c == '$' || c == '.'

    private fun isVoidTag(name: String): Boolean {
        return name.lowercase() in VOID_TAGS
    }

    private fun isTsrxElement(root: PsiElement): Boolean {
        val file: PsiFile = root.containingFile ?: (root as? PsiFile) ?: return false
        if (file.language.isKindOf(TsrxLanguage) || file.language.id == "TSRX") return true
        val vf = file.virtualFile
        return vf != null && vf.extension?.equals("tsrx", ignoreCase = true) == true
    }

    companion object {
        private val LOG = Logger.getInstance(TsrxFoldingBuilder::class.java)
        private const val NULL_CHAR = '\u0000'
        private val VOID_TAGS = setOf(
            "area", "base", "br", "col", "embed", "hr", "img", "input",
            "link", "meta", "param", "source", "track", "wbr"
        )
        private val REGEX_PREV_CHARS = "=(:,!&|?;[+*%^~".toSet()
    }
}
