package dev.tsrx.intellij_plugin

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.net.URI
import java.nio.file.Files
import java.nio.file.Path
import java.util.jar.JarEntry
import java.util.jar.JarOutputStream
import org.jetbrains.plugins.textmate.api.TextMateBundleProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class TsrxTextMateBundleProviderTest {
	@get:Rule
	val temporaryFolder = TemporaryFolder()

	@Test
	fun `extracts an exploded bundle and repairs damaged same-version cache`() {
		val root = temporaryFolder.newFolder("exploded").toPath()
		val resource = root.resolve("textmate")
		writeBundle(resource, "first")
		val cache = TsrxTextMateBundleCache(
			cacheRoot = root.resolve("cache"),
			resourceUrl = { relativePath -> resource.resolve(relativePath).toUri().toURL() },
			pluginVersion = { "1.0.0" },
		)

		val first = requireNotNull(cache.ensureBundleAvailable())
		assertEquals("first", Files.readString(first.resolve("Syntaxes/tsrx.tmLanguage.json")))

		Files.delete(first.resolve("Syntaxes/tsrx.tmLanguage.json"))
		writeBundle(resource, "repaired")
		val repaired = requireNotNull(cache.ensureBundleAvailable())
		assertEquals("repaired", Files.readString(repaired.resolve("Syntaxes/tsrx.tmLanguage.json")))
	}

	@Test
	fun `refreshes cached bundle for a new plugin version`() {
		val root = temporaryFolder.newFolder("versioned").toPath()
		val resource = root.resolve("textmate")
		var version = "1.0.0"
		writeBundle(resource, "first")
		val cache = TsrxTextMateBundleCache(
			cacheRoot = root.resolve("cache"),
			resourceUrl = { relativePath -> resource.resolve(relativePath).toUri().toURL() },
			pluginVersion = { version },
		)
		cache.ensureBundleAvailable()

		version = "1.0.1"
		writeBundle(resource, "second")
		val refreshed = requireNotNull(cache.ensureBundleAvailable())

		assertEquals("second", Files.readString(refreshed.resolve("Syntaxes/tsrx.tmLanguage.json")))
		assertEquals("1.0.1", Files.readString(root.resolve("cache/version.txt")))
	}

	@Test
	fun `extracts the bundle from a jar resource URL`() {
		val root = temporaryFolder.newFolder("jar").toPath()
		val jar = root.resolve("plugin.jar")
		writeBundleJar(jar)
		val cache = TsrxTextMateBundleCache(
			cacheRoot = root.resolve("cache"),
			resourceUrl = { relativePath ->
				URI.create("jar:${jar.toUri()}!/textmate/$relativePath").toURL()
			},
			pluginVersion = { "1.0.0" },
		)

		val bundle = requireNotNull(cache.ensureBundleAvailable())

		assertEquals("plist", Files.readString(bundle.resolve("info.plist")))
		assertEquals("grammar", Files.readString(bundle.resolve("Syntaxes/tsrx.tmLanguage.json")))
	}

	private fun writeBundle(directory: Path, grammar: String) {
		Files.createDirectories(directory.resolve("Syntaxes"))
		Files.writeString(directory.resolve("info.plist"), "plist")
		Files.writeString(directory.resolve("Syntaxes/tsrx.tmLanguage.json"), grammar)
	}

	private fun writeBundleJar(path: Path) {
		JarOutputStream(Files.newOutputStream(path)).use { jar ->
			jar.putNextEntry(JarEntry("textmate/"))
			jar.closeEntry()
			jar.putNextEntry(JarEntry("textmate/Syntaxes/"))
			jar.closeEntry()
			for ((name, value) in listOf(
				"textmate/info.plist" to "plist",
				"textmate/Syntaxes/tsrx.tmLanguage.json" to "grammar",
			)) {
				jar.putNextEntry(JarEntry(name))
				jar.write(value.toByteArray())
				jar.closeEntry()
			}
		}
	}
}

class TsrxTextMateBundleProviderPlatformTest : BasePlatformTestCase() {
	fun testPackagedBundleIsAvailableThroughRegisteredProvider() {
		val providers = TextMateBundleProvider.EP_NAME.extensionList
			.filterIsInstance<TsrxTextMateBundleProvider>()
		assertEquals(1, providers.size)

		val bundles = providers.single().getBundles()
		assertEquals(1, bundles.size)
		assertTrue(Files.isRegularFile(bundles.single().path.resolve("info.plist")))
		assertTrue(
			Files.isRegularFile(
				bundles.single().path.resolve("Syntaxes/tsrx.tmLanguage.json"),
			),
		)
	}
}
