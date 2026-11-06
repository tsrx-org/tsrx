---
'@tsrx/vscode-plugin': patch
---

The TypeScript 7 setup no longer needs `js/ts.tsdk.path` by hand. The TypeScript 7
extension finds `node_modules/typescript` since version 1.0.2 and asks whether to use
it: choose **Use Workspace Version**. TSRX still closes tags in `.tsrx` files, and from
1.0.2 TypeScript 7 closes them too, so to turn closing tags off on TypeScript 7, set
both `tsrx.autoClosingTags.enabled` and `js/ts.autoClosingTags.enabled` to `false`.

The status item now names the compiler the TypeScript 7 server reports, with extension
1.0.2 or newer. It used to name the compiler the settings point to, so it could say 7.1,
with no notice, while the built-in 7.0.2 ran: with a workspace `tsdk` setting the user
has not allowed, or with a package whose platform binary is missing. For a setting that
is not allowed, the notice now opens the extension's version picker.

TSRX's **Use Project TypeScript** button now also finds `@typescript/native` and
`@typescript/native-preview`, in the extension's order, and a relative `tsdk` setting in
a window with several folders and no saved workspace resolves against the first folder,
as it does in the extension.
