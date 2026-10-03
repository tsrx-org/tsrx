---
'@tsrx/intellij-plugin': patch
---

Tags now close as you type. When you type the `>` that ends an opening tag, the TSRX language server inserts the closing tag: `<div>` becomes `<div></div>`, with the caret between the tags. JetBrains IDEs leave on-type formatting off for language servers, so the plugin turns it on for the TSRX server only.

The plugin now needs an IntelliJ-based IDE 2026.1.4 or newer. Before, it needed 2025.2 or newer. 2026.1.4 is the first version with on-type formatting for language servers and with the renamed LSP API, which the plugin now uses (`LspIntegrationProvider`, `ProjectWideLspClientDescriptor`, `LspClientManager`).
