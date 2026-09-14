---
'@tsrx/runtime': patch
'@tsrx/core': patch
---

Remove the unused `exclude_prop_from_object` language helper (also re-exported from `@tsrx/core/runtime/language-helpers`). Its last in-repo callers, the Solid and Vue `<Dynamic>` runtime wrappers, were replaced by compiler lowering; props are plain objects, so a `const { is, ...rest } = props` spread covers the remaining use.
