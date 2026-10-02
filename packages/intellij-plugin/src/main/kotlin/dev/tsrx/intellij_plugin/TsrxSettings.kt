package dev.tsrx.intellij_plugin

import com.intellij.openapi.components.BaseState
import com.intellij.openapi.components.SimplePersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project

class TsrxSettingsState : BaseState() {
	/** The `lib` folder of the TypeScript the language server runs. Empty: the server finds one. */
	var typescriptLib by string()
}

@State(name = "TsrxSettings", storages = [Storage("tsrx.xml")])
class TsrxSettings : SimplePersistentStateComponent<TsrxSettingsState>(TsrxSettingsState()) {
	var typescriptLib: String
		get() = state.typescriptLib.orEmpty()
		set(value) {
			state.typescriptLib = value.trim().ifEmpty { null }
		}

	companion object {
		fun getInstance(project: Project): TsrxSettings = project.service()
	}
}
