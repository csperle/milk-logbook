# Repository Guidelines

## Working style
- Prefer small, reviewable changes.
- Do not expand scope. If unclear, stop and ask targeted questions.
- Avoid large refactors unless explicitly requested.

## Sources of truth (in order)
1) Feature spec: docs/specs/<feature>.md
2) Current status / handoff: docs/state.md
3) System-level architecture: SPEC.md

## Allowed actions by role
### Architect
- May: write/update feature specs, define interfaces, edge cases, acceptance criteria.
- Must not: implement production code.

### Implementer
- May: implement the feature defined in the feature spec, do minimal necessary refactors.
- Must: keep changes scoped, update docs/state.md when requested.

### Tester
- May: add/update tests and test data/fixtures.
- Must not: change production code unless required; if required, explain why.

### Reviewer
- May: critique correctness/security/maintainability, suggest minimal diffs.
- Must not: introduce new features.

## Output formats
- Implementation: 3–7 bullet plan, then a patch/diff (or exact file edit list), then "How to test".
- Review: summary (<=5 bullets), ranked risks, concrete suggestions with small diffs/snippets.
- Specs: output ONLY Markdown for the spec file, no commentary.

## Safety
- Never run destructive commands unless explicitly asked (e.g., rm -rf, history rewrite).
- If command execution is needed, propose commands first.

## Project Structure & Module Organization
- App code lives in `src/app` using the Next.js App Router.
- Route-level files follow Next conventions: `page.tsx`, `layout.tsx`, and shared styles in `globals.css`.
- Static assets belong in `public/` and are referenced as `/asset-name` (example: `/next.svg`).
- Build output is generated in `.next/`; do not edit generated files.
- Use the `@/*` alias for imports from `src` (configured in `tsconfig.json`).

## Build, Test, and Development Commands
- `npm run dev`: start local dev server at `http://localhost:3000` with hot reload.
- `npm run build`: create a production build with Next.js.
- `npm run start`: run the built app in production mode.
- `npm run lint`: run ESLint with Next.js core-web-vitals + TypeScript rules.

## Coding Style & Naming Conventions
- Language: TypeScript (`.ts`/`.tsx`) with `strict` mode enabled.
- Indentation: 2 spaces; prefer double quotes and semicolons to match existing files.
- Components and layout files use `PascalCase` exports; route files remain lowercase framework names (`page.tsx`, `layout.tsx`).
- Keep UI styling in Tailwind utility classes and app-wide tokens in `src/app/globals.css`.
- Prefer alias imports like `@/app/...` over long relative paths when crossing directories.

## Testing Guidelines
- Unit tests and behavior/end-to-end tests are not required for this project.
- Treat `npm run lint` and `npm run build` plus manual verification as required validation before opening a PR.

## Commit & Pull Request Guidelines
- Existing history uses short, imperative-style summaries (example: `initial commit`).
- Use concise commit subjects in present tense, ideally under 72 characters.
- PRs should include: purpose, key changes, validation steps run, and linked issue(s).
- For UI updates, include before/after screenshots or a short video.

## Security & Configuration Tips
- Keep secrets in local environment files such as `.env.local`; never commit credentials.
- Validate external links and `target="_blank"` usage with `rel="noopener noreferrer"`.

## Definition of done
- Feature matches acceptance criteria
- Build/lint pass
- docs/state.md reflects the current status when asked
