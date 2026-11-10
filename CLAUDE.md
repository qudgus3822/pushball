# Global agent instructions (~/.claude/CLAUDE.md)

Applies to every project. A project's own ./CLAUDE.md loads on top of this and may
add or override specifics.

## Writing Style

ELI5 = "Explain Like I'm 5": explain as if to a sharp, curious kid — dead simple
to follow, but never dumbed down into something wrong. This is the default voice
for everything you produce: chat answers, the session file, plans, reviews, commit
messages, and any doc a skill writes (flow-analysis, repo docs, etc.). It exists to
fix one recurring problem — documents stuffed with jargon and tangled sentences
nobody can actually follow.

**Keep it ELI5-simple.**
- Plain, everyday words. Use jargon/acronyms only when needed, and explain them in
  simple terms right where they appear.
- Explain hard ideas with everyday analogies and concrete examples.
- Short sentences. One thing at a time.
- Conclusion first ("so what's the point"), then the details.

**Writing Korean? Load the `korean-tech-writing` skill first.** It holds the 10
rules every Korean doc, plan, review, commit message, and session file follows.

## Rules

- Directory and file names use camelCase (a project may override this).

## Work procedure

Follow this loop for every non-trivial task. Update the session file at each step.
Every artifact you write in this loop — session file, plan, review notes, commit
message — follows the ELI5 writing style above.

Keep every artifact as long as the judgment needs and no longer: one acceptance
criterion per observable outcome, no filler sections, no repeated summaries.

1. Load context — read the session file for the current project (see "Session
   context").
2. Plan — consult implementation-planner. The planner selects which skills apply
   (see "Skills") and writes the plan into the session file. You assign this
   task's `{slug}` and pass it to the planner: a short camelCase name like
   `opencodePort`. Every file in this loop lives under `.claude/specs/{slug}/`.
3. Plan review — consult tough-reviewer in plan-review mode: it runs mechanical
   pre-checks on the plan first, then judges requirement coverage, skill
   checklists, and risk. Iterate planner ↔ reviewer until the verdict is APPROVE.
   Do not write any code before the plan passes.
4. Implement — consult implementation-expert to execute the approved plan,
   applying the selected skills.
5. Implementation review — consult tough-reviewer to review the implementation
   against the same skill checklists, plus: tests pass, requirements met, no
   regressions. Iterate expert ↔ reviewer until the verdict is APPROVE.
6. Ratchet — act on the review's "Promotion candidates". A mechanically
   checkable finding becomes a check in the project's gate (lint rule,
   `scripts/verify-fast.sh`, or a test); a design learning becomes a doc update
   (`repo-knowledge-map` says where); one that recurs across projects becomes a
   skill change in the harness template. Re-run the gate: red means fix it or
   revert that promotion. Commit promotions separately and record them.
7. Commit — consult git-message-creator for the commit message.
8. Record — update the session file with what changed and why.

Verdicts and severity: the reviewer marks every finding **blocking** (must fix)
or **advisory** (worth noting, never blocks on its own). APPROVE means zero
blocking findings. An implementation review also needs the deterministic gate
(typecheck + lint + test) green, zero undocumented drift, and every plan
criterion implemented. Anything less is REQUEST_CHANGES with an ordered fix
list. If a review can't reach APPROVE after 3 rounds, stop and surface the
blocker to me instead of looping.

## Session context (per project — never global)

These files track work on one specific project, so they live in THAT project,
never in ~/.claude. Resolve every path below against the project root — the
nearest ancestor directory containing `.git/` (or `.claude/`) — not your home
directory and not necessarily the current working directory.

- Before any work, read `<project-root>/.claude/tasks/context_session_{id}.md`
  (`{id}` = current session id). If it doesn't exist, create it. This is the
  working project's `.claude/`, NOT `~/.claude/`.
- It is the running record: context, overall plan, and each sub agent's
  progress/results, appended continuously.
- When a file passes 1000 lines, start the next-numbered file.
- After finishing, update it with your results.

## Sub agents

Four sub agents are available (installed in ~/.claude/agents/). After a sub agent
finishes, read the documentation it created before continuing. Everything these
agents write — plans, review notes, commit messages, session updates — follows the
ELI5 writing style above.

- implementation-planner — all implementation *planning*.
- implementation-expert — all actual *implementation*.
- tough-reviewer — *reviewing* any plan or implementation, and returning a verdict.
- git-message-creator — creating any git *commit message*.

## Skills

Consult the relevant skill before planning or writing code in its domain; its
guidance overrides generic defaults. Skills load on demand — these are pointers,
not imports. (Installed in ~/.claude/skills/.) When a skill produces a document,
write its prose ELI5-style (see "Writing style" above).

- deep-module-design — designing or reviewing ANY module/abstraction: boundaries,
  interfaces, naming, comments. The foundation the React skills build on.
- repo-knowledge-map — structuring a repo's docs and CLAUDE.md for agents: when
  CLAUDE.md grows, when adding or placing a doc, when building a docs index, or
  when docs have drifted from the code.
- unit-test-expert - unit test best practices for designing / reviewing / implementing phase.
- flow-analysis-doc - Author a detailed, verifiable flow-analysis document that walks a reader through how one subsystem actually works end-to-end — pairing plain-language concept with exact File:Line, mermaid diagrams, and a rigorous gotchas/observations section.
- korean-tech-writing — writing ANY Korean prose: docs, README, plans, reviews,
  commit messages, session files. The 10 rules for Korean technical writing.
