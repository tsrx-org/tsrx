package dev.tsrx.intellij_plugin

import com.intellij.formatting.service.AsyncDocumentFormattingService
import com.intellij.formatting.service.AsyncFormattingRequest
import com.intellij.formatting.service.FormattingService
import com.intellij.openapi.diagnostic.Logger
import com.intellij.psi.PsiFile

class TsrxFormattingService : AsyncDocumentFormattingService() {

    override fun getName(): String = "TSRX Formatter"

    override fun getNotificationGroupId(): String = "TSRX"

    override fun getFeatures(): MutableSet<FormattingService.Feature> = mutableSetOf()

    override fun canFormat(file: PsiFile): Boolean {
        val can = file.name.endsWith(".tsrx", true) ||
            file.virtualFile?.extension?.equals("tsrx", true) == true ||
            file.language.isKindOf(TsrxLanguage) || file.language.id == "TSRX"
        LOG.warn("TSRX formatting canFormat: file=${file.name} lang=${file.language.id} can=$can")
        return can
    }

    override fun createFormattingTask(request: AsyncFormattingRequest): FormattingTask {
        LOG.warn("TSRX formatting task created for ${request.context.containingFile?.name} ranges=${request.formattingRanges}")
        return object : FormattingTask {
            override fun run() {
                try {
                    val original = request.documentText
                    LOG.warn("TSRX formatting started: len=${original.length} preview='${original.take(120).replace("\n","\\n")}'")
                    val formatted = formatTsrx(original)
                    LOG.warn("TSRX formatting done: changed=${formatted != original} len=${formatted.length}")
                    if (formatted != original) {
                        request.onTextReady(formatted)
                    } else {
                        request.onTextReady(original)
                    }
                } catch (e: Exception) {
                    LOG.warn("TSRX formatting failed: ${e.message}", e)
                    request.onError("TSRX formatting failed", e.message ?: e.toString())
                }
            }

            override fun cancel(): Boolean = false
            override fun isRunUnderProgress(): Boolean = true
        }
    }

    private fun formatTsrx(text: String): String {
        if (text.isEmpty()) return text
        val lineSep = when {
            text.contains("\r\n") -> "\r\n"
            else -> "\n"
        }
        val lines = text.split(Regex("\r?\n"))
        val indentSize = 2
        val result = mutableListOf<String>()
        val tagStack = ArrayDeque<String>()
        var braceDepth = 0
        var inBlockComment = false
        var inTemplate = false
        var templateBraceDepth = 0

        for (rawLine in lines) {
            val trimmed = rawLine.trim()
            if (trimmed.isEmpty()) {
                result.add("")
                continue
            }

            // If inside block comment or template, preserve original indent (do not reformat)
            if (inBlockComment || inTemplate) {
                result.add(rawLine.trimEnd())
                // Update state for next line by scanning rawLine
                val state = scanLineState(rawLine, inBlockComment, inTemplate, templateBraceDepth)
                inBlockComment = state.inBlockComment
                inTemplate = state.inTemplate
                templateBraceDepth = state.templateBraceDepth
                continue
            }

            // Determine indent level before this line
            var indentLevel = tagStack.size + braceDepth
            val firstNonWs = trimmed.firstOrNull() ?: ' '
            // Decrease for closing constructs at line start
            when {
                trimmed.startsWith("</") -> indentLevel = maxOf(0, indentLevel - 1)
                trimmed.startsWith("}") -> indentLevel = maxOf(0, indentLevel - 1)
                trimmed.startsWith("@else") || trimmed.startsWith("@empty") ||
                    trimmed.startsWith("@case") || trimmed.startsWith("@default") ||
                    trimmed.startsWith("@catch") || trimmed.startsWith("@pending") -> indentLevel = maxOf(0, indentLevel - 1)
            }

            // Special: line like "} @else {" -> the closing } already accounted, the opening { will be counted after
            result.add(" ".repeat(indentLevel * indentSize) + trimmed)

            // Update stacks for next line by scanning this line's content
            val newState = updateStacksForLine(trimmed, tagStack, braceDepth, inBlockComment, inTemplate, templateBraceDepth)
            // Transfer back
            tagStack.clear()
            tagStack.addAll(newState.tagStack)
            braceDepth = newState.braceDepth
            inBlockComment = newState.inBlockComment
            inTemplate = newState.inTemplate
            templateBraceDepth = newState.templateBraceDepth
        }
        return result.joinToString(lineSep)
    }

    private data class LineState(
        val inBlockComment: Boolean,
        val inTemplate: Boolean,
        val templateBraceDepth: Int
    )

    private data class StackState(
        val tagStack: List<String>,
        val braceDepth: Int,
        val inBlockComment: Boolean,
        val inTemplate: Boolean,
        val templateBraceDepth: Int
    )

    private fun scanLineState(line: String, inBlockComment: Boolean, inTemplate: Boolean, templateBraceDepth: Int): LineState {
        var i = 0
        var block = inBlockComment
        var tmpl = inTemplate
        var brace = templateBraceDepth
        var quote = 0.toChar()
        val n = line.length
        while (i < n) {
            val c = line[i]
            when {
                block -> {
                    if (c == '*' && i + 1 < n && line[i + 1] == '/') {
                        block = false
                        i += 2
                        continue
                    }
                }
                tmpl -> {
                    when {
                        c == '\\' -> i += 2
                        c == '`' && brace == 0 -> {
                            tmpl = false
                            i++
                        }
                        c == '$' && i + 1 < n && line[i + 1] == '{' -> {
                            brace++
                            i += 2
                        }
                        c == '{' && brace > 0 -> brace++
                        c == '}' && brace > 0 -> brace--
                        else -> {}
                    }
                    i++
                    continue
                }
                quote != NULL_CHAR -> {
                    if (c == '\\') i++
                    else if (c == quote) quote = NULL_CHAR
                }
                c == '/' && i + 1 < n && line[i + 1] == '*' -> block = true
                c == '`' -> tmpl = true
                c == '\'' || c == '"' -> quote = c
                else -> {}
            }
            i++
        }
        return LineState(block, tmpl, brace)
    }

    private fun updateStacksForLine(
        line: String,
        prevTags: ArrayDeque<String>,
        prevBrace: Int,
        prevBlock: Boolean,
        prevTemplate: Boolean,
        prevTemplateBrace: Int
    ): StackState {
        val tags = ArrayDeque(prevTags)
        var braceDepth = prevBrace
        var inBlockComment = prevBlock
        var inTemplate = prevTemplate
        var templateBrace = prevTemplateBrace
        var quote = NULL_CHAR
        var i = 0
        val n = line.length
        // If line starts with closing, we already adjusted indent, but need to pop for next line
        // For tag closing at start, the tag is still in stack from previous line, so we should pop it now
        // Our per-line indent already decreased, but stack still contains it - we need to pop before scanning rest of line
        // Handle leading closing
        val trimmed = line.trim()
        if (!inBlockComment && !inTemplate) {
            when {
                trimmed.startsWith("</") -> {
                    val name = parseTagName(trimmed, 2)
                    val idx = tags.indexOfLast { it == name }
                    if (idx >= 0) {
                        while (tags.size > idx) tags.removeLast()
                    }
                }
                trimmed.startsWith("}") -> {
                    if (braceDepth > 0) braceDepth--
                    // Also handle "} @else {" etc - the } already popped, the following { will be pushed later
                }
                trimmed.startsWith("@else") || trimmed.startsWith("@empty") ||
                    trimmed.startsWith("@case") || trimmed.startsWith("@default") ||
                    trimmed.startsWith("@catch") || trimmed.startsWith("@pending") -> {
                    if (braceDepth > 0) braceDepth--
                }
            }
        }

        while (i < n) {
            val c = line[i]
            when {
                inBlockComment -> {
                    if (c == '*' && i + 1 < n && line[i + 1] == '/') {
                        inBlockComment = false
                        i += 2
                        continue
                    }
                }
                inTemplate -> {
                    when {
                        c == '\\' -> i += 2
                        c == '`' && templateBrace == 0 -> {
                            inTemplate = false
                            i++
                        }
                        c == '$' && i + 1 < n && line[i + 1] == '{' -> {
                            braceDepth++
                            templateBrace++
                            i += 2
                        }
                        c == '{' && templateBrace > 0 -> {
                            braceDepth++
                            templateBrace++
                        }
                        c == '}' && templateBrace > 0 -> {
                            braceDepth--
                            templateBrace--
                        }
                        else -> {}
                    }
                    i++
                    continue
                }
                quote != NULL_CHAR -> {
                    if (c == '\\') i++
                    else if (c == quote) quote = NULL_CHAR
                }
                c == '/' && i + 1 < n && line[i + 1] == '*' -> {
                    inBlockComment = true
                    i += 2
                    continue
                }
                c == '/' && i + 1 < n && line[i + 1] == '/' -> break // line comment rest is comment
                c == '\'' || c == '"' -> quote = c
                c == '`' -> inTemplate = true
                c == '<' && i + 1 < n && line[i + 1] == '/' -> {
                    // closing tag inline
                    val name = parseTagName(line, i + 2)
                    val idx = tags.indexOfLast { it == name }
                    if (idx >= 0) {
                        while (tags.size > idx) tags.removeLast()
                    }
                    // skip to >
                    while (i < n && line[i] != '>') i++
                }
                c == '<' && i + 1 < n && isTagNameStart(line[i + 1]) && prevAllowsTag(line, i) -> {
                    val nameEnd = run {
                        var j = i + 1
                        while (j < n && isTagNameChar(line[j])) j++
                        j
                    }
                    val name = line.substring(i + 1, nameEnd)
                    // scan to > to find selfClose
                    var j = nameEnd
                    var q = NULL_CHAR
                    var b = 0
                    var selfClose = false
                    while (j < n) {
                        val ch = line[j]
                        when {
                            q != NULL_CHAR -> {
                                if (ch == '\\') j++
                                else if (ch == q) q = NULL_CHAR
                            }
                            b > 0 -> when (ch) {
                                '{' -> b++
                                '}' -> b--
                                '\'', '"' -> q = ch
                                else -> {}
                            }
                            ch == '\'' || ch == '"' -> q = ch
                            ch == '{' -> b++
                            ch == '>' -> {
                                selfClose = j > 0 && line[j - 1] == '/'
                                break
                            }
                            else -> {}
                        }
                        j++
                    }
                    if (!selfClose && !isVoidTag(name)) {
                        // Check if this opening tag is closed inline on same line: look for </name> after j
                        val closing = "</$name>"
                        if (!line.substring(j).contains(closing)) {
                            tags.addLast(name)
                        }
                    }
                    i = j + 1
                    continue
                }
                c == '{' -> braceDepth++
                c == '}' -> if (braceDepth > 0) braceDepth--
                else -> {}
            }
            i++
        }
        return StackState(tags.toList(), braceDepth, inBlockComment, inTemplate, templateBrace)
    }

    private fun parseTagName(text: String, start: Int): String {
        var j = start
        while (j < text.length && isTagNameChar(text[j])) j++
        return text.substring(start, j)
    }

    private fun isTagNameStart(c: Char): Boolean = c.isLetter() || c == '_'
    private fun isTagNameChar(c: Char): Boolean = c.isLetterOrDigit() || c == '_' || c == '-' || c == '$' || c == '.'
    private fun isVoidTag(name: String): Boolean = name.lowercase() in VOID_TAGS
    private fun prevAllowsTag(text: String, ltOffset: Int): Boolean {
        if (ltOffset == 0) return true
        val prev = text[ltOffset - 1]
        return !(prev.isLetterOrDigit() || prev == '_' || prev == '$' || prev == ']' || prev == ')')
    }

    companion object {
        private val LOG = Logger.getInstance(TsrxFormattingService::class.java)
        private const val NULL_CHAR = '\u0000'
        private val VOID_TAGS = setOf(
            "area", "base", "br", "col", "embed", "hr", "img", "input",
            "link", "meta", "param", "source", "track", "wbr"
        )
    }
}
