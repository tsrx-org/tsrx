---
'@tsrx/typescript-plugin': minor
---

`tsrx-tsc` runs on TypeScript 7. When the installed `typescript` is a 7.1 nightly with the content-mapper protocol (`7.1.0-dev.20260822.1` or newer), the command finds the native compiler through the launcher's platform package and runs it with `--runExternalCode`, so `.tsrx` files are type-checked through `@tsrx/content-mapper` (now an optional peer dependency) and one `package.json` script serves TypeScript 5.9, 6 and 7. It refuses to run a project whose `tsconfig.json` (through `extends`) declares no content mapper for `.tsrx` rather than let TypeScript skip those files, and explains a TypeScript 7 build without the protocol (the stable 7.0 releases, earlier nightlies) instead of failing on the package's export map.
