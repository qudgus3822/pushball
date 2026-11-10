---
name: repo-knowledge-map
description: "Structure a repository's knowledge for AI agents as a small navigational map plus an indexed docs/ system of record — not one giant CLAUDE.md/AGENTS.md that rots and gets ignored. Apply whenever you set up or reorganize agent-facing docs: when a CLAUDE.md or AGENTS.md is too long, stale, or contradictory; when onboarding an agent to a repo; when deciding where a new design doc, spec, plan, or runbook should live and how to link it; when building a table of contents / index for project docs; when auditing or cleaning up a stale/sprawling docs set (deciding keep/update/archive/prune per doc); or when docs have drifted from the code. Trigger in PLANNING, IMPLEMENTATION, and REVIEW of repo documentation and agent context. When in doubt, trigger."
---

# Repo Knowledge Map

Give the agent a **map, not a manual.** A single large instructions file fails predictably: context is scarce, so a giant file crowds out the actual task; when everything is marked important, nothing is, and the agent pattern-matches locally instead of navigating deliberately; nobody maintains a monolith, so it decays into a graveyard of stale rules; and one undifferentiated blob can't be checked mechanically, so drift is guaranteed.

The fix is a small, stable **entry map** (the root `CLAUDE.md`) that orients the agent and points into a structured `docs/` treated as a **system of record** — categorized, indexed, owned, and dated. The agent starts at a tiny stable entry point and reads deeper sources only when a task needs them. This is `deep-module-design`'s progressive disclosure applied to documentation: the entry file is a narrow interface; the knowledge base is the deep implementation behind it.

## How the harness loads docs (get this right first)

The mechanism determines the design, so don't guess at it:

- **Plain path *pointers* are read on demand.** A line like "see `docs/auth.md` when touching login" costs almost nothing until the agent chooses to open it. This is your main tool for keeping context lean.
- **`@path` imports load eagerly at launch.** They help organization but do **not** save context — an imported file is pulled in every session whether the task needs it or not. Reserve `@import` for the rare doc needed in *every* session; never `@`-import your whole knowledge base, or you've rebuilt the bible file.
- **Nested `CLAUDE.md` in subdirectories load lazily** when the agent works in that area. Use them for area-specific maps so per-package knowledge appears only when relevant.
- **Path-scoped rules** (e.g. `.claude/rules/`) load only when the agent touches matching files. Use them for "when editing X, remember Y."

Rule of thumb: **pointers and nested/scoped files for almost everything; `@import` only for the irreducible always-on minimum.**

## The entry map (`CLAUDE.md`)

Keep it small — adherence drops once an instructions file runs past a couple hundred lines, so treat ~100–150 as a ceiling, not a target. It holds only:

- **Orientation:** what this repo is, the top-level domain/layer map, where to find things.
- **The few genuinely global invariants** — the handful of rules that apply to *every* task (e.g. "never log card data"). If a rule is area-specific, it belongs in a nested `CLAUDE.md` or a path-scoped rule, not here.
- **Pointers**, one line each: *what it covers · when to read it · path.* Example: `Auth flows & session model — read before changing login — docs/auth.md`.

It must NOT hold: detailed specs, transient plans, API dumps, or anything that goes stale fast. Those live in `docs/` and are pointed to.

## The `docs/` layout

A starting template — adapt category names to the project, keep the shape:

```
docs/
├── README.md                  # the docs MAP: categorized one-line pointers (what · when · path) + an Archive section
├── architecture.md            # top-level domain + package layering map
├── design-docs/
│   ├── index.md               # catalog of design docs + their status
│   ├── core-beliefs.md        # durable operating principles
│   └── <topic>.md
├── product-specs/
│   ├── index.md
│   └── <feature>.md
├── plans/
│   ├── active/                # in-progress exec plans (versioned)
│   ├── completed/
│   └── tech-debt.md
├── generated/                 # machine-generated; never hand-edit
│   └── db-schema.md
├── references/                # vendor/tool docs for agents (e.g. *-llms.txt)
├── archive/                   # executed/superseded docs kept for history — git mv here + a superseded-by banner; never silently delete
└── quality.md                 # per-domain/-layer grades + tracked gaps
```

`docs/README.md` is the navigable hub; each category also gets its own `index.md`. The repo entry map (`CLAUDE.md`) carries ONE pointer to `docs/README.md`, not a re-listing of every doc. **Single source of truth:** every fact has exactly one home; other docs link to it rather than restating it. Duplication is how the knowledge base starts lying to itself.

**Subdivide a category before it sprawls.** A category folder is scannable at a glance up to roughly 8–10 docs; a flat folder of fifteen-plus files is as unnavigable as the bible file — the reader (human or agent) can't scan it to find the right doc, so they pattern-match on filename and miss the right one. When a category outgrows that, split it into sub-topic subfolders (by workstream, feature area, or lifecycle stage), each with its own `index.md`, and keep the parent `index.md` as the map over them. Do it as part of the reorg that moves the files, not "later."

## System-of-record discipline

What turns a `docs/` folder into a system of record:

- **Every doc carries front-matter:** `owner` and `last-verified` date, minimum; add `status` (current / active / needs-update / ARCHIVED) and, when superseded, `superseded-by:` pointing at the live source. An unowned, undated doc is a future stale doc. Prefer recording status and cross-links in front-matter over rewriting the body — it keeps the doc honest with a tiny diff.
- **Generated docs are marked generated** and regenerated by a script — never hand-edited, so they can't drift.
- **Plans are first-class, versioned, and colocated** in the repo with their progress and decision log, so the agent works from repo state, not outside context. Trivial changes get a throwaway inline plan; complex work gets an exec plan under `plans/active/`.

## Enforcement and gardening

A knowledge base that isn't checked drifts. Make the invariants mechanical:

- **A docs linter / CI job verifies:** every doc is reachable from the entry map (no orphans), every internal link resolves (no dead links), required front-matter (owner, last-verified) is present, and generated docs are up to date.
- **A periodic "doc-gardening" pass** reconciles docs against actual code behavior, flags or PRs anything stale, and prunes rules that no longer hold. When running this pass, read the doc, check it against the code it describes, and propose a concrete fix — don't just mark it suspect.
- **Name-content drift check.** Folder and doc names are part of the map — a name that no longer matches what it holds silently misroutes navigation (a folder named for its *origin* — a migration, a version, a "revision-vN" — that has since become the home of a whole subsystem). The gardening pass verifies each folder/doc name still describes its current *dominant* content; when it has drifted, `git mv` to a name that matches. Relative links inside the folder survive the rename — fix only the few external references and the entry-map pointer. Renaming is cheap next to the cost of misdirecting every future reader with a stale name.

## Triage: auditing or cleaning up an existing docs set

Bootstrapping a messy repo and running a gardening pass are the same core loop: assess every doc against the code, assign a disposition, then execute. Do this — not a vibe-read:

1. **Assess against code, not impressions.** For each doc, spot-check its concrete claims — symbols, field names, file paths, commands — against the actual source (grep, open the file) and cite `file:line`. Note its *type*: a **handoff/plan** is point-in-time (once executed, it's history); a **contract/guide/reference/design** is durable. Type + code-check decides the disposition.
2. **Fan out when the set is large.** Don't pull twenty 50–100KB docs into one context. Dispatch read-only assessors in parallel, clustered by topic; each returns, per doc: one-line purpose, type, current-vs-stale verdict with citations, overlaps/duplicates, recommended disposition. Then you synthesize.
3. **Assign one disposition per doc:**
   - **KEEP** — durable + current. Index it; ensure front-matter.
   - **UPDATE** — durable but has specific stale parts. List them; fix the minimum (often just front-matter `status`/`superseded-by` or a one-line correction, not a rewrite).
   - **ARCHIVE** — an executed plan/handoff or superseded doc with residual *why*/rationale value. `git mv` to `docs/archive/` (preserve history), prepend a `status: ARCHIVED` + `superseded-by:` banner pointing at the live source, link it from the map's Archive section. The common trigger: a doc whose "current state" section now describes the *before* world — it would actively mislead if left in the live set.
   - **PRUNE** — stale + fully superseded + no residual value (e.g. a generic copy of a skill or vendor doc). Delete; if anyone might still look for it, leave a one-line pointer to the real source instead of a copy.
   - **MERGE** — duplicate/overlapping. Pick one canonical home; reduce the others to a pointer.
4. **Respect a don't-touch set.** If a category is out of scope (per-item specs someone else owns, generated dirs), index it with a single *directory* pointer — do not enumerate its files, move them, or rewrite them.
5. **Gate the destructive steps and isolate the commit.** Archiving and pruning move/delete files — surface the disposition list for approval before executing, and commit the docs reorg on its own, separate from any code change.

**Verify before you call it done** (by hand now; the CI linter enforces it later): every pointer in the map resolves; no surviving doc links to a moved/pruned path (orphan check); required front-matter is present on kept docs; the don't-touch set is byte-for-byte unchanged.

## Workflow

**Bootstrap (new or unstructured repo):** run the **Triage** loop above over every existing doc and scattered instruction → categorize survivors into the `docs/` taxonomy → write `docs/README.md` + per-category `index.md` → add the one entry-map pointer → add the linter/CI checks.

**Refactor a bible file:** split the monolith by concern → move each chunk into the right `docs/` home → replace it with a one-line pointer in the entry map → confirm nothing was lost (every former section now has a home reachable from the map) → keep `@import` only for the always-on minimum.

**Maintain:** run the gardening pass on a schedule and whenever code changes outpace the docs.

## Anti-patterns

- **The bible file.** A 1,000-line `CLAUDE.md` holding everything. The interface (what the agent must hold every session) is larger than it needs to be; split it behind a map.
- **The map that's secretly a manual.** The entry file creeps past a couple hundred lines because "this is important too." Importance is what `docs/` is for; the map only points.
- **`@`-importing the whole knowledge base.** Eager imports negate the context savings — same failure as the bible file, just spread across files.
- **Duplicated facts.** The same rule restated in three docs; they diverge, and now the agent can't tell which is true. One home, links elsewhere.
- **Orphans and stale blobs.** Docs not reachable from the map, or with no owner/date. If the linter can't find it and no one owns it, it rots silently.
- **Transient plans in the entry map.** Plans churn; the map is stable. Plans live versioned under `docs/plans/`.
- **Hard-deleting history.** Pruning a completed plan/handoff that is the only record of *why* a design exists. If it has rationale value, ARCHIVE it (git mv + `superseded-by` banner); only PRUNE what's generic or fully captured elsewhere.
- **Flat-folder sprawl.** One `docs/` category grown to fifteen-plus files in a single flat directory — unscannable, so agents pattern-match on filename instead of navigating. Subdivide by sub-topic with per-subgroup indexes once it passes ~8–10.
- **The mislabeled folder (name-content drift).** A folder or doc whose name reflects its *origin*, not its current content (a `revision-v3/` that is now a subsystem's home). The name is part of the map; a stale one misroutes every future navigation. Rename to match — `git mv` preserves history, and relative links inside survive.

## Checklist

- [ ] Entry `CLAUDE.md` is a map of one-line pointers, under ~150 lines, holding only orientation + truly-global invariants.
- [ ] `@import` used only for the always-on minimum; everything else is on-demand pointers, nested `CLAUDE.md`, or path-scoped rules.
- [ ] `docs/` is categorized with an `index.md` per category; each fact has a single home, others link to it.
- [ ] Every doc has an owner and last-verified date; generated docs are marked and script-regenerated; plans are versioned and colocated.
- [ ] CI/linter checks reachability, dead links, required front-matter, and generated-doc freshness.
- [ ] Refactors lose nothing: every former section of a split file has a home reachable from the map.
- [ ] An existing-docs audit assigned every doc a disposition (KEEP/UPDATE/ARCHIVE/PRUNE/MERGE) backed by a code-cited staleness check, not a vibe-read.
- [ ] Archived docs were `git mv`'d (history preserved) and carry a `superseded-by` banner; nothing with rationale value was hard-deleted.
- [ ] Any don't-touch category is untouched and referenced only by a directory pointer.
- [ ] Post-build verification ran: map links resolve, no orphan refs to moved/pruned docs, front-matter present.
- [ ] No single docs category is a flat sprawl (>~10 files); large categories are subdivided by sub-topic with per-subgroup indexes.
- [ ] Every folder/doc name matches its current dominant content (no origin-name drift); drifted names renamed via `git mv`.

## References

- `deep-module-design` — the same progressive-disclosure / information-hiding principle this applies to repository knowledge.
