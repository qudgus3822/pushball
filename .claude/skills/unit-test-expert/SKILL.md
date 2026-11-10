---
name: unit-test-expert
description: "Write and review unit tests that actually FAIL when the behavior breaks, instead of \"test theater\" — tests with precise-sounding names whose bodies assert almost nothing (usually because a test double threw away the arguments it was handed). Language-agnostic; examples are in Go but every principle applies to Python, TypeScript/JS, Java, Rust, etc. Trigger during IMPLEMENTATION whenever writing or changing any unit test, or building a test double (fake/mock/stub/spy) or fixture; during REVIEW when auditing test quality, evaluating coverage, reviewing a diff that touches test files (`*_test.*`, `*.spec.*`, `*.test.*`, `test_*.py`, `*Test.java`, `*Tests.cs`), or when a test \"passes but proves nothing\"; during PLANNING when designing a module's seams/ports for testability. Builds on deep-module-design — narrow consumer-defined ports are what make capture-and-assert tests cheap. This is a quality gate: a green test that can't catch its own regression is worse than no test. When in doubt, trigger."
---

# Unit Test Expert

**A test exists to FAIL when the behavior it names breaks.** If breaking the code under test would not turn this test red, the test is theater — and worse than no test, because the green check hands out false confidence. Apply this whenever you write or review a test or a test double.

The principles below are language-independent. Code samples are written in Go because they're compact, but each one names the underlying idea so you can map it to your stack — pytest, Jest/Vitest, JUnit, RSpec, xUnit, Rust's `#[test]`, and so on. Where a mechanism has a different name per language, the cross-language equivalents are given inline.

---

## When This Skill Applies

| Phase | Triggers |
|---|---|
| **Implementation** | writing/changing any unit test; building a fake/mock/stub/spy/fixture; "add tests for X" |
| **Review** | auditing test quality; "this passes but proves nothing"; any diff touching test files; coverage gaps |
| **Planning** | designing a module's ports/seams so its behavior is observable in a test |

---

## The one check that matters

Before any test is "done", ask: **if I broke exactly the behavior this test's name claims, would this test fail?**

- If you are not sure — *actually break it*. Inject the regression into the code under test, watch the test go red, then revert. A test you cannot make fail on its matching regression is theater.
- Reviewing a whole suite = inject one regression per test (mentally, or for real); **any test that stays green is the finding.**
- **A "this is locked by a test" claim is only as good as its recorded evidence.** When you make or accept that claim, run the planted-regression experiment in a scratch copy and record the result as `[N red / M green]`, confirming the named test is among the red. A surviving mutant means either the test guards nothing or the mutation hit an inert line instead of the load-bearing one — both are findings.

This check is the same in every language. The rest of the skill is just the recurring ways tests quietly fail it.

---

## DO

1. **Capture, then assert what the code actually did.** A test double must RECORD the arguments it receives (the query filter, the update payload, the HTTP request, the channel, the message body) so the test can assert on them. Assert the system-under-test's *output or observable effect*, not merely that it returned without error. The recording mechanism differs by language (a struct field in Go, an instance attribute in Python, a captured closure variable in JS, a Mockito `ArgumentCaptor` in Java) — the principle is identical.

2. **Make the body prove the name.** A test called `recomputes_next_run_at` must assert the recomputed value (e.g. `== 01:00 UTC`), not just "no error". A precise name over a smoke-test body is a lie that outlives you.

3. **Assert identity / exact values, never mere presence.** Check the *specific* error, not that *some* error occurred — otherwise a different error masking the real one still passes. Use your language's identity check: Go `errors.Is(err, wantErr)`; Python `pytest.raises(SpecificError)`; JS/TS `expect(fn).toThrow(SpecificError)`; Java `assertThrows(SpecificException.class, …)`; Rust `assert!(matches!(res, Err(Specific…)))`. Likewise assert exact expected outputs and exact keys/fields — never "non-nil", "truthy", "non-zero", or "non-empty" as the *real* assertion.

4. **Verify the query/key, not just the result.** Capture the filter and assert the lookup field — especially reverse lookups (e.g. `slackUserId` vs `_id`/primary key), where querying the *wrong* field still "finds" the canned document your fake returns. The result looking right proves nothing if the fake ignores what you asked for.

5. **Cover error paths and every method that contains real logic** — especially writes/mutations. An untested error branch is an untested branch; an implemented-but-untested method is a gap, no matter how green the suite looks.

6. **Pure logic → exact expected values** (exact instants, not ranges). Inject the clock (a `now()` function/parameter) and any randomness/IDs, so time- and identity-dependent tests are deterministic and assert a single correct answer rather than "somewhere in this window".

7. **Prefer a real in-memory implementation over a hand-rolled double** when one is cheap — it tests real semantics instead of your assumptions about them. Examples: an in-memory DB or test container (sqlite, miniredis, testcontainers), a real local HTTP server (Go `httptest`, Python `responses`/`respx`, MSW or `nock` in JS, WireMock in Java), a fake clock library. Hand-rolled fakes are fine, but they encode *your beliefs* about the dependency; a real one encodes the dependency's actual behavior.

8. **Populate every field a serialization / round-trip test touches**, then assert each one survives the trip. A field you never set tells you nothing about how it serializes.

9. **Lock the contract: assert the SUT still satisfies the interface/port its consumers depend on.** Where the language allows it, add a cheap build-time guard so signature or shape drift fails at compile/type-check time instead of in production. Go: `var _ delivery.Adapter = (*SlackAdapter)(nil)`. TypeScript: `const _check: Adapter = impl` or `satisfies Adapter`. Java/C#: the `implements`/`: Interface` declaration already enforces this at compile time — keep it explicit. Python: a `Protocol` plus a `reveal_type`/mypy check, or an `abstractmethod` base. This matters most in languages with structural or duck typing, where a type can silently *stop* satisfying an interface with no error until runtime.

10. **Choose fixture values that can only be right for one reason.** Make the expected value differ from every default, zero value, and anything the double hands back, so the assertion can go green *only* when the SUT genuinely produced it. If the default channel is `C000` and you also want to prove a fallback *targets* `C000`, have the dependency return a *different* channel (`C999`) so a passing assertion can't be the fake's echo. Same-value fixtures make a correct result and a bug indistinguishable.

11. **Be honest about coverage boundaries.** If the double genuinely can't run the real thing (a database aggregation's sort/group stage, a true network round-trip, a GPU kernel), say so in the test and defer it to an integration/smoke test with a named cross-reference — never dress a bypass up as coverage.

12. **Test a new option/knob through the production wiring, at the point where it changes final output.** A test that hands the option directly to an inner function proves the consumer works *when fed* — it says nothing about whether production ever feeds it. At least one test must exercise the real path end-to-end and assert that varying the value changes the observable output. Producer code plus consumer code is not a feature; a value written into a map nobody reads, or checked by validation only, has not been consumed.

---

## DON'T (test-theater smells)

1. **Don't discard arguments in a double when a test should verify them.** A signature that ignores its inputs (Go's `func(_ ctx, _, _ any)`, a Python `def method(self, *args, **kwargs): return self.canned`, a JS `() => cannedResponse`) forces every write-path test to collapse into a bare error check, because there's nothing recorded to assert against.

2. **Don't let the error check be the ONLY assertion on a mutation.** "It returned no error" / "it threw" passes whether the *real* effect happened or a *different* error masked it. Pair it with an assertion on what was written, sent, or returned.

3. **Don't assert on values your double hardcoded** (the canned response's channel, a stubbed return field, an echoed ID). That's the fake grading its own homework. Assert what the SUT *chose*, read from the request it actually made — and (see DO #10) pick fixture values that differ from the canned ones so an echo can't masquerade as a pass.

4. **Don't assert presence of fields you never set** — it silently depends on serialization defaults (`omitempty`, `exclude_unset`, `@JsonInclude`, undefined-stripping) and verifies nothing about the value. Set the field, then assert its value survived.

5. **Don't let a double mask shape mismatches.** A `decode`/cast/deserialize that returns null/None/zero on a failed type assertion hides bugs — the wrong shape silently yields empty data instead of failing. Make the double raise/return an error on an unexpected shape so the mismatch fails loudly.

6. **Don't write names or comments that claim more than the assertions check, or that describe a different mechanism than the one exercised.** Two failure modes: (a) over-claiming scope — a comment says "asserts all keys are lowercase" while the code checks a fixed list of three keys; (b) wrong mechanism — a test named/commented "rejects tampered body" that actually signs with the wrong *key*. Both still test *something* real, but the description misleads the next reader about what's guarded. The name and comment must match the assertions *and* the mechanism exactly.

7. **Don't name a test for a behavior it doesn't exercise** — e.g. a "latest-status edge case" test whose edge logic lives in a layer the double bypasses, so the named edge never actually runs.

8. **Don't leave dead test scaffolding** — unused fake fields, capture variables that are recorded but never asserted, stubbed branches no test reaches. Use it in an assertion or delete it.

9. **Don't anchor to mutable external state.** Synthetic fixtures only; a test that reads live dev/prod data, the real wall clock, or a shared mutable record breaks for reasons unrelated to the code under test.

---

## The capture-and-assert pattern (the fix for most theater)

This is the single highest-leverage move: a double that *records* what it was called with, plus a test that asserts on the recording. The example is Go; the shape is universal — give the double a place to store the call, then read it back in the test.

```go
// THEATER — the double throws the update away; the test can only check the error.
func (f *fakeColl) UpdateOne(_ context.Context, _, _ any, ...) (*Result, error) {
    return f.res, f.err
}
func TestMarkRun_Defer(t *testing.T) {
    err := store.MarkRun(ctx, "s1", now, "deferred", false, time.Time{})
    if err != nil { t.Fatal(err) }            // proves nothing about the write
}

// REAL — the double captures filter + update; the test asserts what was written.
type fakeColl struct { gotFilter, gotUpdate any; res *Result; err error }
func (f *fakeColl) UpdateOne(_ context.Context, filter, update any, ...) (*Result, error) {
    f.gotFilter, f.gotUpdate = filter, update
    return f.res, f.err
}
func TestMarkRun_Defer(t *testing.T) {
    _ = store.MarkRun(ctx, "s1", now, "deferred", false, time.Time{})
    set := f.gotUpdate.(bson.M)["$set"].(bson.M)
    if _, ok := set["nextRunAt"]; ok {        // FAILS if defer wrongly advances the cursor
        t.Error("defer must not write nextRunAt")
    }
}
```

The same pattern in other ecosystems:
- **Python:** `self.captured_request = request` on a fake transport / `unittest.mock.Mock` with `assert_called_with(...)` or inspecting `mock.call_args`.
- **JS/TS:** a captured closure variable, or `jest.fn()` / `vi.fn()` with `expect(spy).toHaveBeenCalledWith(...)`; assert on `spy.mock.calls[0]`.
- **Java:** Mockito `ArgumentCaptor<T>` + `verify(dep).method(captor.capture())`, then assert on `captor.getValue()`.

Good model: a double that records calls (args / order / count) + a test that asserts on the recording. Bad model: ignored params + a body whose only assertion is on the error.

---

## Quick review checklist (scan for these in any language)

- A test whose only assertion is on the error/exception value.
- A double signature that ignores an argument (`_`, `*args`, an unread param) the test's name implies it verifies.
- A truthiness / `!= null` / "an error was thrown" check on an error you control, where you should assert its specific type or identity.
- "all" / "every" / "always" in a comment next to a loop over a *fixed* list — or a comment/name describing a different mechanism than the test runs.
- Unused fields on a fake/mock struct, or capture variables that are recorded but never asserted.
- A test asserting a value that appears verbatim in the double's setup (canned-echo) — or an expected value equal to a default/zero so a bug and a correct result look identical.
- A serialization/round-trip test that never sets the fields it then checks.
- No build-time/type guard that the implementation still satisfies the interface its consumers require (most dangerous under structural/duck typing).
- A reverse-lookup test that never asserts *which* key was queried.
- An option/knob tested only by passing it straight to the inner function — no test proves the production path ever delivers it, so a dead (unwired) feature stays green.

**When in doubt, break the code and see if the test notices. If it doesn't, you just found the work.**