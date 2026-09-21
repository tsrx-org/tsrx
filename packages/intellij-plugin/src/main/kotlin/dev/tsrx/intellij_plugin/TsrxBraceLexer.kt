package dev.tsrx.intellij_plugin

import com.intellij.lexer.LexerBase
import com.intellij.psi.TokenType
import com.intellij.psi.tree.IElementType

/**
 * Minimal real lexer for `.tsrx` files.
 *
 * The previous dummy lexer emitted the entire file as a single `BAD_CHARACTER`,
 * which meant no declared brace token was ever produced and [TsrxBraceMatcher]
 * could never match anything. This lexer tokenizes just enough structure for
 * brace matching:
 *
 * - `{`, `}`, `[`, `]`, `(`, `)` outside strings/comments/templates emit the
 *   shared [TsrxTokenTypes] brace types;
 * - whitespace emits [TokenType.WHITE_SPACE], comments emit
 *   [TsrxTokenTypes.COMMENT];
 * - single/double-quoted strings and template literals are consumed as opaque
 *   [TsrxTokenTypes.TEXT], except `${ ... }` interpolations whose braces ARE
 *   emitted (they are real code braces). A quote with no closing quote on the
 *   same line (e.g. an apostrophe in JSX text like `don't`) is plain text, not
 *   a string;
 * - everything else is coalesced into [TsrxTokenTypes.TEXT] runs.
 */
class TsrxBraceLexer : LexerBase() {
    private var buffer: CharSequence = ""
    private var endOffset: Int = 0
    private var tokenStart: Int = 0
    private var tokenEnd: Int = 0
    private var tokenType: IElementType? = null

    private var inTemplate = false
    private var templateBraceDepth = 0
    private var pendingInterpolationBrace = false

    override fun start(buffer: CharSequence, startOffset: Int, endOffset: Int, initialState: Int) {
        this.buffer = buffer
        this.endOffset = endOffset
        this.tokenStart = startOffset
        this.tokenEnd = startOffset
        this.tokenType = null
        // initialState bit 0 = inTemplate, bit 1 = pendingInterpolationBrace,
        // remaining bits = brace depth.
        this.inTemplate = (initialState and 1) != 0
        this.pendingInterpolationBrace = (initialState and 2) != 0
        this.templateBraceDepth = initialState ushr 2
        if (startOffset < endOffset) {
            advance()
        }
    }

    override fun getState(): Int =
        (templateBraceDepth shl 2) or (if (pendingInterpolationBrace) 2 else 0) or (if (inTemplate) 1 else 0)

    override fun getTokenType(): IElementType? = tokenType

    override fun getTokenStart(): Int = tokenStart

    override fun getTokenEnd(): Int = tokenEnd

    override fun advance() {
        tokenStart = tokenEnd
        if (tokenStart >= endOffset) {
            tokenType = null
            return
        }
        tokenType = if (pendingInterpolationBrace) {
            // Positioned exactly on the `{` of a `${` opener: tokenize as code.
            pendingInterpolationBrace = false
            scanCode(tokenStart)
        } else if (inTemplate && templateBraceDepth == 0) {
            scanTemplateText(tokenStart)
        } else {
            scanCode(tokenStart)
        }
    }

    override fun getBufferSequence(): CharSequence = buffer

    override fun getBufferEnd(): Int = endOffset

    /** Scans template-literal text until the closing backtick, `${`, or EOF. */
    private fun scanTemplateText(start: Int): IElementType {
        var i = start
        while (i < endOffset) {
            val d = buffer[i]
            when {
                d == '\\' -> i += 2
                d == '`' -> {
                    inTemplate = false
                    templateBraceDepth = 0
                    tokenEnd = i + 1
                    return TsrxTokenTypes.TEXT
                }
                d == '$' && i + 1 < endOffset && buffer[i + 1] == '{' -> {
                    // End the text run before `${`; interpolation braces
                    // tokenize as code on the following tokens.
                    if (i == start) {
                        // Token starts exactly on `$`: emit it so the next
                        // token lands on `{` and scans as code.
                        pendingInterpolationBrace = true
                        tokenEnd = i + 1
                    } else {
                        tokenEnd = i
                    }
                    return TsrxTokenTypes.TEXT
                }
                else -> i++
            }
        }
        tokenEnd = endOffset
        return TsrxTokenTypes.TEXT
    }

    private fun scanCode(start: Int): IElementType {
        val c = buffer[start]
        var i = start

        when {
            c.isWhitespace() -> {
                while (i < endOffset && buffer[i].isWhitespace()) i++
                tokenEnd = i
                return TokenType.WHITE_SPACE
            }
            c == '/' && start + 1 < endOffset && buffer[start + 1] == '/' -> {
                while (i < endOffset && buffer[i] != '\n') i++
                tokenEnd = i
                return TsrxTokenTypes.COMMENT
            }
            c == '/' && start + 1 < endOffset && buffer[start + 1] == '*' -> {
                var j = start + 2
                while (j + 1 < endOffset && !(buffer[j] == '*' && buffer[j + 1] == '/')) j++
                tokenEnd = if (j + 1 < endOffset) j + 2 else endOffset
                return TsrxTokenTypes.COMMENT
            }
            c == '\'' || c == '"' -> {
                val close = findLineClosingQuote(start, c)
                // No same-line close: apostrophe in JSX text, not a string.
                tokenEnd = if (close >= 0) close + 1 else start + 1
                return TsrxTokenTypes.TEXT
            }
            c == '`' -> {
                inTemplate = true
                templateBraceDepth = 0
                return scanTemplateText(start + 1)
            }
            c == '{' -> {
                if (inTemplate) templateBraceDepth++
                tokenEnd = start + 1
                return TsrxTokenTypes.LBRACE
            }
            c == '}' -> {
                if (inTemplate && templateBraceDepth > 0) {
                    templateBraceDepth--
                }
                tokenEnd = start + 1
                return TsrxTokenTypes.RBRACE
            }
            c == '[' -> {
                tokenEnd = start + 1
                return TsrxTokenTypes.LBRACKET
            }
            c == ']' -> {
                tokenEnd = start + 1
                return TsrxTokenTypes.RBRACKET
            }
            c == '(' -> {
                tokenEnd = start + 1
                return TsrxTokenTypes.LPAREN
            }
            c == ')' -> {
                tokenEnd = start + 1
                return TsrxTokenTypes.RPAREN
            }
            else -> {
                var j = start + 1
                while (j < endOffset) {
                    val d = buffer[j]
                    if (d.isWhitespace() || d == '{' || d == '}' || d == '[' || d == ']' ||
                        d == '(' || d == ')' || d == '\'' || d == '"' || d == '`' ||
                        (d == '/' && j + 1 < endOffset && (buffer[j + 1] == '/' || buffer[j + 1] == '*'))
                    ) {
                        break
                    }
                    j++
                }
                tokenEnd = j
                return TsrxTokenTypes.TEXT
            }
        }
    }

    /** Index of the closing quote on the same line, or -1 (handles escapes). */
    private fun findLineClosingQuote(start: Int, quote: Char): Int {
        var j = start + 1
        while (j < endOffset) {
            val d = buffer[j]
            if (d == '\\') {
                j += 2
                continue
            }
            if (d == quote) return j
            if (d == '\n') return -1
            j++
        }
        return -1
    }
}
