# Sublime Text Package Development

## Editor tests (local)

`editor-tests/run.mjs` builds this repository's package (`TSRX.sublime-package`,
as `pnpm build` builds it), installs it, and starts Sublime Text on a temporary
project. The project's server is this repository's `@tsrx/language-server`, packed
and installed outside the repository as an editor installs it. Sublime Text opens
a `.tsrx` file, and `editor-tests/check.py`, copied into `Packages/User` for the
run, records the file's syntax and whether the TSRX language server serves it. It
also records the scope of the expression in a dynamic closing tag,
`</{props.as}>`, which must be JavaScript. The test also reads Sublime Text's
console for errors about the TSRX syntax (#1021).

```sh
pnpm --filter @tsrx/sublime-text-plugin test:editor
pnpm --filter @tsrx/sublime-text-plugin test:editor -- --keep
```

Sublime Text on macOS has no option for a separate profile, so the test uses the
one in `~/Library/Application Support/Sublime Text`. It puts back every file it
changes there: `Installed Packages/TSRX.sublime-package`, `Packages/TSRX` and its
own files in `Packages/User`. When the profile has no LSP package, the test first
installs Package Control and lets it install LSP; those stay installed. Quit
Sublime Text before the run: the test starts and stops it, and a Sublime Text
window shows meanwhile.

Sublime Text: `TSRX_SUBLIME`, else
`/Applications/Sublime Text.app/Contents/MacOS/sublime_text`. `--keep` keeps the
temporary directory with Sublime Text's console output. Installing Package
Control, LSP and the server's dependencies needs network access. The tests are not
part of `pnpm test` or CI.
