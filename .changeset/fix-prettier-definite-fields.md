---
'@tsrx/prettier-plugin': patch
---

Keep the `!` on class fields with a definite-assignment assertion
(`value!: string;`) when formatting TSRX files. Previously the marker was
dropped, so strict type checking reported the field as never assigned (TS2564).
