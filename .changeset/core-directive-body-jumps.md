---
'@tsrx/core': patch
'@tsrx/solid': patch
---

Report a `break` or `continue` that would jump out of an `@try`, `@pending`, `@catch` or `@empty` body, or out of a nested `@{ … }` block, as TSRX2036 or TSRX2037, and a `continue` that would leave an `@switch` case as TSRX2037. Every target runs those bodies in functions of their own, so the jump couldn't reach the loop, `switch` or label outside, and the compiled output didn't parse; a `break` or `continue` to a loop, `switch` or label inside the body still works. A `break` nested in an `@switch` case, such as `if (done) break;`, is now TSRX2008, as a `break` right in the case already was; Solid's output didn't parse, and the other targets rendered nothing for the `@switch` when the `break` ran.
