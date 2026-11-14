---
'@tsrx/core': patch
---

An attribute with an empty value, such as `title={}` or `title={/* c */}`, is now an error: TS17000, at its braces, where TypeScript reports it, in acorn-typescript's words (`JSX attributes must only be assigned a non-empty expression`). A strict compile throws it, and a collecting or loose compile records it and keeps the attribute. It compiled before with no error, and the next tool rejected `title={}` in the output.
