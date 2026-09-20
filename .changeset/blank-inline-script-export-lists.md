---
'@tsrx/typescript-plugin': patch
---

Blank a `<script>` body's local export lists (`export { value as alias }`) and rewrite anonymous `export default function` / `class` to `void` expressions, so dead inline-script exports stay valid TypeScript inside the appended block.
