---
title: Statement-Position Membership Performance - Plan
type: perf
date: 2026-08-27
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Statement-Position Membership Performance - Plan

## Goal Capsule

- **Objective:** Developers can parse and analyze a function containing 30,000
  direct template statements at least 20% faster without changing diagnostics.
- **Means:** Classify direct statement children from their parent node's
  structural slots instead of rescanning the containing statement array for every
  template (KTD1).
- **Authority:** The user's performance and non-duplication constraints take
  precedence, followed by this contract and existing semantic-analysis behavior.
- **Execution profile:** Localized internal optimization with no public API,
  parser output, compiler output, or diagnostic change.
- **Stop conditions:** Do not ship if the branch misses R4, changes the diagnostic
  digest, or overlaps a recent performance PR. If it fails, discard it and
  continue the performance hunt elsewhere.
- **Tail ownership:** LFG owns review, commit, PR creation, and CI follow-through
  after implementation and verification.

---

## Product Contract

### Summary

Remove quadratic sibling-array membership checks from forgotten-template analysis
while preserving exact statement-position semantics.

### Problem Frame

`is_free_floating_template` walks upward through transparent wrappers and asks
`is_statement_position` whether the resulting node directly occupies a statement
slot. For `Program`, `BlockStatement`, `SwitchCase`, and `JSXCodeBlock`, the
helper currently calls `includes` on the parent's statement array.

The helper receives a child and its immediate parent from the ancestry path. Those
node types already identify their non-statement child slots, so rescanning the
statement array is redundant. A block containing many direct template statements
therefore performs growing sibling scans during analysis even though each
parent-child relation is already known.

### Requirements

#### Performance

- R1. The analyzer's known-direct-child statement-position classification must
  take constant time for `Program`, `BlockStatement`, `SwitchCase`, and
  `JSXCodeBlock`.
- R2. The implementation must not allocate a `Set`, cache, or per-parent side
  table for information already encoded by the parent-child relation.
- R3. A deterministic function with 30,000 direct `<div />;` statements must
  complete the full parse-and-analysis path materially faster than `origin/main`.

#### Behavioral compatibility

- R4. Across five isolated runs per revision, the branch median must be at least
  20% lower than the control median, with the same parse-error count,
  analysis-error count, and SHA-256 diagnostic digest.
- R5. Direct children in program and block bodies remain statement-position nodes;
  `SwitchCase.test` and `JSXCodeBlock.render` remain value positions while their
  consequent/body children remain statement positions.
- R6. Braceless JavaScript control-flow classification remains unchanged.
- R7. The change remains internal to AST utilities, analysis characterization
  tests, and planning evidence; no changeset is required.

#### Scope provenance

- R8. The branch starts from fetched `origin/main` and does not duplicate recent
  AST-cloning, parameter-comment, export-scope, or Volar keyword-mapping
  performance work.

### Scope Boundaries

**In scope**

- `is_statement_position` in `packages/tsrx/src/utils/ast.js`.
- Focused characterization of the four array-backed parent shapes.
- A control-versus-branch parse-and-analysis benchmark with diagnostic
  equivalence.

**Out of scope**

- Parser comment queues and sibling lookup during comment attachment.
- Source mappings, compiler scope lookup, formatter printing, or general AST
  traversal changes.
- Permanent benchmark infrastructure for this localized optimization.

### Success Criteria

- The analyzer's affected path contains no sibling-array scan, while the exported
  helper retains exact membership semantics for arbitrary candidate nodes.
- The benchmark satisfies R4 and reports fixture size, run count, medians,
  improvement, and diagnostic digest.
- Focused tests, typecheck, format check, and the full test suite pass.
- The final diff contains no residue from the rejected formatter candidate.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Use immediate parent-child structure inside the analyzer.** `Program`
  and `BlockStatement` have no direct AST child slot other than `body`; a
  `SwitchCase` child is a consequent unless it is `test`; a `JSXCodeBlock` child
  is a setup statement unless it is `render`. Express those relationships in an
  internal direct-child helper, retain exact membership semantics in the exported
  helper, and leave identity checks for single-child control-flow slots unchanged.
  This governs R1-R2 and R5-R7.
- KTD2. **Characterize structural edge cases before editing the helper.** Pin
  positive and negative cases for every affected parent type, including the two
  non-statement slots. This governs R5.
- KTD3. **Measure the real parser plus target-neutral analyzer.** Use diagnostic
  collection mode so every direct template is visited, and hash stable diagnostic
  fields to prove identical results. This governs R3-R4.
- KTD4. **Keep the fix at the semantic ownership boundary.** Optimize the shared
  AST helper rather than bypassing forgotten-output validation in callers. This
  governs R6-R7.

### Assumptions

- The ancestry path gives `is_free_floating_template` consecutive child-parent
  pairs after transparent wrappers are collapsed.
- Zimmerframe does not traverse positional or metadata fields as AST children; for
  the affected node shapes, the declared semantic fields are the complete
  direct-child surface.
- No changeset is required because the public API and observable analysis results
  remain unchanged.

### Implementation Constraints

- Do not weaken or skip forgotten-template validation.
- Do not add cached membership structures.
- Preserve the existing `IfStatement`, loop, label, and `WithStatement` identity
  checks.
- Keep benchmark generation outside the committed diff.

### Sources and Related Work

- `packages/tsrx/src/analyze/index.js` calls `is_statement_position` while
  classifying free-floating templates.
- `packages/tsrx/src/utils/ast.js` currently rescans `body` or `consequent` arrays
  with `includes`.
- `packages/tsrx/tests/analyze/analyze.test.js` covers forgotten-output
  diagnostics across ordinary blocks, code-block setup/render positions, wrappers,
  and braceless control flow.
- Recent performance PRs remain disjoint: #3 optimized location-free AST cloning,
  #5 parser line-location reuse, #7 local export scope lookup, and #17 Volar
  keyword token lookup.

### Rejected Candidate Evidence

The first candidate replaced repeated blank-line boundary scans in the Prettier
array printer. On the fixed 10,000-element fixture, five isolated runs produced an
84.94 ms control median and 75.37 ms branch median with identical output, an
11.27% improvement. That missed its predeclared 20% threshold, so its code and
tests were removed before this plan was adopted.

---

## Implementation Units

### U1. Characterize direct statement-position semantics

- **Goal:** Lock the current positive and negative classifications for every
  affected parent node.
- **Requirements:** R5-R6.
- **Dependencies:** None.
- **Files:**
  - `packages/tsrx/tests/analyze/analyze.test.js`
- **Approach:** Add a compact table-driven assertion using the public
  `isStatementPosition` alias and the internal direct-child classifier. Cover a
  direct `Program.body` child, direct `BlockStatement.body` child,
  `SwitchCase.consequent` versus `SwitchCase.test`, and `JSXCodeBlock.body` versus
  `JSXCodeBlock.render`. Verify that unrelated candidate nodes remain false
  through the exported helper.
- **Execution note:** Run the focused suite on the control implementation before
  changing `utils/ast.js`.
- **Verification:** All cases pass on control and continue to pass after KTD1.

### U2. Make direct statement-position classification constant-time

- **Goal:** Remove redundant sibling scans without changing semantic results.
- **Requirements:** R1-R2, R5-R7.
- **Dependencies:** U1.
- **Files:**
  - `packages/tsrx/src/utils/ast.js`
  - `packages/tsrx/tests/analyze/analyze.test.js`
- **Approach:** Add the KTD1 direct-child classifier beside the exported helper
  and call it from `is_free_floating_template`, whose ancestry traversal already
  guarantees consecutive child-parent pairs. Keep the exported helper's exact
  membership checks unchanged.
- **Verification:** The focused characterization and existing analyzer suite pass,
  and source inspection shows no array membership scan in the affected cases.

### U3. Benchmark and verify the shipped diff

- **Goal:** Prove the structural classification removes meaningful end-to-end
  analysis cost with identical diagnostics.
- **Requirements:** R3-R4, R7-R8.
- **Dependencies:** U2.
- **Files:**
  - `packages/tsrx/src/utils/ast.js`
  - `packages/tsrx/tests/analyze/analyze.test.js`
- **Approach:** Run the fixed 30,000-statement fixture in five fresh processes on
  detached `origin/main` and five on the branch. Measure parse plus `analyzeTsrx`,
  and compare parse-error count, analysis-error count, and the SHA-256 digest of
  stable diagnostic fields. Then run repository gates.
- **Test expectation:** No permanent benchmark file is required because U1 owns
  behavioral coverage and this unit validates cost and integration.
- **Verification:** R4 and all quality gates pass.

---

## Verification Contract

| Gate                     | Command or method                                                                         | Covers | Done signal                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| Focused semantics        | `pnpm exec vitest run --project tsrx-analyze packages/tsrx/tests/analyze/analyze.test.js` | U1, U2 | All statement-position and forgotten-output cases pass.                         |
| TSRX analysis regression | `pnpm exec vitest run --project tsrx-analyze`                                             | U1-U3  | All TSRX analyzer tests pass.                                                   |
| Type safety              | `pnpm typecheck`                                                                          | U2     | Workspace typechecks pass.                                                      |
| Formatting               | `pnpm format:check`                                                                       | U1-U3  | No formatting drift is reported.                                                |
| Full regression          | `pnpm test`                                                                               | U1-U3  | Every configured Vitest project passes.                                         |
| Performance              | Five isolated parse-and-analysis runs per revision on the fixed 30,000-statement fixture  | U3     | Branch median is at least 20% lower; error counts and diagnostic digests match. |
| Scope audit              | Diff and recent-PR file comparison                                                        | U3     | Only the active plan, AST helper, and focused analyzer test changed.            |

---

## Definition of Done

- U1 is complete when all affected statement and value slots are characterized on
  the control implementation.
- U2 is complete when direct classification is constant-time and the focused suite
  passes.
- U3 is complete when the benchmark meets R4 and all repository gates pass.
- The branch remains based on fetched `origin/main`, contains no unrelated edits,
  and does not duplicate recent performance work.
- No failed implementation, abandoned tests, debug output, or temporary benchmark
  fixture remains in the branch.
- The PR explains both the rejected first hypothesis and the shipped
  repeated-sibling-scan fix, with measured evidence and validation results.
