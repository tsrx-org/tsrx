---
'@tsrx/core': patch
---

In the editor, a member expression or call written right after a `{`, as in `function f() {user.a.b;` or `<p>@{user.a.b}</p>`, now maps to its own text. It mapped from the line break and indent the printer puts after the `{`, so a diagnostic on it started that many characters late: TypeScript's `'user.a' is possibly 'undefined'` showed on `er.a`, and `TSRX2035` on `a.b`.
