---
name: react-input-orchestration-hooks-design
description: Design React hooks that orchestrate text input, keyboard policy, and overlays — autocomplete, typeahead, mention/@-pickers, command palettes, slash-menus, and rich-text or contenteditable widgets — without leaking keyboard precedence, IME handling, or popover lifecycle back to the caller. Apply whenever a hook must coordinate keydown policy (Enter/Escape/Backspace/Shift+Enter), expose a keyboard predicate instead of a full onKeyDown handler, manage preventDefault/defaultPrevented across an overlay, wire IME composition onto an input/textarea/contenteditable, or render a popover the caller mounts. Builds on react-deep-hook-design — apply that first for return-shape and migration rules; this covers the input-specific delta. Trigger in PLANNING, IMPLEMENTATION, and REVIEW. When in doubt, trigger.
---

# React Input Orchestration Hooks

Specialization of `react-deep-hook-design` for the input/keyboard/overlay family. **Apply that skill first** — return-shape kinds, the props-bag-leak rule, silent-failure discipline, memo/stability, and migration sequencing all carry over unchanged. This skill adds only what is specific to coordinating a text input, its keyboard policy, IME, and an attached overlay.

These hooks fail in a characteristic way: the orchestration looks extracted, but keyboard precedence, `defaultPrevented` coordination, or IME wiring quietly leaks back to the caller, and jsdom tests don't catch it. The rules below close those leaks.

## The input divergence matrix

When deciding whether to hook (per the parent skill's decision flow), these are the rows that vary across input call-sites. Four or more divergent rows is config-explosion territory — hook it.

| Concern | Site A | Site B | Site C | Uniform? |
|---|---|---|---|---|
| Element type (input / textarea / contenteditable) | | | | |
| Enter policy (submit / newline / select) | | | | |
| Shift+Enter policy | | | | |
| Backspace-on-empty policy | | | | |
| Escape policy | | | | |
| Submit target (store action / mutation / parent callback) | | | | |
| Chrome owner (where styling lives) | | | | |
| Disabled source | | | | |
| Value source (who controls it) | | | | |
| IME composition policy | | | | |

## Keyboard: return a predicate, not a handler

A hook that returns a full `onKeyDown(e)` the caller installs directly steals the caller's keyboard precedence — the caller can no longer say "if the overlay didn't consume this key, run my own handler." Return a **predicate** instead:

```ts
// Returns true if the hook handled the key (and has already called preventDefault).
consumeKey(e: KeyboardEvent<HTMLElement>): boolean
```

The caller composes precedence explicitly:

```ts
const onKeyDown = (e) => {
  if (mention.consumeKey(e)) return; // overlay took it
  // ...the caller's own handlers (submit, etc.)
};
```

The policy stays inside the hook; the ordering stays with the caller.

## The `preventDefault` invariant

**The predicate must call `e.preventDefault()` itself whenever it returns `true`** — never leave it to the caller. Anything downstream that reads `e.defaultPrevented` (an overlay's "don't close on Escape if a child consumed it" guard, a parent form's submit suppression) depends on it. Moving `preventDefault` to the call-site silently regresses every such guard, with no test failure in jsdom. Document this as an INVARIANT in the predicate's doc comment.

## IME composition

CJK and other IME input commit text through `compositionstart`/`compositionend`, not keystrokes. Two rules:

- **Expose composition as a spreadable bundle** (`{ onCompositionStart, onCompositionEnd }`) the caller spreads onto the **native** input/textarea — because the caller owns that element (styling differs per site) while the hook owns the composition state.
- **The bundle must reach the native node, not a wrapper.** If the caller spreads it onto a `<div>` wrapper, composition events never fire and the hook silently mishandles IME input. jsdom cannot catch this — mandate a manual Korean/Japanese/Chinese IME smoke before merge.

## `inputRef` must be a real DOM node

Caret and selection reads require a real element. A forwarded synthetic or wrapper ref breaks them with no error. Document the requirement and add a cheap dev-only invariant check if practical.

## Multi-trigger: one detector, N wrappers

When a second trigger lands (e.g. a `#` channel-picker alongside `@` mentions), avoid both extremes:

- **Don't** stuff all triggers into one config blob (`useThingPicker({ triggers: [...] })`) — config explosion at the trigger level.
- **Don't** run N hooks side-by-side and chain their predicates at the caller (`if (a.consumeKey(e)) return; if (b.consumeKey(e)) return;`) — precedence leaks back to the caller.

Instead: **one detector dispatches to N per-trigger wrappers.** The detector owns the "which trigger is active" state and the IME composition wiring — IME is shared across triggers, so leaving it per-wrapper is a silent regression. Each wrapper owns its own data fetch, ranking, commit policy, and `consumeKey`. The detector returns a single combined `consumeKey`, so the caller's keydown chain stays one line and at-most-one-trigger-active stays invariant.

## Worked example: `useMentionPicker`

```ts
function useMentionPicker(args: {
  value: string;
  setValue: (next: string) => void;
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}): {
  spans: MentionSpan[];                       // state

  // Spreadable bundle — spread onto the native input/textarea.
  // Fresh per render; never put in a caller dep array.
  composition: {
    onCompositionStart: (e: CompositionEvent) => void;
    onCompositionEnd: (e: CompositionEvent) => void;
  };

  // Predicate — chain first in the caller's onKeyDown.
  // INVARIANT: on `true` it has already called e.preventDefault();
  // the overlay's `if (e.defaultPrevented) return` guard relies on it.
  consumePopoverKey: (e: KeyboardEvent<HTMLElement>) => boolean;

  // Render function — caller mounts it where the popover should appear.
  // Returns null when closed; hook owns the popover's internal props.
  renderPopover: () => ReactNode;

  // Stable callback — serializes value+spans to wire format.
  // Identity tracks `spans`; destructure before listing in deps.
  serialize: (text: string) => string;
};
```

Each shape choice: `composition` is a spreadable bundle because the caller owns the styled textarea; `consumePopoverKey` is a predicate so the caller keeps precedence (popover first, then submit); `renderPopover()` returns ReactNode rather than a props bag so the hook hides the popover's internals; `serialize` is a stable callback because callers list it in their submit handler's deps.

**Scope discipline:** this migration kept each site's hand-rolled textarea and chrome. Folding those into a shared `<MentionAwareTextarea>` was deferred — bundling it would have regressed bespoke chip-painting on the editor site. Ship the orchestration extraction first; consolidating the element/styling is a separate decision.

## Checklist (in addition to the parent skill's)

- [ ] Input divergence matrix filled; 4+ divergent rows justify the hook.
- [ ] Keyboard exposed as a predicate (`consumeKey`), not a full `onKeyDown`.
- [ ] Predicate calls `preventDefault` itself on `true`; invariant documented; a `defaultPrevented`-dependent guard has a test.
- [ ] Composition exposed as a spreadable bundle that reaches the native node; manual IME smoke listed as an un-automated merge gate.
- [ ] `inputRef`-is-a-real-DOM-node precondition documented (+ dev assert if cheap).
- [ ] Multiple triggers use one detector → N wrappers, with IME wiring owned by the detector and a single combined `consumeKey`.

## References

- `react-deep-hook-design` — the general hook-design skill this specializes; apply it first.
- `deep-module-design` — the language-agnostic Ousterhout foundation.
