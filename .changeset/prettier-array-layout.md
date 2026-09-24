---
'@tsrx/prettier-plugin': patch
---

Arrays now format the way Prettier formats them. An array breaks only when it
doesn't fit on the line, or when every element is an object (or every element
an array) with more than one entry. An array written across several lines that
fits on one, such as `['a', 'b']`, now collapses to one line. A blank line
between elements is kept only when the array breaks. Number-only arrays pack
several numbers per line. An object inside an array prints like any other
object, so a one-property object written across lines stays that way.

`trailingComma: "none"` now also applies to arrays with a blank line between
elements, which used to print a comma after the last element with every
setting. A trailing hole (`[1, 2, ,]`) still keeps the comma that creates it.

Call arguments follow two more of Prettier's rules: an array after a lone
arrow function (`useMemo(() => value, [deps])`) and a number-only array after
other arguments break out with the other arguments instead of expanding in
place. A declaration whose `= [` doesn't fit on its line breaks after the `=`.
