# @tsrx/hono

## 0.2.0

### Minor Changes

- [#790](https://github.com/tsrx-org/tsrx/pull/790)
  [`c70964d`](https://github.com/tsrx-org/tsrx/commit/c70964d76055f1bea742bc15b66044042ef5bfcd)
  Thanks [@leonidaz](https://github.com/leonidaz)! - A `<script>` element is raw
  text, like `<style>`, in templates and in plain JSX. Its body is `content`,
  taken as written, and the element has no children: the `JSXText` child that
  mirrored the body is gone. None of JSX text's rules apply to the body: comments,
  `<`, `>`, character references, and line breaks stay as written, and
  `<script>{code}</script>` is a script whose text is `{code}`, not an expression
  container.

  Each target now outputs the body in the form that renders it exactly, on the
  client and in server HTML:

  - React: `<script>{"…"}</script>`, a string child.
  - Preact and Hono: `<script dangerouslySetInnerHTML={{ __html: "…" }} />`.
  - Solid: `<script innerHTML={"…"} />`.
  - Vue: `<script v-html={"…"} />`.

  Before, the body compiled to JSX text: its lines were joined, so a `// c` line
  commented out the rest of the script, and `&amp;` rendered `&`. In Solid and
  Vue, a `<` rendered `&lt;`. `<script>{code}</script>` threw
  `ReferenceError: code is not defined`. Whether a script runs is still each
  target's decision: a client render runs it in Preact and `hono/jsx/dom`, not in
  React, Solid, and Vue, and server HTML runs it.

  A body ends where HTML ends it: at `</script`, optional whitespace, and `>`, so
  `</script >` closes it. Any other `</script` in the body, in any letter case
  (`</SCRIPT>`), is the `tsrx-script-end-tag-in-body` error, with a hint to write
  `<\/script`. A body of only whitespace outputs an empty script, as the formatter
  prints it.

  The formatter formats a script body from `content`, and the TypeScript plugin's
  fallback for a file that doesn't compile ends a body where the parser does.

### Patch Changes

- Updated dependencies
  [[`1b3bbe5`](https://github.com/tsrx-org/tsrx/commit/1b3bbe5722dec196f54632e768a920904581568a),
  [`20b17fd`](https://github.com/tsrx-org/tsrx/commit/20b17fd8b8a255e1b32eef17183f710b5b04d4af),
  [`de88f59`](https://github.com/tsrx-org/tsrx/commit/de88f59036b5ff6824d85b15d032f79d0b9e36bc),
  [`c70964d`](https://github.com/tsrx-org/tsrx/commit/c70964d76055f1bea742bc15b66044042ef5bfcd),
  [`1555269`](https://github.com/tsrx-org/tsrx/commit/1555269944da6e0bdbc7623afea8339d8b737af4),
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
  [`b51a77e`](https://github.com/tsrx-org/tsrx/commit/b51a77e08ebf686ca23eddcee6ae2ac26128e58a)]:
  - @tsrx/core@0.5.0

## 0.1.8

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

## 0.1.7

### Patch Changes

- Updated dependencies
  [[`ca86115`](https://github.com/tsrx-org/tsrx/commit/ca86115f91e9aec052bff27809b7439fd6fa7dbd),
  [`06a9c5c`](https://github.com/tsrx-org/tsrx/commit/06a9c5c699961c7ac1def5196229cc65704f358d)]:
  - @tsrx/core@0.3.3

## 0.1.6

### Patch Changes

- Updated dependencies
  [[`c426225`](https://github.com/tsrx-org/tsrx/commit/c42622548a877bc5a1d2741c96534447679f2ae5)]:
  - @tsrx/core@0.3.2

## 0.1.5

### Patch Changes

- Updated dependencies
  [[`b12105e`](https://github.com/tsrx-org/tsrx/commit/b12105e60a077559e55f59940cb25c0dd73eda8a)]:
  - @tsrx/core@0.3.1

## 0.1.4

### Patch Changes

- [#211](https://github.com/tsrx-org/tsrx/pull/211)
  [`8916c70`](https://github.com/tsrx-org/tsrx/commit/8916c7091156023e716c0d75f0be4a8465c6d5c4)
  Thanks [@leonidaz](https://github.com/leonidaz)! - Adding a `ref` to a host
  element with a spread no longer changes the order in which its attributes are
  evaluated on React, Preact, and Hono. In
  `<div data-first={next()} {...{ 'data-second': next() }} ref={cb} />` the
  compiler evaluated the spread in a declaration before the element, so
  `data-second` got `1` and `data-first` got `2`; a spread on a nested element
  also ran before its ancestors' attributes. The spread's props bag is now
  assigned where it is spread, `{...(bag = normalize(expr))}`, and the element's
  `ref` reads `bag?.ref` afterward, as before.

  Platforms opt in with the new `jsx.hostSpreadRefBinding: 'in-place'` option.
  Solid and Vue keep the declaration: their compiled JSX evaluates attributes in
  its own order, and Solid reads `ref` before the spread.

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

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @tsrx/core@0.2.4

## 0.1.2

### Patch Changes

- Updated dependencies
  [[`ba0be2d`](https://github.com/tsrx-org/tsrx/commit/ba0be2dd06c7b707912a067c20e276c4428a905b)]:
  - @tsrx/core@0.2.3

## 0.1.1

### Patch Changes

- [#92](https://github.com/tsrx-org/tsrx/pull/92)
  [`0e3f36f`](https://github.com/tsrx-org/tsrx/commit/0e3f36fb824e3fa7a74f3464b24a36679052872d)
  Thanks [@kotarotaniguchi0523](https://github.com/kotarotaniguchi0523)! - Add
  Hono server and DOM compiler targets with Vite and Bun integrations. The
  compilers and build integrations support the shared compile-time platform flags;
  DOM editor selection remains explicit, and DOM async-component validation stays
  conservative and same-module.

  Respect later object-property overrides during DOM async-component validation,
  and add server/DOM targets and supported examples to the website playground.
