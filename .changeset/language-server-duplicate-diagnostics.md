---
'@tsrx/language-server': patch
---

Show each mistake once in the editor (#946). The parser collects some mistakes that TypeScript's parser accepts, such as a rest element's default or a redeclared `let`, and TypeScript reported them again from the virtual code. When TypeScript reports the same code at the same place, the editor now shows only TypeScript's diagnostic, which has TypeScript's message and quick fixes. A mistake TypeScript doesn't report there, or any mistake while TypeScript validation is off, still comes from TSRX.
