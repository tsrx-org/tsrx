---
'@tsrx/typescript-plugin': patch
---

The tsserver plugin now type-checks `<script>` bodies inside `.tsrx` files. Volar does not honor `getExtraServiceScripts` on that path, so those bodies were blanked in the generated TSX and had no TypeScript program; they are now appended to the root service script with source mappings.
