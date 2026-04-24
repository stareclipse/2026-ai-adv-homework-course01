# Codex Docs Compliance Reorganization Implementation Plan

> **For Codex:** Use this archived plan as the record for the completed documentation compliance task.

**Goal:** Make the project documentation comply with the Codex-oriented assignment rules.

**Architecture:** Keep `AGENTS.md` as the short primary memory file, move extended content into `docs/`, and separate feature status from API reference details. Completed work is archived under `docs/plans/archive/`.

**Tech Stack:** Markdown documentation for a Node.js, Express, EJS, Vue CDN, Tailwind CSS, better-sqlite3, Vitest project.

---

## Tasks

1. Update `AGENTS.md` so it remains under 100 lines and reflects the current ECPay implementation.
2. Add `docs/API_REFERENCE.md` for endpoint details, auth requirements, status mappings, and API error references.
3. Rewrite `docs/FEATURES.md` as a concise feature status and behavior overview under 500 lines.
4. Update `docs/README.md`, `docs/DEVELOPMENT.md`, `docs/ECPAY_SETUP.md`, and `docs/CHANGELOG.md` to match the new document boundaries.
5. Verify `AGENTS.md <= 100` and every `docs/**/*.md <= 500`.
6. Verify stale ECPay mock-payment wording has been removed.
