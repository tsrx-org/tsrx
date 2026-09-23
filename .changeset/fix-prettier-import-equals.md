---
'@tsrx/prettier-plugin': patch
---

Keep TypeScript import aliases (`import Alias = Foo.Bar;`,
`import fs = require("fs");`, `export import`), export assignments
(`export = value;`), and `export as namespace` declarations when formatting
TSRX files. Previously each was replaced with an `Unknown:` comment, which
removed a runtime binding from otherwise working modules.
