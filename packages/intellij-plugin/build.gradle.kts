plugins {
	id("java")
	id("org.jetbrains.kotlin.jvm") version "2.1.20"
	id("org.jetbrains.intellij.platform") version "2.10.2"
}

group = "dev.tsrx.intellij_plugin"
version = "0.0.82"

repositories {
	mavenCentral()
	intellijPlatform {
		defaultRepositories()
	}
}

// Read more: https://plugins.jetbrains.com/docs/intellij/tools-intellij-platform-gradle-plugin.html
dependencies {
	intellijPlatform {
		webstorm("2025.2.4")
		testFramework(org.jetbrains.intellij.platform.gradle.TestFrameworkType.Platform)

		// Add plugin dependencies for compilation here:
		bundledPlugin("org.jetbrains.plugins.textmate")
	}
}

val ideDir = configurations.named("intellijPlatformDependency").map { it.files.first() }
dependencies {
	compileOnly(files(ideDir.map { file("$it/lib/modules/intellij.spellchecker.jar") }))
	testImplementation("junit:junit:4.13.2")
}

intellijPlatform {
	pluginConfiguration {
		ideaVersion {
			sinceBuild = "252.25557"
		}

		changeNotes = """
	            TSRX language support for IntelliJ Platform IDEs.
	        """.trimIndent()
	}
}

val textmateGrammar = file("src/main/resources/textmate/Syntaxes/tsrx.tmLanguage.json")
val textmateInfoPlist = file("src/main/resources/textmate/info.plist")

tasks.register("checkTextMateResources") {
	group = "verification"
	description = "Verifies TextMate bundle resources are present (run `node ../../scripts/regenerate-textmate.js` from repo root if missing)."
	notCompatibleWithConfigurationCache("Uses project.file at execution time")
	doLast {
		val missing = listOf(textmateGrammar, textmateInfoPlist).filterNot { it.exists() }
		if (missing.isNotEmpty()) {
			val expected = missing.joinToString(", ") { it.path }
			throw GradleException(
				"Missing TextMate resources: $expected. " +
					"Run `node ../../scripts/regenerate-textmate.js` from the repo root and then re-run the build. " +
					"These files are generated from the canonical grammars/textmate sources."
			)
		}
	}
}

tasks.register<Exec>("regenerateTextMate") {
	group = "generation"
	description = "Regenerates TextMate bundle from canonical grammars/textmate via root scripts/regenerate-textmate.js"
	workingDir = file("../..")
	commandLine("node", "scripts/regenerate-textmate.js")
}

tasks {
	// Ensure TextMate resources are present before packaging resources
	named("processResources") {
		dependsOn("checkTextMateResources")
	}
	// Set the JVM compatibility versions
	withType<JavaCompile> {
		sourceCompatibility = "21"
		targetCompatibility = "21"
	}
}

kotlin {
	compilerOptions {
		jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
	}
}
