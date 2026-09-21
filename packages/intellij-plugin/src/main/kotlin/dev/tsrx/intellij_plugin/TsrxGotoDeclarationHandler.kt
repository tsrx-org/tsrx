package dev.tsrx.intellij_plugin

import com.intellij.codeInsight.navigation.actions.GotoDeclarationHandler
import com.intellij.ide.DataManager
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.psi.PsiElement

/**
 * Enables "Go to Declaration or Usages" (Cmd+B) on TSRX definitions.
 *
 * For TextMate-only language (flat PSI), IntelliJ's LSP
 * `textDocument/definition` handler only triggers on *usages*. When the caret is
 * on the *definition* itself (e.g. `export function MyButton`), the definition
 * request resolves to the same location or empty, so Cmd+B does nothing.
 *
 * This handler makes Cmd+B on a definition fall back to Find Usages
 * (textDocument/references) via the existing TsrxFindUsagesProvider + LSP.
 * Anything that is not reliably recognized as a declaration returns null so
 * that LSP's definition lookup handles it.
 *
 * Declaration detection is deliberately strict: the identifier under the caret
 * must be immediately preceded — on the same line — by a declaration keyword
 * (`export function`, `function`, `const`, `let`, `var`, `class`, `type`,
 * `interface`, including `export default function/class`). A merely *nearby*
 * `export function` elsewhere on the line (e.g. the caret on `helper` in
 * `export function App() { return helper(); }`) must NOT take this path.
 */
class TsrxGotoDeclarationHandler : GotoDeclarationHandler {
	companion object {
		private val LOG = Logger.getInstance(TsrxGotoDeclarationHandler::class.java)
		private val DECLARATION_PREFIX = Regex(
			"""^(?:export\s+(?:default\s+)?)?(?:function|class|const|let|var|type|interface)$"""
		)
	}

	override fun getGotoDeclarationTargets(
		sourceElement: PsiElement?,
		offset: Int,
		editor: Editor?,
	): Array<PsiElement>? {
		if (sourceElement == null || editor == null) {
			return null
		}
		val file = sourceElement.containingFile ?: return null
		val vFile = file.virtualFile ?: file.viewProvider.virtualFile
		val isTsrx = file.name.endsWith(".tsrx", true) ||
			vFile?.name?.endsWith(".tsrx", true) == true ||
			vFile?.extension?.equals("tsrx", true) == true ||
			file.language.isKindOf(TsrxLanguage) ||
			file.language.id == "TSRX" ||
			file.fileType === TsrxFileType.INSTANCE
		if (!isTsrx) {
			return null
		}

		if (!isCaretOnDeclaration(file.text ?: return null, editor.caretModel.offset)) {
			// Ordinary usage -> let LSP's GotoDefinition handle it.
			return null
		}

		ApplicationManager.getApplication().invokeLater {
			try {
				val findUsagesAction = ActionManager.getInstance().getAction("FindUsages")
				if (findUsagesAction != null) {
					val dataContext = DataManager.getInstance().getDataContext(editor.component)
					findUsagesAction.actionPerformed(
						AnActionEvent.createFromDataContext("FindUsages", null, dataContext)
					)
				} else {
					LOG.warn("TsrxGotoDeclarationHandler: FindUsages action not found")
				}
			} catch (e: Exception) {
				LOG.warn("TsrxGotoDeclarationHandler: FindUsagesAction failed", e)
			}
		}
		return emptyArray()
	}

	/**
	 * Returns true only when the caret sits inside an identifier that is directly
	 * introduced by a declaration keyword on the same line.
	 */
	internal fun isCaretOnDeclaration(docText: String, caretOffset: Int): Boolean {
		if (docText.isEmpty()) return false
		val caret = caretOffset.coerceIn(0, docText.length)
		if (!isIdentifierChar(docText.getOrNull(caret)) && !isIdentifierChar(docText.getOrNull(caret - 1))) {
			return false
		}
		var wordStart = caret
		while (wordStart > 0 && isIdentifierChar(docText[wordStart - 1])) {
			wordStart--
		}
		var wordEnd = caret
		while (wordEnd < docText.length && isIdentifierChar(docText[wordEnd])) {
			wordEnd++
		}
		if (wordStart == wordEnd) return false

		// Restrict to the current line: a declaration keyword on a previous line
		// must not leak into this decision.
		val lineStart = docText.lastIndexOf('\n', (wordStart - 1).coerceAtLeast(0)).let { if (it < 0) 0 else it + 1 }
		val beforeWord = docText.substring(lineStart, wordStart).trim()
		if (beforeWord.isEmpty()) return false
		return DECLARATION_PREFIX.matches(beforeWord)
	}

	private fun isIdentifierChar(c: Char?): Boolean {
		return c != null && (c.isLetterOrDigit() || c == '_' || c == '$')
	}

	override fun getActionText(context: com.intellij.openapi.actionSystem.DataContext): String? {
		return null
	}
}
