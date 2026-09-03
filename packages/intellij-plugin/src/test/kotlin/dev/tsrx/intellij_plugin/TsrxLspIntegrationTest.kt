package dev.tsrx.intellij_plugin

import com.intellij.platform.lsp.api.LspServerDescriptor
import com.intellij.platform.lsp.api.LspServerSupportProvider
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.nio.file.Files

class TsrxLspIntegrationTest : BasePlatformTestCase() {
	fun testOptionalProviderIsRegisteredExactlyOnce() {
		val providers = LspServerSupportProvider.EP_NAME.extensionList
			.filterIsInstance<TsrxLspServerSupportProvider>()

		assertEquals(1, providers.size)
	}

	fun testDescriptorSupportsOnlyTsrxAndPreservesRootAndStdioArgument() {
		val source = fixtureText("projects/basic/src/App.tsrx")
		val tsrxFile = myFixture.configureByText("App.tsrx", source).virtualFile
		val textFile = myFixture.configureByText("notes.txt", "text").virtualFile
		val root = Files.createTempDirectory("tsrx-lsp-root")
		val binary = Files.createTempFile("tsrx-language-server", "")
		val descriptor = TsrxLspServerDescriptor(
			project,
			TsrxLanguageServerInfo(binary, root, TsrxLanguageServerSource.PROJECT),
		)

		assertTrue(descriptor.isSupportedFile(tsrxFile))
		assertFalse(descriptor.isSupportedFile(textFile))
		val commandLine = descriptor.createCommandLine()
		assertEquals(binary.toString(), commandLine.exePath)
		assertEquals(root.toFile(), commandLine.workDirectory)
		assertTrue(commandLine.getCommandLineList(null).contains("--stdio"))
	}

	fun testUntrustedProjectCannotStartLanguageServerResolution() {
		val source = fixtureText("projects/basic/src/App.tsrx")
		val file = myFixture.configureByText("App.tsrx", source).virtualFile
		var starts = 0
		val provider = TsrxLspServerSupportProvider { false }
		val starter = object : LspServerSupportProvider.LspServerStarter {
			override fun ensureServerStarted(serverDescriptor: LspServerDescriptor) {
				starts++
			}
		}

		provider.fileOpened(project, file, starter)

		assertEquals(0, starts)
	}

	private fun fixtureText(path: String): String =
		requireNotNull(javaClass.classLoader.getResource(path)) { "Missing test fixture: $path" }
			.readText()
}
