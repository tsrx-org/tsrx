---
'@tsrx/vscode-plugin': patch
---

The extension ships each package it keeps unbundled at the version the TSRX language server resolves: it shipped `acorn` 8.16.0 (from an older `@tsrx/core` elsewhere in the workspace), while the bundled `@tsrx/core` needs `^8.18.0`. The build now resolves each of these packages from the package that depends on it, and fails, naming who needs which version, when one would need two versions.
