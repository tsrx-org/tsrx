---
'@tsrx/core': patch
---

A `return` right in a class `static` block, also in a block or a loop there, is now TypeScript's checker error for it, `TS18041` (`A 'return' statement cannot be used inside a class static block.`), at the `return`. A strict compile throws it, as it threw `TS1108` before. A collecting compile and the editor record it and read on, where the parse stopped there, so the editor lost the rest of the file's diagnostics; the editor now shows TypeScript's own `TS18041` there. A `return` in a template in a `static` block keeps its template error, and one in a class in a template is the class's. As in TypeScript, a `return` in the operand of a reported one isn't reported, and one in an ambient class's `static` block is left to TypeScript's `TS1036`, as any statement there is.
