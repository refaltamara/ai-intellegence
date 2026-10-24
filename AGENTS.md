# Instructions for AI coding agents

This file is for any agent working in this repository (Antigravity, Codex, Cursor, Gemini, and others). Claude Code reads `CLAUDE.md`; the rules are the same.

1. **Product and data rules:** read `CLAUDE.md` first, then `docs/DECISIONS.md` (it overrides the rest), `docs/DATA_NOTES.md` and `docs/PRD.md`.
2. **UI rules:** any work that creates or changes an interface follows `DESIGN.md`, the design standard for this product. In short:
   - Tailwind CSS v4 utilities only, without preflight. `app/legacy.css` styles the pages not yet rebuilt; never add classes to it or use its classes in new UI.
   - Orange brand tokens (`brand-palette-*`, `primary`), Museo Sans Rounded, light theme only.
   - Reuse `src/ui/kit/` (Button, TextInput, SelectInput, Form, PickMenu, ProposalShell, PageHeader, Modal/ConfirmDialog/PromptDialog, Toast, ActionMenu, Segmented, Switch, StatusPill, Skeleton, icons) before building anything new; add new shared pieces there.
   - No global header and no width cap on app pages, forms included (fill the width with responsive grids); each page owns its header, the compact `PageHeader`.
   - Dropdowns: every choice from a list is a `SelectInput` with `withSearch`, never a native `<select>`.
   - Tables: the header row sits on the body's white (no grey band), its cells the body's size in `font-semibold text-gray-900`.
   - Sidebar recent chats: hover changes the text colour only, never the row's background.
   - Loading: each rebuilt page has a `loading.tsx` whose skeleton (`src/ui/kit/Skeleton.tsx`) has the shape of that page's components.
   - Keyboard, focus, 44px tap targets, WCAG AA contrast and the empty, loading and error states are required, not optional.
   - English UI copy, no em dashes, no emoji, no invented numbers or names. Dialogs go through the kit `Modal`, never `confirm()`, `prompt()` or `alert()`.
3. When you add a token, a kit component or a layout pattern, update `DESIGN.md` in the same change.
4. **When the design standard changes** (a correction from the user, a new pattern, a rule taken back), update every document that repeats it in the same change: `DESIGN.md` first, then this file (section 2), `.agent/rules/design-system.md`, and rule 11 in `CLAUDE.md` if it is affected. Apply the change to the screens already built to the standard, and say in your reply which documents and screens you updated.
5. Before calling UI work done: `pnpm typecheck`, then run the app and check it at 1440px and 375px.
