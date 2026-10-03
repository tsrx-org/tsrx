package dev.tsrx.intellij_plugin

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.platform.lsp.api.LspServerDescriptor
import com.intellij.platform.lsp.api.LspServerSupportProvider
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.util.ui.UIUtil
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

	fun testDescriptorSendsTheTypeScriptLibSettingOnlyWhenSet() {
		val settings = TsrxSettings.getInstance(project)
		val lib = Files.createTempDirectory("tsrx-typescript-lib")
		val descriptor = TsrxLspServerDescriptor(
			project,
			TsrxLanguageServerInfo(
				Files.createTempFile("tsrx-language-server", ""),
				null,
				TsrxLanguageServerSource.PROJECT,
			),
		)

		try {
			assertNull(descriptor.createInitializationOptions())

			settings.typescriptLib = "  $lib  "
			assertEquals(lib.toString(), settings.typescriptLib)
			assertEquals(
				createTsrxInitializationOptions(lib.toString(), null),
				descriptor.createInitializationOptions(),
			)

			settings.typescriptLib = " "
			assertEquals("", settings.typescriptLib)
			assertNull(descriptor.createInitializationOptions())
		} finally {
			settings.typescriptLib = ""
		}
	}

	fun testSettingsPageRestartsTheServerOnlyWhenTheSettingChanges() {
		val settings = TsrxSettings.getInstance(project)
		val lib = Files.createTempDirectory("tsrx-typescript-lib").toString()
		val restarts = mutableListOf<Project>()
		val configurable = TsrxSettingsConfigurable(project) { restarts += it }

		try {
			val field = requireNotNull(
				UIUtil.findComponentOfType(configurable.createComponent(), TextFieldWithBrowseButton::class.java),
			)
			configurable.reset()
			assertEquals("", field.text)

			configurable.apply()
			assertEmpty(restarts)

			field.text = "  $lib  "
			assertTrue(configurable.isModified)
			configurable.apply()
			assertEquals(lib, settings.typescriptLib)
			assertEquals(lib, field.text)
			assertFalse(configurable.isModified)
			assertEquals(listOf(project), restarts)

			configurable.apply()
			field.text = "$lib "
			configurable.apply()
			assertEquals(1, restarts.size)

			field.text = ""
			configurable.apply()
			assertEquals("", settings.typescriptLib)
			assertEquals(2, restarts.size)
		} finally {
			configurable.disposeUIResources()
			settings.typescriptLib = ""
		}
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
