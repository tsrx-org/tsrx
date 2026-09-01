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
 * Enables \"Go to Declaration or Usages\" (Cmd+B) on TSRX definitions.
 *
 * For TextMate-only language (no PSI), IntelliJ's default handler for
 * LSP (textDocument/definition) only triggers when caret is on a *usage*.
 * When caret is on the *definition* itself (e.g. `export function MyButton`),
 * textDocument/definition returns the same location or empty, so Cmd+B does nothing.
 *
 * This handler makes Cmd+B on a definition fall back to Find Usages
 * (textDocument/references) via the existing TsrxFindUsagesProvider + LSP.
 *
 * Logic: if the element is inside a TSRX file and looks like a declaration
 * (previous text contains `function`, `const`, `let`, `class`), return the element
 * itself as a target. Then GotoDeclarationOrUsagesHandler2 detects that the target
 * is the source itself and shows the usages popup (which will be populated by LSP).
 * Otherwise return null to let LSP's definition handler run normally.
 */
class TsrxGotoDeclarationHandler : GotoDeclarationHandler {
	companion object {
		private val LOG = Logger.getInstance(TsrxGotoDeclarationHandler::class.java)
	}

	override fun getGotoDeclarationTargets(
		sourceElement: PsiElement?,
		offset: Int,
		editor: Editor?,
	): Array<PsiElement>? {
		LOG.warn("TsrxGotoDeclarationHandler CALLED: source=${sourceElement?.text?.take(30)} offset=$offset file=${sourceElement?.containingFile?.name} lang=${sourceElement?.containingFile?.language} fileType=${sourceElement?.containingFile?.fileType?.name} elementType=${sourceElement?.node?.elementType}")
		if (sourceElement == null) {
			LOG.warn("TsrxGotoDeclarationHandler: sourceElement null -> return null")
			return null
		}
		val file = sourceElement.containingFile
		if (file == null) {
			LOG.warn("TsrxGotoDeclarationHandler: containingFile null -> return null")
			return null
		}
		val vFile = file.virtualFile ?: file.viewProvider.virtualFile
		val isTsrxByName = file.name.endsWith(".tsrx") || vFile?.name?.endsWith(".tsrx") == true || vFile?.extension == "tsrx"
		val isTsrxByLang = file.language.`is`(TsrxLanguage)
		val isTsrxByType = file.fileType === TsrxFileType.INSTANCE
		LOG.warn("TsrxGotoDeclarationHandler: file language=${file.language} fileType=${file.fileType.name} isTsrxLang=$isTsrxByLang isTsrxFileType=$isTsrxByType isTsrxByName=$isTsrxByName vFile=${vFile?.name}")
		if (!isTsrxByName && !isTsrxByLang && !isTsrxByType) {
			LOG.warn("TsrxGotoDeclarationHandler: not TSRX file -> return null (let LSP handle)")
			return null
		}

		val text = sourceElement.text
		if (text == null || text.isBlank()) {
			LOG.warn("TsrxGotoDeclarationHandler: blank text -> return null")
			return null
		}

		// Heuristic: distinguish declaration (Prueba.tsrx: export function TestButton) vs usage (App.tsrx: <TestButton/>)
		try {
			val docText = file.text ?: return null
			// Use caret offset from editor if available, otherwise element start offset
			val caretOffset = editor?.caretModel?.offset ?: offset
			val wordAtCaret = try {
				val start = maxOf(0, caretOffset - 15)
				val end = minOf(docText.length, caretOffset + 15)
				val snippet = docText.substring(start, end)
				// Find word around caret
				val wordRegex = Regex("""\b(\w+)\b""")
				// Look for word that contains caret
				val caretInSnippet = caretOffset - start
				wordRegex.findAll(snippet).firstOrNull { it.range.first <= caretInSnippet && caretInSnippet <= it.range.last }?.groupValues?.getOrNull(1)
					?: Regex("""\b(\w+)\b""").find(text)?.groupValues?.getOrNull(1)
			} catch (_: Exception) { null }
			val effectiveWord = wordAtCaret?.takeIf { it.isNotBlank() } ?: text.trim().take(30).split(Regex("""\W+""")).firstOrNull() ?: text.take(20)
			val beforeCaret = docText.substring(maxOf(0, caretOffset - 40), caretOffset)
			val beforeCaretTrimmed = beforeCaret.trimEnd()
			val isDeclaration = beforeCaret.contains(Regex("""export\s+function\s+${Regex.escape(effectiveWord)}\b"""))
				|| beforeCaretTrimmed.endsWith("export function $effectiveWord")
				|| beforeCaretTrimmed.endsWith("function $effectiveWord")
				|| beforeCaret.matches(Regex(""".*\bexport\s+function\s+${Regex.escape(effectiveWord)}\s*"""))
				|| (beforeCaret.contains(Regex("""\bexport\s+function\b""")) && beforeCaret.length < 50 && effectiveWord.length > 2)

			LOG.warn("TsrxGotoDeclarationHandler: text='${text.take(30)}' wordAtCaret='$effectiveWord' beforeCaret='${beforeCaret.takeLast(40)}' isDeclaration=$isDeclaration caretOffset=$caretOffset offset=$offset file=${file.name}")

			// If isDeclaration, trigger Find Usages via the same action as Alt+F7 (uses editor caret, not PsiElement text)
			if (isDeclaration) {
				LOG.warn("TsrxGotoDeclarationHandler: triggering FindUsages via FindUsagesAction for declaration: ${file.name}:$caretOffset word=$effectiveWord")
				if (editor != null) {
					val project = file.project
					ApplicationManager.getApplication().invokeLater {
						try {
							val actionManager = ActionManager.getInstance()
							val findUsagesAction = actionManager.getAction("FindUsages")
							if (findUsagesAction != null) {
								val dataContext = DataManager.getInstance().getDataContext(editor.component)
								val event = AnActionEvent.createFromDataContext("FindUsages", null, dataContext)
								findUsagesAction.actionPerformed(event)
								LOG.warn("TsrxGotoDeclarationHandler: FindUsagesAction performed for ${file.name}:$caretOffset word=$effectiveWord")
							} else {
								LOG.warn("TsrxGotoDeclarationHandler: FindUsages action not found")
							}
						} catch (e: Exception) {
							LOG.warn("TsrxGotoDeclarationHandler: FindUsagesAction failed", e)
						}
					}
					return emptyArray()
				} else {
					LOG.warn("TsrxGotoDeclarationHandler: editor null, returning sourceElement for ${file.name}:$caretOffset")
					return arrayOf(sourceElement)
				}
			}
		} catch (e: Exception) {
			LOG.warn("TsrxGotoDeclarationHandler: exception", e)
		}

		// Not a declaration -> let LSP's GotoDefinition handle it
		return null
	}

	override fun getActionText(context: com.intellij.openapi.actionSystem.DataContext): String? {
		// Provide hint text for the action when on declaration
		return null
	}
}
