# Instructions for AI coding agents

This file is for any agent working in this repository (Antigravity, Codex, Cursor, Gemini, and others). Claude Code reads `CLAUDE.md`; the rules are the same.

1. **Product and data rules:** read `CLAUDE.md` first, then `docs/DECISIONS.md` (it overrides the rest), `docs/DATA_NOTES.md` and `docs/PRD.md`.
2. **UI rules:** any work that creates or changes an interface follows `DESIGN.md`, the design standard for this product. In short:
   - Tailwind CSS v4 utilities only, without preflight. `app/legacy.css` styles the pages not yet rebuilt; never add classes to it or use its classes in new UI.
   - Orange brand tokens (`brand-palette-*`, `primary`), Museo Sans Rounded, light theme only.
   - Reuse `src/ui/kit/` (Button, TextInput, SelectInput, Form, PickMenu, ProposalShell, icons) before building anything new; add new shared pieces there.
   - No global header and no width cap on app pages; each page owns its header.
   - Keyboard, focus, 44px tap targets, WCAG AA contrast and the empty, loading and error states are required, not optional.
   - English UI copy, no em dashes, no emoji, no invented numbers or names.
3. When you add a token, a kit component or a layout pattern, update `DESIGN.md` in the same change.
4. Before calling UI work done: `pnpm typecheck`, then run the app and check it at 1440px and 375px.
