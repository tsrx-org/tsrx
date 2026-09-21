package dev.tsrx.intellij_plugin

import com.intellij.psi.tree.IElementType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TsrxBraceLexerTest {

    private data class Token(val type: IElementType?, val text: String)

    private fun lex(text: String): List<Token> {
        val lexer = TsrxBraceLexer()
        lexer.start(text, 0, text.length, 0)
        val out = mutableListOf<Token>()
        while (lexer.tokenType != null) {
            out.add(Token(lexer.tokenType, text.substring(lexer.tokenStart, lexer.tokenEnd)))
            lexer.advance()
        }
        return out
    }

    @Test
    fun `tokens cover the whole buffer contiguously`() {
        val text = "export function App() @{ return <div className=\"x\">hi</div> }"
        val tokens = lex(text)
        var offset = 0
        for (token in tokens) {
            assertEquals(text.substring(offset, offset + token.text.length), token.text)
            offset += token.text.length
        }
        assertEquals(text.length, offset)
    }

    @Test
    fun `code braces emit shared brace types`() {
        val text = "function f() { return [1]; }"
        val tokens = lex(text)
        val kinds = tokens.map { it.type }
        assertTrue(kinds.contains(TsrxTokenTypes.LBRACE))
        assertTrue(kinds.contains(TsrxTokenTypes.RBRACE))
        assertTrue(kinds.contains(TsrxTokenTypes.LBRACKET))
        assertTrue(kinds.contains(TsrxTokenTypes.RBRACKET))
        assertTrue(kinds.contains(TsrxTokenTypes.LPAREN))
        assertTrue(kinds.contains(TsrxTokenTypes.RPAREN))
        // `{` `}` offsets line up with the source.
        assertEquals("{", tokens.first { it.type == TsrxTokenTypes.LBRACE }.text)
        assertEquals(text.indexOf("{"), text.indexOf(tokens.first { it.type == TsrxTokenTypes.LBRACE }.text))
    }

    @Test
    fun `braces inside strings and comments do not emit brace tokens`() {
        val text = "const a = \"{\"; // }\n/* { */ const b = '}';"
        val tokens = lex(text)
        val braces = tokens.filter {
            it.type == TsrxTokenTypes.LBRACE || it.type == TsrxTokenTypes.RBRACE
        }
        assertTrue("expected no brace tokens, got $braces", braces.isEmpty())
    }

    @Test
    fun `braces inside template text do not emit but interpolation braces do`() {
        val text = "const s = `a{b}c${'$'}{ { x: 1 } }`;"
        val tokens = lex(text)
        val braces = tokens.filter {
            it.type == TsrxTokenTypes.LBRACE || it.type == TsrxTokenTypes.RBRACE
        }
        // `${`, inner `{`, inner `}`, final `}` of the interpolation.
        assertEquals(4, braces.size)
    }

    @Test
    fun `apostrophe in JSX text does not swallow the closing tag`() {
        val text = "<div>\n  don't\n</div>"
        val tokens = lex(text)
        assertTrue(
            "closing tag lost in tokens: $tokens",
            tokens.any { it.text.contains("</div>") }
        )
    }
}
