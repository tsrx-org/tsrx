---
'@tsrx/core': patch
---

Add `createTargetCompiler(platform)`, which builds a target package's `parse` / `compile` / `compile_to_volar_mappings` entry points from its `JsxPlatform` descriptor. The React, Preact, Solid, and Vue compilers now share this pipeline instead of each carrying a copy; external targets can adopt the same seam.
