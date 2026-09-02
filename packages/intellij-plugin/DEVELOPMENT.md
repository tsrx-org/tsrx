# IntelliJ plugin development

## Build and verify locally

Run commands from the repository root with Java 21:

```sh
node scripts/sync-intellij-plugin-version.js --check
packages/intellij-plugin/gradlew -p packages/intellij-plugin \
  test verifyPluginProjectConfiguration buildPlugin verifyPluginStructure verifyPlugin
```

The archive is written to `packages/intellij-plugin/build/distributions`. It
contains the plugin descriptors, MIT license, icon, pinned language-server
version, and generated TextMate bundle.

The plugin targets compatible IntelliJ-based IDEs from 2025.2 onward. WebStorm
2025.2.4 is the reference build used for compilation, platform tests, and Plugin
Verifier. Syntax support does not load the optional LSP classes; IDEs exposing the
Ultimate and LSP modules additionally receive language-server features.

## Install-from-disk smoke test

Build the ZIP, then open **Settings → Plugins → ⚙ → Install Plugin from Disk** in
a clean IDE profile and select that archive.

In WebStorm, open `src/App.tsrx` from the test fixture and confirm the icon,
comments, syntax highlighting, diagnostics, completion, navigation, and
formatting. In a syntax-only IDE, confirm the file type and highlighting work
without starting a language-server download.

The managed language server is installed with npm lifecycle scripts disabled.
Gradle derives its exact pinned version directly from
`packages/language-server/package.json`; do not duplicate that version in IntelliJ
configuration. Before releasing a new language-server version, verify the
published package with:

```sh
node packages/intellij-plugin/scripts/verify-language-server-release.mjs
```

## Continuous integration

`.github/workflows/intellij-plugin.yml` contains one pull-request job. It runs
only when the IntelliJ plugin, canonical TextMate grammar, or their generation
scripts change, and performs the platform tests, build, structure checks, and one
WebStorm Plugin Verifier pass.

## Signing and Marketplace publication

The plugin XML ID is `tsrx.intellij-plugin`. The deleted third-party listing used
a different ID and is intentionally not reused.

Changesets owns the plugin version. When the **Version Packages** commit changes
`packages/intellij-plugin/package.json`, the conditional IntelliJ job in
`.github/workflows/publish.yml` waits for the repository's npm publication job,
then repeats the release checks, signs the archive, and publishes the update to
Marketplace. The initial `0.0.82` submission was uploaded manually; the workflow
is only responsible for later versions. It always retains the signed ZIP when
signing succeeds, including when Marketplace rejects the upload.

Configure `JETBRAINS_MARKETPLACE_CERTIFICATE_CHAIN`,
`JETBRAINS_MARKETPLACE_PRIVATE_KEY`, `JETBRAINS_MARKETPLACE_PRIVATE_KEY_PASSWORD`,
and `JETBRAINS_MARKETPLACE_PUBLISH_TOKEN` as `tsrx-org` organization Actions
secrets scoped to the `tsrx` repository. All four values are required for
automated updates. The workflow maps the namespaced GitHub secrets to the
environment variable names expected by Gradle. The `jetbrains-marketplace` GitHub
environment continues to provide the protected deployment boundary.

See [MARKETPLACE_RELEASE.md](./MARKETPLACE_RELEASE.md) for the first-submission
checklist.
