package dev.tsrx.intellij_plugin

import com.intellij.ide.actions.CreateFileFromTemplateAction
import com.intellij.ide.actions.CreateFileFromTemplateDialog
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiDirectory

class NewTsrxFileAction :
	CreateFileFromTemplateAction("TSRX File", "Create new TSRX file", TsrxIcons.FILE) {

	override fun buildDialog(
		project: Project,
		directory: PsiDirectory,
		builder: CreateFileFromTemplateDialog.Builder,
	) {
		builder.setTitle("New TSRX File").addKind("TSRX File", TsrxIcons.FILE, "TSRX File")
	}

	override fun getActionName(
		directory: PsiDirectory,
		newName: String,
		templateName: String,
	): String = "TSRX File"
}
