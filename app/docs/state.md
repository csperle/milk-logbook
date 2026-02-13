# Project State

- Last updated date: 2026-02-13
- Current goal: define and deliver the first vertical slice, starting with Expense Type Administration.
- Active feature spec(s): `docs/specs/001-expense-types-admin.md`.

## What is implemented
- Base Next.js 16 app scaffold with App Router is present (`src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`).
- Tooling is configured: TypeScript strict mode, Tailwind v4, ESLint.
- NPM scripts exist: `dev`, `build`, `start`, `lint`.
- No domain modules, APIs, DB schema, or bookkeeping flows are implemented yet.
- Feature spec for expense type admin is documented.

## What remains
- Implement expense type admin UI and endpoints (list/create/delete) per spec.
- Add persistence layer and data constraints for expense type uniqueness/reference rules.
- Add/validate error handling and conflict behavior.
- Implement subsequent features (invoice upload/extraction/review/save, yearly overview, P&L).

## Known issues / open questions
- Persistence technology (SQLite/Postgres/file-based) is not yet selected.
- No test framework is configured.
- Open product questions are tracked in `docs/specs/001-expense-types-admin.md`.
