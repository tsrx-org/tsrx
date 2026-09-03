package dev.tsrx.intellij_plugin

import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class TsrxLanguageServerResolverTest {
	@get:Rule
	val temporaryFolder = TemporaryFolder()

	@Test
	fun `nearest project launcher wins and keeps nearest project root`() {
		val root = temporaryFolder.newFolder("workspace").toPath()
		write(root.resolve("package.json"), "{}")
		val nested = Files.createDirectories(root.resolve("packages/app/src"))
		val local = launcher(root.resolve("packages/app/node_modules/.bin"), windows = false)
		write(root.resolve("packages/app/package.json"), "{}")
		val global = launcher(root.resolve("global-bin"), windows = false)
		val managedRoot = root.resolve("managed")
		managedPackage(managedRoot.resolve("1.2.3"), "@tsrx/language-server", "1.2.3", false)
		val resolver = resolver(path = global.parent.toString())

		val result = resolver.resolve(nested, managedRoot, "1.2.3")

		assertEquals(local, result?.binary)
		assertEquals(root.resolve("packages/app"), result?.root)
		assertEquals(TsrxLanguageServerSource.PROJECT, result?.source)
	}

	@Test
	fun `global launcher wins when local is absent then managed exact version is used`() {
		val root = temporaryFolder.newFolder("workspace").toPath()
		write(root.resolve("pnpm-workspace.yaml"), "packages: []")
		val global = launcher(root.resolve("global-bin"), windows = false)
		val managedRoot = root.resolve("managed")
		val managed = managedPackage(
			managedRoot.resolve("1.2.3"),
			"@tsrx/language-server",
			"1.2.3",
			false,
		)

		val globalResult = resolver(path = global.parent.toString()).resolve(root, managedRoot, "1.2.3")
		assertEquals(global, globalResult?.binary)
		assertEquals(TsrxLanguageServerSource.PATH, globalResult?.source)

		val managedResult = resolver(path = null).resolve(root, managedRoot, "1.2.3")
		assertEquals(managed, managedResult?.binary)
		assertEquals(TsrxLanguageServerSource.MANAGED, managedResult?.source)
	}

	@Test
	fun `managed launcher requires the expected package identity and exact version`() {
		val root = temporaryFolder.newFolder("workspace").toPath()
		val managedRoot = root.resolve("managed")
		managedPackage(managedRoot.resolve("1.2.3"), "wrong-package", "1.2.3", false)
		assertNull(resolver().resolve(root, managedRoot, "1.2.3"))

		managedPackage(managedRoot.resolve("1.2.3"), "@tsrx/language-server", "9.9.9", false)
		assertNull(resolver().resolve(root, managedRoot, "1.2.3"))
	}

	@Test
	fun `windows resolution selects cmd launchers from local path and managed locations`() {
		val root = temporaryFolder.newFolder("workspace").toPath()
		write(root.resolve("package.json"), "{}")
		val local = launcher(root.resolve("node_modules/.bin"), windows = true)
		val global = launcher(root.resolve("global-bin"), windows = true)
		val managedRoot = root.resolve("managed")
		managedPackage(managedRoot.resolve("1.2.3"), "@tsrx/language-server", "1.2.3", true)
		val resolver = resolver(windows = true, path = global.parent.toString(), separator = ';')

		assertTrue(local.fileName.toString().endsWith(".cmd"))
		assertEquals(local, resolver.resolve(root, managedRoot, "1.2.3")?.binary)
		Files.delete(local)
		assertEquals(global, resolver.resolve(root, managedRoot, "1.2.3")?.binary)
		Files.delete(global)
		assertTrue(resolver.resolve(root, managedRoot, "1.2.3")!!.binary.fileName.toString().endsWith(".cmd"))
	}

	private fun resolver(
		windows: Boolean = false,
		path: String? = null,
		separator: Char = File.pathSeparatorChar,
	) = TsrxLanguageServerResolver(
		isWindows = windows,
		pathValue = { path },
		pathSeparator = separator,
	)

	private fun managedPackage(
		directory: Path,
		name: String,
		version: String,
		windows: Boolean,
	): Path {
		write(
			directory.resolve("node_modules/@tsrx/language-server/package.json"),
			"""{"name":"$name","version":"$version"}""",
		)
		return launcher(directory.resolve("node_modules/.bin"), windows)
	}

	private fun launcher(directory: Path, windows: Boolean): Path {
		val path = directory.resolve("tsrx-language-server${if (windows) ".cmd" else ""}")
		write(path, "launcher")
		return path
	}

	private fun write(path: Path, content: String) {
		Files.createDirectories(path.parent)
		Files.writeString(path, content)
	}
}
