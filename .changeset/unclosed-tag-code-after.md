---
'@tsrx/core': patch
---

A collecting or loose parse reports an unclosed tag (TSRX1001) and goes on, instead of throwing a later error caused by it, in these shapes:

- A tag left open in code, whose text starts with the code after it: `return (<div>);`, `c ? <b> : null`, `[<div>]`. That text is read as code again, so Prettier, ESLint and the editor show TSRX1001 instead of `Unexpected token`.
- An unclosed `<style>` or `<script>`, whose body now ends at the next tag inside a template, or at the `}` that closes the block it's in (`@{ <style>.a {} }`), in a collecting parse as in a loose one. A collecting parse no longer throws the CSS error (`Expected identifier`) of the rest of the file, and the editor no longer reports `'}' expected` at the end of the file.

The editor's code no longer moves an unclosed element to a module-level constant, where it lost the closing tag that keeps the code valid.
