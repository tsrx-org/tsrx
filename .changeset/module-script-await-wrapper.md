---
'@tsrx/typescript-plugin': patch
'@tsrx/content-mapper': patch
---

Type-check embedded `<script>` bodies as an async IIFE so a `<script type="module">` body's top-level `await` and `export` are legal, while declarations stay isolated from the component and from each other. `export … from` is hoisted with `import` declarations.
