---
'@tsrx/vscode-plugin': patch
---

Update the VS Code language client to vscode-languageclient 10.1.2. After the TSRX language server stops unexpectedly and starts again, the TSRX Language Server output no longer shows a line that says only `true`. The output and trace channels are now log channels: each line shows its time and level, and **Set Log Level** in the Output view filters them. Server traces (`tsrx.trace.server`) show at the Trace level.
