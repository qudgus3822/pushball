---
name: react-deep-hook-design
description: "Design React hooks and shared abstractions that stay deep — a small interface hiding rich orchestration — instead of shallow shared components that encode every call-site's divergence as props. Apply whenever you extract, design, or review a React abstraction reused across 2+ component sites: deciding \"should this be a hook or a component?\", designing a hook that returns more than plain state (callbacks, predicates, render functions, spreadable prop bundles), consolidating duplicated orchestration, or when a shared component's prop list grows past ~5 props that exist only to encode site-by-site behavior — the canonical config-explosion smell. Trigger in PLANNING, IMPLEMENTATION, and REVIEW of reusable hooks. For keyboard/input/popover/IME hooks specifically, also apply react-input-orchestration-hooks-design. When in doubt, trigger."
---

# React Deep Hook Design

The React specialization of `deep-module-design`. Ousterhout's rule — *the best modules have interfaces much simpler than their implementations* — maps directly onto hooks: prefer a **deep hook** whose small return surface hides orchestration over a **shallow-wide shared component** that re-exposes every site's divergence as a prop.

A deep hook lets the caller write less code than inlining would, makes fewer decisions, and cannot reach in to break invariants. A shallow shared component does the opposite: each new call-site adds a prop until the "shared" component is harder to read than three honest copies. Concretely, prefer `useThing()` returning `{ state, callbacks, renderX(), spreadable }` over `<SharedThing prop1 … prop24 />` that branches internally on 24 props.

## When NOT to abstract

Extracting is often the wrong move. Leave it inline when:

- **Only one call-site exists.** A second similar-looking line is not duplication yet. The first concrete use is right; an imagined second use is a guess.
- **The divergence is core domain logic, not orchestration.** Two components that look alike but answer different domain questions should stay separate.
- **The shared work is pure UI chrome** — no state, no event policy, no async. That is a normal component, not a hook.
- **The team deliberately chose composition for revertability.** Don't override that.

## Decision flow

1. **Count byte-identical orchestration lines** across call-sites (same hook calls, memo, effect chain). Under ~20 lines *and* fewer than 4 divergence rows (step 2) → inline it; stop here. The two thresholds are AND, not OR: a lot of identical lines with little divergence is still a candidate, but trivial duplication with little divergence is not worth a hook.
2. **Tabulate divergence.** One row per concern that varies across sites; mark each row uniform or divergent. (See the divergence-matrix technique below.)
3. **4+ divergent rows → reject the shared-component approach.** That many props-to-encode-divergence is the config-explosion smell. Hook the orchestration instead.
4. **Keep the divergent parts at the call-site** as their own JSX/handlers. The hook owns only what is uniform.
5. **Pick the return shape** (next section).
6. **Audit silent-failure preconditions** and document each one.
7. **Sequence the migration** so every step is independently revertable.

### The divergence-matrix technique

List each varying concern as a row, each call-site as a column, and mark whether the row is uniform. Non-uniform rows are the divergence count that drives step 3.

| Concern | Site A | Site B | Site C | Uniform? |
|---|---|---|---|---|
| (e.g.) data source | … | … | … | no |
| (e.g.) submit target | … | … | … | no |
| (e.g.) loading chrome owner | … | … | … | no |

A domain with its own fixed set of concerns can hard-code the rows; see `react-input-orchestration-hooks-design` for the input/keyboard row-set.

## Return shapes

A deep hook's return object holds **at most four kinds** of member. A fifth kind is a smell that the hook is doing two jobs.

1. **State** — plain values the caller reads (`spans`, `query`, `isOpen`).
2. **Stable callbacks** — `useCallback`-wrapped functions the caller invokes (`serialize`, `commit`). They must be referentially stable, or the caller's `useMemo`/`useCallback` deps that list them re-run every render. Document the stability contract.
3. **Render functions** — `renderPopover(): ReactNode`. The hook owns the JSX subtree; the caller decides only *where* to mount it.
4. **Spreadable event bundles** — `{ onCompositionStart, onCompositionEnd }` the caller spreads onto a DOM node the hook does not own. These are typically fresh per render, so they must never appear in the caller's dep arrays; say so in the field's doc comment.

**Prefer a render function over a "props bag."** Returning `popoverProps: { isOpen, items, onSelect, … }` forces the caller to spread N props onto JSX it now owns — which re-leaks the orchestration into the caller, the exact failure mode the hook exists to fix. A render function keeps the orchestration inside the hook.

## Anti-patterns

- **Config-explosion shallow-wide component.** `<SharedX>` with 24 props branching on every site. The interface is more complex than the implementation — abstraction inverted. Three honest copies read better.
- **Orchestration leak via props bag.** Hook returns `{ thingProps }`; caller spreads it onto its own element and inherits the lifecycle the hook was supposed to hide. Complexity moved, not removed.
- **Closed string-literal union in shared types.** `type Kind = "member" | "team"` baked into a shared hook blocks the next use-case without a sweeping rename. If a second use-case is genuinely coming, widen the shared type to `string` and keep the closed union at the call-site only.
- **Direct hook coupling.** A shared hook hard-imports its data source at the top, so the next use-case must fork the whole hook. Inject the source as a parameter — but only once a second use-case is actually specified, not speculatively.
- **Speculative generalization.** Building for a second use-case that does not exist yet. Ship the single-use deep hook. When the real second case lands, generalize *additively* (rename + thread a parameter + inject the dependency).

## Silent failures

A deep hook fails silently when a precondition is violated: no type error, no exception — the feature just doesn't work. Enumerate every silent-failure precondition in the hook's doc comment, and give each one a verify step (a test, a smoke check, or a dev-only runtime assert). The most common is the **stable-reference contract**: callers will list your callbacks in `useCallback` deps, so a callback whose identity changes every render silently defeats their memoization.

## Memo & stability

- `useCallback`-wrap returned callbacks and document their dep set.
- Mark intentionally-fresh-per-render returns (spreadable bundles) as such in the doc comment.
- When the *caller* needs hook returns in a dep array, destructure the stable members first rather than listing the whole return object:

  ```ts
  const { serialize, consumeKey } = thing;
  const onSubmit = useCallback(() => { /* uses serialize, consumeKey */ },
    [serialize, consumeKey]);
  ```

  Listing `thing` directly defeats the memo, because the hook's return object is fresh each render. `react-hooks/exhaustive-deps` may flag the destructured form; that lint is wrong here — suppress it with a comment pointing back to this rule.

## Testing

- **Test the hook in isolation** with a minimal harness component. `renderHook` alone can't exercise hooks that use `useImperativeHandle` or expose `renderX()` — those need a mounted component to populate refs.
- **Keep per-site parity tests byte-unchanged** across a migration. They are the regression gate: if one fails after migration, the hook broke parity — fix the hook, not the test.
- **Run mutation probes** so the new hook-level tests aren't vacuous: temporarily break the hook in a way a test should catch, confirm it fails, then restore.

## Migration sequencing

Stage the work so each step reverts cleanly:

1. **Additive commit.** Add the hook and its tests; it's dead code until imported.
2. **One commit per call-site.** Per-site parity tests stay green after each. If a parity test must change shape, that site isn't a parity migration — split it out.
3. **Full gate at the end.** Type-check clean, lint zero-error, full suite green.

If a site needs new styling or an element-type change to migrate, **scope it out** and ship the orchestration extraction first. Bundling risks regressing the styling work and muddies the parity gate.

## Checklist

- [ ] Divergence tabulated; 4+ divergent rows justify the hook (or it stayed inline for a reason above).
- [ ] Return object has ≤4 kinds: state, stable callbacks, render functions, spreadable bundles.
- [ ] No props-bag return the caller must spread onto its own JSX.
- [ ] Every silent-failure precondition is in the doc comment and has a verify step.
- [ ] Spreadable bundles documented as fresh-per-render; stable callbacks document their identity contract.
- [ ] Closed unions live at call-sites only; shared types widen only for an already-concrete second use-case.
- [ ] Migration sequenced additive → per-site → full gate; parity tests byte-unchanged; mutation probes confirm non-vacuous tests.
- [ ] No stale closures: hook dependency arrays list every value the effect or callback reads, and anything derivable from props or state is computed during render instead of synced by an effect.

## References

- `deep-module-design` — the language-agnostic Ousterhout skill this one specializes.
- `react-input-orchestration-hooks-design` — the specialization for hooks that orchestrate text input, keyboard policy, IME, and overlays.
