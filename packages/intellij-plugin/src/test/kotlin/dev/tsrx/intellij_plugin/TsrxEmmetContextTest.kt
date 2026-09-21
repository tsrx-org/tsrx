package dev.tsrx.intellij_plugin

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TsrxEmmetContextTest {

    @Test
    fun `markup position is expandable`() {
        val doc = "export function A() @{\n  return <div>\n    \n  </div>\n}"
        assertTrue(TsrxEmmetGenerator.isExpandableContext(doc, doc.indexOf("</div>")))
    }

    @Test
    fun `line comment is not expandable`() {
        val doc = "<div>\n  // div>ul\n</div>"
        assertFalse(TsrxEmmetGenerator.isExpandableContext(doc, doc.indexOf("ul")))
    }

    @Test
    fun `code after a line comment is expandable`() {
        val doc = "// comment\ndiv"
        assertTrue(TsrxEmmetGenerator.isExpandableContext(doc, doc.length))
    }

    @Test
    fun `block comment is not expandable`() {
        val doc = "<div>/* span */</div>"
        assertFalse(TsrxEmmetGenerator.isExpandableContext(doc, doc.indexOf("span")))
    }

    @Test
    fun `string literal is not expandable`() {
        val doc = "const s = \"div>ul\";"
        assertFalse(TsrxEmmetGenerator.isExpandableContext(doc, doc.indexOf(">")))
    }

    @Test
    fun `template literal text is not expandable`() {
        val doc = "const s = `div>ul`;"
        assertFalse(TsrxEmmetGenerator.isExpandableContext(doc, doc.indexOf(">")))
    }

    @Test
    fun `apostrophe in text does not poison later positions`() {
        // `don't` must not open a string that swallows the rest of the file.
        val doc = "<div>\n  don't\n</div>\ndiv"
        assertTrue(TsrxEmmetGenerator.isExpandableContext(doc, doc.length))
    }
}
