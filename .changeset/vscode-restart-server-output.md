---
'@tsrx/vscode-plugin': patch
---

After the TSRX language server restarts (**TSRX: Restart Language Server**, a `package.json` or lockfile change, or a crash), the TSRX Language Server output shows the new server's lines again. The restarted server used to start without `TSRX_DEBUG`, so it wrote nothing to the output. vscode-languageclient 9 and the `fork` of VS Code's Electron both change the server options object they get, and the next start lost the variable. Each start now gets new options.
