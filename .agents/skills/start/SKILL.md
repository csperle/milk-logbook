---
name: start
description: Initialize project context after restart or context reset. Explicit use only.
---

# When to use
Only run when the user explicitly types "$start" after a restart or context reset.
Never activate implicitly.

# Goal
Reconstruct an accurate understanding of the current project state.
Do not guess. Do not generate code.

# Read (in order)

Primary sources:
1. AGENTS.md
2. SPEC.md
3. docs/state.md
4. If docs/state.md references an active feature specs then read that specific file as well.

Next.js sanity check:
5. package.json (scripts + major deps only)
6. next.config.* (routing/runtime-relevant settings only)
7. src/app/** OR src/pages/** (determine router style + main entry areas)

# Output (max 10 bullets total)

Group bullets into:

- Architecture & conventions
- Current goal
- Active feature
- Next steps (max 3, concrete)
- Open questions (if there are any, that could prevent or complicate the implementation of the next feature)

# Constraints

- Do not generate code.
- Do not propose edits.
- Do not infer undocumented behavior.
- Stop after the summary and wait for further instruction.
