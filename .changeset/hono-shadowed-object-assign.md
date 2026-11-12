---
'@tsrx/hono': patch
---

The Hono DOM check for async components no longer treats `assign` on a local
binding named `Object` as the built-in `Object.assign`. A value passed after the
first argument of such a call now counts as possibly written, so an async member
the call may replace is no longer reported as an async component.
