package dev.tsrx.intellij_plugin

import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogPanel
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel

class TsrxSettingsConfigurable internal constructor(
	private val project: Project,
	private val restartServer: (Project) -> Unit,
) : BoundConfigurable("TSRX") {
	constructor(project: Project) : this(project, ::restartTsrxLanguageServer)

	private val settings = TsrxSettings.getInstance(project)

	override fun createPanel(): DialogPanel = panel {
		row("TypeScript lib folder:") {
			textFieldWithBrowseButton(
				FileChooserDescriptorFactory.singleDir().withTitle("TypeScript Lib Folder"),
				project,
			)
				.bindText(settings::typescriptLib)
				.align(AlignX.FILL)
				.comment(
					"The <code>lib</code> folder of the TypeScript the language server runs, " +
						"for example <code>node_modules/typescript/lib</code>. " +
						"A relative path starts at the project folder. " +
						"Leave it empty to use the project's <code>typescript</code>.",
				)
		}
	}

	override fun apply() {
		val before = settings.typescriptLib
		super.apply()
		// Show the trimmed value that was saved, so the page is no longer modified.
		reset()
		if (settings.typescriptLib != before) {
			restartServer(project)
		}
	}
}
