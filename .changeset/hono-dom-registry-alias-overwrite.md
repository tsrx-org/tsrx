---
'@tsrx/hono': patch
---

Hono DOM no longer reports `Hono JSX DOM does not support async components` for a component registry whose async member is replaced before its use through another name or by a built-in. Writing through an alias (`const registry = UI; registry.App = …`) or passing the registry to `Object.assign`, `Object.defineProperty`, `Object.defineProperties`, `Reflect.set` or `Reflect.defineProperty` now counts as replacing its members, as `UI.App = …` already did, so the build and the editor stay silent about a member they can't prove is still async. An async member that nothing writes is still reported, including one read through an alias (`const registry = UI; <registry.App />`), one whose registry was only copied (`{ ...UI }` or `const { ...copy } = UI`) or used as an `Object.assign` source, and one written through `registry ||= UI` (or `??=`, `&&=`) when `registry` is a `let` that starts as a value for which that assignment never happens.
