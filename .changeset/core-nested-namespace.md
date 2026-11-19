---
'@tsrx/core': patch
---

Report a namespace or module declared outside the module's or a namespace's body, in a function, block, `if`, loop, label, `case`, static block or template body, as TypeScript does: TS1235 (`A namespace declaration is only allowed at the top level of a namespace or module.`), or TS1234 (`An ambient module declaration is only allowed at the top level in a file.`) for `module "m"` or `global`, at the declaration's first token. The compile used to report nothing and emit output that doesn't parse. After `export` in a block, `global` and `module "m"` are TS1234 too, where they were TS1184 or TS1235, and `declare` or `abstract` before one there is no longer reported on its own. The editor's code maps the declaration's first token, so the editor shows TypeScript's own error there, once.
