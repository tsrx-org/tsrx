---
'@tsrx/core': patch
---

Export `isSvgTagName` and `isMathmlTagName` predicates for case-sensitive tag-name membership checks. Target compilers can reuse the core tag-name sets for lowering decisions, including SVG names shared with HTML, without changing ref-type namespace inference.
