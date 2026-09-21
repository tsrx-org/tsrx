package dev.tsrx.intellij_plugin

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TsrxFoldingRulesTest {

    @Test
    fun `uppercase Link is a component, not the void link element`() {
        // Regression: lowercasing treated `<Link>` as void `<link>` (no fold).
        assertFalse(TsrxFoldingRules.isVoidTag("Link"))
        assertTrue(TsrxFoldingRules.isVoidTag("link"))
    }

    @Test
    fun `common void elements stay void`() {
        assertTrue(TsrxFoldingRules.isVoidTag("br"))
        assertTrue(TsrxFoldingRules.isVoidTag("img"))
        assertTrue(TsrxFoldingRules.isVoidTag("input"))
        assertTrue(TsrxFoldingRules.isVoidTag("hr"))
    }

    @Test
    fun `regular tags and components are not void`() {
        assertFalse(TsrxFoldingRules.isVoidTag("div"))
        assertFalse(TsrxFoldingRules.isVoidTag("MyButton"))
        assertFalse(TsrxFoldingRules.isVoidTag(""))
    }
}
