---
'@tsrx/core': patch
---

Renaming a name in the editor now replaces all of a reference written with a Unicode escape. The editor output prints the name the escape spells, and its mapping covered only as many characters as the name, so renaming `a` where a reference is written `props.\u0061` edited only the `\` and left `props.renamedu0061`. Hover, references and diagnostics on such a name now cover all of it as well, on every target, for identifiers, private names (`#\u0061`) and attribute names (`\u0063lassName`, which Solid and Vue print as `class`).
