---
"@tsrx/core": patch
---

Allow lazy binding patterns anywhere a destructuring pattern is valid: nested inside destructuring assignment targets (`[&{ name }] = pairs`) and as `for`–`of` / `for`–`in` / `@for` loop targets (`@for (&{ label } of items)`). Lazy patterns in plain expression positions now report a descriptive error instead of a generic unexpected-token failure.
