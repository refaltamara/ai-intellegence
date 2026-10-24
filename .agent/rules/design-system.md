---
trigger: always_on
---

# Fair Intelligence UI standard

Whenever you create or change any interface in this workspace (a page, a component, a form, a menu, a style), first read `DESIGN.md` at the repository root and follow it. It is the design standard for this product: tokens, components, layout, interaction, accessibility and copy.

The essentials, so they hold even before you open it:

- Tailwind CSS v4 utilities only, without preflight. `app/legacy.css` is for pages not yet rebuilt: never add to it, never use its classes in new UI. Rebuilt pages carry `data-tw` on their root.
- Colours: orange `brand-palette-*`. `bg-primary` (600) for primary actions; orange text is `text-brand-palette-700` or darker, except a stat card's big number (`StatTile`, `text-3xl font-bold text-brand-palette-500`, with its icon tile on the right and one short line under it, the full sentence behind an `InfoTip`, as in the agency dashboard); text is never lighter than `gray-500`. No hex colours in components.
- Museo Sans Rounded (`font-sans`; 500 is regular, 700 is `font-semibold`). Light theme only. Cards `rounded-3xl border border-card-border bg-white`; inputs and buttons `rounded-2xl` (small ones `rounded-xl`).
- Reuse `src/ui/kit/`: `Button`/`buttonClass`, `TextInput`, `SelectInput`, `DateInput`, `Field`/`TextField`/`Chip`, `PickMenu`, `ProposalShell`, `Spinner`, `PageHeader`, `Modal`/`ConfirmDialog`/`PromptDialog`, `Toast`/`useToast`, `ActionMenu`, `Segmented`, `Switch`, `StatusPill`, `InfoTip`, the `Skeleton` pieces, and the two-tone icons in `icons.tsx` (no icon library, no emoji). Team icons through `RoleIcon`, the logo through `LogoMark`. Never `confirm()`, `prompt()` or `alert()`.
- No global header and no `max-w` page container, forms included (fill the width with responsive grids): each page has its own header (`PageHeader`: `h1` `text-xl font-semibold`, `text-xs` subtitle flush under it, a dashed line below; pages not yet rebuilt still have the old `text-3xl` header) and spans the width with `px-4 md:px-6`.
- Dropdowns: every choice from a list is a `SelectInput` with `withSearch`, never a native `<select>` (options may carry `disabled` and `group`; use `ariaLabel` when no label shows; inside a `Field`, give the `Field` `group`).
- Dates: every date field is the kit `DateInput` (typed `DD/MM/YYYY` or picked from its calendar; value `YYYY-MM-DD`; `min`/`max` as strings), never `<input type="date">`.
- Tables: the header row on the body's white (no grey band), header cells the body's size in `font-semibold text-gray-900`.
- Sidebar recent chats: hover changes the text colour only (`hover:text-brand-palette-700`), never a background.
- Loading: each rebuilt page has a `loading.tsx` with a skeleton from `src/ui/kit/Skeleton.tsx` in the shape of its own components.
- Accessibility is required: real buttons and links, visible focus, keyboard menus (arrows, Escape returns focus), 44px tap targets on phones, WCAG AA contrast, empty/loading/error states that say why and what to do.
- Copy: English, plain sentences, no em dashes, no emoji, no invented numbers, names or claims.
- When you add a token, a kit component or a layout pattern, update `DESIGN.md` in the same change.
- When the design standard changes (a user's correction, a new pattern, a rule taken back), update every document that repeats it in the same change: `DESIGN.md`, `AGENTS.md` section 2, this file, and rule 11 in `CLAUDE.md` if affected. Apply it to the screens already built to the standard, and say which documents and screens you updated.
