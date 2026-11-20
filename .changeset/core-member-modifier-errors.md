---
'@tsrx/core': patch
---

Class member modifiers get TypeScript's errors. `override accessor x = 1`, which TypeScript accepts, no longer fails with TS1243 "'accessor' modifier cannot be used with 'override' modifier.". An `abstract` constructor is TS1242 at `abstract`, where it threw TS1245 in every mode (or reported nothing without a body). An access modifier with `abstract` is reported on any member, as on an `accessor` property: `private abstract m()` and `abstract private x` are TS1243, `abstract public m()` is TS1029. `accessor` on a method is TS1275. `declare override x` is TS1243 at `override` and `override declare x` TS1040 at `declare`, as TypeScript words them, and a repeated modifier is worded as TypeScript's TS1030 ("'readonly' modifier already seen.").
