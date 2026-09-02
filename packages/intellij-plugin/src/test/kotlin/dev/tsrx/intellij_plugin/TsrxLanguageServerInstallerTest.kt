package dev.tsrx.intellij_plugin

import java.io.ByteArrayInputStream
import java.nio.file.Files
import java.nio.file.Path
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class TsrxLanguageServerInstallerTest {
	@get:Rule
	val temporaryFolder = TemporaryFolder()

	@Test
	fun `install uses exact package with lifecycle scripts disabled then promotes validated files`() {
		val root = temporaryFolder.newFolder("managed").toPath()
		val commands = mutableListOf<TsrxProcessCommand>()
		val installer = installer { command ->
			commands += command
			writeInstalledPackage(command.prefix(), "@tsrx/language-server", "1.2.3", launcher = true)
			TsrxProcessOutput(0, "installed", "")
		}

		val result = installer.install(Path.of("/tools/npm"), root, "1.2.3")

		assertTrue(result is TsrxInstallResult.Success)
		assertEquals(1, commands.size)
		assertEquals("@tsrx/language-server@1.2.3", commands.single().arguments[1])
		assertTrue(commands.single().arguments.contains("--ignore-scripts"))
		assertTrue(Files.isRegularFile(root.resolve("1.2.3/node_modules/.bin/tsrx-language-server")))
		assertTrue(stagingDirectories(root).isEmpty())
	}

	@Test
	fun `missing npm is actionable and leaves the installation retryable`() {
		val root = temporaryFolder.newFolder("managed").toPath()
		var calls = 0
		val installer = installer { command ->
			calls++
			writeInstalledPackage(command.prefix(), "@tsrx/language-server", "1.2.3", launcher = true)
			TsrxProcessOutput(0, "", "")
		}

		val missing = installer.install(null, root, "1.2.3")
		val retry = installer.install(Path.of("/tools/npm"), root, "1.2.3")

		assertTrue(missing is TsrxInstallResult.Failure)
		assertTrue((missing as TsrxInstallResult.Failure).userMessage.contains("Node.js 22+"))
		assertTrue(retry is TsrxInstallResult.Success)
		assertEquals(1, calls)
	}

	@Test
	fun `failed validation cleans staging and preserves another valid managed version`() {
		val root = temporaryFolder.newFolder("managed").toPath()
		writeInstalledPackage(root.resolve("1.2.2"), "@tsrx/language-server", "1.2.2", launcher = true)
		val installer = installer { command ->
			writeInstalledPackage(command.prefix(), "wrong-package", "1.2.3", launcher = true)
			TsrxProcessOutput(0, "", "")
		}

		val result = installer.install(Path.of("/tools/npm"), root, "1.2.3")

		assertTrue(result is TsrxInstallResult.Failure)
		assertTrue(Files.isDirectory(root.resolve("1.2.2")))
		assertFalse(Files.exists(root.resolve("1.2.3")))
		assertTrue(stagingDirectories(root).isEmpty())
	}

	@Test
	fun `nonzero process exceptions wrong versions and missing launchers remain retryable`() {
		val root = temporaryFolder.newFolder("managed").toPath()
		val results = listOf(
			installer { TsrxProcessOutput(1, "stdout", "stderr") }
				.install(Path.of("/tools/npm"), root, "1.2.3"),
			installer { throw IllegalStateException("offline") }
				.install(Path.of("/tools/npm"), root, "1.2.3"),
			installer { command ->
				writeInstalledPackage(command.prefix(), "@tsrx/language-server", "9.9.9", launcher = true)
				TsrxProcessOutput(0, "", "")
			}.install(Path.of("/tools/npm"), root, "1.2.3"),
			installer { command ->
				writeInstalledPackage(command.prefix(), "@tsrx/language-server", "1.2.3", launcher = false)
				TsrxProcessOutput(0, "", "")
			}.install(Path.of("/tools/npm"), root, "1.2.3"),
		)

		assertTrue(results.all { it is TsrxInstallResult.Failure })
		assertFalse(Files.exists(root.resolve("1.2.3")))
		assertTrue(stagingDirectories(root).isEmpty())
	}

	@Test
	fun `coordinator runs one install per version and restarts all live waiters`() {
		val queued = mutableListOf<() -> Unit>()
		val restarted = mutableListOf<String>()
		val failures = mutableListOf<String>()
		val disposed = mutableSetOf<String>()
		var installs = 0
		val coordinator = TsrxInstallCoordinator<String>(
			execute = { queued += it },
			install = {
				installs++
				TsrxInstallResult.Success(Path.of("/managed/$it/server"))
			},
			isDisposed = { it in disposed },
			onSuccess = { project, _ -> restarted += project },
			onFailure = { project, _ -> failures += project },
		)

		coordinator.request("1.2.3", "alpha")
		coordinator.request("1.2.3", "beta")
		coordinator.request("1.2.3", "alpha")
		disposed += "beta"
		assertEquals(1, queued.size)
		queued.single().invoke()

		assertEquals(1, installs)
		assertEquals(listOf("alpha"), restarted)
		assertTrue(failures.isEmpty())

		coordinator.request("1.2.3", "alpha")
		assertEquals(2, queued.size)
	}

	@Test
	fun `notification details strip ansi escape html and stay bounded while logs remain complete`() {
		val raw = (1..20).joinToString("\n") { "line-$it" } +
			"\n\u001B[31m<failure & reason>\u001B[0m"
		val safe = notificationDetails(raw, maxLines = 3, maxCharacters = 64)

		assertFalse(safe.contains("\u001B"))
		assertTrue(safe.contains("&lt;failure &amp; reason&gt;"))
		assertTrue(safe.length <= 64)
		assertTrue(raw.contains("<failure & reason>"))
	}

	@Test
	fun `required version resource cannot be absent or blank`() {
		assertThrows(IllegalArgumentException::class.java) {
			readRequiredLanguageServerVersion { null }
		}
		assertThrows(IllegalArgumentException::class.java) {
			readRequiredLanguageServerVersion { ByteArrayInputStream("  \n".toByteArray()) }
		}
		assertEquals(
			"1.2.3",
			readRequiredLanguageServerVersion { ByteArrayInputStream("1.2.3\n".toByteArray()) },
		)
	}

	@Test
	fun `windows batch launchers pass one quoted command string to the command shell`() {
		val commandLine = createTsrxLauncherCommandLine(
			Path.of("C:/Program Files/TSRX/tsrx-language-server.cmd"),
			listOf("--stdio", "--workspace", "C:/Users/TSRX Developer/example project"),
			isWindows = true,
			windowsShell = "cmd.exe",
		)

		assertEquals("cmd.exe", commandLine.exePath)
		assertEquals(
			listOf(
				"cmd.exe",
				"/d",
				"/s",
				"/c",
				"\"\"C:/Program Files/TSRX/tsrx-language-server.cmd\" \"--stdio\" \"--workspace\" \"C:/Users/TSRX Developer/example project\"\"",
			),
			commandLine.getCommandLineList(null),
		)
	}

	@Test
	fun `non batch launchers keep executable and arguments separate`() {
		val commandLine = createTsrxLauncherCommandLine(
			Path.of("C:/Program Files/TSRX/tsrx-language-server.exe"),
			listOf("--workspace", "C:/Users/TSRX Developer/example project"),
			isWindows = true,
			windowsShell = "cmd.exe",
		)

		assertEquals(
			listOf(
				"C:/Program Files/TSRX/tsrx-language-server.exe",
				"--workspace",
				"C:/Users/TSRX Developer/example project",
			),
			commandLine.getCommandLineList(null),
		)
	}

	private fun installer(run: (TsrxProcessCommand) -> TsrxProcessOutput) =
		TsrxLanguageServerInstaller(
			resolver = TsrxLanguageServerResolver(isWindows = false, pathValue = { null }),
			commandRunner = TsrxCommandRunner(run),
			uniqueId = { "test-staging" },
		)

	private fun TsrxProcessCommand.prefix(): Path =
		Path.of(arguments[arguments.indexOf("--prefix") + 1])

	private fun writeInstalledPackage(
		directory: Path,
		name: String,
		version: String,
		launcher: Boolean,
	) {
		val packageJson = directory.resolve("node_modules/@tsrx/language-server/package.json")
		Files.createDirectories(packageJson.parent)
		Files.writeString(packageJson, """{"name":"$name","version":"$version"}""")
		if (launcher) {
			val binary = directory.resolve("node_modules/.bin/tsrx-language-server")
			Files.createDirectories(binary.parent)
			Files.writeString(binary, "launcher")
		}
	}

	private fun stagingDirectories(root: Path): List<Path> {
		if (!Files.isDirectory(root)) return emptyList()
		return Files.list(root).use { paths ->
			paths.filter { it.fileName.toString().startsWith(".staging-") }.toList()
		}
	}
}
