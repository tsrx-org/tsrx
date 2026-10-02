---
'@tsrx/language-server': patch
'@tsrx/vscode-plugin': patch
---

When a `package.json` or a lockfile changes, VS Code no longer shows "Client TSRX Language Server: connection to server is erroring. Cannot call write after a stream was destroyed". The language server restarts to load the TSRX compiler again. Before, it exited by itself, and VS Code's next message to it failed. Now an editor that sets the new `restartNotification` initialization option gets a `tsrx/restartServer` notification and restarts the server itself. The VS Code extension sets it. Other editors see the same exit as before.
