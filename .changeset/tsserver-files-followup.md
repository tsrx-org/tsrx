---
'@tsrx/vscode-plugin': patch
---

**TSRX: Go to Source Definition** now opens a definition in an unsaved document. Before, it opened a `file:` path that doesn't exist. In a tab that VS Code's TypeScript doesn't serve, such as a `git:` one, Go to Source Definition and Find File References now say "Unknown file type.", as VS Code's own commands do, instead of "Cannot read properties of undefined (reading 'includes')". Find File References runs that overlap now change `references.preferredLocation` one at a time, so each one shows in the References view.
