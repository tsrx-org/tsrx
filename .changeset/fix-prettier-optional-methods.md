---
'@tsrx/prettier-plugin': patch
---

Keep the `?` on optional class methods (`onMount?(): void;`) when formatting
TSRX files. Previously the marker was dropped, which made the method required
and broke type checking for objects that leave it out.
