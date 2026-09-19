# Benchmarks: classic versus native TypeScript

Phase 4 of [tsrx-org/tsrx#41](https://github.com/tsrx-org/tsrx/issues/41). Classic
is `tsrx-tsc` (`@tsrx/typescript-plugin`, Volar hosting TypeScript 5.9.3) and the
TSRX language server on its classic backend. Native is TypeScript
7.1.0-dev.20260918.1 (`tsc --runExternalCode` and `tsc --lsp`) through
`@tsrx/content-mapper`, with the mapper started from `src/server.js`. Both paths
run the same type-only transform from this checkout, so the numbers isolate the
host.

Harness: `bench/bench.js`. Raw reports for the runs below are in
`bench/results/2026-09-18-macos-x64/`.

```sh
pnpm --filter @tsrx/language-server build   # the classic server runs from dist/
node bench/bench.js                                        # consumer fixture
node bench/bench.js --scale 25                             # 25 copies of it
node bench/bench.js --project ../../../ripple/playground/ripple --edit src/App.tsrx
node bench/bench.js --runs 5 --edits 5 --json out.json     # defaults shown
```

## Method

Every measurement is repeated (`--runs`, default 5) and reported as median
(min–max). The order is classic then native, cold checks, then warm checks, then
language-server sessions.

| Measurement         | How                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold check          | `<tsc> --noEmit -p tsconfig.json --pretty false` in a fresh process, no tsbuildinfo. Wall time from spawn to exit.                                                                                                                                                                                                                                                            |
| Warm check          | The same command with `--incremental --tsBuildInfoFile <tmp>` after one unmeasured priming run, so the tsbuildinfo exists and matches.                                                                                                                                                                                                                                        |
| Single-edit latency | One language-server session per run: `initialize`, open the edit file, wait for its first diagnostics, then `--edits` (default 5) edits that each prepend a new top-level `const` declaration, timing `didChange` → diagnostics. Native uses pull diagnostics (after the `.tsrx` registration arrives); classic waits for the `publishDiagnostics` notification for the file. |
| Peak memory         | Every 50 ms, `ps -axo pid,ppid,rss` is read and the resident set sizes of the process tree under the measured process are summed; the maximum over the run is reported (MiB).                                                                                                                                                                                                 |
| Process count       | From the same samples: the largest number of processes in that tree, and how many of them are content-mapper processes (`args` containing `content-mapper`).                                                                                                                                                                                                                  |

The same `tsconfig.json`, carrying `contentMappers`, serves both paths: TypeScript
5 ignores the key (`COMPATIBILITY.md` row 16), and both language servers discover
`tsconfig.json` rather than a sidecar. The edit file is the first `.tsrx` file
found (or `--edit`). Diagnostic counts and exit codes are recorded to show the two
paths checked the same thing.

## Environment

- MacBookPro16,1, Intel Core i9-9980HK (8 cores, 16 threads), 64 GiB
- macOS 15 (Darwin 25.6.0), x64, Node v24.18.0
- TypeScript 5.9.3 (classic), TypeScript 7.1.0-dev.20260918.1 (native)
- 2026-09-18, five runs and five edits per session everywhere

## Results

### Consumer fixture (React; 2 `.tsrx` files, 41 lines, 1 `.ts` file)

| Measurement                       |          classic |        native |
| --------------------------------- | ---------------: | ------------: |
| Cold check, wall ms               | 1274 (1262–1305) | 601 (600–624) |
| Cold check, peak RSS MiB          |    296 (284–303) | 184 (177–186) |
| Cold check, processes (mappers)   |            1 (0) |         2 (1) |
| Cold check, diagnostics / exit    |            1 / 2 |         1 / 2 |
| Warm check (incremental), wall ms | 1167 (1149–1185) | 596 (592–603) |
| Warm check, peak RSS MiB          |    267 (264–273) | 180 (138–181) |
| Warm check, diagnostics / exit    |            1 / 1 |         1 / 2 |
| LSP initialize, ms                |    513 (510–517) |       2 (2–2) |
| LSP open → first diagnostics, ms  |    934 (925–943) | 590 (585–625) |
| LSP single edit → diagnostics, ms |    365 (349–375) |    91 (83–97) |
| LSP session, peak RSS MiB         |    364 (360–367) | 207 (201–209) |
| LSP session, processes (mappers)  |            1 (0) |         2 (1) |

### Consumer fixture ×25 (50 `.tsrx` files, 1,025 lines, 25 `.ts` files)

| Measurement                       |          classic |        native |
| --------------------------------- | ---------------: | ------------: |
| Cold check, wall ms               | 1837 (1819–1918) | 762 (743–862) |
| Cold check, peak RSS MiB          |    377 (375–383) | 208 (199–225) |
| Cold check, processes (mappers)   |            1 (0) |         2 (1) |
| Cold check, diagnostics / exit    |           25 / 2 |        25 / 2 |
| Warm check (incremental), wall ms | 1503 (1467–1538) | 743 (729–855) |
| Warm check, peak RSS MiB          |    311 (289–337) | 201 (190–219) |
| Warm check, diagnostics / exit    |           25 / 1 |        25 / 2 |
| LSP initialize, ms                |    438 (406–507) |       2 (2–2) |
| LSP open → first diagnostics, ms  | 1121 (1102–1131) | 794 (778–808) |
| LSP single edit → diagnostics, ms |    363 (283–387) |   93 (88–111) |
| LSP session, peak RSS MiB         |    383 (373–389) | 251 (250–259) |
| LSP session, processes (mappers)  |            1 (0) |         2 (1) |

### Consumer fixture ×100 (200 `.tsrx` files, 4,100 lines, 100 `.ts` files)

| Measurement                       |          classic |           native |
| --------------------------------- | ---------------: | ---------------: |
| Cold check, wall ms               | 3060 (3007–3084) | 1096 (1066–1131) |
| Cold check, peak RSS MiB          |    426 (425–432) |    271 (266–274) |
| Cold check, processes (mappers)   |            1 (0) |            2 (1) |
| Cold check, diagnostics / exit    |          100 / 2 |          100 / 2 |
| Warm check (incremental), wall ms | 2093 (1988–2882) |  1003 (966–1046) |
| Warm check, peak RSS MiB          |    370 (365–383) |    264 (261–273) |
| Warm check, diagnostics / exit    |          100 / 1 |          100 / 2 |
| LSP initialize, ms                |    554 (421–648) |          2 (2–2) |
| LSP open → first diagnostics, ms  | 1581 (1488–1885) | 1093 (1052–1257) |
| LSP single edit → diagnostics, ms |    369 (290–435) |      95 (89–133) |
| LSP session, peak RSS MiB         |    413 (411–431) |    320 (315–327) |
| LSP session, processes (mappers)  |            1 (0) |            2 (1) |

### Ripple playground (external `@tsrx/ripple`; 2 `.tsrx` files, 1,655 lines, 3 `.ts` files)

`playground/ripple` in the Ripple repository, checked with its own `tsconfig.json`
(`jsxImportSource: "ripple"`, `skipLibCheck` off). The edit file is the 1,648-line
`src/App.tsrx`.

| Measurement                       |          classic |         native |
| --------------------------------- | ---------------: | -------------: |
| Cold check, wall ms               | 2423 (2130–2993) |  677 (670–720) |
| Cold check, peak RSS MiB          |    382 (376–399) |  238 (235–241) |
| Cold check, processes (mappers)   |            1 (0) |          2 (1) |
| Cold check, diagnostics / exit    |            1 / 2 |          1 / 2 |
| Warm check (incremental), wall ms | 2844 (2401–2908) |  787 (700–901) |
| Warm check, peak RSS MiB          |    430 (425–433) |  239 (237–243) |
| Warm check, diagnostics / exit    |            1 / 1 |          1 / 2 |
| LSP initialize, ms                |    567 (446–661) |        3 (2–7) |
| LSP open → first diagnostics, ms  | 2812 (2357–3827) | 891 (852–1391) |
| LSP single edit → diagnostics, ms |    427 (397–661) |  129 (107–343) |
| LSP session, peak RSS MiB         |    502 (495–511) |  380 (379–383) |
| LSP session, processes (mappers)  |            1 (0) |          2 (1) |

## Reading the numbers

- **Cold check** is 2.1× (consumer), 2.4× (×25), 2.8× (×100) and 3.6× (Ripple
  playground) faster on native. The floor of about 600 ms on the smallest project
  is the mapper process: Node start-up, loading the target compiler, and one
  `openProject` round trip; TypeScript 7 alone checks the fixture in a fraction of
  that.
- **Warm check** with `--incremental` saves 8–30% on classic and almost nothing on
  native (the mapper start-up dominates; the tsbuildinfo cannot skip it). The warm
  classic exit code is 1 where native reports 2, a TypeScript 5 versus 7
  difference reproduced without a mapper (`COMPATIBILITY.md` row 10).
- **Single-edit latency** is 3.3–4× lower on native (about 90–130 ms against
  360–430 ms) and does not grow with project size in this range on either path.
  The classic figure includes Volar's diagnostics scheduling, which is what an
  editor user waits for too.
- **First diagnostics after open** includes project load on both paths (native
  reports `initialize` in 2 ms and does the work when the first file opens).
  Native is 1.4–3.2× faster; the Ripple playground gains most.
- **Peak memory** is 25–45% lower on native even though it is the sum of two
  processes (the Go `tsc` and the Node mapper). The mapper process alone is about
  130–180 MiB on these projects (it loads the target compiler and the transform);
  the classic figure is one Node process hosting TypeScript 5, Volar and the same
  compiler.
- **Process count** is two on native (`tsc` plus one mapper per invocation or
  session) against one on classic. One mapper serves every configured project in a
  session (`native-lsp.test.js` covers two projects in one server).

Diagnostic counts and exit codes match across paths on every project, so the runs
compared equal work. Each figure is five runs on one machine; treat the ratios,
not the absolute milliseconds, as the result.

## Start-up floor of the mapper (2026-09-19)

The ~600 ms floor of a native cold check is the mapper process starting. Best of
five on the same machine (Node 24.18), measured with `spawnSync`:

| Step                                           | ms  |
| ---------------------------------------------- | --- |
| Bare `node -e ""`                              | 66  |
| `require('typescript')` (the JavaScript API)   | 268 |
| `import('src/mapper.js')` (includes the above) | 326 |
| Mapper plus the `@tsrx/react` compiler         | 380 |

About a third of the floor is loading TypeScript's JavaScript API, which the
mapper only uses to read `tsconfig.json` and resolve the compiler. Replacing that
with a dedicated tsconfig reader (tracked in tsrx-org/tsrx#136) would also remove
the mapper's `typescript` dependency.
