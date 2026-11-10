---
name: deep-module-design
description: Enforces deep module design, strong abstractions, precise naming, and meaningful comments based on "A Philosophy of Software Design" by John Ousterhout. MUST be triggered across ALL phases of software development — planning, design, implementation, and review. Trigger during PLANNING when the user discusses architecture, system design, module boundaries, service decomposition, API contracts, data modeling, or asks "how should I structure this." Trigger during REVIEW when the user asks to review code, PR reviews, audit existing modules, evaluate abstractions, or assess code quality. Trigger during IMPLEMENTATION when the user asks to write, create, build, implement, refactor, or modify any code. Also trigger when the user mentions abstractions, interfaces, naming conventions, documentation, or design patterns. This skill is a mandatory quality gate — no planning decision, code review, or implementation should bypass it. When in doubt, trigger.
---
 
# Deep Module Design Skill
 
This skill applies in every phase: planning, review, and implementation — sketching architecture, reviewing a pull request, or writing new code. Its principles are design constraints, not optional suggestions.
 
---
 
## When This Skill Applies
 
| Phase | Trigger Examples |
|-------|-----------------|
| **Planning** | "How should I structure this?", "Design the architecture for...", "What modules do we need?", "Should I split this into microservices?", decomposing features, choosing between approaches |
| **Review** | "Review this code", "Is this abstraction right?", PR reviews, auditing module boundaries, evaluating naming, assessing existing designs |
| **Implementation** | Writing new code, refactoring, adding features, fixing bugs, creating APIs |
 
---
 
## Phase 1: Planning & Design
 
When the user is planning or discussing architecture, evaluate every proposed boundary using these questions:
 
1. **What is the abstraction?** — Define the mental model the caller should have.
2. **What is the interface?** — Keep it as narrow as possible.
3. **What is being hidden?** — List the complexity the caller should never see.
4. **What are the defaults?** — The common case should need zero configuration.
If these cannot be answered clearly for a proposed module, the design is not ready. Push back and help the user refine before moving forward.
 
**During planning, actively challenge:**
- Proposed module splits that create shallow modules or pass-throughs.
- Interfaces that leak implementation details (e.g., exposing internal data structures in API contracts).
- Service boundaries that force callers to orchestrate what should be hidden.
- Naming choices that are vague or inconsistent across the design.
**Output for planning tasks:** Provide a design recommendation that explicitly states — for each proposed module — the abstraction it provides, what it hides, and its interface surface. Flag any module that looks shallow.
 
---
 
## Phase 2: Review
 
When reviewing existing code or designs, evaluate against the full review checklist (see below). For every violation found:
1. Name the specific principle being violated.
2. Quote or point to the offending code/design.
3. Suggest a concrete fix — don't just flag problems.
Review scope includes: module depth, information hiding, exception handling, naming precision, comment quality, and unnecessary shallow splits.
 
---
 
## Phase 3: Implementation
 
Before writing any code, confirm the design is sound by running through the Planning checklist above. If the user jumped straight to "build this" without a design discussion, briefly validate the design internally and flag concerns before coding.
 
---
 
## Core Principles
 
### 1. Deep Modules Over Shallow Modules
 
Every module, class, or function Claude writes MUST maximize the ratio of **hidden complexity to interface surface**.
 
**DO:**
- Provide a small, simple interface that hides significant internal complexity.
- Absorb implementation details — formats, algorithms, retries, caching, error recovery.
- Combine closely related functionality into one module with a clean boundary.
**DON'T:**
- Create pass-through methods that just delegate without adding value.
- Split into many tiny classes/functions that scatter complexity across more surfaces.
- Expose internal data structures or state to callers.
**Self-test:** If removing the module forces the caller to write roughly the same amount of code, the module is too shallow. Redesign it.
 
### 2. Information Hiding
 
Every module MUST absorb its design decisions so that changes to internals never ripple to callers.
 
**Checklist before finalizing any module:**
- [ ] Can the internal data format change without affecting callers?
- [ ] Can the algorithm change without affecting callers?
- [ ] Can error-handling strategy change without affecting callers?
- [ ] Are configuration details defaulted, not required?
If any answer is "no," the abstraction is leaking. Fix it before shipping.
 
### 3. Exception Handling — Absorb, Don't Propagate
 
**Default behavior:** Handle errors internally whenever a reasonable default or recovery exists.
 
- Mask transient failures with retries inside the module.
- Use sensible fallbacks rather than surfacing every edge case.
- Only propagate errors the caller can meaningfully act on.
- Never force callers to handle errors that are implementation artifacts.
### 4. Sensible Defaults
 
- The zero-argument or minimal-argument call MUST handle the common case.
- Advanced options are exposed through optional parameters, builder patterns, or configuration objects.
- Never require the caller to understand internals to use the basic API.
---
 
## Naming Rules
 
### Every name MUST be precise and self-qualifying.
 
A reader seeing only the name and type signature should build a correct mental model.
 
| Bad | Good | Why |
|-----|------|-----|
| `r` | `requestBody` | What kind of reader? Be specific. |
| `n` | `retryCount` | `n` requires context lookup every time. |
| `data` | `userProfiles` | "data" says nothing about what it contains. |
| `process()` | `validateAndRoute()` | "process" is meaningless — what does it do? |
| `handle()` | `retryWithBackoff()` | "handle" hides the actual behavior. |
| `tmp` | `pendingBatchBuffer` | Temporary doesn't describe purpose. |
 
### Naming Checklist
 
- [ ] **Precise** — Name conveys exact meaning without reading implementation.
- [ ] **Consistent** — Same concept uses the same name across the entire codebase.
- [ ] **No abbreviations** — Unless universally understood (`URL`, `HTTP`, `ID`).
- [ ] **Verb+noun for functions** — `sendNotification`, `parseConfig`, `validateInput`.
- [ ] **Noun phrases for variables/classes** — `connectionPool`, `retryPolicy`, `UserSession`.
- [ ] **No generic names** — Avoid `data`, `info`, `manager`, `handler`, `utils`, `helper`, `misc` unless further qualified.
### Language-Specific Override
 
When working in Go, acknowledge the community convention of short names but **still prefer precision at module boundaries** (exported functions, struct fields, interface methods). Short names are acceptable ONLY for:
- Loop indices in < 5-line blocks.
- Well-established idioms (`err`, `ctx`, `ok`).
Everywhere else — especially in public APIs — use precise names.
 
---
 
## Comment Rules
 
### What MUST be commented
 
1. **Every exported/public interface** — What abstraction does this provide? What can the caller assume?
2. **Every non-obvious design decision** — Why this approach over alternatives?
3. **Precision details** — Units, boundary conditions, nullability, thread safety, side effects.
4. **Module-level doc** — What problem does this module solve? What does it hide?
### What MUST NOT be commented
 
- What the code literally does (the code already says this).
- Obvious type information.
- Change logs (use git).
### Comment Quality Test
 
Before finalizing comments, apply this test:
 
> *"If someone reads ONLY the name, type signature, and comments — never the implementation — can they use this correctly?"*
 
If no, the comments are insufficient. Add what's missing.
 
### Comment Template for Interfaces
 
```
// [ModuleName] provides [abstraction in one sentence].
//
// It handles [hidden complexity 1], [hidden complexity 2], and [hidden complexity 3]
// internally, so callers only need to [simple usage pattern].
//
// [Parameter/config name]: [precision detail — units, bounds, defaults, null behavior]
//
// Example:
//   [minimal usage example showing the common case]
```
 
---
 
## Review Checklist (Used in ALL Phases)
 
Whether planning, reviewing, or implementing — evaluate against these criteria:
 
| # | Check | Pass Criteria | Applies To |
|---|-------|---------------|------------|
| 1 | **Depth** | Interface is significantly simpler than implementation | Planning, Review, Implementation |
| 2 | **Information hiding** | Internals can change without caller changes | Planning, Review, Implementation |
| 3 | **Exception absorption** | Caller only sees errors they can act on | Review, Implementation |
| 4 | **Defaults** | Common case needs minimal arguments | Planning, Review, Implementation |
| 5 | **Naming precision** | Names are self-qualifying at every scope | Planning, Review, Implementation |
| 6 | **No pass-throughs** | No methods that just delegate without value | Planning, Review, Implementation |
| 7 | **Interface comments** | Every public surface has what/why documentation | Review, Implementation |
| 8 | **No shallow splits** | Related logic isn't scattered across needless layers | Planning, Review, Implementation |
 
Flag any violation explicitly and suggest a concrete fix.
 
---
 
## Quick Reference — Red Flags by Phase
 
### Planning Red Flags
- **"Let's make a service for each entity"** → Likely creates shallow modules. Ask what complexity each service hides.
- **Interface mirrors the data model** → Abstraction is leaking. The interface should reflect the caller's mental model, not the storage schema.
- **Every module needs to know about every other** → Boundaries are wrong. Redesign so modules communicate through narrow interfaces.
- **"We'll need a config for that"** → Challenge it. Can a sensible default handle the common case?
### Review Red Flags
- **Pass-through method** → Merge with the layer above or below.
- **Leaking implementation type in signature** → Return an abstraction instead.
- **Caller catches and re-throws unchanged** → Absorb the exception.
- **Required config for common case** → Add a default.
- **Generic name at module boundary** → Make it precise.
- **No interface comment** → Add one describing the abstraction, not the code.
- **Many small classes with thin logic** → Consider consolidating into one deep module.
### Implementation Red Flags
- **Writing a class and immediately wondering "should I split this?"** → Finish the deep version first. Split only if two genuinely independent abstractions emerge.
- **Adding a parameter the common caller won't use** → Make it optional with a default.
- **Exposing an internal error type to the caller** → Wrap it or handle it internally.