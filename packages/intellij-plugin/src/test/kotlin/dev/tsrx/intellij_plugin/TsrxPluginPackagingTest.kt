package dev.tsrx.intellij_plugin

import java.nio.file.Files
import java.nio.file.Path
import java.util.jar.JarInputStream
import java.util.zip.ZipFile
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.io.path.readBytes
import kotlin.io.path.readText
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

class TsrxPluginPackagingTest {
	private val packageDir: Path = Path.of("").toAbsolutePath().normalize()
	private val repositoryDir: Path = packageDir.resolve("../..").normalize()

	@Test
	fun `processed resources contain the canonical TextMate bundle and license`() {
		assertResourceMatches(
			"textmate/info.plist",
			repositoryDir.resolve("grammars/textmate/info.plist"),
		)
		assertResourceMatches(
			"textmate/Syntaxes/tsrx.tmLanguage.json",
			repositoryDir.resolve("grammars/textmate/tsrx.tmLanguage.json"),
		)
		assertResourceMatches("META-INF/LICENSE", packageDir.resolve("LICENSE"))
		val languageServerPackage = repositoryDir.resolve("packages/language-server/package.json")
			.readText()
		val expectedLspVersion = Regex(""""version"\s*:\s*"([^"]+)"""")
			.find(languageServerPackage)
			?.groupValues
			?.get(1)
		assertNotNull("Missing language-server package version", expectedLspVersion)
		assertEquals(
			expectedLspVersion,
			javaClass.classLoader.getResource("lsp-version.txt")!!.readText().trim(),
		)
	}

	@Test
	fun `descriptor keeps baseline support independent from optional integrations`() {
		val mainDescriptor = parseXml(packageDir.resolve("src/main/resources/META-INF/plugin.xml"))
		val requiredDependencies = mainDescriptor.dependencies(optional = false)
		val optionalDependencies = mainDescriptor.dependencies(optional = true)

		assertTrue(requiredDependencies.contains("com.intellij.modules.platform"))
		assertTrue(requiredDependencies.contains("org.jetbrains.plugins.textmate"))
		assertEquals(
			mapOf(
				"com.intellij.modules.ultimate" to "tsrx-ultimate.xml",
				"izhangzhihao.rainbow.brackets" to "tsrx.intellij-plugin-rainbow-brackets.xml",
			),
			optionalDependencies,
		)

		val ultimateDescriptor = parseXml(
			packageDir.resolve("src/main/resources/META-INF/tsrx-ultimate.xml"),
		)
		assertEquals(
			mapOf("com.intellij.modules.lsp" to "tsrx-lsp.xml"),
			ultimateDescriptor.dependencies(optional = true),
		)

		val lspDescriptor = parseXml(packageDir.resolve("src/main/resources/META-INF/tsrx-lsp.xml"))
		val providers = lspDescriptor.getElementsByTagName("serverSupportProvider")
		assertEquals(1, providers.length)
		assertEquals(
			"dev.tsrx.intellij_plugin.TsrxLspServerSupportProvider",
			(providers.item(0) as Element).getAttribute("implementation"),
		)

		val rainbowDescriptor = parseXml(
			packageDir.resolve("src/main/resources/META-INF/tsrx.intellij-plugin-rainbow-brackets.xml"),
		)
		val visitors = rainbowDescriptor.getElementsByTagName("highlightVisitor")
		assertEquals(1, visitors.length)
		assertEquals(
			"dev.tsrx.intellij_plugin.TsrxRainbowBracketsHighlightVisitor",
			(visitors.item(0) as Element).getAttribute("implementation"),
		)
		assertNotNull(
			"Missing packaged Rainbow Brackets companion descriptor",
			javaClass.classLoader.getResource("META-INF/tsrx.intellij-plugin-rainbow-brackets.xml"),
		)
	}

	@Test
	fun `Marketplace metadata is present and non-placeholder`() {
		val pluginXml = packageDir.resolve("src/main/resources/META-INF/plugin.xml").readText()
		val icon = packageDir.resolve("src/main/resources/META-INF/pluginIcon.svg").readText()
		val packageJson = packageDir.resolve("package.json").readText()

		assertTrue(pluginXml.contains("<idea-plugin url=\"https://tsrx.dev/\">"))
		assertTrue(pluginXml.contains("<vendor url=\"https://github.com/tsrx-org/tsrx\">TSRX</vendor>"))
		assertTrue(pluginXml.contains("MIT License"))
		assertTrue(icon.contains("width=\"40\""))
		assertTrue(icon.contains("height=\"40\""))
		assertTrue(packageJson.contains("\"license\": \"MIT\""))
		assertTrue(packageJson.contains("\"homepage\": \"https://tsrx.dev/\""))
		assertTrue(packageJson.contains("\"repository\""))
	}

	@Test
	fun `distribution ships the companion descriptor without Rainbow implementation code`() {
		val packageJson = packageDir.resolve("package.json").readText()
		val version = checkNotNull(Regex(""""version"\s*:\s*"([^"]+)"""").find(packageJson))
			.groupValues[1]
		val distribution = packageDir.resolve("build/distributions/intellij-plugin-$version.zip")
		assertTrue("Missing built plugin distribution: $distribution", Files.isRegularFile(distribution))

		ZipFile(distribution.toFile()).use { archive ->
			val entries = archive.entries().asSequence().toList()
			assertTrue(entries.none { it.name.contains("intellij-rainbow-brackets", ignoreCase = true) })
			val pluginJar = entries.single { it.name.endsWith("/lib/intellij-plugin-$version.jar") }
			JarInputStream(archive.getInputStream(pluginJar)).use { jar ->
				val names = generateSequence { jar.nextJarEntry }.map { it.name }.toSet()
				assertTrue("META-INF/tsrx.intellij-plugin-rainbow-brackets.xml" in names)
				assertTrue(names.none { it.startsWith("com/github/izhangzhihao/rainbow/brackets/") })
			}
		}
	}

	private fun assertResourceMatches(resourcePath: String, sourcePath: Path) {
		val resource = javaClass.classLoader.getResource(resourcePath)
		assertNotNull("Missing packaged resource: $resourcePath", resource)
		assertTrue("Missing canonical source: $sourcePath", Files.isRegularFile(sourcePath))
		assertArrayEquals(sourcePath.readBytes(), resource!!.readBytes())
	}

	private fun parseXml(path: Path) =
		DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(path.toFile())

	private fun org.w3c.dom.Document.dependencies(optional: Boolean): Map<String, String> {
		val dependencies = linkedMapOf<String, String>()
		val nodes = documentElement.childNodes
		for (index in 0 until nodes.length) {
			val element = nodes.item(index) as? Element ?: continue
			if (element.tagName != "depends") continue
			if (element.getAttribute("optional").toBoolean() != optional) continue
			dependencies[element.textContent.trim()] = element.getAttribute("config-file")
		}
		return dependencies
	}
}
