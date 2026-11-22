---
'@tsrx/core': patch
---

An `animation` or `animation-name` declaration with a space before its colon now gets the scope hash on the keyframes name it uses. The stylesheet transform read the value from the character right after the property name, so in `.a { animation :spin 1s }` it read `:spin`, left the name unhashed while `@keyframes spin` became `@keyframes <hash>-spin`, and the element never animated.
