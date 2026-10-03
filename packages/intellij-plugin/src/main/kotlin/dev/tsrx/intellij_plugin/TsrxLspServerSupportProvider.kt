package dev.tsrx.intellij_plugin

import com.intellij.ide.trustedProjects.TrustedProjects
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.LspClientManager
import com.intellij.platform.lsp.api.LspIntegrationProvider

class TsrxLspServerSupportProvider internal constructor(
	private val isProjectTrusted: (Project) -> Boolean,
) : LspIntegrationProvider {
	constructor() : this(TrustedProjects::isProjectTrusted)

	override fun fileOpened(
		project: Project,
		file: VirtualFile,
		clientStarter: LspIntegrationProvider.LspClientStarter,
	) {
		if (!TsrxFileType.isTsrxFile(file) || !isProjectTrusted(project)) {
			return
		}

		val serverInfo = TsrxLanguageServer.resolveServer(project, file) ?: return
		clientStarter.ensureClientStarted(TsrxLspServerDescriptor(project, serverInfo))
	}
}

/** Stops the project's TSRX servers and starts them again for the open `.tsrx` files. */
internal fun restartTsrxLanguageServer(project: Project) {
	LspClientManager.getInstance(project)
		.stopAndRestartClientsIfNeeded(TsrxLspServerSupportProvider::class.java)
}
