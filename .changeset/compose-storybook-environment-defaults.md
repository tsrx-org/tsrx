---
'@tsrx/core': patch
'@tsrx/vite-plugin-react': patch
'@tsrx/vite-plugin-preact': patch
'@tsrx/vite-plugin-solid': patch
'@tsrx/vite-plugin-vue': patch
'@tsrx/vite-plugin-hono': patch
---

Compose TSRX platform flags into compatible JSON `import.meta.env` defaults so Storybook Vite builds and development canvases work with an explicit platform. Keep rejecting conflicting or incomplete platform definitions.

Refresh extracted Solid and Vue CSS before hot-update requests so simultaneous template and style edits use matching scope hashes, and removing styles clears the cached sheet.
