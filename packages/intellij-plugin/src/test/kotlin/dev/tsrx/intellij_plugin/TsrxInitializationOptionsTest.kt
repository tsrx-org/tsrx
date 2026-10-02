package dev.tsrx.intellij_plugin

import com.google.gson.JsonObject
import java.nio.file.Path
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class TsrxInitializationOptionsTest {
	@get:Rule
	val temporaryFolder = TemporaryFolder()

	@Test
	fun `an empty setting sends no options`() {
		val project = temporaryFolder.newFolder("project").toPath()

		assertNull(createTsrxInitializationOptions("", project))
		assertNull(createTsrxInitializationOptions(" \t\n", project))
		assertNull(createTsrxInitializationOptions("", null))
	}

	@Test
	fun `an absolute setting is sent as typescript tsdk`() {
		val project = temporaryFolder.newFolder("project").toPath()
		val lib = temporaryFolder.newFolder("typescript", "lib").toPath()

		assertOptions(tsdkOptions(lib), createTsrxInitializationOptions(lib.toString(), project))
		assertOptions(tsdkOptions(lib), createTsrxInitializationOptions(lib.toString(), null))
	}

	@Test
	fun `a relative setting starts at the project folder`() {
		val project = temporaryFolder.newFolder("project").toPath()
		val sibling = temporaryFolder.root.toPath().resolve("typescript/lib")

		assertOptions(
			tsdkOptions(project.resolve("node_modules/typescript/lib")),
			createTsrxInitializationOptions("node_modules/typescript/lib", project),
		)
		assertOptions(
			tsdkOptions(sibling),
			createTsrxInitializationOptions("../typescript/lib", project),
		)
		assertOptions(
			tsdkOptions(project.resolve("node_modules/typescript/lib")),
			createTsrxInitializationOptions("./node_modules/typescript/lib/", project),
		)
	}

	@Test
	fun `a relative setting without a project folder sends no options`() {
		assertNull(createTsrxInitializationOptions("node_modules/typescript/lib", null))
	}

	@Test
	fun `whitespace around the setting is trimmed`() {
		val project = temporaryFolder.newFolder("project").toPath()
		val lib = temporaryFolder.newFolder("typescript", "lib").toPath()

		assertOptions(tsdkOptions(lib), createTsrxInitializationOptions("  $lib\t\n", project))
		assertOptions(
			tsdkOptions(project.resolve("node_modules/typescript/lib")),
			createTsrxInitializationOptions(" node_modules/typescript/lib ", project),
		)
	}

	private fun tsdkOptions(lib: Path): String =
		"""{"typescript":{"tsdk":"${lib.toString().replace("\\", "\\\\")}"}}"""

	private fun assertOptions(expected: String, actual: JsonObject?) {
		assertEquals(expected, actual?.toString())
	}
}
