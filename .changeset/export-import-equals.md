---
'@tsrx/core': patch
---

Keep `export` on TypeScript import-equals aliases (`export import Alias = Foo;`,
`export import fs = require('fs');`) when compiling TSRX files. The compilers
printed a plain `import Alias = Foo`, so the module silently stopped exporting
the alias. Editor output now also maps the whole exported statement back to its
source.
