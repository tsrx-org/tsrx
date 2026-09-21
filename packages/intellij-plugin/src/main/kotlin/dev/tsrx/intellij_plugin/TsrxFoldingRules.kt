package dev.tsrx.intellij_plugin

/**
 * Pure, IDE-independent folding rules for `.tsrx` files, extracted for unit
 * testing. [TsrxFoldingBuilder] delegates to these helpers while scanning.
 */
internal object TsrxFoldingRules {

    private val VOID_TAGS = setOf(
        "area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr"
    )

    /**
     * Returns true for void HTML elements that never receive a tag fold.
     *
     * In JSX, a tag starting with an uppercase letter is always a component
     * reference (e.g. `<Link>`), never the void HTML element `<link>`, so such
     * names are never void even though they match case-insensitively.
     */
    fun isVoidTag(name: String): Boolean {
        if (name.isEmpty()) return false
        if (name[0].isUpperCase()) return false
        return name.lowercase() in VOID_TAGS
    }
}
