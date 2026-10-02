# Neovim Plugin Development

## Editor tests (local)

`editor-tests/run.js` starts headless Neovim per scenario in a temporary project
with this repository's plugin. The project's server is this repository's
`@tsrx/language-server`, packed and installed outside the repository as an editor
installs it, so no `typescript` sits next to it. Neovim opens a `.tsrx` file, and
`editor-tests/check.lua` records which TypeScript the server runs, the warning the
server sends when it finds none it can run, and whether Neovim shows that warning.

```sh
pnpm --filter @tsrx/nvim-plugin test:editor
pnpm --filter @tsrx/nvim-plugin test:editor -- --keep
```

Neovim: `TSRX_NVIM`, else `nvim` on `PATH`, else `~/.local/opt/nvim-*/bin/nvim`.
`--keep` keeps the temporary directory. Packing the server needs network access.
The tests are not part of `pnpm test` or CI.
