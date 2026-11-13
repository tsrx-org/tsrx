# @tsrx/bun-plugin-vue

## 0.1.0

### Minor Changes

- [#1296](https://github.com/tsrx-org/tsrx/pull/1296)
  [`00a238c`](https://github.com/tsrx-org/tsrx/commit/00a238cc95013ca90e1fc2bd5fbb47b80c942664)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The Vue packages now
  need `vue` 3.6 or later, including 3.6.0's prereleases (`>=3.6.0-0`), and
  `vue-jsx-vapor` 3.2.27 or a later stable release (`>=3.2.27`). Until Vue 3.6.0
  is stable, install it as `"vue@^3.6.0-0"`.

  - Vue 3.5 has no Vapor, so a Vue 3.5 project never built. Under npm, the old
    `vue >=3.5` also rejected every Vue 3.6 prerelease, so the documented
    `npm install` failed with ERESOLVE whichever Vue it named.
  - `vue-jsx-vapor` 3.2.27 is the first release that fixes both a dev worker that
    imports a module exporting a function
    ([#186](https://github.com/tsrx-org/tsrx/issues/186)) and the space after an
    element that a `{…}` container renders last
    ([#870](https://github.com/tsrx-org/tsrx/issues/870)).
  - A project on `vue-jsx-vapor` 3.2.26 or earlier now gets an unmet peer warning
    from pnpm, and an install error under pnpm's `strict-peer-dependencies`. That
    is why this is a minor release.

### Patch Changes

- [#1091](https://github.com/tsrx-org/tsrx/pull/1091)
  [`6eaee99`](https://github.com/tsrx-org/tsrx/commit/6eaee992105984b13c38f9de4edfd6ca99eae399)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Fix four Bun plugin
  bugs:

  - Plugin instances that split `.tsrx` files with `include`/`exclude` now each
    emit the scoped CSS of the files they compile. Before, the first instance
    served an empty stylesheet for every file another instance compiled (React,
    Preact, Solid, Vue).
  - Production builds now use the production JSX runtime when the tsconfig selects
    an automatic JSX setting such as `"jsx": "react-jsx"`, or none. Before,
    compiled `.tsrx` modules always called `jsxDEV` from the development runtime,
    which is undefined in React's production build, so components threw when they
    rendered (React, Preact, Hono). Under the classic `"jsx": "react"`, Bun keeps
    using the development runtime, as before. The Hono plugin no longer requires
    `Bun.Transpiler`.
  - When `Bun.build()` omits `root`, `tsrx.platform` is read from the tsconfig
    nearest the entrypoints' common directory, which is Bun's default root,
    instead of the working directory. When every entrypoint is an in-memory
    `files` entry, the working directory is still used, as Bun does.
  - With `Bun.plugin()`, including `bun:test` preloads,
    `import.meta.env.platform.*` values in compiled `.tsrx` output are now written
    in. Before, reading a flag as a value threw `undefined is not an object`.

  `@tsrx/core/config` adds `resolveTsconfigJsx()`, which reads the effective
  `compilerOptions.jsx` of the nearest tsconfig.

- [#1186](https://github.com/tsrx-org/tsrx/pull/1186)
  [`1fe10c9`](https://github.com/tsrx-org/tsrx/commit/1fe10c9f24643c969f6d2cf526098c33e44f0828)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - The Bun plugins now
  work as `bun:test` preloads registered with `Bun.plugin()`.

  - `@tsrx/bun-plugin-vue` no longer fails every test file with "Expected module
    mock to return an object". Its `createVaporApp` interop rewrite now runs only
    in `Bun.build()`, so a preload leaves every module other than `.tsrx` to Bun,
    and `require()` of CommonJS project files keeps working. Under a preload, add
    `vaporInteropPlugin` to `createVaporApp()` yourself. Vue preloads cover
    `.tsrx` modules that export plain values: a component with a template fails
    under `bun:test`, because Vue 3.6's `node` entry has no Vapor APIs. In
    `Bun.build()`, the rewrite now skips `node_modules` in its filter and loads
    `.js` files with Bun's default `jsx` loader
    ([#1151](https://github.com/tsrx-org/tsrx/issues/1151)).
  - `@tsrx/bun-plugin-hono` now loads components with a `<style>` block, which
    failed with `Expected loader to be one of "js", …`. Its virtual stylesheets
    now use the `file` namespace, the only one where Bun's runtime accepts the
    `css` loader, as the other Bun plugins do
    ([#1152](https://github.com/tsrx-org/tsrx/issues/1152)).
  - `include`, `exclude` and several plugin instances now work under
    `Bun.plugin()`, which calls only the first matching hook and fails with
    "onLoad() expects an object returned" when it returns nothing. An instance
    hands a `.tsrx` file it leaves out to the first registered TSRX plugin
    instance that includes it, or else returns what Bun loads without a plugin
    (the file's path as the default export). It serves stylesheets that any
    instance compiled.

- [#1245](https://github.com/tsrx-org/tsrx/pull/1245)
  [`ebe18dc`](https://github.com/tsrx-org/tsrx/commit/ebe18dc00dde8bceecc48392d76a3dbd1eab21cb)
  Thanks [@jonkwheeler](https://github.com/jonkwheeler)! - Run vue-jsx-vapor's
  macros, as `@tsrx/vite-plugin-vue` does. Before, the plugin passed
  `macros: true` to a transform that ignores it, so a component declared no props:
  `function Greeting({ name, greeting = 'Hello' })` mounted with `{ name: 'Ada' }`
  rendered `<p name="Ada">Hello, </p>` instead of `<p>Hello, Ada</p>`, and a
  component that reads `props.name` got `undefined`. `defineModel`, `defineSlots`,
  `defineExpose` and `defineStyle` now work too. The macros' `include` and
  `exclude` options apply as in the Vite plugin, and the plugin serves the helper
  modules the macros import, in `Bun.build()` and under `Bun.plugin()`, including
  for other instances there. A `defineStyle` stylesheet in a language other than
  CSS fails the build with a message that says so.
- Updated dependencies
  [[`2bc4f1f`](https://github.com/tsrx-org/tsrx/commit/2bc4f1fc5fcb9863c926ab3d01b0407e89bbf639),
  [`fb35a0b`](https://github.com/tsrx-org/tsrx/commit/fb35a0bf5bbea972889e2024b535d0fee3227856),
  [`28440d7`](https://github.com/tsrx-org/tsrx/commit/28440d79a59d6cf54530f386471687f99e914ae8),
  [`2646239`](https://github.com/tsrx-org/tsrx/commit/26462399753081501e78478de7495d15775e411e),
  [`6eaee99`](https://github.com/tsrx-org/tsrx/commit/6eaee992105984b13c38f9de4edfd6ca99eae399),
  [`972010b`](https://github.com/tsrx-org/tsrx/commit/972010b3654c907baa25cf2f03e3cad9b3d6c6fd),
  [`dac81a4`](https://github.com/tsrx-org/tsrx/commit/dac81a418448476aa4ab60999096dc629627c9b4),
  [`677d574`](https://github.com/tsrx-org/tsrx/commit/677d5743b8cb3d3cd57504ef81f6323ef45b8399),
  [`72956b0`](https://github.com/tsrx-org/tsrx/commit/72956b0d9a4a55c56b210b1b7669f7e04a77709c),
  [`fe2c377`](https://github.com/tsrx-org/tsrx/commit/fe2c377664bdcac510bcd137b6468bec7efe9eeb),
  [`6297ffa`](https://github.com/tsrx-org/tsrx/commit/6297ffa6527f297de69edb95af7a74a87b804970),
  [`25e5844`](https://github.com/tsrx-org/tsrx/commit/25e58444734d535385f2ca4310445b34286369cb),
  [`8c6d037`](https://github.com/tsrx-org/tsrx/commit/8c6d037fdd16d28d871126bf48fba4b2583d9bbf),
  [`54e7644`](https://github.com/tsrx-org/tsrx/commit/54e7644d256f5506fbde84e35ee5e827aaef15ad),
  [`9d8ea3e`](https://github.com/tsrx-org/tsrx/commit/9d8ea3e61a0ed083af98269f703bb73e91421e64),
  [`73c170b`](https://github.com/tsrx-org/tsrx/commit/73c170b4d14f961ce49080c604e233886e71e79d),
  [`129825c`](https://github.com/tsrx-org/tsrx/commit/129825ce427fb80b31c6fcbb148d48781a83485f),
  [`c28d0b7`](https://github.com/tsrx-org/tsrx/commit/c28d0b7356b9c4456cbe4009c5ea2d38260d7660),
  [`827030c`](https://github.com/tsrx-org/tsrx/commit/827030cd1441ec3156414a54a1ab6d3de1f4c34b),
  [`b620e02`](https://github.com/tsrx-org/tsrx/commit/b620e02c284bfdf59c105c2e5d71b14f0cc84228),
  [`d0a00dc`](https://github.com/tsrx-org/tsrx/commit/d0a00dc54713b459a208fb2e044158a46b0143da),
  [`d5015d2`](https://github.com/tsrx-org/tsrx/commit/d5015d25b33980d0509ecccf04a341081fee70db),
  [`4d1def9`](https://github.com/tsrx-org/tsrx/commit/4d1def98977820da6206df0c189a7f525203298e),
  [`6165298`](https://github.com/tsrx-org/tsrx/commit/6165298529f192d72825c7905973ae2acc881921),
  [`ee70085`](https://github.com/tsrx-org/tsrx/commit/ee700855c0c7e14b58163f4693c1797be7e96772),
  [`33022ba`](https://github.com/tsrx-org/tsrx/commit/33022ba2356f9c375242b6edc63ce65fd6215b89),
  [`66a0791`](https://github.com/tsrx-org/tsrx/commit/66a079126a2604436eb2c934ad88f8b78c7c7bc5),
  [`2b465b4`](https://github.com/tsrx-org/tsrx/commit/2b465b432b515c07047e3eadeb66ff34df95de2d),
  [`8d1541b`](https://github.com/tsrx-org/tsrx/commit/8d1541ba83643e51f86b8f46d8034c56bd70d17c),
  [`3603935`](https://github.com/tsrx-org/tsrx/commit/36039352946b9466f337f00dbc4e0662ba78a395),
  [`c7dc4ef`](https://github.com/tsrx-org/tsrx/commit/c7dc4efa939153f7b800500f1ebdc71093066340),
  [`d18720d`](https://github.com/tsrx-org/tsrx/commit/d18720d75e143c26d015d9837fb5d1c860cc0cb9),
  [`9f90c6a`](https://github.com/tsrx-org/tsrx/commit/9f90c6ae8d85f4a65853d42382f5280e504c08f8),
  [`02e39f6`](https://github.com/tsrx-org/tsrx/commit/02e39f6bf7f0941bb5b7226a02cfadeb5f9ff264),
  [`a09bc3d`](https://github.com/tsrx-org/tsrx/commit/a09bc3dffac142c0a8adc347b0683f333b78a705),
  [`bbf7092`](https://github.com/tsrx-org/tsrx/commit/bbf70925ae7944ebba8275b2090247c1e333fe54),
  [`964899b`](https://github.com/tsrx-org/tsrx/commit/964899bd268e026dfe5f4832fb44c7cbb0b42141),
  [`55d2886`](https://github.com/tsrx-org/tsrx/commit/55d2886718cd9134b5c7e7c2ba4129a24d2d94b6),
  [`9ff7b5d`](https://github.com/tsrx-org/tsrx/commit/9ff7b5d5f80e7697896d91d5674ccccb389a890d),
  [`418dc53`](https://github.com/tsrx-org/tsrx/commit/418dc530f0897c9c9f54d61eed1269490d3b29aa),
  [`80316d9`](https://github.com/tsrx-org/tsrx/commit/80316d94773c91a182d15e3bca5e7965ebc225b0),
  [`28440d7`](https://github.com/tsrx-org/tsrx/commit/28440d79a59d6cf54530f386471687f99e914ae8),
  [`135ce77`](https://github.com/tsrx-org/tsrx/commit/135ce776f67596af641c8f2772d0321dbd73274e),
  [`28440d7`](https://github.com/tsrx-org/tsrx/commit/28440d79a59d6cf54530f386471687f99e914ae8),
  [`28440d7`](https://github.com/tsrx-org/tsrx/commit/28440d79a59d6cf54530f386471687f99e914ae8),
  [`3c510ee`](https://github.com/tsrx-org/tsrx/commit/3c510ee11929af366393ce5aa582d72c1c38d3a8),
  [`f38319a`](https://github.com/tsrx-org/tsrx/commit/f38319a6a0f5a133ca0eb9efc864d9e3c69bee4f),
  [`7484f21`](https://github.com/tsrx-org/tsrx/commit/7484f2135be256f099f6e27af704e894b09ee260),
  [`21edc74`](https://github.com/tsrx-org/tsrx/commit/21edc743be4622090b007d015c2f0d2699248777),
  [`3ef0076`](https://github.com/tsrx-org/tsrx/commit/3ef00761631d95ef9fcccbae2673df371d1a4c0d),
  [`15899ed`](https://github.com/tsrx-org/tsrx/commit/15899ed7a3e324f842e5f1662ac3b2c53dbf2605),
  [`b2af266`](https://github.com/tsrx-org/tsrx/commit/b2af26663e24648ca777a6893b2e66b67d5c4d28),
  [`6dbda19`](https://github.com/tsrx-org/tsrx/commit/6dbda190b1fa875d4d196b80c0dcc2903ad41b72),
  [`059ba30`](https://github.com/tsrx-org/tsrx/commit/059ba30018bb3a74d7fbaf2de2d88068c8b30636),
  [`829de73`](https://github.com/tsrx-org/tsrx/commit/829de739887b29e42dea5328b5fb370edf5bc58e),
  [`2aa4bf8`](https://github.com/tsrx-org/tsrx/commit/2aa4bf8b1e38e8be96e149a2b5ba5b6d3c727164),
  [`da9bec8`](https://github.com/tsrx-org/tsrx/commit/da9bec849cd988e39637654951864d1dba98cfc9),
  [`4bdbe57`](https://github.com/tsrx-org/tsrx/commit/4bdbe572d5e5e0ac4a746248f7b4a9109f52e02d),
  [`0fc3819`](https://github.com/tsrx-org/tsrx/commit/0fc3819e6c91a9cc8a2723737dd47f72374ae25f),
  [`357bbcc`](https://github.com/tsrx-org/tsrx/commit/357bbcc9967848cd48a3ddcc59a4b10ed59db3a1),
  [`644583f`](https://github.com/tsrx-org/tsrx/commit/644583f0abf521bf04b615e1394d96a3fd1f0d35),
  [`91d958d`](https://github.com/tsrx-org/tsrx/commit/91d958de44c9e582cd66a5b66aff6bb37ff0ece2),
  [`e0c07b5`](https://github.com/tsrx-org/tsrx/commit/e0c07b55b199acc4fe05b705255e79020b500376),
  [`6b60554`](https://github.com/tsrx-org/tsrx/commit/6b60554c73958e7b2d00f385760d533031417f1f),
  [`6b207b6`](https://github.com/tsrx-org/tsrx/commit/6b207b65e8a339d5fe301c60e72db271ffb9a572),
  [`2473538`](https://github.com/tsrx-org/tsrx/commit/247353854e918f119dafe88f6474a2738cb82ed8),
  [`baf1452`](https://github.com/tsrx-org/tsrx/commit/baf1452ef56f7e481112dd7138a69f9010f113c7),
  [`ab3d989`](https://github.com/tsrx-org/tsrx/commit/ab3d989a68c1c2d68a2d0bfa2a94c4b9019f3f6e),
  [`bb15638`](https://github.com/tsrx-org/tsrx/commit/bb156380f69d2a7fe23d7522a02580d3f4d276af),
  [`e9330ea`](https://github.com/tsrx-org/tsrx/commit/e9330ea841e6113e10be39980aae7c0ebfd4b63a),
  [`190f797`](https://github.com/tsrx-org/tsrx/commit/190f7970cf968c978b3e5df37b4e3a97c4e7efa5),
  [`384972f`](https://github.com/tsrx-org/tsrx/commit/384972fcdd5eaeb09b92a852bb3d9ee186689286),
  [`0ee439a`](https://github.com/tsrx-org/tsrx/commit/0ee439a5d94e071ecae594229f61e9b5ee022296),
  [`56dd6f5`](https://github.com/tsrx-org/tsrx/commit/56dd6f573f9c7c822db9d33313317bed16f7fa45),
  [`10a8901`](https://github.com/tsrx-org/tsrx/commit/10a89015088a283db1f067ffe7803fef4e621859),
  [`1589310`](https://github.com/tsrx-org/tsrx/commit/1589310147fa30e065a10199e75092813ed4bb53),
  [`07e262a`](https://github.com/tsrx-org/tsrx/commit/07e262afedaf6cf614ae78dc9649437ce34d66ef),
  [`04ea4f0`](https://github.com/tsrx-org/tsrx/commit/04ea4f0bb85bc3fe25d09366cf04e70d809cc66e),
  [`0546961`](https://github.com/tsrx-org/tsrx/commit/0546961247f011b32370c6c16be3961b2bb5f533),
  [`42e3e49`](https://github.com/tsrx-org/tsrx/commit/42e3e4934d2beaa86d5048c303dfa27498599fec),
  [`70825fb`](https://github.com/tsrx-org/tsrx/commit/70825fb73774dce8753fcff7b6a8bbcdebe3a7fb),
  [`14a664d`](https://github.com/tsrx-org/tsrx/commit/14a664d8485a89c9cece8cc2080266cd89cc1329),
  [`f762c09`](https://github.com/tsrx-org/tsrx/commit/f762c09eea9f1071663bdc9d90524f21250132ff),
  [`ed8c38c`](https://github.com/tsrx-org/tsrx/commit/ed8c38c9fd948270d1136bf269f896402c0d359a),
  [`c07323a`](https://github.com/tsrx-org/tsrx/commit/c07323a54009fc3fbf95503de00d50ddb2b00725),
  [`4344150`](https://github.com/tsrx-org/tsrx/commit/4344150cc4786dd717c1df722370e519ad349647),
  [`c49216e`](https://github.com/tsrx-org/tsrx/commit/c49216e86d15b68c4d84f8763691418d74ad8744),
  [`fb35a0b`](https://github.com/tsrx-org/tsrx/commit/fb35a0bf5bbea972889e2024b535d0fee3227856),
  [`910dbae`](https://github.com/tsrx-org/tsrx/commit/910dbaea2d709ff2f53bf800042c8914bd336939),
  [`d3e8fe4`](https://github.com/tsrx-org/tsrx/commit/d3e8fe44c53fdc64030307dbaaca1448d591cc2e),
  [`e423279`](https://github.com/tsrx-org/tsrx/commit/e423279be7250a493c555bd98e243db4540d654e),
  [`5391890`](https://github.com/tsrx-org/tsrx/commit/539189010bd47564395b7ab2c7108e2b9cc53f76),
  [`5552aa5`](https://github.com/tsrx-org/tsrx/commit/5552aa5ff936fabbec7ee652155df64905968c6a),
  [`4885ba3`](https://github.com/tsrx-org/tsrx/commit/4885ba3808edf0b2a74bb84b880b9c7f4966e5de),
  [`1e58a65`](https://github.com/tsrx-org/tsrx/commit/1e58a65f2be6ff7d3aee1f4bff521d172b997159),
  [`228d7bd`](https://github.com/tsrx-org/tsrx/commit/228d7bd028e879cde8b481a0209d1c3449380c5f),
  [`5422ee1`](https://github.com/tsrx-org/tsrx/commit/5422ee180deb0422f0359629b0cdbf5533abf07b),
  [`aea883a`](https://github.com/tsrx-org/tsrx/commit/aea883a7ec7632ff467b9864052592ae948544b1),
  [`c19818c`](https://github.com/tsrx-org/tsrx/commit/c19818ce37642c4508fb2ffd41a8325367d46c36),
  [`ab5a0ff`](https://github.com/tsrx-org/tsrx/commit/ab5a0ff13138746ade811808f27f52d34668ae3f),
  [`00a238c`](https://github.com/tsrx-org/tsrx/commit/00a238cc95013ca90e1fc2bd5fbb47b80c942664),
  [`00a238c`](https://github.com/tsrx-org/tsrx/commit/00a238cc95013ca90e1fc2bd5fbb47b80c942664),
  [`04ef167`](https://github.com/tsrx-org/tsrx/commit/04ef16724d4c3d0a85cebef45fbd081673987fa0),
  [`41739c6`](https://github.com/tsrx-org/tsrx/commit/41739c6263df8ea48228c78a41c1e53d13bb4ec4),
  [`0246e95`](https://github.com/tsrx-org/tsrx/commit/0246e95f983c2efd83e3e99100d00a5ba24c9233)]:
  - @tsrx/core@0.6.0
  - @tsrx/vue@0.4.0

## 0.0.91

### Patch Changes

- Updated dependencies
  [[`0a967fc`](https://github.com/tsrx-org/tsrx/commit/0a967fcc3df20b9e9e22921ca90d604dd93cf7ec),
  [`5d7314a`](https://github.com/tsrx-org/tsrx/commit/5d7314a0615d1dfcf5ba36cf832d7b4b656885e8),
  [`a420dd1`](https://github.com/tsrx-org/tsrx/commit/a420dd1bd2e3fe7d03d4e93eb666d7d070e7bdb5),
  [`5ce0b5f`](https://github.com/tsrx-org/tsrx/commit/5ce0b5fdff3f86abf578a685869d63b8dfb61f60)]:
  - @tsrx/core@0.5.5
  - @tsrx/vue@0.3.5

## 0.0.90

### Patch Changes

- Updated dependencies
  [[`885adfb`](https://github.com/tsrx-org/tsrx/commit/885adfb87ddf6907d46e8a98267bdfdad5103d76),
  [`87dda2d`](https://github.com/tsrx-org/tsrx/commit/87dda2d5c8d6154ffe32e7494aaadfc8ac7a27aa),
  [`d2f42e8`](https://github.com/tsrx-org/tsrx/commit/d2f42e8e8403c1653c2928ac7b92c71ee04b9e42),
  [`7accf3c`](https://github.com/tsrx-org/tsrx/commit/7accf3c7fb0d56288827c1804a2d2c1fd1120bff)]:
  - @tsrx/core@0.5.4
  - @tsrx/vue@0.3.4

## 0.0.89

### Patch Changes

- Updated dependencies
  [[`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee),
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee),
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee),
  [`5abd474`](https://github.com/tsrx-org/tsrx/commit/5abd474b108bdd780cece1e88e02ccfec265aad4),
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee),
  [`836eb49`](https://github.com/tsrx-org/tsrx/commit/836eb492898dc8d7300dd31012951c1dd3d1adee),
  [`f518cb9`](https://github.com/tsrx-org/tsrx/commit/f518cb91a120e8a368cece21efbc954135f99dfe),
  [`12803d3`](https://github.com/tsrx-org/tsrx/commit/12803d3da7a8fddfbd9ec783213310e3e6520fff)]:
  - @tsrx/core@0.5.3
  - @tsrx/vue@0.3.3

## 0.0.88

### Patch Changes

- Updated dependencies
  [[`a836f17`](https://github.com/tsrx-org/tsrx/commit/a836f1730d868f4a06b6de019d5c6ff1112db34e)]:
  - @tsrx/core@0.5.2
  - @tsrx/vue@0.3.2

## 0.0.87

### Patch Changes

- Updated dependencies
  [[`b213995`](https://github.com/tsrx-org/tsrx/commit/b213995b75c1c294d76efc20445e450b3b876eb7)]:
  - @tsrx/core@0.5.1
  - @tsrx/vue@0.3.1

## 0.0.86

### Patch Changes

- Updated dependencies
  [[`00d47ed`](https://github.com/tsrx-org/tsrx/commit/00d47edc7469deb1fffc229c642136dd35abbb86),
  [`1b3bbe5`](https://github.com/tsrx-org/tsrx/commit/1b3bbe5722dec196f54632e768a920904581568a),
  [`20b17fd`](https://github.com/tsrx-org/tsrx/commit/20b17fd8b8a255e1b32eef17183f710b5b04d4af),
  [`bf793b1`](https://github.com/tsrx-org/tsrx/commit/bf793b13bdc05169b98a7c452df37ae2af4ca953),
  [`9cfadf4`](https://github.com/tsrx-org/tsrx/commit/9cfadf4c00dfee8cf546fe1ddbb68cda039d06a1),
  [`42d62c7`](https://github.com/tsrx-org/tsrx/commit/42d62c703d55fb73c49637ad6ee1e79ffe64e5d9),
  [`de88f59`](https://github.com/tsrx-org/tsrx/commit/de88f59036b5ff6824d85b15d032f79d0b9e36bc),
  [`21bb71e`](https://github.com/tsrx-org/tsrx/commit/21bb71eb3ce94d0ba187b59bf5df9f7902582a49),
  [`f78fada`](https://github.com/tsrx-org/tsrx/commit/f78fadacacff187b666014af086a7b0f3d01430c),
  [`b52c55f`](https://github.com/tsrx-org/tsrx/commit/b52c55f38126ecc76b61dd47c4e8a5aee6c0687e),
  [`454de56`](https://github.com/tsrx-org/tsrx/commit/454de565b60207d4daa8f649e02f3d34deea5ac6),
  [`1fe134b`](https://github.com/tsrx-org/tsrx/commit/1fe134b6316c0fd39688b012ebaaee125a9d2676),
  [`c70964d`](https://github.com/tsrx-org/tsrx/commit/c70964d76055f1bea742bc15b66044042ef5bfcd),
  [`1555269`](https://github.com/tsrx-org/tsrx/commit/1555269944da6e0bdbc7623afea8339d8b737af4),
  [`83c64d3`](https://github.com/tsrx-org/tsrx/commit/83c64d3073e532afdc13c60e25862e316e3e6248),
  [`3aa3b30`](https://github.com/tsrx-org/tsrx/commit/3aa3b30e7eda90482bd933cf6484d6beed60f742),
  [`fec1d81`](https://github.com/tsrx-org/tsrx/commit/fec1d8133898c043ebf71717f5b666c6357b99b6),
  [`0212b6f`](https://github.com/tsrx-org/tsrx/commit/0212b6f5eee220a90014eb57eb34926b1e71b8a9),
  [`c3a3200`](https://github.com/tsrx-org/tsrx/commit/c3a320061861625161f58380d26f2eb61c110fcc),
  [`87df3f4`](https://github.com/tsrx-org/tsrx/commit/87df3f4dac6064b33fbce4f0d7994fd2f31269c6),
  [`41be7e8`](https://github.com/tsrx-org/tsrx/commit/41be7e80e576b548448ee836b0e14d9747e63512),
  [`fcc3dc8`](https://github.com/tsrx-org/tsrx/commit/fcc3dc8151d9da9ae7813854de6876aa69c655f6),
  [`d9e9110`](https://github.com/tsrx-org/tsrx/commit/d9e911015458d677a342f70699e4ce45406b785b),
  [`1091170`](https://github.com/tsrx-org/tsrx/commit/10911705ab6ab4203c42f4bf329f00b16334fc00),
  [`4005d38`](https://github.com/tsrx-org/tsrx/commit/4005d382dba64b7b2e570b3b135a1687139d7aba),
  [`2c964db`](https://github.com/tsrx-org/tsrx/commit/2c964dbe23fe1bdae42e9f9c6329dc3bf1ec03b8),
  [`8eeec66`](https://github.com/tsrx-org/tsrx/commit/8eeec666600f8fc431f78c0040103a1c1314ce09),
  [`c8ec9cc`](https://github.com/tsrx-org/tsrx/commit/c8ec9cc0bfa3c1986ac23f6e3bd67cddf971848b),
  [`c9469b3`](https://github.com/tsrx-org/tsrx/commit/c9469b3bfe1ab5fd1f8ed615fe84ba094ac8ffac),
  [`d746930`](https://github.com/tsrx-org/tsrx/commit/d7469303cbc6ca6c4679251a0ee30eda04f744c8),
  [`e3a627a`](https://github.com/tsrx-org/tsrx/commit/e3a627ae47a5b7440959e174eeb78c07778f6148),
  [`c4fa258`](https://github.com/tsrx-org/tsrx/commit/c4fa258840b04b226f9f527d22b8b5401bdb13af),
  [`b98651c`](https://github.com/tsrx-org/tsrx/commit/b98651c0173b3cacc9d53650a6625e08afedb48f),
  [`d16852a`](https://github.com/tsrx-org/tsrx/commit/d16852a725f7ed3114ba52a9f78b7fec163c4169),
  [`5508243`](https://github.com/tsrx-org/tsrx/commit/5508243824b9984184dd936684a76e67d669d931),
  [`3ea944c`](https://github.com/tsrx-org/tsrx/commit/3ea944c41c0fb35d9118f337cfa68cee1b1424ac),
  [`d1785a1`](https://github.com/tsrx-org/tsrx/commit/d1785a10fda6517901795dc19e8560a09d1bb50e),
  [`f73b676`](https://github.com/tsrx-org/tsrx/commit/f73b676036673cb81975dae7f50ae65c6e4af358),
  [`4701beb`](https://github.com/tsrx-org/tsrx/commit/4701beb167f160945836bb9cc122aa6779bd682d),
  [`4b38c47`](https://github.com/tsrx-org/tsrx/commit/4b38c47d28e84437e074306c31d90324ccac4ffa),
  [`4a5d385`](https://github.com/tsrx-org/tsrx/commit/4a5d3859e47e6a9ad82cb8a7343f52b56bf23218),
  [`b3f3b03`](https://github.com/tsrx-org/tsrx/commit/b3f3b0384ac7ac94dcc4c6efb6b1c455433cd1bc),
  [`1dd7288`](https://github.com/tsrx-org/tsrx/commit/1dd728863fa9f945c972e94b85925e62854ede52),
  [`a5beb97`](https://github.com/tsrx-org/tsrx/commit/a5beb9773e9169d546a1a10623806ea2ec811404),
  [`944a943`](https://github.com/tsrx-org/tsrx/commit/944a943394c9fea12ea72a4e871726c172613136),
  [`9338fdd`](https://github.com/tsrx-org/tsrx/commit/9338fdd35760c4743cf1a79373c8dd2e27849e3b),
  [`2933f42`](https://github.com/tsrx-org/tsrx/commit/2933f427c289a958d108208262716d828d7dbd67),
  [`d02b7e6`](https://github.com/tsrx-org/tsrx/commit/d02b7e6119462890b27f4506d9c5d8eb5258e650),
  [`a7327be`](https://github.com/tsrx-org/tsrx/commit/a7327be124f3a5f8870acd28b46b67aac9d9691d),
  [`d1f89bd`](https://github.com/tsrx-org/tsrx/commit/d1f89bdd27e60ed41b103e546b7b8c280f24fff8),
  [`e82305f`](https://github.com/tsrx-org/tsrx/commit/e82305f84078a5f21f902a30b5cd65e8cb7f633f),
  [`94b9f91`](https://github.com/tsrx-org/tsrx/commit/94b9f91a6279cd3ff03f9c9bf54fe39cf64835e0),
  [`883a8b6`](https://github.com/tsrx-org/tsrx/commit/883a8b622c5e830433244155e13029038fae26a7),
  [`935dfe4`](https://github.com/tsrx-org/tsrx/commit/935dfe4242a07abf54d994afe3e87b9582c3ac2a),
  [`927aa91`](https://github.com/tsrx-org/tsrx/commit/927aa91ae42f06dca2a1a8809bc4149600eb60c9),
  [`3a33f71`](https://github.com/tsrx-org/tsrx/commit/3a33f7154fb8995e5cd5dc60847c8b07ce98eee9),
  [`fd9481c`](https://github.com/tsrx-org/tsrx/commit/fd9481c43470daf1cb335b74772b97886f0d8646),
  [`b51a77e`](https://github.com/tsrx-org/tsrx/commit/b51a77e08ebf686ca23eddcee6ae2ac26128e58a),
  [`3a355da`](https://github.com/tsrx-org/tsrx/commit/3a355daf22b4f9973e0e63f875de7c03fc0a2c45)]:
  - @tsrx/core@0.5.0
  - @tsrx/vue@0.3.0

## 0.0.85

### Patch Changes

- Updated dependencies
  [[`dcc53cb`](https://github.com/tsrx-org/tsrx/commit/dcc53cba3da00d5f9c155ae48c11cc89764b8333),
  [`bc68cb9`](https://github.com/tsrx-org/tsrx/commit/bc68cb947f616fb83c45f35977156d9a51b6cba7),
  [`36e131a`](https://github.com/tsrx-org/tsrx/commit/36e131ab416f96647a6b2fbe8b6c2dcdc7a39f6c),
  [`ce6bd8d`](https://github.com/tsrx-org/tsrx/commit/ce6bd8dae8693096f344c5b0b9bfa9abe66cdcdf),
  [`baaad3d`](https://github.com/tsrx-org/tsrx/commit/baaad3db8a5ec9add8c584351c2d2040bdee6f49),
  [`e927446`](https://github.com/tsrx-org/tsrx/commit/e9274468033a347f4b54b4c5b0a37e725f242da6),
  [`68d5218`](https://github.com/tsrx-org/tsrx/commit/68d5218d154c3090fe5b40dec5c254db0a780efe),
  [`3b3e128`](https://github.com/tsrx-org/tsrx/commit/3b3e12800e419cadd5e59a9738d724d14e0bd5ee),
  [`b30a4ed`](https://github.com/tsrx-org/tsrx/commit/b30a4ed8769958b86fda39d1492a35b4a229d363),
  [`bff5325`](https://github.com/tsrx-org/tsrx/commit/bff53256b05142b033d7e1753862e518901bc15f),
  [`a7246b9`](https://github.com/tsrx-org/tsrx/commit/a7246b96d409708f3dedcab75f0dc045240e29c8),
  [`24f0184`](https://github.com/tsrx-org/tsrx/commit/24f018462d33856dae1f0452e1432a8a5a535a55),
  [`cb59a43`](https://github.com/tsrx-org/tsrx/commit/cb59a4378cf2403eef1b895343f92648e3112f3b),
  [`b0cb8dd`](https://github.com/tsrx-org/tsrx/commit/b0cb8ddb72bdd2804ae7aad06bb6cc2e83fd2bec),
  [`e404adf`](https://github.com/tsrx-org/tsrx/commit/e404adfa3bd3961092d593d01a20ea7edbe6bd72),
  [`3e09ec2`](https://github.com/tsrx-org/tsrx/commit/3e09ec26a6783ddc8d3b19bdf38bed7c27249a08),
  [`c491400`](https://github.com/tsrx-org/tsrx/commit/c49140047c104cb0e46a3e6736e3fb275753548f),
  [`d734bfa`](https://github.com/tsrx-org/tsrx/commit/d734bfa8178bda5708b171a32917913b5f56f023),
  [`b932928`](https://github.com/tsrx-org/tsrx/commit/b93292872bfa355a4a1adec58de1be5c8890d9e5),
  [`b4ea5ca`](https://github.com/tsrx-org/tsrx/commit/b4ea5ca80ca4d258d808840c514e4afd898bab71),
  [`0c33754`](https://github.com/tsrx-org/tsrx/commit/0c33754e4e32d92302c11fb6a45f056f67f8e0d4),
  [`dbe1851`](https://github.com/tsrx-org/tsrx/commit/dbe18512a4e41a2535dd605ebcea1a5188c8ee5e),
  [`62ef14a`](https://github.com/tsrx-org/tsrx/commit/62ef14a7cbf2a2984849889f52e59d17babd4d2d),
  [`3d9fd90`](https://github.com/tsrx-org/tsrx/commit/3d9fd90d3e052eba3a468101e7497db21fc2e3e7)]:
  - @tsrx/core@0.4.0
  - @tsrx/vue@0.2.9

## 0.0.84

### Patch Changes

- Updated dependencies
  [[`ca86115`](https://github.com/tsrx-org/tsrx/commit/ca86115f91e9aec052bff27809b7439fd6fa7dbd),
  [`06a9c5c`](https://github.com/tsrx-org/tsrx/commit/06a9c5c699961c7ac1def5196229cc65704f358d)]:
  - @tsrx/core@0.3.3
  - @tsrx/vue@0.2.8

## 0.0.83

### Patch Changes

- Updated dependencies
  [[`c426225`](https://github.com/tsrx-org/tsrx/commit/c42622548a877bc5a1d2741c96534447679f2ae5)]:
  - @tsrx/core@0.3.2
  - @tsrx/vue@0.2.7

## 0.0.82

### Patch Changes

- Updated dependencies
  [[`b12105e`](https://github.com/tsrx-org/tsrx/commit/b12105e60a077559e55f59940cb25c0dd73eda8a)]:
  - @tsrx/core@0.3.1
  - @tsrx/vue@0.2.6

## 0.0.81

### Patch Changes

- Updated dependencies
  [[`3d6fa8c`](https://github.com/tsrx-org/tsrx/commit/3d6fa8cadecf5c550231101a899960e53796483f),
  [`5272aec`](https://github.com/tsrx-org/tsrx/commit/5272aece1c9f0cf2b07cc0f80607b2e8a470b433),
  [`f1a21f6`](https://github.com/tsrx-org/tsrx/commit/f1a21f65557a19d5069f8985dee887ca079e5c4e),
  [`61fc4d6`](https://github.com/tsrx-org/tsrx/commit/61fc4d69cc3807ca9ca423a128c0e7854d1bb36b),
  [`ae4131c`](https://github.com/tsrx-org/tsrx/commit/ae4131c5054e77b4bb1c9ac020c1c827de6ddc5c),
  [`fb52feb`](https://github.com/tsrx-org/tsrx/commit/fb52febb0661dd111e15d55b918236125ab65385),
  [`bbfe88e`](https://github.com/tsrx-org/tsrx/commit/bbfe88e058bc6eefc9c9f08acf1df61e20d44170),
  [`9e25e90`](https://github.com/tsrx-org/tsrx/commit/9e25e90a34724b1b89b7a7735dee737d91bfd0c9),
  [`3bbc283`](https://github.com/tsrx-org/tsrx/commit/3bbc283debdd6e34d598e127259dff27ee154998),
  [`f8bb16d`](https://github.com/tsrx-org/tsrx/commit/f8bb16dfe59309aa4fe19e10e2412c132d29f0d9),
  [`676d943`](https://github.com/tsrx-org/tsrx/commit/676d94395c6561d3f2f7febad1c42fb40b7b0221),
  [`8916c70`](https://github.com/tsrx-org/tsrx/commit/8916c7091156023e716c0d75f0be4a8465c6d5c4),
  [`73c956c`](https://github.com/tsrx-org/tsrx/commit/73c956cf9ea739e948ca2498dcc85fdd2b5954c5),
  [`69b5a33`](https://github.com/tsrx-org/tsrx/commit/69b5a3359edc09ec90b16a721f2f00909f3e4f21),
  [`4cf5823`](https://github.com/tsrx-org/tsrx/commit/4cf5823525daaf683b80a40037d0b7c3c2538b91),
  [`3a13af2`](https://github.com/tsrx-org/tsrx/commit/3a13af2550939c9615048e1b95f6c77ba6dca6d9),
  [`c37eb95`](https://github.com/tsrx-org/tsrx/commit/c37eb95572ec79a369300f4fa69e3a71d76b2703),
  [`3372724`](https://github.com/tsrx-org/tsrx/commit/3372724784db8b8de9ff918b3a048279a587f43d),
  [`6490e51`](https://github.com/tsrx-org/tsrx/commit/6490e519634a5697310b073495033ecbca05e457)]:
  - @tsrx/core@0.3.0
  - @tsrx/vue@0.2.5

## 0.0.80

### Patch Changes

- Updated dependencies []:
  - @tsrx/core@0.2.4
  - @tsrx/vue@0.2.4

## 0.0.79

### Patch Changes

- Updated dependencies
  [[`ba0be2d`](https://github.com/tsrx-org/tsrx/commit/ba0be2dd06c7b707912a067c20e276c4428a905b)]:
  - @tsrx/core@0.2.3
  - @tsrx/vue@0.2.3

## 0.0.78

### Patch Changes

- Updated dependencies
  [[`2d053f4`](https://github.com/tsrx-org/tsrx/commit/2d053f421f09c5c4936d8866bbeb44b924411dbb)]:
  - @tsrx/core@0.2.2
  - @tsrx/vue@0.2.2

## 0.0.77

### Patch Changes

- Updated dependencies
  [[`33d6093`](https://github.com/tsrx-org/tsrx/commit/33d60939c720d7d0bb8ab03790486a4c033dde96)]:
  - @tsrx/core@0.2.1
  - @tsrx/vue@0.2.1

## 0.0.76

### Patch Changes

- Updated dependencies
  [[`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99),
  [`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99),
  [`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99),
  [`dcc0283`](https://github.com/tsrx-org/tsrx/commit/dcc0283a7470773f8a169c8750344ad147c30c99),
  [`79c1359`](https://github.com/tsrx-org/tsrx/commit/79c1359650d7e74914e818bbf179b6a41d06370c)]:
  - @tsrx/core@0.2.0
  - @tsrx/vue@0.2.0

## 0.0.75

### Patch Changes

- [#98](https://github.com/tsrx-org/tsrx/pull/98)
  [`727d17f`](https://github.com/tsrx-org/tsrx/commit/727d17f1e535f68dc5e4478920f2de7ab71a3822)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add validated web, iOS, and
  Android compile-time platform flags, early ordinary-if specialization for TSRX
  source and virtual TypeScript, automatic inherited/project-referenced tsconfig
  resolution, and matching definitions across every in-repo Vite, Rspack,
  Turbopack, and Bun integration, with conflict checks and chained source maps.

- Updated dependencies
  [[`727d17f`](https://github.com/tsrx-org/tsrx/commit/727d17f1e535f68dc5e4478920f2de7ab71a3822)]:
  - @tsrx/core@0.1.71
  - @tsrx/vue@0.1.71

## 0.0.74

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.70

## 0.0.73

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.69

## 0.0.72

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.68

## 0.0.71

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.67

## 0.0.70

### Patch Changes

- [#70](https://github.com/tsrx-org/tsrx/pull/70)
  [`4d01eeb`](https://github.com/tsrx-org/tsrx/commit/4d01eeb0a63c3f37de7d849593e7290001e0e780)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Emit each module's virtual
  CSS import after its JavaScript imports, so an imported theme's CSS comes before
  the CSS of the block that applies it and the local rule wins at equal
  specificity. The Rspack and Turbopack loaders now keep the compiler's source map
  when a module has styles, since nothing above the import moves.

- Updated dependencies []:
  - @tsrx/vue@0.1.66

## 0.0.69

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.65

## 0.0.68

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.64

## 0.0.67

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.63

## 0.0.66

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.62

## 0.0.65

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.61

## 0.0.64

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.60

## 0.0.63

### Patch Changes

- [#1398](https://github.com/Ripple-TS/ripple/pull/1398)
  [`6d3417e`](https://github.com/Ripple-TS/ripple/commit/6d3417eb3852a9f0085b273f07079a3b12323712)
  Thanks [@aleclarson](https://github.com/aleclarson)! - Split compiler-emitted
  helpers into shared and renderer-specific runtime packages, and add opt-in
  direct runtime imports across supported build integrations.
- Updated dependencies
  [[`2aa2b6f`](https://github.com/Ripple-TS/ripple/commit/2aa2b6f4beff43b61badd1fb7d11433e9e4f52b3),
  [`6d3417e`](https://github.com/Ripple-TS/ripple/commit/6d3417eb3852a9f0085b273f07079a3b12323712)]:
  - @tsrx/vue@0.1.59

## 0.0.62

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.58

## 0.0.61

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.57

## 0.0.60

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.56

## 0.0.59

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.55

## 0.0.58

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.54

## 0.0.57

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.53

## 0.0.56

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.52

## 0.0.55

### Patch Changes

- Updated dependencies
  [[`6eaa2f3`](https://github.com/Ripple-TS/ripple/commit/6eaa2f3e6cd18973d57df06eae770313dd061a1a)]:
  - @tsrx/vue@0.1.51

## 0.0.54

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.50

## 0.0.53

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.49

## 0.0.52

### Patch Changes

- Updated dependencies
  [[`81859da`](https://github.com/Ripple-TS/ripple/commit/81859da03464b8865304c70ea2b8b1245018af2c)]:
  - @tsrx/vue@0.1.48

## 0.0.51

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.47

## 0.0.50

### Patch Changes

- Updated dependencies
  [[`21a43da`](https://github.com/Ripple-TS/ripple/commit/21a43da09713f28c5d2ae73633e5ca56e4cd8d1f)]:
  - @tsrx/vue@0.1.46

## 0.0.49

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.45

## 0.0.48

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.44

## 0.0.47

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.43

## 0.0.46

### Patch Changes

- Updated dependencies
  [[`b36ec19`](https://github.com/Ripple-TS/ripple/commit/b36ec1930764f447585a6c31c17bc63b3596511a)]:
  - @tsrx/vue@0.1.42

## 0.0.45

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.41

## 0.0.44

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.40

## 0.0.43

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.39

## 0.0.42

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.38

## 0.0.41

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.37

## 0.0.40

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.36

## 0.0.39

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.35

## 0.0.38

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.34

## 0.0.37

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.33

## 0.0.36

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.32

## 0.0.35

### Patch Changes

- Updated dependencies
  [[`8747e8f`](https://github.com/Ripple-TS/ripple/commit/8747e8f306628443d3c4d73bce0d79e986f5966e)]:
  - @tsrx/vue@0.1.31

## 0.0.34

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.30

## 0.0.33

### Patch Changes

- Updated dependencies
  [[`b1256fd`](https://github.com/Ripple-TS/ripple/commit/b1256fdb5bf279ee7dd20bf1a71dcfccc47e279c)]:
  - @tsrx/vue@0.1.29

## 0.0.32

### Patch Changes

- Updated dependencies
  [[`87afc5d`](https://github.com/Ripple-TS/ripple/commit/87afc5d3f4c73e604cd245865e27d29e40435482)]:
  - @tsrx/vue@0.1.28

## 0.0.31

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.27

## 0.0.30

### Patch Changes

- Updated dependencies
  [[`92982ee`](https://github.com/Ripple-TS/ripple/commit/92982ee5cd2e6d971b5b650ec1df70483c9716aa),
  [`b826234`](https://github.com/Ripple-TS/ripple/commit/b8262342111a977ba5a0d44086154e386b06f4b9),
  [`b826234`](https://github.com/Ripple-TS/ripple/commit/b8262342111a977ba5a0d44086154e386b06f4b9),
  [`b826234`](https://github.com/Ripple-TS/ripple/commit/b8262342111a977ba5a0d44086154e386b06f4b9)]:
  - @tsrx/vue@0.1.26

## 0.0.29

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.25

## 0.0.28

### Patch Changes

- Updated dependencies
  [[`6fd49c9`](https://github.com/Ripple-TS/ripple/commit/6fd49c9dd737e889844e254763f66e13ea4a7241)]:
  - @tsrx/vue@0.1.24

## 0.0.27

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.23

## 0.0.26

### Patch Changes

- Updated dependencies
  [[`5d33325`](https://github.com/Ripple-TS/ripple/commit/5d3332564109d228af5e02c0f68ca4a318766649)]:
  - @tsrx/vue@0.1.22

## 0.0.25

### Patch Changes

- Updated dependencies
  [[`1de66b8`](https://github.com/Ripple-TS/ripple/commit/1de66b8f851849597b6078dab7af2699e49b0e21)]:
  - @tsrx/vue@0.1.21

## 0.0.24

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.20

## 0.0.23

### Patch Changes

- Updated dependencies
  [[`0574e73`](https://github.com/Ripple-TS/ripple/commit/0574e73830a549f515cef6aa8c0a1e38c79b06cc),
  [`0574e73`](https://github.com/Ripple-TS/ripple/commit/0574e73830a549f515cef6aa8c0a1e38c79b06cc)]:
  - @tsrx/vue@0.1.19

## 0.0.22

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.18

## 0.0.21

### Patch Changes

- [#1177](https://github.com/Ripple-TS/ripple/pull/1177)
  [`054bd1e`](https://github.com/Ripple-TS/ripple/commit/054bd1e75347e395f6c096f8e293d1baf8e03549)
  Thanks [@trueadm](https://github.com/trueadm)! - Parse tags and bare fragments
  as native TSRX by default, remove `component` keyword parsing, and
  compile/format/lint function components that return native TSRX across the
  React, Preact, Solid, Vue, and Ripple targets. Ripple component compilation now
  only renders TSRX reachable from returned values and supports string and `null`
  component returns.

  Ripple now also preserves directly called PascalCase helpers as ordinary
  functions while still compiling renderable component functions used as
  components or render entries.

  The old explicit TSRX wrapper tag is no longer special; TSRX elements and
  fragments are the default expression syntax, and the tag name is treated like
  any ordinary element name.

  Ripple now exports a typed `Fragment` helper from its public runtimes and
  supports `innerHTML` on both host elements and `Fragment`. Ripple also treats
  `innerHTML` from element spreads as rendered content instead of serializing it
  as an `innerhtml` attribute.

  The `{html ...}` template directive has been removed. Use each target's native
  raw HTML prop instead, such as `innerHTML` for Ripple/Solid/Vue or
  `dangerouslySetInnerHTML` for React/Preact.

  The `{text ...}` template directive has also been removed. Text values now use
  ordinary `{expr}` containers, with explicit coercion written as JavaScript
  (`String(value)`, `value + ''`, or a typed string value). Ripple optimizes
  clearly string-shaped expressions and typed string props into text-node updates
  without requiring a TSRX-specific directive.

- Updated dependencies
  [[`054bd1e`](https://github.com/Ripple-TS/ripple/commit/054bd1e75347e395f6c096f8e293d1baf8e03549)]:
  - @tsrx/vue@0.1.17

## 0.0.20

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.16

## 0.0.19

### Patch Changes

- Updated dependencies
  [[`d083ab8`](https://github.com/Ripple-TS/ripple/commit/d083ab8e802259fa6d8b7bf9bb64d4be899848c4)]:
  - @tsrx/vue@0.1.15

## 0.0.18

### Patch Changes

- Updated dependencies
  [[`bf1cb96`](https://github.com/Ripple-TS/ripple/commit/bf1cb96f2ea9b325e30f5a051c451f92659d20f9)]:
  - @tsrx/vue@0.1.14

## 0.0.17

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.13

## 0.0.16

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.12

## 0.0.15

### Patch Changes

- [#1145](https://github.com/Ripple-TS/ripple/pull/1145)
  [`0de733f`](https://github.com/Ripple-TS/ripple/commit/0de733f05800df5d3854eb69e012e9aeaf098f8a)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Add Vue Vapor support for
  TSRX `try/pending` by lowering pending blocks to Vue Suspense slots.

- Updated dependencies
  [[`0de733f`](https://github.com/Ripple-TS/ripple/commit/0de733f05800df5d3854eb69e012e9aeaf098f8a),
  [`0de733f`](https://github.com/Ripple-TS/ripple/commit/0de733f05800df5d3854eb69e012e9aeaf098f8a)]:
  - @tsrx/vue@0.1.11

## 0.0.14

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.10

## 0.0.13

### Patch Changes

- Updated dependencies
  [[`b1d6de0`](https://github.com/Ripple-TS/ripple/commit/b1d6de05912aca4cf40af68f291851eda706140c)]:
  - @tsrx/vue@0.1.9

## 0.0.12

### Patch Changes

- Updated dependencies
  [[`165703c`](https://github.com/Ripple-TS/ripple/commit/165703c588b52f3dc0d26c06187f21700d448693)]:
  - @tsrx/vue@0.1.8

## 0.0.11

### Patch Changes

- Updated dependencies
  [[`e4a04dd`](https://github.com/Ripple-TS/ripple/commit/e4a04ddb4bbc8e21a9c7c2c65b179d764b72e4fb)]:
  - @tsrx/vue@0.1.7

## 0.0.10

### Patch Changes

- Updated dependencies
  [[`a59ccb8`](https://github.com/Ripple-TS/ripple/commit/a59ccb83b91257bf34fca2ba1415e77d1f815a7b)]:
  - @tsrx/vue@0.1.6

## 0.0.9

### Patch Changes

- Updated dependencies
  [[`18b4aef`](https://github.com/Ripple-TS/ripple/commit/18b4aefa8127e56a9f1b3058da2d4d2172551579)]:
  - @tsrx/vue@0.1.5

## 0.0.8

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.4

## 0.0.7

### Patch Changes

- Updated dependencies
  [[`4f360f0`](https://github.com/Ripple-TS/ripple/commit/4f360f008edf61492cf85afa646c797c80a73f22),
  [`2ae792c`](https://github.com/Ripple-TS/ripple/commit/2ae792cdca7d466e552a330ea965cefec2b1f5a5)]:
  - @tsrx/vue@0.1.3

## 0.0.6

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.2

## 0.0.5

### Patch Changes

- Updated dependencies []:
  - @tsrx/vue@0.1.1

## 0.0.4

### Patch Changes

- Updated dependencies
  [[`2a85e9b`](https://github.com/Ripple-TS/ripple/commit/2a85e9bb73f4d82f2bd2273c33735b4dc7b82d5f)]:
  - @tsrx/vue@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies
  [[`b54a72f`](https://github.com/Ripple-TS/ripple/commit/b54a72f721adb5f08a5bf3e3d006780b7e1eb471),
  [`b54a72f`](https://github.com/Ripple-TS/ripple/commit/b54a72f721adb5f08a5bf3e3d006780b7e1eb471),
  [`b54a72f`](https://github.com/Ripple-TS/ripple/commit/b54a72f721adb5f08a5bf3e3d006780b7e1eb471),
  [`b54a72f`](https://github.com/Ripple-TS/ripple/commit/b54a72f721adb5f08a5bf3e3d006780b7e1eb471),
  [`b54a72f`](https://github.com/Ripple-TS/ripple/commit/b54a72f721adb5f08a5bf3e3d006780b7e1eb471)]:
  - @tsrx/vue@0.0.23

## 0.0.2

### Patch Changes

- [#1041](https://github.com/Ripple-TS/ripple/pull/1041)
  [`b1e717e`](https://github.com/Ripple-TS/ripple/commit/b1e717e33283f17209c5b4fc2bc2e70037d90460)
  Thanks [@RazinShafayet2007](https://github.com/RazinShafayet2007)! - Add a Bun
  plugin for compiling `.tsrx` files with `@tsrx/vue`, running the downstream
  `vue-jsx-vapor` transform, and emitting component-local styles as virtual CSS
  modules.
