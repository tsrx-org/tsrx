---
'@tsrx/core': minor
---

A `-` in a JSX member name's part after a `.` (`<X.A-b />`) now fails as in TypeScript, which reads that part as an identifier and stops it at the `-`: TS1003 `Identifier expected.` at the `-` in an opening tag, and TS1005 `'>' expected.` in a closing one. The compiler read `A-b` as the part and printed the tag as written. esbuild, oxc (Vite), Bun and vue-jsx-vapor reject that output, rspack's SWC compiles it to `X.A - b`, and only Solid's Babel read it as `X["A-b"]`. A `-` in the first part (`<a-b.c />`), in a namespaced name (`<x:a-b />`), or in a tag's or attribute's name without a `.` (`<my-element data-x="1" />`) is unchanged.

Migration: to render a component whose property name has a `-`, name it first (`const AB = X['A-b'];`, then `<AB />`), or use a dynamic tag (`<{X['A-b']} />`).
