---
'@tsrx/language-server': patch
---

Tags now close in editors other than VS Code. When you type the `>` that ends an opening tag, the server answers on-type formatting (`textDocument/onTypeFormatting`) with the closing tag: `<div>` becomes `<div></div>`. Zed 1.17 or newer, Neovim and JetBrains IDEs keep the cursor between the tags. Before, only VS Code closed tags, and on-type formatting for `>` returned nothing.

To turn closing tags off, set `tsrx.autoClosingTags.enabled` to `false`. An editor that closes tags another way sets the new `closeTagsOnType` initialization option to `false`. The server then offers no on-type formatting. The VS Code extension does this.

On the classic backend, the server no longer offers on-type formatting for `;`, `}` and new lines. For `.tsrx` files, it returned nothing.
