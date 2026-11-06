---
'@tsrx/vscode-plugin': minor
---

The TypeScript 7 extension closes tags in `.tsrx` files itself since version 1.0.2,
so this extension no longer does. The `tsrx.autoClosingTags.enabled` setting is
removed: on TypeScript 7, use `js/ts.autoClosingTags.enabled`, as on VS Code's
built-in TypeScript. With an older TypeScript 7 extension, nothing closes tags in
`.tsrx` files, so update it to 1.0.2 or newer.

A setup where TypeScript 7 cannot serve `.tsrx` files, such as the extension's built-in
7.0.2 before it uses the project's TypeScript, no longer gets closing tags at all,
because this extension supplied them.

The TypeScript 7 setup no longer needs `js/ts.tsdk.path` by hand. The TypeScript 7
extension now finds `node_modules/typescript` and asks whether to use it: choose
**Use Workspace Version**. TSRX's **Use Project TypeScript** button now also finds
`@typescript/native` and `@typescript/native-preview`, in the extension's order, and
the status item resolves a relative `tsdk` setting against the first workspace
folder, as the extension does.
