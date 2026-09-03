package dev.tsrx.intellij_plugin

import com.intellij.lang.LanguageCommenters
import com.intellij.testFramework.fixtures.BasePlatformTestCase

class TsrxFileTypeTest : BasePlatformTestCase() {
	fun testFileTypeCommenterAndIconAreRegistered() {
		val source = fixtureText("projects/basic/src/App.tsrx")
		val file = myFixture.configureByText("App.tsrx", source)
		val uppercaseFile = myFixture.configureByText("Upper.TSRX", source)

		assertSame(TsrxFileType.INSTANCE, file.virtualFile.fileType)
		assertSame(TsrxFileType.INSTANCE, uppercaseFile.virtualFile.fileType)
		assertTrue(TsrxFileType.isTsrxFile(uppercaseFile.virtualFile))
		assertNotNull(TsrxFileType.INSTANCE.icon)
		val commenter = LanguageCommenters.INSTANCE.forLanguage(TsrxLanguage)
		assertNotNull(commenter)
		assertEquals("//", commenter.lineCommentPrefix)
		assertEquals("/*", commenter.blockCommentPrefix)
		assertEquals("*/", commenter.blockCommentSuffix)
	}

	private fun fixtureText(path: String): String =
		requireNotNull(javaClass.classLoader.getResource(path)) { "Missing test fixture: $path" }
			.readText()
}
