package dev.tsrx.intellij_plugin

import com.google.gson.JsonObject
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.ProjectWideLspClientDescriptor
import com.intellij.platform.lsp.api.customization.LspCustomization
import com.intellij.platform.lsp.api.customization.LspOnTypeFormattingCustomizer
import com.intellij.platform.lsp.api.customization.LspOnTypeFormattingSupport
import java.nio.file.InvalidPathException
import java.nio.file.Path
import java.nio.file.Paths

internal class TsrxLspServerDescriptor(
	project: Project,
	private val serverInfo: TsrxLanguageServerInfo,
) : ProjectWideLspClientDescriptor(project, "TSRX") {
	override fun isSupportedFile(file: VirtualFile): Boolean = TsrxFileType.isTsrxFile(file)

	override fun createCommandLine(): GeneralCommandLine {
		val commandLine = createTsrxLauncherCommandLine(
			serverInfo.binary,
			listOf("--stdio"),
			com.intellij.openapi.util.SystemInfo.isWindows,
		)
		serverInfo.root?.let { commandLine.withWorkDirectory(it.toFile()) }
		return commandLine
	}

	override fun createInitializationOptions(): Any? = createTsrxInitializationOptions(
		TsrxSettings.getInstance(project).typescriptLib,
		project.basePath?.let(Paths::get),
	)

	override val lspCustomization: LspCustomization = TsrxLspCustomization
}

/**
 * The server closes tags through on-type formatting: when `>` ends an opening tag, it
 * answers with an edit that inserts the closing tag. That is its only on-type formatting,
 * and JetBrains IDEs leave on-type formatting off unless the plugin turns it on.
 */
internal object TsrxLspCustomization : LspCustomization() {
	override val onTypeFormattingCustomizer: LspOnTypeFormattingCustomizer = LspOnTypeFormattingSupport()
}

/**
 * `{ "typescript": { "tsdk": "<lib folder>" } }` when the TypeScript lib folder setting is set.
 * Otherwise no options: the server finds the project's `typescript` itself.
 */
internal fun createTsrxInitializationOptions(typescriptLib: String, projectDir: Path?): JsonObject? {
	val tsdk = resolveTsrxTypeScriptLib(typescriptLib, projectDir) ?: return null
	val typescript = JsonObject()
	typescript.addProperty("tsdk", tsdk)
	return JsonObject().apply { add("typescript", typescript) }
}

/**
 * The setting as an absolute path. The server resolves a relative `tsdk` against its working
 * directory, the package root of the `.tsrx` file that started it, so a relative setting starts
 * at the project folder here instead. Without a project folder, a relative setting is dropped.
 */
internal fun resolveTsrxTypeScriptLib(typescriptLib: String, projectDir: Path?): String? {
	val value = typescriptLib.trim()
	if (value.isEmpty()) return null
	val path = try {
		Paths.get(value)
	} catch (_: InvalidPathException) {
		return null
	}
	val absolute = when {
		path.isAbsolute -> path
		projectDir != null -> projectDir.resolve(path)
		else -> return null
	}
	return absolute.normalize().toString()
}
