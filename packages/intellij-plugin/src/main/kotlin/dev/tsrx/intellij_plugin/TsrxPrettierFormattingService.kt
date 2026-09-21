package dev.tsrx.intellij_plugin

import com.intellij.formatting.service.AsyncDocumentFormattingService
import com.intellij.formatting.service.AsyncFormattingRequest
import com.intellij.formatting.service.FormattingService
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.util.SystemInfo
import com.intellij.psi.PsiFile
import com.intellij.util.EnvironmentUtil
import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.TimeUnit

/**
 * Wires "Reformat Code" for `.tsrx` files to Prettier with `@tsrx/prettier-plugin`.
 *
 * There is intentionally no handwritten formatter here: reformatting must preserve
 * program values (e.g. whitespace inside template literals), so all formatting is
 * delegated to Prettier. The document text is piped via stdin while
 * `--stdin-filepath` points at the real file, so Prettier discovers and honors the
 * project's Prettier configuration (including `plugins` entries) exactly as the
 * CLI would.
 */
class TsrxPrettierFormattingService : AsyncDocumentFormattingService() {

    override fun getName(): String = "Prettier (TSRX)"

    override fun getNotificationGroupId(): String = "TSRX"

    override fun getFeatures(): MutableSet<FormattingService.Feature> = mutableSetOf()

    override fun canFormat(file: PsiFile): Boolean {
        return file.name.endsWith(".tsrx", true) ||
            file.virtualFile?.extension?.equals("tsrx", true) == true ||
            file.language.isKindOf(TsrxLanguage) || file.language.id == "TSRX"
    }

    override fun createFormattingTask(request: AsyncFormattingRequest): FormattingTask {
        return object : FormattingTask {
            override fun run() {
                try {
                    val formatted = formatWithPrettier(request)
                    request.onTextReady(formatted)
                } catch (e: PrettierUnavailableException) {
                    request.onError("Prettier unavailable", e.message ?: e.toString())
                } catch (e: Exception) {
                    LOG.warn("TSRX Prettier formatting failed", e)
                    request.onError("TSRX formatting failed", e.message ?: e.toString())
                }
            }

            override fun cancel(): Boolean = false
            override fun isRunUnderProgress(): Boolean = true
        }
    }

    @Throws(PrettierUnavailableException::class)
    private fun formatWithPrettier(request: AsyncFormattingRequest): String {
        val file = request.context.containingFile
        val filePath = file?.virtualFile?.path ?: file?.name?.takeIf { it.endsWith(".tsrx", true) }
        ?: "file.tsrx"
        val workDir = file?.virtualFile?.parent?.let { Paths.get(it.path) }
            ?: request.context.project?.basePath?.let { Paths.get(it) }

        val node = findExecutableInPath(if (SystemInfo.isWindows) "node.exe" else "node")
            ?: throw PrettierUnavailableException("Node.js was not found on PATH. Install Node.js 22+ to format TSRX files.")
        val prettierEntry = findPackageEntry(workDir, "prettier", listOf("bin/prettier.cjs", "bin-prettier.js"))
            ?: throw PrettierUnavailableException(
                "Prettier was not found. Install it in the project (e.g. `pnpm add -D prettier @tsrx/prettier-plugin`)."
            )
        // Explicit plugin path is a convenience for projects that have the package
        // installed but have not listed it in their Prettier config yet. When the
        // project config already declares the plugin, Prettier resolves it itself.
        val tsrxPluginDir = findPackageDir(workDir, "@tsrx/prettier-plugin")

        val command = mutableListOf(node.toString(), prettierEntry.toString(), "--stdin-filepath", filePath)
        if (tsrxPluginDir != null) {
            command.add("--plugin")
            command.add(tsrxPluginDir.toString())
        }

        val processBuilder = ProcessBuilder(command)
        if (workDir != null && Files.isDirectory(workDir)) {
            processBuilder.directory(workDir.toFile())
        }
        processBuilder.environment().putAll(EnvironmentUtil.getEnvironmentMap())

        val process = processBuilder.start()
        var stdout = ByteArray(0)
        var stderr = ByteArray(0)
        val stdoutReader = Thread { stdout = process.inputStream.readBytes() }
        val stderrReader = Thread { stderr = process.errorStream.readBytes() }
        stdoutReader.isDaemon = true
        stderrReader.isDaemon = true
        stdoutReader.start()
        stderrReader.start()
        process.outputStream.bufferedWriter(StandardCharsets.UTF_8).use { writer ->
            writer.write(request.documentText)
        }
        val finished = process.waitFor(FORMAT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        stdoutReader.join(READER_JOIN_TIMEOUT_MS)
        stderrReader.join(READER_JOIN_TIMEOUT_MS)
        if (!finished) {
            process.destroyForcibly()
            throw PrettierUnavailableException("Prettier timed out while formatting $filePath.")
        }
        if (process.exitValue() != 0) {
            val details = stderr.toString(StandardCharsets.UTF_8).lineSequence()
                .filter { it.isNotBlank() }.toList().takeLast(MAX_ERROR_LINES).joinToString("\n")
            throw PrettierUnavailableException(
                buildString {
                    append("Prettier failed to format $filePath.")
                    if (details.isNotBlank()) {
                        append("\n\n")
                        append(details)
                    }
                }
            )
        }
        return stdout.toString(StandardCharsets.UTF_8)
    }

    private fun findPackageEntry(startDir: Path?, packageName: String, candidates: List<String>): Path? {
        val dir = findPackageDir(startDir, packageName) ?: return null
        return candidates.map { dir.resolve(it) }.firstOrNull { Files.isRegularFile(it) }
    }

    private fun findPackageDir(startDir: Path?, packageName: String): Path? {
        var current = startDir
        while (current != null) {
            val candidate = current.resolve("node_modules").resolve(packageName)
            if (Files.isDirectory(candidate)) {
                return candidate
            }
            current = current.parent
        }
        return null
    }

    private fun findExecutableInPath(name: String): Path? {
        val pathValue = EnvironmentUtil.getValue("PATH") ?: return null
        for (entry in pathValue.split(File.pathSeparatorChar)) {
            if (entry.isBlank()) {
                continue
            }
            val path = Paths.get(entry, name)
            if (Files.isRegularFile(path)) {
                return path
            }
        }
        return null
    }

    private class PrettierUnavailableException(message: String) : Exception(message)

    companion object {
        private val LOG = Logger.getInstance(TsrxPrettierFormattingService::class.java)
        private const val FORMAT_TIMEOUT_SECONDS = 30L
        private const val READER_JOIN_TIMEOUT_MS = 5000L
        private const val MAX_ERROR_LINES = 8
    }
}
