---
'@tsrx/typescript-plugin': patch
'@tsrx/language-server': patch
---

Fix the language server dropping the ES standard library when a project's `tsconfig.json` omits `lib`. Omitted library configuration is now left unset so TypeScript selects the target's default library through the active language-service host, while explicit `lib: []` and `noLib` configurations retain their intended semantics.
