import groovy.json.JsonSlurper
import org.gradle.api.DefaultTask
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.OutputFile
import org.gradle.api.tasks.PathSensitive
import org.gradle.api.tasks.PathSensitivity
import org.gradle.api.tasks.TaskAction
import org.gradle.api.tasks.bundling.AbstractArchiveTask
import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.tasks.VerifyPluginTask

plugins {
	id("java")
	id("org.jetbrains.kotlin.jvm") version "2.1.20"
	id("org.jetbrains.intellij.platform") version "2.18.1"
}

group = "tsrx"
version = providers.gradleProperty("pluginVersion").get()

val targetPlatformVersion = providers.gradleProperty("targetPlatformVersion").get()

repositories {
	mavenCentral()
	intellijPlatform {
		defaultRepositories()
	}
}

// Read more: https://plugins.jetbrains.com/docs/intellij/tools-intellij-platform-gradle-plugin.html
dependencies {
	testImplementation("junit:junit:4.13.2")

	intellijPlatform {
		webstorm(targetPlatformVersion)
		testFramework(org.jetbrains.intellij.platform.gradle.TestFrameworkType.Platform)

		// Add plugin dependencies for compilation here:
		bundledPlugin("org.jetbrains.plugins.textmate")
	}
}

intellijPlatform {
	pluginConfiguration {
		ideaVersion {
			sinceBuild = "252"
		}

		changeNotes = """
			<p>TSRX language support for IntelliJ Platform IDEs.</p>
			<ul>
				<li>TextMate syntax highlighting and baseline editor support.</li>
				<li>Optional language-server integration in supported JetBrains IDEs.</li>
			</ul>
		""".trimIndent()
	}

	pluginVerification {
		failureLevel = listOf(
			VerifyPluginTask.FailureLevel.COMPATIBILITY_PROBLEMS,
			VerifyPluginTask.FailureLevel.INTERNAL_API_USAGES,
			VerifyPluginTask.FailureLevel.OVERRIDE_ONLY_API_USAGES,
			VerifyPluginTask.FailureLevel.INVALID_PLUGIN,
		)
		ignoredProblemsFile = layout.projectDirectory.file("plugin-verifier-ignored-problems.txt")
		verificationReportsDirectory = layout.buildDirectory.dir("reports/pluginVerifier")
		verificationReportsFormats = VerifyPluginTask.VerificationReportsFormats.ALL.toList()

		ides {
			create(IntelliJPlatformType.WebStorm, targetPlatformVersion)
		}
	}

	signing {
		certificateChain = providers.environmentVariable("CERTIFICATE_CHAIN")
		privateKey = providers.environmentVariable("PRIVATE_KEY")
		password = providers.environmentVariable("PRIVATE_KEY_PASSWORD")
	}

	publishing {
		token = providers.environmentVariable("PUBLISH_TOKEN")
		channels = listOf("default")
	}
}

val generatedPluginResources = layout.buildDirectory.dir("generated/tsrx-plugin-resources")
val generateLspVersion by tasks.registering(GenerateLspVersionTask::class) {
	languageServerPackage.set(layout.projectDirectory.file("../language-server/package.json"))
	outputFile.set(layout.buildDirectory.file("generated/tsrx-lsp-version/lsp-version.txt"))
}
val generatePluginResources by tasks.registering(Sync::class) {
	dependsOn(generateLspVersion)
	from(layout.projectDirectory.file("../../grammars/textmate/info.plist")) {
		into("textmate")
	}
	from(layout.projectDirectory.file("../../grammars/textmate/tsrx.tmLanguage.json")) {
		into("textmate/Syntaxes")
	}
	from(layout.projectDirectory.file("LICENSE")) {
		into("META-INF")
	}
	from(generateLspVersion.flatMap { it.outputFile }) {
		rename { "lsp-version.txt" }
	}
	into(generatedPluginResources)
}

sourceSets.main {
	resources.srcDir(generatedPluginResources)
}

tasks {
	processResources {
		dependsOn(generatePluginResources)
	}

	// Set the JVM compatibility versions
	withType<JavaCompile> {
		sourceCompatibility = "21"
		targetCompatibility = "21"
	}

	withType<AbstractArchiveTask> {
		isPreserveFileTimestamps = false
		isReproducibleFileOrder = true
	}
}

kotlin {
	compilerOptions {
		jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
	}
}

abstract class GenerateLspVersionTask : DefaultTask() {
	@get:InputFile
	@get:PathSensitive(PathSensitivity.RELATIVE)
	abstract val languageServerPackage: org.gradle.api.file.RegularFileProperty

	@get:OutputFile
	abstract val outputFile: org.gradle.api.file.RegularFileProperty

	@TaskAction
	fun generate() {
		val packageFile = languageServerPackage.get().asFile
		val metadata = JsonSlurper().parse(packageFile) as? Map<*, *>
			?: error("Expected $packageFile to contain a JSON object")
		require(metadata["name"] == "@tsrx/language-server") {
			"Expected $packageFile to define package @tsrx/language-server"
		}
		val version = metadata["version"] as? String
			?: error("Expected $packageFile to contain a version")
		require(Regex("""^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$""").matches(version)) {
			"Expected $packageFile to contain a valid version"
		}
		outputFile.get().asFile.apply {
			parentFile.mkdirs()
			writeText("$version\n")
		}
	}
}
