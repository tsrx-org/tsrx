package dev.tsrx.intellij_plugin

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TsrxGotoDeclarationHandlerTest {

    private val handler = TsrxGotoDeclarationHandler()

    @Test
    fun `caret on declared function name is a declaration`() {
        val doc = "export function App() {\n  return 1;\n}"
        val caret = doc.indexOf("App") + 1
        assertTrue(handler.isCaretOnDeclaration(doc, caret))
    }

    @Test
    fun `caret on usage after nested declaration is not a declaration`() {
        // Regression: the old heuristic treated a nearby `export function` as
        // evidence and routed `helper` to Find Usages instead of LSP definition.
        val doc = "export function App() { return helper(); }"
        val caret = doc.indexOf("helper") + 2
        assertFalse(handler.isCaretOnDeclaration(doc, caret))
    }

    @Test
    fun `caret on const name is a declaration`() {
        val doc = "const MyButton = () => <div/>;"
        val caret = doc.indexOf("MyButton") + 2
        assertTrue(handler.isCaretOnDeclaration(doc, caret))
    }

    @Test
    fun `caret on export default function name is a declaration`() {
        val doc = "export default function Page() @{ return <div/> }"
        val caret = doc.indexOf("Page") + 1
        assertTrue(handler.isCaretOnDeclaration(doc, caret))
    }

    @Test
    fun `caret on class name is a declaration`() {
        val doc = "export class Store {}"
        val caret = doc.indexOf("Store") + 1
        assertTrue(handler.isCaretOnDeclaration(doc, caret))
    }

    @Test
    fun `caret on JSX usage is not a declaration`() {
        val doc = "export function App() {\n  return <MyButton/>;\n}"
        val caret = doc.indexOf("MyButton") + 2
        assertFalse(handler.isCaretOnDeclaration(doc, caret))
    }

    @Test
    fun `caret on call expression callee is not a declaration`() {
        val doc = "function run() {\n  helper();\n}"
        val caret = doc.indexOf("helper") + 1
        assertFalse(handler.isCaretOnDeclaration(doc, caret))
    }

    @Test
    fun `caret on whitespace is not a declaration`() {
        val doc = "export function App() {}"
        assertFalse(handler.isCaretOnDeclaration(doc, doc.indexOf(" ")))
    }
}
