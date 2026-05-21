# Sraj-Warehouse — Handover Document

> **Purpose:** complete context dump for the next Claude session. Read this first, end-to-end, before any new work.

**Last updated:** 2026-05-17 (Session 3 — see addendum below)
**Project status:** Production. Live at `https://sraj-warehouse.vercel.app`. Founder logged in and using.

> **Portable context:** `CLAUDE.md` (repo root) is auto-loaded by Claude Code and
> carries the durable project context across devices. Read it first, then this file.
> New-device setup: see `CLAUDE_CODE_SETUP.md`.

---

## ⚡ SESSION 3 ADDENDUM (2026-05-17) — READ THIS FIRST

Session 3 work, on top of Session 2. Overrides conflicting older text.

### Security — RLS tightened (APPLIED to prod)
- **`migration_18_rls_warehouse_membership.sql`** applied to Supabase
  `tfrzyiyoromlgmcissvu`. Replaced all `auth all` policies with
  warehouse-membership policies. Helpers: `user_can_access_warehouse(wh)`,
  `user_is_wh_manager(wh)`, `item_effective_warehouse(box,zone,shelf,wh)` —
  all `SECURITY DEFINER`. Founder bypasses everything via `is_founder()`
  (verified). `anon` warehouse-read + join-request insert preserved.
  `activity_log` is now append-only except founder.

### Multi-warehouse signup
- `SignupPage` uses a checkbox list (select several warehouses).
  `AuthContext.signUp(email,pw,name,warehouseIds[])` inserts one
  `join_requests` row per warehouse.

### WarehouseMap — free items vs zones
- The 70/30 band + `FREE_AREA_TOP` clamp + dashed divider were REMOVED.
- `FreeItemSquare` now takes an `obstacles` prop (zone rects). Items move
  freely in open floor space but **cannot overlap a zone** (axis-separated
  slide); resize can't grow into a zone; a saved position on a zone
  self-heals downward (`resolveBelow`) and persists once. Zones stay fixed.
- `resolveItemLocation()` in `helpers.js` — unified 4-bucket location
  resolver; ReportsTab + AllItemsList now show large/unassigned/outside
  items with a real location instead of skipping them.

### Dark mode — softened globally
- `index.css`: dark body color + `--tile-pill-text` `#e7e5e4` → `#bdb9b1`.
- `dark:text-stone-100` → `dark:text-stone-300` app-wide.
- Full dark-variant sweep of `WarehouseMap` and `ZoneView` (header buttons,
  toggles, selects, cards, rack panel, shelf rows, slots, modals, help panel).

### ZoneView — unified selection + stacking
- Large shelf items are selectable together with boxes (`selectedItemIds`).
  Floating bar shows a combined "N صندوق و M غرض" count; bulk delete removes
  both. Box-only actions (cross-wh move, edit description) show only when
  boxes are selected.
- Stacking a box over an item-only slot works via `handleStackBoxOverItem`
  (direct insert at the slot with `stack_index` above the item).

### Other
- `xlsx` is dynamically imported in `ReportsTab` (chunk 443 kB → 19 kB).
- Removed 3 dead shrink helpers in `WarehouseMap`. **`ShelfView.jsx` is NOT
  dead** — it is reachable via deep-link/scan navigation; do not delete it.
- Box photo-save failure and LocationPicker cross-warehouse load failure
  now surface to the user instead of being swallowed.

---

## ⚡ SESSION 2 ADDENDUM (2026-05-17)

Everything below sections were written after Session 1. The rest of this
document is still broadly accurate for architecture; this block lists what
**changed in Session 2** and overrides any conflicting older text.

### Infrastructure fixes
- **CI workflows Node 20 → 22** (all 4 yml). Older `@supabase/supabase-js`
  needs native WebSocket → Node 22. Backup + overdue workflows green again.
- **`vercel.json`** now has `git.deploymentEnabled.backups = false` — stops
  Vercel error emails from trying to deploy the JSON-only `backups` branch.
- MCP access available this session: Supabase project `tfrzyiyoromlgmcissvu`
  (ours; the other project `cash-advance` is unrelated — don't touch) and
  Vercel team `team_yjSVfkDNYdlWJjwbF1itNeHR`, project
  `prj_uoHMF49IQMc8xJAQSYhQDPoDhyTE`.

### New SQL migrations (APPLIED to prod)
- **migration_16_stacking_and_placement.sql**: `boxes.stack_index`;
  `items.pos_top/pos_left/width_pct/height_pct`; `add_stacked_box()` RPC.
- **migration_17_shelf_slot_items.sql**: `items.shelf_id`, `items.box_index`,
  `items.stack_index` + partial index `items_shelf_slot_idx`.
- Items model now has a 5th bucket — **large item on a shelf slot**:
  `box_id NULL, shelf_id NOT NULL, box_index = slot` (zone_id also set so the
  Dashboard "unassigned" query fetches it). Renders box-sized in the rack.

### Dark mode
- `tailwind.config.js` `darkMode:'class'`; new `src/lib/useTheme.js`
  (localStorage `sraj.theme`). ☀️/🌙 toggle in Dashboard header.
- `dark:` variants use the **stone** palette (warm), applied to Dashboard,
  FormModal/ConfirmDelete, WarehouseMap, ZoneView/BoxView panels,
  WarehousesHome. Secondary tabs not fully themed yet (low priority).

### Password recovery
- AuthContext: `resetPassword(email)` (`resetPasswordForEmail`,
  redirect `/reset-password`) + `updatePassword(pw)`.
- LoginPage has a "نسيت كلمة المرور؟" forgot-mode panel.
- New **`src/pages/ResetPasswordPage.jsx`** + public route `/reset-password`
  (listed before the protected catch-all in App.jsx).
- Supabase Auth → URL Configuration already set: Site URL = vercel domain,
  Redirect URLs includes `https://sraj-warehouse.vercel.app/**`.

### Warehouse map (WarehouseMap.jsx) — heavily reworked
- Outside-zone items render as **draggable + resizable squares ON the map**
  (no more list). Shared component **`src/components/FreeItemSquare.jsx`**
  (move = body drag, resize = ◢ grip; saves pos/size via
  `updateOutsideItemPosition`).
- **Main warehouse is 6×6 m.** Zones repositioned to a 2×2 grid occupying
  exactly the **top 70%**; the bottom **30% is a fixed free band for items**
  (dashed divider + label). Items are clamped to that band (`FREE_AREA_TOP`).
- **Dynamic zone-shrink was REMOVED.** Zones are now static
  (`displayRect = naturalZoneRect`). `shrinkRectAwayFromItem` /
  `computeVisualZoneRect` / `syncSiblingZones` are dead code (left in place).
  Do NOT reintroduce shrink — the founder rejected it repeatedly.

### Zones (ZoneView.jsx) — large items + stacking + no ShelfView
- Empty rack slot click → **chooser modal: 📦 صندوق / 🧊 غرض كبير**.
  "غرض كبير" inserts an item at `{shelf_id, box_index, zone_id}` — same
  size/position as a box, amber-styled tile in the slot.
- Edit-mode purple **`+` stack button** on every occupied slot → same
  chooser in *stack* mode → stacks a box (`add_stacked_box`) or an item
  (next `stack_index`) on top. box→box, box→item, item→item all work.
- **ShelfView is fully bypassed.** Clicking a box in the rack → BoxView
  directly (`onItemClick(box.code)` → Dashboard `goToBoxByCode`). BoxView
  back/breadcrumb/delete return to the **zone** (`onBackToZone`), never the
  shelf. Clicking the shelf frame does nothing now. `ShelfView.jsx` still
  exists/lazy-loaded but is unreachable — safe to ignore.
- Box tile colors: brown = normal, **red = a unit from it is checked out**
  (not an error), green = search-highlighted.

### UsersTab.jsx
- New **📜 النشاط** button per user → modal with that user's last 200
  `activity_log` entries, action-type filter chips + color coding.

### Known dead code / cleanup backlog (non-urgent)
- WarehouseMap: `shrinkRectAwayFromItem`, `computeVisualZoneRect`,
  `syncSiblingZones`, `naturalZoneRect` (last one still used) — unused
  shrink helpers.
- Large items don't show a real location in ReportsTab/AllItemsList yet
  (no box code) — they're skipped in aggregation. Acceptable for now.

---

## 0. The User in 60 seconds

- **Owner:** Hussain (founder of جمعية المسؤولية الاجتماعية بمحافظة جدة, a Saudi nonprofit).
- **Email:** `evuon1@gmail.com`. **GitHub:** `hussain-HHS`.
- **Technical level:** non-programmer. Communicate in formal Arabic. Decisive — wants you to pick the best option, not ask "A or B?".
- **Working environment:** Windows 10. Project at `D:\Sraj-Warehouse\`.
- **Shell quirks:** PowerShell blocks `npm.ps1` — use `npm.cmd`. Bash `node`/`npm` aren't on PATH. Use PowerShell for npm, Bash for git/gh/curl.

### His preferences (REINFORCED across many turns)

1. **Decide and act.** "اختر دائماً الخيار الأفضل". Asking him for tooling/structure decisions wastes time.
2. **Tables and bulleted lists.** Brief Arabic, not prose.
3. **Explicit Save buttons.** Auto-save on blur is a UX violation per his explicit feedback.
4. **All edits in centered modals.** Inline forms below the screen get missed.
5. **Hierarchical drill-down.** Warehouses → Zones → Shelves → Boxes → Items. Each its own view with breadcrumbs.
6. **Free-only stack.** Zero budget. Even App Store fees deferred until ready to bundle multiple apps.
7. **Forms must follow scroll.** Use `FormModal` for any non-trivial edit.

These are saved in `~/.claude/projects/D--/memory/` for cross-session persistence.

---

## 1. Stack and locations

| Where | What |
|:---|:---|
| **Local source** | `D:\Sraj-Warehouse\` |
| **GitHub repo** | `https://github.com/hussain-HHS/-sraj-warehouse` (note leading dash — don't normalize) |
| **Live site** | `https://sraj-warehouse.vercel.app` |
| **Supabase** | ref `tfrzyiyoromlgmcissvu` — `https://tfrzyiyoromlgmcissvu.supabase.co` |
| **Cron-job.org** | account on `evuon1@gmail.com` — keeps Supabase awake daily 03:00 Asia/Riyadh |
| **UptimeRobot** | account on `evuon1@gmail.com` — monitor 802963157 pings every 5 min |
| **Resend** | account on `evuon1@gmail.com` — overdue-alerts at 09:00 Riyadh + welcome emails on signup |

### Frontend
- React 18 + Vite 5 + Tailwind CSS 3 (RTL via `dir="rtl"` in index.html)
- React Router 6
- `@supabase/supabase-js` v2.45
- `qrcode` + `qr-scanner` for QR
- `browser-image-compression` for photos
- `xlsx` for Excel I/O
- **Code-splitting**: heavy tabs lazy-loaded via `React.lazy` (initial bundle ~650 kB, was 1180 kB)

### Backend
- Supabase Postgres + Auth + Storage
- `pg_net` extension enabled (for trigger-based emails)
- Storage bucket `sraj-photos` (5MB cap, jpeg/png/webp), public read

### Automation
- GitHub Actions: `backup.yml` (03:00 UTC), `notify-overdue.yml` (06:00 UTC = 09:00 Riyadh)
- One-shot workflows: `create-stairway-warehouse.yml`, `fix-stairway-warehouse.yml`
- Cron-job.org: pings `health_check` RPC daily

### Auth and credentials
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `D:\Sraj-Warehouse\.env` and Vercel env
- `SUPABASE_SERVICE_ROLE_KEY` + `RESEND_API_KEY` + `SUPABASE_URL` in GitHub Secrets
- Resend API key for welcome emails: stored in DB table `app_config` (key='resend_api_key'). User added it manually — RLS hides from anon.
- GitHub CLI authenticated as `hussain-HHS` on this Windows machine — Claude can run `gh secret`, `gh workflow run`, etc., directly.

---

## 2. Database schema (15 migrations applied, in order)

| # | File | What it adds |
|:---:|:---|:---|
| 0 | `setup.sql` | Initial: profiles, warehouses, user_warehouses, join_requests, boxes, items, checkouts, damaged_items, donated_items, activity_log + founder system + stealth mode |
| 02 | `migration_02_dynamic_layout.sql` | zones, shelves tables + boxes.shelf_id/box_index + founder-only RPCs (create/update/delete warehouse/zone/shelf/box) + `get_warehouse_layout()` |
| 03 | `migration_03_photos.sql` | items.photo_url + boxes.photo_url + storage bucket policies |
| 04 | `migration_04_shelf_position.sql` | `add_shelf_at(z_id, position='top'|'bottom', label)` RPC |
| 05 | `migration_05_insert_at_position.sql` | `add_box_at_position(s_id, position)` RPC with shift logic |
| 06 | `migration_06_partial_unique_box_code.sql` | Replaces strict UNIQUE(warehouse_id, code) with partial index `WHERE deleted_at IS NULL` (lets you reuse codes after soft-delete) |
| 07 | `migration_07_position_no_clamp.sql` | `add_box_at_position` no longer clamps position to max+1 — empty positions stay empty after insert |
| 08 | `migration_08_unassigned_items.sql` | items.box_id NULLABLE + items.zone_id + `delete_box_keep_items` RPC |
| 09 | `migration_09_move_box_to_position.sql` | `move_box_to_position(box, target_shelf, position)` RPC handles reorder + cross-shelf + cross-warehouse moves atomically |
| 10 | `migration_10_outside_zones_storage.sql` | items.warehouse_id (nullable) for big items stored outside any zone |
| 11 | `migration_11_activity_log_target_id.sql` | activity_log.target_type + target_id for precise per-item history |
| 12 | `migration_12_welcome_email.sql` | (superseded by 13) welcome email trigger using ALTER DATABASE — failed in SQL Editor |
| 13 | `migration_13_app_config_for_resend.sql` | **app_config** table (key/value, RLS founder-only) + `send_welcome_email()` trigger reads from it. **User must INSERT the Resend key manually after running this migration** |
| 14 | `migration_14_item_tags.sql` | items.tags TEXT[] + GIN index |
| 15 | `migration_15_initiatives.sql` | initiatives + initiative_items tables (event bundles for bulk checkout) |

### RLS policies (current state)
- **Most tables**: `auth all` policy — any authenticated user can do anything. Founder-only operations are protected via SECURITY DEFINER RPCs that check `is_founder(auth.uid())`.
- **zones / shelves**: founder-only INSERT/UPDATE/DELETE.
- **app_config**: founder-only ALL operations (only the founder can read/write the Resend key).
- **initiatives / initiative_items**: `auth all` for now.
- ⚠ **Known weakness**: `auth all items/boxes/checkouts` means any authenticated user can mutate any warehouse's data. Tightening to warehouse-membership is a future improvement. See "Known to-do" below.

---

## 3. Frontend architecture

### Routing (`src/App.jsx`)
- `/login`, `/signup`, `/*` (protected → Dashboard)
- `ErrorBoundary` wraps everything

### State (`src/context/AuthContext.jsx`)
- `user`, `profile`, `permissions`, `warehouseId`, `warehouses`, `activeWarehouse`, `loading`
- `isFounder`, `isSysadmin` derived booleans
- `signIn`, `signUp`, `signOut`, `can(perm)`, `refreshProfile`, `refreshWarehouses`, `setWarehouseId`
- Active warehouse id in `localStorage['sraj.activeWarehouseId']`
- Founder bypasses all `can(...)` checks

### Top-level pages (Dashboard.jsx)
- Tabs (depend on role): 🏢 المستودعات | الإخراج/الإرجاع | 🎪 المبادرات | المتلفات | الدعم | السجل | التقارير | QR | طلبات الانضمام | المستخدمون | 🗑 السلّة | 👑 إعدادات المؤسّس
- Header: brand stripe (rainbow) + BrandLogo + WarehouseSwitcher + scan QR + GlobalSearch (with `/` shortcut + tag search) + 🔔 NotificationsBell + user badge + logout
- Heavy tabs are `React.lazy`-loaded with a Suspense fallback
- Keyboard shortcuts: `/` focus search, `Ctrl+K` open scanner, `Esc` close any modal

### Component map

| Component | Purpose |
|:---|:---|
| `WarehousesHome.jsx` | Founder home: grid OR pages view of all warehouses, with stats + per-warehouse CRUD. Stairway template auto-creates 5 stairway zones |
| `WarehouseMap.jsx` | Top-down view of one warehouse: zone tiles arranged in floor plan. Has stat cards (clickable → modal with full list) + AllItemsList view (with tag filter) + outside-zones storage section + `+ صندوق` and `+ أداة` and `+ خارج المساحات` buttons |
| `ZoneView.jsx` | Inside a zone: rack visualization (vertical stack, RTL position 1 = rightmost). Multi-select boxes with floating action bar (move/delete/edit/cross-warehouse). Mini-map (bottom-left) for quick zone navigation + box drop. Wood-grain texture when zone color = #8B6F3F (stairway). Shelves admin section collapsed by default |
| `ShelfView.jsx` | Inside a shelf: full-size cardboard boxes. Drag-drop items between boxes |
| `BoxView.jsx` | Inside a box: top-down opened-box visualization. Items with photo OR name-text fallback. 📜 History button + 🖨 Print Label button + per-item ✏️/🗑/📍-move buttons. Items have tags (TagInput in add/edit forms) |
| `LocationPicker.jsx` | UNIVERSAL 2-step picker shown in a FormModal. Step 1: warehouse map (clickable zones). Step 2: position (for box mode) OR boxes-on-rack (for item mode, with "+ create new box at empty slot" support, and a "+ pick position" sub-step for new-box creation). Supports cross-warehouse switching with auto-fetch |
| `WarehouseMiniMap.jsx` | Floating bottom-left mini floor plan. Drop targets when selection active; navigate-to-zone when not |
| `InitiativesTab.jsx` | Manage event bundles: create, add items+quantities, bulk checkout |
| `ReportsTab.jsx` | 6-stat strip + filters + aggregated table + Excel/CSV import-export + 🖨 PDF print + 🔍 inventory audit (compare expected vs counted) |
| `RecoveryBin.jsx` | Soft-deleted boxes/items with multi-select + bulk restore/delete |
| `CheckoutsTab.jsx` | List view + month calendar view (with checkout/return events on each day) |
| `NotificationsBell.jsx` | Header bell icon, polls activity_log every 30s, shows unread count |
| `BrandLogo.jsx` | Reads `/logo.png` (official) with SVG fallback. `BrandStripe` (animated 7-color band). `BrandLetterBadge` |
| `TagInput.jsx` | Reusable tag picker with chips + suggestions. `TagChips` for compact display |
| `CopyCodeButton.jsx` | 📋→✓ copy-to-clipboard button |
| `PrintBoxLabel.jsx` | Generates printable 10×10cm label with QR + zone name + box code |
| `BuilderForms.jsx` | Shared forms (CreateWarehouseForm with template picker, EditZoneForm, AddShelfForm, etc.). FormModal closes on Esc. ConfirmDelete. StatusToast. useFlash |
| `CardboardBox.jsx` | `CardboardBox` (full-size with photo/code/count) and `CardboardBoxMini` (small). Brown gradient simulating real cardboard |
| `PhotoUploader.jsx` | File picker with camera capture + client-side compression + Storage upload |

### Helpers (`src/lib/`)
- `supabase.js` — client + `logActivity(action, target, location, targetType?, targetId?)` (last 2 args added in batch 3)
- `helpers.js` — date utils, `isOverdue`, `getInitials`, `arabicOrdinal`, `shelfDisplayName`, `suggestLocation`
- `constants.js` — USER_ROLES, PERMISSIONS, ITEM_STATUSES, DAMAGE_REASONS, DEFAULT_RETURN_DAYS=10
- `photoUpload.js` — `uploadPhoto`, `deletePhoto`
- `warehouseOps.js` — central RPCs/mutations: `rpcCreate/Rename/Delete Warehouse`, `rpcAddZone/UpdateZone/DeleteZone` (with cascade), `rpcAddShelf/UpdateShelf/DeleteShelf`, `rpcAddBox` (with optional `position`), `updateBox`, `deleteBox(id, {keepItems})`, `softDeleteItem`, `restoreBox/Item`, `permanentDeleteBox/Item`, `moveItemToBox`, `moveBoxToShelf`, `moveBoxToPosition` (atomic with cross-wh support), `bulkMoveBoxes/Delete/Update`, `bulkRestore/PermanentDelete*`, `bulkMoveBoxesToZone`, `assignItemToBox`, `fetchWarehouseLayout`. PRESET_COLORS, PRESET_POSITIONS
- `useKeyboard.js` — `useEscapeKey(handler)` and `useGlobalShortcuts({ onFocusSearch, onOpenScanner })`

---

## 4. Key behaviors and gotchas

### Soft-delete + cascade
- `boxes.deleted_at`, `items.deleted_at`, `checkouts.deleted_at` etc. exist
- JS-level cascade: `deleteBox` first soft-deletes items in box, then box. `rpcDeleteShelf/Zone` cascade through children before SQL hard-delete
- Queries always filter `is('deleted_at', null)` AND `not('shelf_id', 'is', null)` defensively

### Items model (3 buckets)
- `box_id != NULL` → in a box
- `box_id = NULL, zone_id != NULL` → unassigned in a zone (after delete-box-keep-items)
- `box_id = NULL, zone_id = NULL, warehouse_id != NULL` → outside all zones (big items like tables)

### Drag-and-drop
- `<img>` defaults are draggable. Always `draggable={false}` + `pointer-events-none` on inner images
- Drag handle is a 4-arrow SVG icon (Material-Design style), always visible for the founder
- Multi-select via clicks; drag any selected box → drags all selected
- Cross-zone drop on mini-map opens LocationPicker for explicit position; cross-warehouse via "🔄 لمستودع آخر" in selection bar

### Position-aware box add
- Empty position slots are clickable buttons rendering at exact slot position
- When a selection is active, slots become purple "↪ انقل هنا" drop targets
- `add_box_at_position` (after migration 7) doesn't clamp — clicking position 5 on empty shelf puts box at exactly position 5

### RTL layout
- Page is RTL. `flex-row` items flow right-to-left visually. Position 1 (first JSX child) renders RIGHTMOST.
- Stairway warehouse zones use landscape dimensions (`width_cm=230, height_cm=100`) so the rack frame is wide-not-tall

### Welcome email flow
- Migration 13 creates `app_config` table + `send_welcome_email()` trigger reading the key from it
- **User must run separately**: `INSERT INTO app_config (key, value) VALUES ('resend_api_key', 're_xxx') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`
- Without the key, signup still works — trigger silently skips email

### Bundle splitting
- Initial bundle: ~650 kB (was 1180 kB before batch 9)
- Heavy tabs (Reports, Initiatives, RecoveryBin, FounderTab, etc.) load on-demand
- ReportsTab is the largest chunk (~440 kB) due to XLSX library

---

## 5. Recent UX iterations (chronological, last → first)

(Read these to understand the user's direction; bottom = oldest)

1. **Batches 1–9 of major enhancements** (May 2): numeric sort, copy-code, color unification, outside-zones storage, keyboard shortcuts, individual print labels, activity history per box, PDF reports, inventory audit, welcome email, in-app notifications bell, granular permissions UI, checkouts calendar, item tags + filter, wood-grain stairway, initiative bundles, smart search with tag support, bundle splitting via React.lazy
2. **Stairway warehouse**: 4 zones (2 attached pairs, upper-left + lower-right per pair). Wooden brown #8B6F3F. Landscape dimensions. Wood-grain CSS texture
3. **Universal LocationPicker**: visual 2-step warehouse-map → zone → position/box. Cross-warehouse switching. Empty-zone "+ create box" inline
4. **All edits in modals**: no more inline forms below the fold. Esc closes all modals
5. **Multi-select boxes** + cross-warehouse box move + box reorder within shelf via `move_box_to_position` RPC
6. **Photoless items show name** instead of generic 🔧 icon (gradient text tile with line-clamp-2)
7. **Brand theme**: 7-color stripe across the top, navy→purple gradient buttons, BrandLogo from `/logo.png`
8. **Recovery bin multi-select** + cross-warehouse move + delete unassigned items
9. **Migration 6 partial unique** fix for box-code reuse after soft-delete
10. **Cardboard visual styling** + drag-drop boxes + floating trash drop zone
11. **All-items views** at warehouse and zone levels (search/filter/click-to-jump)
12. **Production stability**: cron keep-alive, daily DB backup, UptimeRobot, email alerts
13. **Photos for items and boxes** + QR scanner + global search + recovery bin

---

## 6. Critical files to NOT regress

| File | Why critical |
|:---|:---|
| `src/lib/warehouseOps.js` | Single source of truth for structural mutations. JS-level cascade soft-delete logic. Don't replace cascading deletes with direct SQL without thinking |
| `src/pages/Dashboard.jsx` | All navigation state. The `loadAllData` query has carefully-tuned filters (`deleted_at`, `shelf_id NOT NULL`, `boxes.deleted_at`) AND now fetches 4 item categories in parallel. React.lazy + Suspense for tab loading |
| `src/components/LocationPicker.jsx` | Universal 2-step picker with cross-warehouse support. Many flows rely on its `onSelect({ zone, shelf, position, box, warehouse, isCrossWh })` shape |
| `src/components/ZoneView.jsx` | Most complex component. Multi-select state, drag-drop handlers, mini-map drop, cross-zone moves, "create box and assign item" flow. The `wood-grain` CSS class is auto-applied when zone color = #8B6F3F |
| `supabase/migration_*.sql` | Each migration is incremental. User has run all 15. Don't rewrite — add new ones |
| `supabase/migration_13_app_config_for_resend.sql` | The `app_config` table is RLS-protected (founder-only). The trigger uses SECURITY DEFINER to read it. Don't change to ALTER DATABASE — Supabase rejects that in SQL Editor |
| `src/components/CardboardBox.jsx` | The `draggable={false}` + `pointer-events-none` on inner img is what makes drag-drop work |
| `src/components/BuilderForms.jsx` | Shared forms used by 8+ components. FormModal closes on Esc |

---

## 7. Outstanding / known to-do

- **RLS tightening** (#16 from suggestions): currently `auth all` on most tables means any authenticated user can mutate any warehouse's data. Should restrict to warehouse members. Defer until non-founder users actually use the system
- **Bundle size**: ReportsTab chunk is 443 kB due to xlsx. Could `import('xlsx')` dynamically only when import/export is clicked
- **Item drag-drop across boxes**: handle exists in BoxView but no cross-box drop visual. Currently uses 📍 button → modal flow which works
- **Sorting boxes alphabetically vs box_index**: now uses `.order('shelf_id').order('box_index')` which is correct
- **PWA + Capacitor**: explicitly deferred per user request. They'll bundle multiple websites later
- **Smart search**: now searches by name AND tags (exact match in tags array). Could add fuzzy/typo-tolerant search via Postgres `pg_trgm` if needed

---

## 8. Useful commands

```bash
# Refresh PATH on Windows (after winget installs)
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","User") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","Machine")

# Build
cd D:\Sraj-Warehouse; npm.cmd run build

# Push to GitHub (Vercel auto-deploys main)
git add -A && git commit -m "..." && git push

# Add/update a GitHub Secret
gh secret set SECRET_NAME --body "value"

# Trigger a workflow manually
gh workflow run backup.yml
gh run list --workflow=backup.yml --limit 1
gh run watch <run_id> --exit-status

# Verify Supabase RPC exists (with anon — error means not deployed)
curl -s -X POST "https://tfrzyiyoromlgmcissvu.supabase.co/rest/v1/rpc/<rpc_name>" \
  -H "apikey: <anon_key>" -H "Authorization: Bearer <anon_key>" \
  -H "Content-Type: application/json" -d '{}'
```

---

## 9. How to start the next session

1. **Read this file end-to-end first.** Don't skim.
2. **Check the live site** (`https://sraj-warehouse.vercel.app`) — log in as founder and verify it loads.
3. **Pull latest:** `cd D:\Sraj-Warehouse && git pull`
4. **Read git log** — recent commits = recent context.
5. **Check open user feedback in the conversation** — prioritize new feedback.
6. **Don't break the production-stability layers** (Cron, backup, UptimeRobot, email cron, welcome trigger).
7. **When in doubt about user intent, ask.** He'd rather a 1-question detour than a 30-minute wrong build.

The user is patient with thoughtful work but frustrated by re-explaining context. Read his memory files (`~/.claude/projects/D--/memory/`) before any non-trivial decision.

Good luck. — Previous Claude (2026-05-02, end of batches 1–9)
