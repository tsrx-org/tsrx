---
'@tsrx/prettier-plugin': patch
---

The formatter now follows `trailingComma: "none"` in arrays with a blank line
between elements. It used to print a comma after the last element of such an
array (`2,` instead of `2`) with every `trailingComma` setting. A trailing hole
(`[1, 2, ,]`) still keeps the comma that creates it.
