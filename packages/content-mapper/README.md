# @tsrx/content-mapper

TypeScript 7 content mapper for `.tsrx` files. It lets native TypeScript (`tsc`
from the `typescript@7` line, and the TypeScript 7 language server) type-check
`.tsrx` modules through the upstream content-mapper protocol, reusing the same
target-specific type-only transform that powers `@tsrx/typescript-plugin` and the
classic Volar path.

Tracking issue: https://github.com/tsrx-org/tsrx/issues/41

## Status

Phase 0 (baseline) of the plan in the tracking issue. The mapper itself lands in
Phase 1.

## Development

### Native TypeScript binary

The mapper is tested against an exact TypeScript 7 nightly. The `typescript@7.x`
package is only a thin launcher: its `bin/tsc` calls `lib/getExePath.js`, which
resolves the platform package `@typescript/typescript-<os>-<arch>` and runs
`lib/tsc` (or `lib/tsc.exe`) from it. That platform package is self-contained (the
Go binary plus the `lib.*.d.ts` library files), so this repository pins the
platform packages directly instead of the launcher:

- `package.json` at the repository root lists every
  `@typescript/typescript-<os>-<arch>` package under `optionalDependencies` at the
  exact nightly version. pnpm installs only the one matching the current
  `process.platform` and `process.arch`.
- Pinning the platform packages avoids a `tsc` bin conflict with the classic
  `typescript` catalog entry, which stays on the 5.x line for the Volar path.
- The pinned nightly is also listed under `minimumReleaseAgeExclude` in
  `pnpm-workspace.yaml` because it is newer than the workspace's release-age
  policy.
- `@typescript/native-preview` (the `tsgo` used by `pnpm typecheck`) is a
  different, older build and does not contain the content-mapper feature.

Tests locate the binary as
`node_modules/@typescript/typescript-${process.platform}-${process.arch}/lib/tsc`
resolved from the repository root. A missing binary fails the test instead of
skipping it.

To move to a newer nightly, update the version in the root `package.json`
(`optionalDependencies`) and in `pnpm-workspace.yaml`
(`minimumReleaseAgeExclude`), then run `pnpm install`.

### Parity fixture

`tests/fixtures/consumer/` is the reference project: two `.tsrx` modules that
import each other, a `.ts` importer, one intentional cross-file prop-type error,
one embedded `<script>` block, and one `<style>` block with a scoped class.
`tests/fixtures/consumer/expected-diagnostics.json` records the classic `tsrx-tsc`
output (file, position, code, message, exit status) and is the parity target for
the native path.

```sh
pnpm test --project content-mapper
```
