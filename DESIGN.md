# Fair Intelligence: UI Design Standard

> The single source of truth for how this product looks and behaves: tokens, components, layout, interaction and copy.
> Every person and every AI agent (Claude Code, Antigravity, Codex, Cursor, any other) building or changing UI in this repository follows this file.
> It is self-contained on purpose: nothing here needs another repository. Fair's agency dashboard uses the same system in purple; this product is the orange member of the family.

**Keep it current.** When you add or change a token, a shared component in `src/ui/kit/`, or a layout pattern, update this file in the same change. Do not document one-off page code here.

**When the standard changes, every place that repeats it changes too.** A change to the standard (a user's correction such as "headers on the body's background", a new pattern, a rule taken back) is written here first, then in the short versions other agents read: `AGENTS.md` (section 2), `.agent/rules/design-system.md`, and rule 11 in `CLAUDE.md` when it is touched. Apply the change to the screens already built to the standard (search for the old classes) so the product and this file never disagree, and say in your reply which documents and screens you updated.

---

## 0. Before you touch UI

1. Read this file, then `CLAUDE.md` (product rules) and `docs/DECISIONS.md` (what overrides what).
2. Look in `src/ui/kit/` first. Use the component that exists; extend it if it is close; build a new one only when nothing fits, and then add it to the kit and to section 6 here.
3. New or rebuilt UI is written in **Tailwind utilities only**. Do not add classes to `app/legacy.css`. Do not write new global CSS except tokens and the few resets in `app/globals.css`.
4. Run it and look at it before you call it done (section 12).

---

## 1. Identity

| | |
|---|---|
| Product name | **Fair Intelligence** (a presenter's brand for the day may replace it; read it from the server, never hardcode it in a component) |
| Assistant | **CeMO** |
| Personality | Professional, calm, data-first, quick to act. Tactile controls, no decoration for its own sake. |
| Theme | **Light only.** There is no dark mode; do not add `dark:` variants. |
| Logo | The orange-to-pink sound-bar mark: `<LogoMark size={n} />` from `src/ui/LogoMark.tsx` (same drawing as `app/icon.svg`). Never a letter, never redrawn, never recoloured. On an orange surface, set it on a white tile (`rounded-[30px] bg-white p-1.5`). |
| Brand motif | The logo's five rounded bars. It may be used large and faint (white at 15% on orange) as the one decorative element of a brand surface, as on the sign-in panel (`AuthShell`). |

**Dials** (how much energy the UI carries): `ENERGY 2 / RHYTHM 2 / MOTION 2`.
- Energy 2: one orange accent on calm neutral surfaces. No gradients as decoration, no glows, no blurred colour blobs.
- Rhythm 2: dense, structured screens (tables, filters, forms) with a clear hierarchy.
- Motion 2: short, purposeful motion only (button press, menu entrance, drawer slide, spinner while working). Nothing loops on its own except a spinner that marks real work.

---

## 2. How styling works in this repo

- **Tailwind CSS v4**, configured in CSS (`app/globals.css`, `@theme`), no `tailwind.config`. PostCSS plugin: `@tailwindcss/postcss`.
- **No preflight.** The old stylesheet `app/legacy.css` still styles the pages not yet rebuilt, so Tailwind's reset is off. Cascade layers, lowest to highest:
  `theme` (tokens) → `legacy` (old pages) → `shell` (a few global fixes) → `utilities` (your classes win).
- Consequences you must handle yourself because there is no reset:
  - Form controls do not inherit the font: put `font-sans` on every `input`, `textarea`, `select` and on portalled menus.
  - Browsers draw a border on `textarea`/`input`: add `border-0` when the frame belongs to a wrapper.
  - `svg` is inline by default and sits on the text baseline: kit icons are already `block shrink-0`; do the same for any svg you draw.
  - Legacy styles bare `table`, `th`, `td`. A rebuilt page puts `data-tw` on its root element so those rules step aside (see the reset in `app/globals.css`).
- Merge classes with `cn()` from `src/ui/cn.ts` (`clsx` + `tailwind-merge`).
- **Static class names only.** Tailwind cannot see `bg-${color}`. Use a map: `const TONE = { ok: "bg-green-50 text-green-700", ... }`.
- A legacy class name kept on a rebuilt element must have a reason written next to it (for example Chats keeps `screen ask` because `legacy.css` reads `.main:has(.screen.ask)`).

---

## 3. Tokens

All tokens live in `@theme` in `app/globals.css`. Use the utility names below; never paste hex values into components (the chart palette in `src/ui/Chart.tsx` is the one exception, and it is commented).

### 3.1 Brand palette (orange)

| Step | Hex | Use |
|---|---|---|
| 50 | `#FFF6F0` | Tint: active nav item, selected row, secondary button, active chip |
| 100 | `#FFEADB` | Icon tiles, count badges, evidence chips |
| 200 | `#FFD2B6` | Borders of selected or open things |
| 300 | `#FFB083` | Hover border on outline controls |
| 400 | `#FF9047` | The logo's own orange. Decoration only (tab markers, motif). Never text. |
| 500 | `#F26B1F` | Focus ring tint (`ring-brand-palette-500/15`) |
| **600** | `#CF4A0C` | **Primary.** `bg-primary` buttons, focus outline, switch track, avatars. White text on it: 4.53:1. |
| **700** | `#AD3A08` | **Accent text.** Any orange text, links, text on the 50/100 tints (5.82:1 on 50). Primary button hover. |
| 800 | `#8C300A` | Text on 100/200 badges, link hover |
| 900 | `#72290C` | Rare deep accent |
| 950 | `#3E1203` | Deepest tone |

`--color-primary` = 600.

**Contrast rule (hard):** orange text is `text-brand-palette-700` or darker, never 600 on a tint and never 400/500. `text-brand-palette-600` on white is the lowest allowed (4.53:1) and only for icons or 16px+ text.

### 3.2 Neutrals

Cool gray carries the interface:

| Token | Hex | Use |
|---|---|---|
| `gray-50` | `#F9FAFB` | App canvas, table zebra, quiet panels |
| `gray-100` | `#F3F4F6` | Segmented control track, disabled fills, neutral chips |
| `gray-200` | `#E5E7EB` | Dividers, sidebar border |
| `gray-300` | `#D1D5DB` | Switch track off, secondary borders |
| `gray-400` | `#9CA3AF` | Decoration only. Fails contrast for text. |
| `gray-500` | `#6B7280` | Secondary text, hints, captions (lowest text grey: 4.83:1 on white) |
| `gray-600` | `#4B5563` | Body text in dense areas, idle nav items |
| `gray-700` | `#374151` | Labels, table cells, control text |
| `gray-800` | `#1F2937` | Strong UI text |
| `gray-900` | `#111827` | Headings, primary text, tooltips |

Also available: `card-border` = `#EEF0F4` (every card and panel border), `slate-200` (input borders), `neutral-*`, `bw` not used.

Root text colour is `text-[#1C1C1C]` on the app shell.

### 3.3 Semantic

| Meaning | Classes |
|---|---|
| Success / live | `bg-green-50/60 text-green-700`, dot `bg-green-600` (`green-50` here is a bright `#C5FFBF`, so use it at 60%) |
| Error | `bg-red-50 text-red-700`, borders `border-red-500`; danger actions `text-red-600 hover:bg-red-50` |
| Warning / waiting | `bg-amber-50 text-amber-800` |
| Neutral status | `bg-gray-100 text-gray-700` |
| Brand status | `bg-brand-palette-100 text-brand-palette-800` |

### 3.4 Typography

- Family: **Museo Sans Rounded** (self-hosted in `public/fonts`, weights 100/300/500/700/900), fallback Plus Jakarta Sans, system sans. Utility: `font-sans`.
- **Weights are remapped:** `font-regular` = 500 (body), `font-medium` and `font-semibold` = 700, `font-bold` = 900. There is no 1000 file; do not use `font-black`.
- Use native Tailwind sizes only:

| Class | Size | Use |
|---|---|---|
| `text-[10px]`/`text-[11px]` | 10/11px | Count badges, evidence chips, tiny tags |
| `text-xs` | 12px | Labels above inputs, captions, hints, chips, small buttons |
| `text-sm` | 14px | Body, table cells, nav items, form text |
| `text-base` | 16px | Prominent body, sign-in subtitle |
| `text-lg` | 18px | Card titles, sidebar product name |
| `text-xl`/`text-2xl` | 20/24px | Section and modal titles, sign-in title |
| `text-3xl` | 30px | **Page title (`h1`)**, big numbers |
| `text-4xl` | 36px | Empty-state hero on wide screens |

- **Title and subtitle sit flush:** no margin between a heading and the line under it.
  ```tsx
  <div>
    <h1 className="text-3xl font-semibold text-gray-900">Chats</h1>
    <p className="text-sm text-gray-500">On the side of GoPay</p>
  </div>
  ```
- Numbers in tables and stats: `tabular-nums`, right-aligned in columns.

### 3.5 Radius

| Class | px | Use |
|---|---|---|
| `rounded-md` | 4 | Tiny tags, evidence chips |
| `rounded-lg` | 8 | Menu rows inside a list, small icon buttons |
| `rounded-xl` | 12 | Small buttons (`sm`), chips, tool buttons, nav items, select `sm` |
| `rounded-2xl` | 16 | Buttons `md`/`lg`, **inputs**, composer, menus, inner panels |
| `rounded-3xl` | 24 | **Cards**, sign-in panels, modals, bottom sheets |
| `rounded-full` | 999 | Avatars, status pills, switch tracks, badges |

### 3.6 Elevation

Most things sit flat on a border. Shadow marks something that floats.

| Thing | Treatment |
|---|---|
| Card / panel | `border border-card-border bg-white`, optional `hover:shadow-md transition-shadow` when clickable |
| Input, composer | `shadow-xs` at most |
| Menu, dropdown, popover | `shadow-xl` (`shadow-lg` for small ones) |
| Drawer, bottom sheet, phone sidebar | `shadow-xl` / `shadow-2xl` |
| Never | Glow, coloured shadows, shadow on every card |

### 3.7 Z-index

| Layer | z |
|---|---|
| Sticky table header | 20 to 30 |
| Desktop sidebar (its tooltips must clear the page) | 30 |
| Mobile backdrop, app switcher, inline menus | 40 |
| Evidence pane as a phone sheet | 45 |
| Phone sidebar drawer, toasts, collapsed-sidebar tooltips | 50 |
| Portalled select lists | 60 |
| Modal backdrop and dialog | 999 |

---

## 4. Icons

- First choice: **Fair's two-tone icons** in `src/ui/kit/icons.tsx`. Each is one shape at `opacity="0.4"` under one solid shape, both `fill="currentColor"`, drawn on a 16, 20 or 24 viewBox, rendered by the internal `Svg` helper (`block shrink-0`, `aria-hidden`).
  Available: `IconCalendar`, `IconChart`, `IconDocument`, `IconMessages`, `IconBriefcase`, `IconFolderFavorite`, `IconPlug`, `IconPeople`, `IconSetting`, `IconDocumentCloud`, `IconEye`, `IconEyeSlash`, `IconSignOut`, `IconNotification`, `IconProfile2User`, `IconLikeShapes`.
- System glyphs, stroked 2px round: `IconMenu`, `IconClose`, `IconChevronLeft/Right/Down`, `IconCheck`, `IconSearch`, `IconPlus`, `IconDownload`; `IconMore` is three filled dots.
- Team icons always through `<RoleIcon role="pr|brand_kol|social" />` (bell, two people, like-badge), so the picker and the sidebar never disagree.
- **Adding an icon:** add a function to `icons.tsx` in the same two-tone manner (a 40% background shape, a solid foreground shape). No icon library imports (no `lucide-react`), no emoji, no generic "AI" sparkles.
- Sizes: 20px in nav items and buttons, 18px in menus and icon buttons, 14 to 16px inline with small text, 22 to 24px inside 48px tiles.
- Icons inherit colour (`currentColor`). Never hardcode a colour on an icon.

---

## 5. Layout

### 5.1 App shell (`app/layout.tsx`)

```
┌──────────────┬───────────────────────────────┐
│ Sidebar      │ MobileBar (phones only, h-14) │
│ 256 / 72px   ├───────────────────────────────┤
│              │ <main> page (scrolls itself)  │
└──────────────┴───────────────────────────────┘
```

- Root: `flex h-dvh overflow-clip bg-gray-50 text-[#1C1C1C]`, wrapped in `<ShellProvider>` (drawer state).
- **There is no global header.** Each page owns its header, inside the page, and it scrolls with the content.
- Use `h-dvh`, never `h-screen`; `overflow-clip`, never `overflow-hidden`, on root containers.
- Full-screen routes (sign-in, team picker, consent, CMS) skip the shell: `FULL_SCREEN` in `app/layout.tsx`.

### 5.2 Sidebar (`src/ui/Sidebar.tsx`)

- `bg-white border-r border-gray-200`, `w-64` expanded, `w-18` collapsed (cookie `fi_sidebar`, read on the server so the first paint is right).
- Order, top to bottom: logo + product + team label → workspace `SelectInput` (search; a 40px initials badge when collapsed) → team switcher (segmented, always three roles, the unavailable one disabled with its reason as a title) → nav (`MAIN_NAV` only) → **Recent chats** in a grey well (`rounded-2xl border border-card-border bg-gray-50 p-1.5`) so they read as conversations, not places → Our {codename}, Connect → `AccountMenu` → Hide menu.
- Nav item: `flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm`; active `bg-brand-palette-50 font-semibold text-brand-palette-700`; idle `text-gray-600 hover:bg-brand-palette-50 hover:text-brand-palette-700`.
- Recent chat row: `truncate rounded-xl px-2.5 text-[13px] text-gray-700`; hover changes only the text colour (`hover:text-brand-palette-700`), never a background or shadow on the row, so the well stays one quiet surface.
- Collapsed: icons only, centred, each with a dark tooltip (`bg-gray-900 text-white text-xs rounded-lg`) on hover **and** on keyboard focus; the tooltip text is the accessible name.
- Below `md`: a drawer from the left with a `bg-black/40` backdrop; closes on Escape, backdrop, navigation; focus moves to its close button and back to the menu button.

### 5.3 Page header

```tsx
<header className="flex flex-col gap-3 pb-2 pt-6 md:flex-row md:items-center md:justify-between md:gap-6 md:pt-8">
  <div className="min-w-0">
    <h1 className="text-3xl font-semibold text-gray-900">Title</h1>
    <p className="text-sm text-gray-500">What this page is about</p>
  </div>
  <div className="flex flex-wrap items-center gap-2">{/* status pills, actions */}</div>
</header>
```

- Pair title block and actions with `md:items-center`, not `items-start`.
- Chats, Decks (list, New deck, Edit, a deck and its versions), Weekly Reports, Reports (list, a schedule, a report) and the Dashboard (every team's, the Pulse and a case) use the compact version of this header instead (6.3, `PageHeader` in the kit). A page rebuilt next to them should use it too.
- Page horizontal padding: `px-4 md:px-6`. Content is **full width**: no `max-w-*` container on app pages, forms included (a long form fills the width with responsive grids, `md:grid-cols-2 xl:grid-cols-3`, instead of leaving the right side empty). The only exceptions are reading width for long prose and the full-screen family (sign-in, team picker), whose centred column is part of the layout.
- Sections stack with `gap-6`.

### 5.4 Sign-in family (`src/ui/AuthShell.tsx`)

Split screen on `bg-gray-50 p-4 md:p-6`: the form on a white `rounded-3xl border-card-border` panel (`max-w-md` column), the brand on an orange `rounded-3xl bg-brand-palette-600` panel from `lg` up with the logo, the faint bar motif and one true sentence about the product. No figures, no testimonials, no badges. Login, reset, set password and invitation all use it.

### 5.5 Breakpoints

Tailwind defaults: `sm` 640, `md` 768 (sidebar becomes a drawer below it), `lg` 1024, `xl` 1280. The evidence pane uses `min-[1101px]` / `max-[1100px]` (side panel vs bottom sheet).

---

## 6. Components

### 6.1 In the kit today (`src/ui/kit/`), use these

**`Button`, `ButtonLink`, `buttonClass(variant, size, className?)`** (`Button.tsx`)
- Base: `inline-flex items-center justify-center font-semibold transition-all duration-100 active:scale-[0.98]`, focus outline orange.
- Variants: `primary` (`bg-primary text-white hover:bg-brand-palette-700 hover:shadow-md`), `secondary` (`bg-brand-palette-50 text-brand-palette-700`), `outline` (white, `border-slate-200`, orange on hover; the quiet default for rows of follow-up actions), `ghost` (no frame; Cancel, Discard, Undo), `link`.
- Sizes: `sm` (`min-h-10 rounded-xl text-xs px-3`), `md` (`min-h-11 rounded-2xl text-sm px-6`), `lg` (`min-h-[52px] rounded-2xl text-base px-8`).
- `isLoading` + `loadingLabel`: spinner and a verb ("Signing in…"); the button keeps its place.
- A `Link` that acts as a button: `className={buttonClass("outline", "sm")}`.
- In a footer, secondary actions come first and the primary last (right).

**`TextInput`** (`TextInput.tsx`): label above (`text-sm text-gray-900`, `gap-1.5`), `h-13 rounded-2xl border-slate-200 px-4 text-sm`, focus `border-brand-palette-600 ring-2 ring-brand-palette-500/15`, error `border-red-500 bg-red-50/30` with `text-red-600` message below, `hint` below in `text-gray-500`, optional `right` slot (show password). Placeholders say what goes there (`email@example.com`), never fake data.

**`SelectInput`** (`SelectInput.tsx`): a button that looks like the input, its list portalled to `document.body` (`data-dropdown-portal`, `z-[60]`), flipped above when there is no room. `withSearch` adds a search box that takes focus. Keyboard: arrows, Home/End, Enter, Escape returns focus. Sizes `sm` (40px, 44px on phones) and `md` (52px). `variant="badge"`: a 40px square with the option's initials for narrow rails; its list opens beside it.
- **Every choice from a list is a `SelectInput` with `withSearch`**, whatever the page (rebuilt, legacy or CMS) and however short the list. Never a native `<select>`; `NativeSelect` is gone from the kit.
- Options are `{ value, label, disabled?, group? }`. A `disabled` option shows but cannot be picked, and the arrows skip it. A run of options with the same `group` gets a small heading (what an `<optgroup>` was, such as "Months" and "Weeks"). Values are strings: map numbers with `String()` in and `Number()` out.
- Name it with `label` (shown above it) or `ariaLabel` (no visible label: a filter row, a table cell, a `Field`). Inside a `Field`, pass `group` to the `Field`, because a `<label>` around the button would open it on a click on the label's text.
- Width: full width by default. In a row of filters or a table cell, set `className="w-auto min-w-48"` (or the width the longest option needs). `placeholder` is shown while no option matches the value, such as "choose…" or "→ brand".

**`DateInput`** (`DateInput.tsx`): the agency dashboard's date field, and **every date field uses it; never `<input type="date">`**.
- Props: `{ value: "YYYY-MM-DD" | "", onChange, min?, max?, label?, ariaLabel?, size?: "sm" | "md", disabled?, error?, className? }`. `min` and `max` are `YYYY-MM-DD` strings.
- Typing is masked to `DD/MM/YYYY`: a day above 31 or a month above 12 is refused. The parent hears a value only when it is a real date inside the bounds, and leaving the field with half or an impossible date clears it.
- The calendar icon (`IconCalendar`) opens a month calendar portalled with `data-dropdown-portal` (`z-[60]`). It flips up when there is no room below. Weeks start on Sunday. The selected day is `bg-primary text-white`; today has a thin brand ring; days outside the bounds are disabled.
- Keyboard: ArrowDown in the field opens the calendar, and focus moves to the selected day. Arrows move a day or a week, across months, and stop at the bounds. Enter picks, and Escape closes and returns focus to the field.
- Sizes: `sm` matches `TextField` (40px, 44px on phones), `md` matches `TextInput` (52px). Inside a legacy `<label>` caption, use a `div` instead, so a click on the caption does not open the calendar.

**`Field`, `TextField`, `Chip`** (`Form.tsx`): compact filter forms. `Field` puts a bold `text-xs` label and an optional hint above its control; pass `group` when it holds several controls (chips, min/max pair, multi-select, a `SelectInput`) so it renders a labelled group instead of a `<label>`. Inputs are `h-10 rounded-xl`. `Chip` is a toggle (`aria-pressed`), `on` = `bg-brand-palette-50 border-brand-palette-300 text-brand-palette-700`.

**`MultiSelect`** (`src/ui/MultiSelect.tsx`): chips + search + checkbox list, `rounded-2xl`, removable chips are real buttons.

**`PickMenu`** (`PickMenu.tsx`): small action menu (decks, Pulses, "+ New …"), `rounded-2xl shadow-xl p-1.5`, opens down or `up` from a footer, focus on first item, arrows and Escape.

**`ProposalShell`** (`ProposalShell.tsx`): the card for anything CeMO proposes: kind badge, title, status pill (`tone`: draft, waiting, approved, sent_back, rejected, removed), body, a grey footer with actions and an error line.

**`Spinner`**: `h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin`, brand 600 by default.

**`AuthShell`, `FormError`, `authLink`** (`src/ui/AuthShell.tsx`): sign-in frame, the one-error box (`role="alert"`, `rounded-2xl bg-red-50 text-red-700`), and the underlined orange link style.

**`AccountMenu`** (`src/ui/AccountMenu.tsx`): avatar (initials on `bg-brand-palette-600`), email, role, chevron; opens a menu with a header (full email), items with a one-line hint, then Sign out in red. Upwards in the sidebar, sideways when collapsed.

**`PageHeader`** (`PageHeader.tsx`): the compact header Chats has (6.3): `h1 text-xl`, `text-xs` subtitle flush under it (a string or a node, such as a "Decks" link · "no version yet"), an actions slot, and the dashed line. Decks, its child pages, Weekly Reports and Reports use it.

**`Modal`, `ConfirmDialog`, `PromptDialog`** (`Modal.tsx`): the modal spec in 6.2, portalled to the body. Focus goes to the text field or the first control, Tab stays inside, and Escape or the backdrop closes it, with focus returned to the opener. `ConfirmDialog` takes `danger` (a `bg-red-600` primary) and `busy`. `PromptDialog` is one labelled `TextField` whose Save stays off while it is empty. Use these instead of `confirm()`, `prompt()` and `alert()`.

**`Toast`, `useToast()`** (`Toast.tsx`): the toast spec in 6.2. `const toast = useToast(); toast.show("Saved.")` and render `<Toast text={toast.text} />` once.

**`ActionMenu`** (`ActionMenu.tsx`): a 40px three-dot button (`IconMore`, `aria-haspopup="menu"`, `aria-expanded`). Its list is portalled with `data-dropdown-portal` (`z-[60]`), so a table's `overflow-x-auto` never clips it, and it flips up near the bottom of the screen. Items are `{ key, label, onSelect, danger?, disabled?, hint? }`. Arrows, Home/End and Escape work as in a menu. Picking an item puts focus back on the button before `onSelect` runs, so a dialog it opens returns focus there.

**`Segmented`** (`Segmented.tsx`): the segmented control in 6.2. It is a radio group by default, and a tab list with `tabs` (filters over a list). An option may carry a `count` badge. Sizes `sm` and `md`, both 44px on phones.

**`Switch`, `SwitchKnob`** (`Switch.tsx`): the toggle switch in 6.2 as a full row (knob, bold label, `text-xs` hint). Use `SwitchKnob` alone inside a tool button (the deck's "Every week", Chats' Builder mode).

**`Skeleton` pieces** (`Skeleton.tsx`): `SkeletonPage`, `HeaderSkeleton`, `FilterRowSkeleton`, `TableSkeleton`, `CardSkeleton`, `ChartSkeleton`, `StatRowSkeleton`, `ViewerSkeleton`, `Skel`, `SkelPill`; see "Empty, loading, error states" in 6.2.

**`StatusPill`** (`StatusPill.tsx`): the status pill with tones `live` (green, with the one dot), `ok` (green, no dot: good but not live), `waiting`, `neutral`, `brand`, `error`, `critical` (`bg-red-700 text-white`, the worst state only, such as PR's Crisis). `ProposalShell` keeps its own proposal tones.

**`StatTile`, `Delta`, `StatRow`** (`StatTile.tsx`): the stat card in 6.2. `StatTile({ label, value, delta?, sub?, action?, icon? })`, drawn like the agency dashboard's StatCard: label `text-sm font-medium text-gray-500` and value `text-3xl font-bold text-brand-palette-500 tabular-nums` on the left, the metric's two-tone icon in a `size-12 rounded-2xl bg-brand-palette-100 text-brand-palette-600` tile on the right; under them the delta, a `text-xs` line that says what the number counts (`text-pretty`, two lines at most), and an optional action (an "Ask why" link) at the bottom. Each dashboard maps its tile keys to icons (`TILE_ICON`). `Delta({ dir, glyph? })`: `dir` is good (`up`, green-700) or bad (`down`, red-700), `flat` or `none` (no comparison, grey); the ▲/▼ glyph says which way the number went, so a rise in negative comments is a red ▲. It always names the comparison ("vs Sep", "vs before"). `StatRow({ n })` lays tiles one, two, then four (or three and six) across. No tinted tiles, no corner shapes.

**`SectionCard`, `SectionTitle`, `CARD`, `Panel`, `Empty`, `Notes`, `ErrorBox`** (`Section.tsx`): a screen's section as the card in 6.2 with its `h2 text-lg` title, a `text-xs` line flush under it, the section's own actions on the right (Add to a deck, a quiet link) and the content. `Panel` is a `rounded-2xl` inner panel (one of two lists side by side). `Empty` is the in-section empty state (`rounded-2xl bg-gray-50`, one centred sentence). `Notes` is the amber box for the data's caveats above a screen (`rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs`, a line each): quieter than the content it qualifies. `ErrorBox` is the one-error box. `decks/formParts.tsx` re-exports `CARD` and `SectionTitle`.

**Table pieces** (`Table.tsx`): the table in 6.2 as class names a server component can use: `TABLE_FRAME`, `TABLE` (add a `min-w-[…]` so it scrolls instead of squashing), `THEAD`, `TH`, `TH_NUM`, `TR`, `TD`, `TD_NUM`, `SUB` (a second line in a cell), `EMPTY_ROW`; `Table({ head, children, min })` puts them together; `SortHeader` is the sortable header (button inside the `th`, `aria-sort`, active in `brand-palette-700` with ↓); `Pager` is the pagination line (range on the left, Previous and Next on the right, as links or buttons).

**`Drawer`** (`Drawer.tsx`): the side sheet in 6.2, portalled: `bg-black/30` backdrop, the panel `sm:w-[420px]` (`wide`: 640px) with a grey header (title and a close button) and a grey footer for its actions; the body scrolls. Escape and the backdrop close it, focus goes in, stays in and comes back; a dialog opened from it (a `ConfirmDialog`) owns the keys while it is open.

**Chart pieces** (`chart.tsx`): `SERIES` (the categorical palette, fixed order; the one place chart hex values live), `OTHER` (a neutral for the rest), `GRID`, `AXIS`, `LABEL` (SVG paints), `niceCeil` (the top of an axis), `ChartTip` + `TipRow` (the dark hover card and its rows), `Swatch` (a legend entry) and `LegendToggles` (legend entries as `aria-pressed` buttons that hide and show a series). Charts are hand-drawn SVG: dashed `gray-200` grid, 2px lines, 8px markers with a white ring, 2px white gaps between stacked parts, one y-axis per chart (two measures are two charts), a legend from two series, and a "Table view" under the chart.

**`RoleIcon`, `LogoMark`, `cn`**: see sections 1, 2 and 4.

### 6.2 Patterns to follow when you build one (add it to the kit, then here)

These come from the shared Fair design system. Build them to these specs in orange; do not invent a different look.

**Card**: `rounded-3xl border border-card-border bg-white`, padding `p-5` or `p-6`; clickable adds `cursor-pointer hover:shadow-md transition-shadow`. Inner panels and result cards inside a thread may use `rounded-2xl` with `px-4 py-3` headers and `border-t border-card-border` between parts.

**Table**
- Wrapper `overflow-x-auto rounded-2xl border border-card-border` (or `rounded-xl` with `max-h-[720px] overflow-auto` for long lists).
- Header row on the same background as the body (`bg-white`, never a grey band), closed by a line (`border-0 border-b border-card-border`). Header cells are the body's size and say they are headers through weight and colour: `px-3 py-2.5 text-sm font-semibold text-gray-900` (in a `text-xs` mini table, `text-xs`). A sticky header is `sticky top-0 z-20 bg-white`.
- Body cells `px-3 py-2.5 text-sm text-gray-700`, zebra `even:bg-gray-50/60`, hover `hover:bg-brand-palette-50`, selected/open row `bg-brand-palette-50`.
- Sortable header: a `<button>` inside `<th>` with `aria-sort` on the `<th>`; active column `text-brand-palette-700` with ↓/↑.
- Numbers right-aligned `tabular-nums`. Checkboxes `h-4 w-4 accent-brand-palette-600` with an `aria-label`.
- Empty: one sentence in the table body that says why and what to do.

**Status pill**: `inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold` + a semantic tone (3.3). A dot (`h-1.5 w-1.5 rounded-full`) only when it marks a live state; it never pulses.

**Count badge**: `min-w-5 rounded-full bg-brand-palette-100 px-1.5 py-0.5 text-[11px] font-semibold text-brand-palette-800`.

**Tabs**: container `rounded-xl border border-card-border bg-white`; each tab a button `h-12 px-4 text-xs font-semibold`, active `text-gray-900` with a `h-0.5 bg-brand-palette-600` bar under it, idle `text-gray-500 hover:text-gray-900`; `role="tablist"`/`"tab"` with `aria-selected`; on phones the row scrolls horizontally (`no-scrollbar overflow-x-auto`).

**Segmented control / switch button**: track `rounded-xl bg-gray-100 p-1`, options flex items, active `bg-white shadow-xs font-semibold text-brand-palette-700`.

**Toggle switch**: track `inline-flex h-5 w-9 items-center rounded-full p-0.5` (`bg-brand-palette-600` on, `bg-gray-300` off), knob `h-4 w-4 rounded-full bg-white shadow-xs transition-transform` with `translate-x-4` when on. Knob in normal flow, never absolutely positioned. The element is a `button role="switch" aria-checked`.

**Menu / dropdown**: `rounded-2xl border border-gray-100 bg-white p-1.5 shadow-xl`; rows `min-h-10 rounded-xl px-3 py-2 text-sm hover:bg-gray-100`; active row `bg-brand-palette-50 text-brand-palette-700`; `role="menu"`/`"menuitem"`; focus moves in on open, arrows move, Escape closes and returns focus, click outside closes. A menu that must escape an overflow container goes through a portal with `data-dropdown-portal`.

**Tooltip**: `rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white`, shown on hover after a short delay and immediately on keyboard focus. Long explanations stay in `title` only if a visible label already names the control.

**Modal**: backdrop `fixed inset-0 z-[999] bg-black/40 backdrop-blur-sm grid place-items-center`; dialog `rounded-3xl bg-white p-6 sm:p-8 shadow-2xl max-w-[400px] w-full`; `role="dialog" aria-modal="true"` with a labelled title; Escape and the backdrop close it; focus goes in and comes back. Destructive confirm: primary in `bg-red-600`.

**Drawer (side sheet)**: backdrop `bg-black/30`; panel `fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white border-l border-gray-200 shadow-2xl`; header and footer `px-5 py-3 bg-gray-50`.

**Toast**: `fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg`, `role="status" aria-live="polite"`, slides up 12px on show. One short sentence that says what happened.

**Stat card** (in the kit as `StatTile`): card `p-5`; label `text-sm text-gray-500`; value `text-3xl font-bold text-brand-palette-500` (the one place orange text may be lighter than 700: at 3xl bold it is large text, 3:1 on white); icon tile on the right `size-12 rounded-2xl bg-brand-palette-100 text-brand-palette-600`. Every number comes from the data layer (CLAUDE.md rule 1); never a placeholder figure, never a delta without a named comparison period.

**Stepper**: steps as `rounded-xl px-3 py-1.5 text-sm`; active `bg-brand-palette-50 text-brand-palette-700 font-semibold` with a `bg-brand-palette-600 text-white` index box; done `bg-gray-100 text-gray-900` with a check; idle `bg-gray-100/70 text-gray-500`.

**Pagination**: `min-w-8 h-8 rounded-lg text-sm`; active `bg-primary text-white`; idle `bg-gray-100 hover:bg-gray-200`; a line of `text-sm text-gray-500` with the range on the left.

**Empty, loading, error states** (required on every data view)
- Loading: a skeleton with the same geometry as the content (`bg-gray-200 rounded animate-pulse` for text lines, `bg-gray-100` for pills and buttons), or a `Spinner` plus a line that says what is loading. No full-page spinner when the layout is known.
  - **Every page rebuilt to this standard that loads on the server has a `loading.tsx`** (a legacy page gets its skeleton when it is rebuilt, so the skeleton and the page it stands for have the same shape), built from `src/ui/kit/Skeleton.tsx`, in the shape of that page's own components: `SkeletonPage` (the frame, `role="status"` with a hidden label), `HeaderSkeleton` (PageHeader), `TableSkeleton` (the table above), `CardSkeleton` (a section card, with `tiles` for a card grid), `StatRowSkeleton` (stat cards), `ViewerSkeleton` (the slide viewer), `Skel`/`SkelPill` for anything else. `PageLoading` is the dashboard shape (header, filter row, stat tiles, a chart, a table, a card) for the Dashboard, the Pulse and a case.
  - A new page or a new layout adds its skeleton in the same change; a new kind of component that pages wait on gets a skeleton piece in `Skeleton.tsx`.
  - Inside a component, a part that loads on its own (a PDF, a list fetched in the browser) shows its own skeleton in place, the size of what is coming.
- Empty: why it is empty and the one action that fills it ("No chats yet. Ask CeMO something in Chats and it shows up here.").
- Error: what failed and what to do next, in `rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700` with `role="alert"`.

### 6.3 Chats-specific pieces (reference implementations)

`src/ui/Ask.tsx` (page, thread, composer), `ResultCard.tsx`, `Pane.tsx` (evidence pane), `ProposalCard.tsx`, `SlashMenu.tsx`, `AskContextCard.tsx`, `Evidence.tsx`, `Chart.tsx` are the most complete examples of this standard. Copy their patterns:
- User message: `self-end max-w-[75%] rounded-2xl rounded-br-md border border-brand-palette-100 bg-brand-palette-50 px-4 py-2.5 text-sm`.
- CeMO message: a 32px `rounded-xl bg-brand-palette-100 text-brand-palette-700` "C" tile, then the answer column (`text-sm leading-relaxed text-gray-800`).
- Composer: `rounded-2xl border bg-white p-3 shadow-xs` with `focus-within:border-brand-palette-600 focus-within:ring-2 focus-within:ring-brand-palette-500/15`; the textarea inside has no border, outline or shadow of its own; the dock around it has no border or background of its own (it sits on the page's `bg-gray-50`, like the thread) and lines up with the thread (`px-4 pb-4 md:px-6 md:pb-6`; the thread's `pb-6` is the gap above). The page header's top padding matches the sides (`pt-4 md:pt-6`) ; its title is smaller than other pages' (`h1` `text-xl font-semibold leading-tight`, subtitle `text-xs text-gray-500`, still flush) so it sits with the `text-xs` pills beside it and stays under the empty-state hero; a dashed line closes it (`border-0 border-b border-dashed border-gray-300 pb-4`; without preflight `border-0` is needed, or `border-dashed` draws the browser's default width on the other three sides).
- Evidence chip: a real `<button>`, `h-5 min-w-5 rounded-md bg-brand-palette-100 text-[11px] font-bold text-brand-palette-800`.
- Empty-screen hero (a new conversation), vertically centred (`py-10 md:py-16`):
  - It opens with the 44px CeMO tile (`rounded-2xl bg-brand-palette-100 text-brand-palette-700`) and the name "CeMO", which says who answers. Parts are spaced `gap-6`.
  - The title (`hero_title`) is `text-[32px] md:text-5xl font-semibold leading-[1.1] tracking-tight text-balance` at `max-w-3xl`. It uses 700, not 900: at this size 900 reads heavy in Museo Sans Rounded.
  - The intro (`hero_intro`) is `text-base md:text-lg leading-relaxed text-gray-600 text-pretty` at `max-w-2xl` (reading width for prose). Its first sentence (`splitLead` in `Ask.tsx`, what CeMO has read) leads in `font-semibold text-gray-900`, and the rest follows in grey.
  - There are no suggested questions on it (DECISIONS).
  - Intro copy: short sentences, no semicolons. Say what CeMO has read, what to ask about, and that every number comes with its posts.

### 6.4 Decks and the slide viewer (reference implementations)

`src/ui/decks/` (`DeckList`, `DeckForm`, `DeckDescriber`, `SlideDescriber`, `PeriodPick`, `DeckFirst`, `DeckViewer`, `SlideComments`, shared pieces in `formParts.tsx`) and `src/ui/weekly/` (`WeeklyViewer`, `SlideAsk`), and `src/ui/reports/` (Reports: `ReportList`, `ScheduleDetail`, `NewSchedule`, `WeeklyForm`, the report documents on `docParts.tsx`). Copy these patterns:
- **List with row actions:** the table in 6.2 at `min-w-[880px]` inside its scrolling wrapper. One visible quiet action (Pause or Resume, outline sm), and the rest in `ActionMenu`. Destructive items go through `ConfirmDialog`.
- **Long form:** a column of section cards (`CARD`: `rounded-3xl border-card-border bg-white p-5 md:p-6`, `h2 text-lg` + `text-xs` hint via `SectionTitle`), full width, with the fields and card grids widening to three or four columns on wide screens. A sticky footer (`sticky bottom-0 border-t border-gray-200 bg-gray-50 py-3`) keeps the busy line, Cancel, Save and the primary in reach.
- **Template cards:** `button aria-pressed` cards in `grid gap-3 sm:grid-cols-2 xl:grid-cols-3`. Selected is `border-brand-palette-200 bg-brand-palette-50` with a 20px `bg-brand-palette-600` check. `MadeBy` badges: Fair's work in `brand-palette-100/800`, a team's in `gray-100/700`.
- **Checkbox cards** (`CheckCard`): a `<label>` card holding a `h-4 w-4 accent-brand-palette-600` checkbox, a bold title, an optional `text-[11px]` tag and badge, and a `text-xs` description. Checked uses the brand tint; locked or blocked is `bg-gray-50 text-gray-500`.
- **Version tabs:** a `role="tablist"` row of `rounded-xl border px-3 text-xs` chips, active in the brand tint. On phones the row scrolls (`no-scrollbar overflow-x-auto`) instead of wrapping.
- **Side panel beside a slide:** `rounded-2xl border-card-border bg-white`, sticky from 1101px. It has the Tabs spec (Ask AI | Comments with a count badge), a thread in the Chats bubble style without the "C" tile (the column is 380px), and the Chats composer (`COMPOSER`, `COMPOSER_INPUT`).
- **Presenting** is the one exception to light only. The full-screen shell turns `bg-gray-900` so the slide is the only bright thing on screen. Text on it is `text-gray-300`/`text-white`, and its buttons are `text-gray-100 hover:bg-white/10`. Nothing else in the product is dark.

### 6.5 The Dashboard (reference implementation)

`src/ui/dashboard/` (`Dashboard` for Brand & KOL, the shared `DashFilters`, `Sections`, `Customise`, `DashTemplates`, `PanelBuilder`, `PanelView`, `RankTable`, `MentionsChart`, `AskBar`, and the small server-safe pieces in `parts.tsx`), `src/ui/reputation/PrDashboard.tsx` (PR), `src/ui/social/SocialDashboard.tsx` (Social Media) and `src/ui/PulsePage.tsx` (a profile's crisis view, also `/pulse` and a case). Copy these patterns:
- **Frame:** `<section data-tw className={DASH_PAGE}>` (`flex min-h-full flex-col gap-6 px-4 pb-10 md:px-6`), the compact `PageHeader` (title, the period and "data through" line, Customise and Templates as outline `sm` buttons), the filter row under it, the data's notes (`Notes`), the stat tiles (`StatRow` + `StatTile`), a Builder's "What do you want to see here?" (`AskBar`), then the sections in the team's order.
- **Filter row:** one wrapping row of kit controls: platform and window as `Segmented` (`sm`), the period or brand in focus as `SelectInput withSearch`, brands as `MultiSelect` with a primary Apply that shows only when the choice changed, and `FilterBusy` ("Updating…" with a spinner) while the new view loads. Every change is a URL.
- **Sections:** each is a `SectionCard`; two half-width sections share `TWO` (`grid gap-6 lg:grid-cols-2`). Inner lists (creators, posts, quotes) are rows divided by `divide-card-border` or `Panel`s; post cards are `rounded-2xl border-card-border p-4` in `sm:grid-cols-2 xl:grid-cols-3`.
- **"Ask why" and "Ask CeMO":** `AskLink`, a quiet `text-xs font-semibold text-brand-palette-700` link that is always visible (never shown only on hover, which a phone cannot do), with an `aria-label` that names the figure.
- **Small marks:** `PlatformTag` (a neutral two-letter tag with the full name for screen readers), `Tag` (format, client, own post), `Bar` (one value on a grey track in `brand-palette-600`), `Facts` (label and value pairs), `SegLinks` (the segmented control as links when the choice lives in the URL of a server-drawn list).
- **Colour in data:** ordinal scales (creator tiers, a heat table) use one hue: `brand-palette-600` bars, or the brand ramp 50 to 400 in steps with the number written in each cell. Identity (brands, own vs affiliators vs creators) uses `SERIES` in order. State (PR's Calm to Crisis) uses `StatusPill` tones with the word written, never colour alone.

---

## 7. Interaction and accessibility (hard rules)

- **Focus:** one mark everywhere, a 2px orange outline (`:focus-visible` in `app/globals.css`). Components may draw their own (`focus-visible:outline-*`, or a ring on a wrapper with `focus-within:`), but never remove focus without a replacement, and never add a second competing mark.
- **Keyboard:** every control reachable with Tab in visual order and usable with Enter/Space; menus and lists with arrows; Escape closes the top layer and returns focus to what opened it. Clickable things are `<button>` or `<a>`, never a `<div onClick>` or `<span onClick>`.
- **Tap targets:** 44px minimum on phones (`min-h-11`, `h-11 w-11`, or `max-md:h-11` on denser desktop controls).
- **Contrast:** WCAG AA. Text never lighter than `gray-500`; orange text `brand-palette-700`+; white text only on `brand-palette-600`+ or `gray-900`.
- **Names:** icon-only buttons have `aria-label`; toggles use `aria-pressed` or `role="switch" aria-checked`; menus `aria-haspopup`/`aria-expanded`; tabs `aria-selected`; current nav item `aria-current="page"`.
- **Live regions:** errors `role="alert"`, toasts and completed actions `role="status"`, streaming progress `aria-live="polite"`.
- **Responsive:** check at 375px. No horizontal overflow; rows wrap (`flex-wrap`) instead of shrinking text; long text truncates with a `title` that holds the whole string.
- **Reduced motion:** `prefers-reduced-motion` turns animations off globally; do not fight it.

---

## 8. Motion

| Context | Duration | Easing |
|---|---|---|
| Button press (`active:scale-[0.98]`), hover colours | 100 to 150ms | default |
| Input focus, switch, chevron rotate | 200ms | `ease-in-out` |
| Sidebar width, drawer slide, sheet | 300ms | `ease-in-out` |
| Menu entrance | 180ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Toast in/out | 200 to 350ms | `cubic-bezier(0.16, 1, 0.3, 1)` |

Spinners run only while work is running. Nothing pulses, floats or loops for decoration.

---

## 9. Copy in the interface

- **English** for all UI text (labels, buttons, errors, empty states), unless the product decides otherwise in `docs/DECISIONS.md`.
- Plain sentences, sentence case, short. Buttons are verbs ("Turn into a report", "Send the link").
- **No em dashes** in UI text; use a comma, a colon, parentheses or a middle dot (`·`).
- No emoji, no exclamation-mark enthusiasm, no "AI-powered" labels.
- **No invented content:** no sample numbers, fake names, testimonials, stock claims. If a value is not real, show nothing or an honest placeholder.
- Inside Chats, never show a skill name, slash command, tool name or "Running…" (CLAUDE.md, "Partner experience").

---

## 10. Moving a legacy page to this standard

1. Mark the page root `data-tw` and rebuild its markup with utilities and kit components. Keep every data call, permission check, endpoint and piece of copy; only the presentation changes.
2. Remove its classes from use, not from `legacy.css`, until no page uses them (other pages may share them). Note what became unused.
3. Replace any old top bar with the page header pattern (5.3). Drop any width cap.
4. Swap legacy colours for tokens: old blue becomes `brand-palette-600/700`, `--text-3` becomes `gray-500`, `--line` becomes `gray-200`/`card-border`.
5. Check states (empty, loading, error), keyboard use and 375px.
6. If a shared component changes, list the other pages that render it in the change description.

---

## 11. Do and don't

**Do**
- Use kit components and tokens; extend the kit rather than copying markup.
- Keep one accent: orange marks the active, the primary and the selected. Everything else is neutral.
- Put labels above inputs, errors and hints below.
- Portal floating lists out of overflow containers and mark them `data-dropdown-portal`.
- Write a short comment when a class exists for a non-obvious reason (a legacy marker, a z-index, a contrast step).

**Don't**
- Add CSS to `app/legacy.css` or style new UI with its classes (`btn`, `card`, `pill`, `topbar`, `wrap`…).
- Use `text-brand-palette-600` on a tint, `gray-400` for text, or any hex colour in a component.
- Build classes with string interpolation.
- Add a global header bar, a `max-w` page container, gradients as decoration, glows, coloured shadows, blurred blobs, decorative status dots, or pill badges above headings.
- Add `dark:` variants, an icon library, or emoji.
- Use a native `<select>`; a choice from a list is a `SelectInput` with `withSearch`.
- Use `<input type="date">`; a date is a `DateInput`.
- Use `h-screen`, `overflow-hidden` on root containers, or `<div onClick>`.

---

## 12. Before you call UI work done

1. `pnpm typecheck` passes (and `next build` when you touched CSS layers, server components or shared components).
2. Run the app and look at it: desktop (1440px) and phone (375px), every state you touched, keyboard only once through.
3. Click every control you changed and confirm it does something real.
4. Check contrast of any new colour pairing.
5. If you added a token, a kit component or a layout pattern, this file says so.
