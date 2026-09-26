---
'@tsrx/prettier-plugin': patch
---

A comment inside `{" "}` stays when that expression is beside a comment
between JSX children. It was treated as the comment run's space, so the
comment was dropped.
