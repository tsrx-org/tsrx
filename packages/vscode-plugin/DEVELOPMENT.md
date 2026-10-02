# VS Code extension development and publishing

## Build locally

From the repository root:

```sh
pnpm --filter @tsrx/vscode-plugin build-and-package
```

This creates `packages/vscode-plugin/vscode-plugin.vsix`. Its `build` step first
builds the workspace packages the extension ships (`@tsrx/typescript-plugin`,
`@tsrx/language-server` and their workspace dependencies with a `build` script),
so the VSIX always contains their current sources. Install that exact artifact
locally with:

```sh
pnpm --filter @tsrx/vscode-plugin install-package
```

## Editor tests (manual)

`editor-tests/` checks the built VSIX in real VS Code instances. Each scenario in
`editor-tests/scenarios.js` starts a fresh, isolated instance (its own user data
and extensions directories, so your VS Code and its settings are untouched),
installs the extensions the scenario lists, opens a copy of
`editor-tests/fixtures/react`, and checks which TypeScript serves its `.tsrx`
file: a hover, a definition, and a type error typed into the unsaved buffer.
Scenarios cover the TypeScript 7 extension with the project's 7.1 nightly, with
the TypeScript 7 Nightly extension, with its bundled compiler, switched off, and
VS Code's own TypeScript without it. `vscode-typescript-package-change` changes
the project's `package.json` and checks, in the TSRX Language Server output, that
the extension restarts the TSRX server without a connection error. It and the
`*-restart` scenarios also check that the restarted server writes to the output.

```sh
pnpm --filter @tsrx/vscode-plugin build-and-package
pnpm --filter @tsrx/vscode-plugin test:editor
pnpm --filter @tsrx/vscode-plugin test:editor -- --scenario ts7-project-nightly --verbose
```

`--list` prints the scenarios, `--build` builds the VSIX first, `--keep` keeps the
temporary directory with each instance's logs. The runner expects VS Code at
`/Applications/Visual Studio Code.app`; set `TSRX_VSCODE_APP` (the executable) and
`TSRX_VSCODE_CLI` (its `code` command) elsewhere. Installing the TypeScript 7
extensions needs network access. The tests are not part of `pnpm test` or CI.

## Publishing workflows

`.github/workflows/vsix.yml` publishes after a push to `main` changes files in
this package and the extension version differs from the previous commit.
`.github/workflows/vsix-manual.yml` packages and publishes the current commit when
manually dispatched. Both workflows publish the same VSIX to the Visual Studio
Marketplace and Open VSX.

Visual Studio Marketplace publishing uses Microsoft Entra workload identity
federation. GitHub obtains a short-lived Azure credential through OIDC, and `vsce`
consumes it with `--azure-credential`. Do not create a `VSM_TOKEN` or store an
Azure client secret. Open VSX publishing remains authenticated by the `OVSX_TOKEN`
repository secret until Open VSX trusted publishing is released and deployed.

The workspace's `@vscode/vsce` version must remain at least `2.26.1` for
`--azure-credential` support.

## One-time Visual Studio Marketplace setup

1. Create a user-assigned managed identity in the Azure subscription used for
   release automation. Assign the minimum Azure role needed to log in; Microsoft
   currently documents the Reader role for this publishing flow.
2. Add a federated credential to that identity for GitHub Actions:

   - Organization: `tsrx-org`
   - Repository: `tsrx`
   - Entity type: Environment
   - Environment: `vscode-marketplace`
   - Issuer: `https://token.actions.githubusercontent.com`
   - Audience: `api://AzureADTokenExchange`
   - Subject:
     `repo:tsrx-org@284757011/tsrx@1345339730:environment:vscode-marketplace`

   The numeric organization and repository IDs are GitHub's immutable OIDC subject
   format. Confirm the subject printed by `azure/login` before creating or
   replacing the federated credential if GitHub's OIDC configuration changes.

3. In the repository's `vscode-marketplace` environment, add these non-secret
   variables from the managed identity and Azure subscription:

   - `AZURE_CLIENT_ID`
   - `AZURE_TENANT_ID`
   - `AZURE_SUBSCRIPTION_ID`

   Restrict the environment's deployment branches to `main`.

4. Run the **Inspect VS Code Marketplace Identity** workflow. Copy the identity ID
   from its job summary.
5. In Visual Studio Marketplace publisher management, add that identity ID as a
   member of publisher `TSRX` with the Contributor role.
6. Rerun **Inspect VS Code Marketplace Identity** with **Verify publisher**
   enabled. This runs `vsce verify-pat --azure-credential TSRX` without publishing
   an extension.
7. Run **Publish VSC Extension (Manual)** from `main` and verify the resulting
   `TSRX.tsrx-vscode-plugin` listing before relying on version-triggered
   publishing.

Microsoft's current setup reference is
[Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#_secure-automated-publishing-to-visual-studio-marketplace).

## Temporary Open VSX token setup

Production Open VSX currently requires a personal access token for CI publishing.
Create a dedicated token under Open VSX **Settings → Access Tokens** and save it
as the repository secret `OVSX_TOKEN`. Do not put the token in a workflow input,
source file, issue, log, or local environment file.

Run **Inspect Open VSX Token** after creating or rotating the secret. It invokes
`ovsx verify-pat TSRX`, which verifies publishing access to the `TSRX` namespace
without publishing an extension.

Replace this secret-backed flow with Open VSX OIDC trusted publishing once both
the production registry and the released `ovsx` CLI are at least version `1.2.0`.
