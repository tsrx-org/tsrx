---
'@tsrx/core': patch
---

Give `analyzeCss` file-relative `pos`/`end`/`loc` for `:global` placement errors. `parseStyle` now records the style body's file origin (`start` / `sourceLine` / `sourceColumn`) so CSS nodes carry `loc` and a `sourceStart` while keeping body-relative `start`/`end` for stylesheet rendering. Direct `analyzeCss(sheet)` callers (and optional `{ filename, errors, comments, start }`) can place editor squiggles; `compile` / `compile_to_volar_mappings` are unchanged.
