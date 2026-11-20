---
'@tsrx/core': patch
---

A name the compiler generates no longer collides with an authored name that spells one of its characters with a Unicode escape. The compiler skips names the module already uses when it names a hoisted static, a static renamed after a collision between functions of the same name, a spread or ref temporary or a helper component, but it read the source as written, so `const App__st\u0061tic1 = 0;` beside a component with a static compiled to two `App__static1` declarations, and the module failed to parse. The check now also reads the source with its `\uXXXX` and `\u{…}` escapes decoded.
