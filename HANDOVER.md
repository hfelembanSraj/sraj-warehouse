# Sraj-Warehouse — Handover Document

> **Purpose:** complete context dump for the next Claude session to pick up where we left off without re-reading the entire conversation. Read this first, end-to-end, before any new work.

**Last updated:** 2026-05-01
**Project status:** Production. Live at `https://sraj-warehouse.vercel.app`. Founder logged in and using.

---

## 0. The User in 60 seconds

- **Owner:** Hussain (founder of جمعية المسؤولية الاجتماعية, a Saudi nonprofit).
- **Email tied to everything:** `evuon1@gmail.com`.
- **Technical level:** non-programmer. Communicate in formal Arabic. He's a sharp founder with strong product opinions; bring him decisions, not engineering trade-offs.
- **GitHub username:** `hussain-HHS`.
- **Working environment:** Windows 10, project lives at `D:\Sraj-Warehouse\`.
- **OS Hassle notes:** PowerShell execution policy blocks `npm.ps1`; always invoke `npm.cmd` instead. Bash tool's `node`/`npm` aren't on PATH — use PowerShell for npm operations.

### His preferences (REINFORCED across many turns)

1. **Decide the technical things, escalate only product/business choices.** "اختر دائماً الخيار الأفضل" — pick the best option and act. Asking him "A or B?" for tooling/structure choices is wasted time.
2. **Tables and bulleted lists, brief and direct.** He prefers scannable structure over prose.
3. **Explicit Save buttons everywhere.** Auto-save on blur is a UX violation per his explicit feedback. Forms must be dirty-aware and only commit when "💾 حفظ" is clicked.
4. **Global "create" actions outside per-item context.** `+ Add warehouse` lives at the top-level toolbar, never inside an existing warehouse's edit screen.
5. **Hierarchical drill-down for nested structures.** "تعديل داخل تعديل داخل تعديل" — Warehouses → Zones → Shelves → Boxes → Items, each its own view with its own breadcrumb and CRUD.
6. **Free-only stack.** Zero budget. Never recommend paid services without explicit ask. Even App Store fees ($99/yr Apple, $25 Google) are deferred until he's ready to bundle multiple apps.
7. **Forms must follow scroll position.** Floating modals (`FormModal` component) for any non-trivial edit. Inline forms that disappear off-screen frustrate him.

These are saved in `~/.claude/projects/D--/memory/` for cross-session persistence. Refresh them if his preferences shift.

---

## 1. Stack and locations

| Where | What |
|:---|:---|
| **Local source** | `D:\Sraj-Warehouse\` |
| **GitHub repo** | `https://github.com/hussain-HHS/-sraj-warehouse` (note leading dash in name — don't normalize it) |
| **Live site** | `https://sraj-warehouse.vercel.app` |
| **Supabase project** | ref `tfrzyiyoromlgmcissvu` — URL `https://tfrzyiyoromlgmcissvu.supabase.co` |
| **Cron-job.org** | account on `evuon1@gmail.com` — keeps Supabase awake daily 03:00 Asia/Riyadh |
| **UptimeRobot** | account on `evuon1@gmail.com` — monitor 802963157 pings the site every 5 min, emails on down/up |
| **Resend** | account on `evuon1@gmail.com` — sends overdue alerts daily 09:00 Asia/Riyadh from `onboarding@resend.dev` |

### Frontend
- React 18 + Vite 5 + Tailwind CSS 3
- React Router 6
- `@supabase/supabase-js` v2.45
- `qrcode` (generation), `qr-scanner` (camera reading)
- `browser-image-compression` (client-side photo compression)
- `xlsx` (Excel import/export)

### Backend
- Supabase Postgres + Auth + Storage
- Storage bucket `sraj-photos` (5MB cap, jpeg/png/webp), public read

### Automation
- GitHub Actions: `backup.yml` (daily 03:00 UTC), `notify-overdue.yml` (daily 06:00 UTC = 09:00 Riyadh)
- Cron-job.org: pings `health_check` RPC daily

### Auth and credentials
- **Supabase URL:** `https://tfrzyiyoromlgmcissvu.supabase.co`
- **Supabase anon key:** stored in `D:\Sraj-Warehouse\.env` and Vercel env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Supabase service_role key:** stored in GitHub Secret `SUPABASE_SERVICE_ROLE_KEY` (used by backup + notify scripts)
- **Resend API key:** stored in GitHub Secret `RESEND_API_KEY`
- **GitHub CLI:** authenticated as `hussain-HHS` on this Windows machine — Claude can run `gh secret set`, `gh workflow run`, `gh run watch`, etc., directly. NO need to walk the user through GitHub UI.

### Shell-permissions setup
`.claude/settings.local.json` allows Bash/PowerShell for git, gh, npm, node, curl etc. without prompting. Already in place.

---

## 2. Database schema (in order of migration)

### Migration 0 — `supabase/setup.sql` (initial)
Tables created:
- `profiles` — links to `auth.users` 1:1, has `full_name`, `role` (sysadmin/whmanager/user), `is_founder`, `stealth_mode`, `updated_at`
- `warehouses` — id, name, description, dims (width_m/depth_m/height_m)
- `user_warehouses` — many-to-many users↔warehouses with per-warehouse `permissions` JSONB and `role` (whmanager/user) and `approved`
- `join_requests` — pending signup requests per warehouse
- `boxes` — warehouse_id, code (e.g. A-1-2), description, status. Plus `deleted_at`, `version`, `shelf_id` (added later), `box_index`, `width_cm`, `height_cm`, `photo_url` (added later)
- `items` — box_id, name, quantity, status. Plus `deleted_at`, `version`, `photo_url`
- `checkouts` — historical out-of-warehouse records with date_out, returned_at, damaged_at, donated_at terminal states
- `damaged_items`, `donated_items` — terminal-state archives
- `activity_log` — every action

Plus triggers:
- `handle_new_user()` — auto-creates profile when new auth user signs up
- `protect_founder_profile` / `protect_founder_auth` — BEFORE DELETE triggers that raise exceptions on the founder row
- `skip_log_for_stealth_founder` — BEFORE INSERT on activity_log, returns NULL when founder has `stealth_mode = true`
- `touch_profiles_updated_at` — auto-updates `updated_at`

Plus RPCs:
- `is_founder(uid)` — used in RLS policies
- `health_check()` — used by cron-job.org and UptimeRobot
- `bootstrap_founder(email)` — promotes the user with that email to founder + sysadmin (idempotent)
- `update_founder_profile(name, email)` — founder-only
- `toggle_stealth_mode(enable)` — founder-only

RLS: most tables have `auth all` policies (any authenticated user can do anything). Founder protection is via the BEFORE DELETE triggers + RLS deny on zones/shelves (only founder can mutate).

### Migration 02 — `migration_02_dynamic_layout.sql`
Added the multi-warehouse + dynamic layout system:
- New tables: `zones` (warehouse_id, letter, name, color, dims, position pcts, display_order), `shelves` (zone_id, shelf_index, label, height_cm, max_boxes)
- Added to `boxes`: `shelf_id`, `box_index`, `width_cm`, `height_cm`
- Backfilled: created zones A/B/C/D for the seed warehouse, 3 shelves each, linked existing boxes via code parsing
- RLS: only founder can INSERT/UPDATE/DELETE zones/shelves; everyone authenticated can SELECT
- Founder-only RPCs: `create_warehouse`, `rename_warehouse`, `delete_warehouse`, `add_zone`, `update_zone`, `delete_zone`, `add_shelf`, `update_shelf`, `delete_shelf`, `add_box_to_shelf`
- Read RPC: `get_warehouse_layout(wh_id)` — returns nested JSON of zones+shelves

### Migration 03 — `migration_03_photos.sql`
- Added `photo_url` to `items` and `boxes`
- Created Storage bucket `sraj-photos` (5MB, jpeg/png/webp) — actually created via REST API by Claude using service_role; SQL just adds policies
- Storage policies: anyone can SELECT, authenticated can INSERT, owner-or-founder can UPDATE/DELETE

### Migration 04 — `migration_04_shelf_position.sql`
- New RPC `add_shelf_at(z_id, position TEXT, ...)` that picks `MIN(shelf_index)-1` for `'top'` or `MAX+1` for `'bottom'`. Allows inserting shelves above existing ones without breaking order.

### Migration 05 — `migration_05_insert_at_position.sql`
- New RPC `add_box_at_position(s_id, p_position, ...)` that:
  1. If `p_position > max(box_index) + 1`, clamps to `max + 1`
  2. Otherwise, shifts existing boxes with `box_index >= p_position` forward by 1, regenerating their `code` to match. Iterates in DESC order of box_index to avoid UNIQUE-constraint clashes during shift
  3. Inserts new box at exactly `p_position` with code `letter-shelf-position`

### Migration 06 — `migration_06_partial_unique_box_code.sql`
**Critical fix for a real bug user hit:** the original `UNIQUE(warehouse_id, code)` constraint on `boxes` counted soft-deleted rows. After deleting box `C-1-1` (soft), trying to add a new box with the same code failed with `boxes_warehouse_id_code_key` violation.

Fix:
```sql
ALTER TABLE boxes DROP CONSTRAINT IF EXISTS boxes_warehouse_id_code_key;
DROP INDEX IF EXISTS boxes_warehouse_id_code_key;
CREATE UNIQUE INDEX boxes_warehouse_id_code_active
  ON boxes (warehouse_id, code) WHERE deleted_at IS NULL;
```

User confirmed running it. Do not regress this.

---

## 3. Frontend architecture

### Routing (`src/App.jsx`)
- `/login`, `/signup`, `/*` (all-protected route to `Dashboard`)
- `ErrorBoundary` wraps everything in `main.jsx`

### State (`src/context/AuthContext.jsx`)
- `user`, `profile`, `permissions`, `warehouseId` (active), `warehouses` (all available to user), `activeWarehouse`, `loading`
- `isFounder`, `isSysadmin` derived booleans
- Methods: `signIn`, `signUp`, `signOut`, `can(perm)`, `refreshProfile`, `refreshWarehouses`, `setWarehouseId`
- Active warehouse id persisted in `localStorage` key `sraj.activeWarehouseId`
- Founder bypasses all permission checks — `can(...)` always returns true if `is_founder`

### Top-level pages
- `Dashboard.jsx` — single big page with tabs:
  - For founder: tabs are 🏢 المستودعات (home), Checkouts, Damaged, Donated, Log, Reports, QR, Requests, Users, 🗑 السلّة, 👑 إعدادات المؤسّس
  - For non-founder: المستودع instead of المستودعات
- Header has: warehouse switcher (`WarehouseSwitcher`), 📷 scan QR button (`QrScannerModal`), GlobalSearch (md+), user badge, logout
- State: `activeTab`, `enteredWarehouse` (founder only — true after entering a warehouse from home), `currentZone`, `currentShelf`, `currentBox`, `showBuilder`, `showScanner`
- `goToBoxByCode(code)` — deep-link navigator used by both QR scanner and global search

### Component map (read-only summary)

| Component | Purpose |
|:---|:---|
| `WarehousesHome.jsx` | Founder home: grid OR pages view of all warehouses with per-warehouse stats (zones/boxes/items count) and CRUD |
| `WarehouseMap.jsx` | Top-down view of a single warehouse: zone tiles arranged in floor plan, with realistic shelf-grid look. Has its own view toggle (🗺 الخريطة \| 📋 كل الأغراض) |
| `ZoneView.jsx` | Inside a zone: rack visualization (vertical stack of shelves with horizontal box slots). Edit mode toggle. Shelves are clickable to drill into. Position-aware add slots. Box drag-drop. External shelf-management section |
| `ShelfView.jsx` | Inside a shelf: bigger rack frame with full-size cardboard boxes. Three view modes (🗄 المرئي \| 📋 الأغراض \| 🗂 الترتيب). Drag-drop items between boxes in organize mode |
| `BoxView.jsx` | Inside a box: top-down opened-box visualization with items as cards. Item add/edit/delete via inline modal forms |
| `WarehouseBuilder.jsx` | Founder-only modal: 4-level drill-down (Warehouses → Zones → Shelves → Boxes) with full CRUD at each level. Slightly redundant with main flow but preserved as a power tool |
| `WarehouseSwitcher.jsx` | Header dropdown to switch active warehouse |
| `GlobalSearch.jsx` | Header search input. Debounced, parallel queries on items/boxes/zones/warehouses, jumps to result via `goToBoxByCode` |
| `QrScannerModal.jsx` | Full-screen camera scanner using `qr-scanner`. Reads URL with `?wh=&zone=&box=` and triggers `handleScannedUrl` in Dashboard |
| `QrTab.jsx` | Generates printable QR stickers for warehouse + zones + boxes. Toggle between zones-view and boxes-view |
| `RecoveryBin.jsx` | Founder-only tab: lists soft-deleted boxes and items, allows restore (clear deleted_at) or permanent delete |
| `ReportsTab.jsx` | 6-stat strip + filters + aggregated table of items by location + Excel/CSV export + Excel import with template |
| `FounderTab.jsx` | Founder settings: stealth toggle, name change, email change (via Supabase Auth update), health check display |
| `BuilderForms.jsx` | Shared inline forms used everywhere: `CreateWarehouseForm`, `EditWarehouseForm`, `AddZoneForm`, `EditZoneForm`, `AddShelfForm`, `EditShelfForm`, `AddBoxForm`, `EditBoxForm`. Plus `FormModal` (centered overlay), `ConfirmDelete`, `StatusToast`, `useFlash` hook |
| `PhotoUploader.jsx` | Reusable: file picker with camera capture, compresses via `browser-image-compression`, uploads to Storage bucket. Returns `(value, onChange)` API. Plus `PhotoThumb` for read-only display |
| `CardboardBox.jsx` | Two visual components: `CardboardBox` (full size with photo + code + count, for ShelfView), `CardboardBoxMini` (small for ZoneView rack). Brown gradient + tape line + center fold to look like real cardboard |
| `ErrorBoundary.jsx` | Top-level boundary with friendly recovery UI |
| `CheckoutsTab.jsx`, `DamagedTab.jsx`, `DonatedTab.jsx`, `LogTab.jsx`, `UsersTab.jsx`, `RequestsTab.jsx` | Operational tabs (mostly inherited from initial seed code, lightly modified for founder visibility) |
| `AddItemModal.jsx`, `AddBoxModal.jsx` | Legacy add modals — `AddItemModal` is launched from WarehouseMap; uses `suggestLocation` helper to auto-pick a slot. `AddBoxModal` is mostly unused now but referenced from `ZoneView` for empty slot adds |

### Helpers (`src/lib/`)
- `supabase.js` — client + `logActivity(action, target, location)` helper
- `helpers.js` — date utils, `isOverdue`, `getInitials`, `arabicOrdinal(1)→الأوّل`, `shelfDisplayName(shelf, allShelves)`, `suggestLocation(zoneLetter, existingBoxes, zones)`
- `constants.js` — USER_ROLES, PERMISSIONS, ITEM_STATUSES, DAMAGE_REASONS, DEFAULT_RETURN_DAYS=10
- `photoUpload.js` — `uploadPhoto(file, prefix)`, `deletePhoto(url)` — handles compression to ~500KB webp + upload to `sraj-photos` bucket
- `warehouseOps.js` — central place for all RPCs and structural mutations: `rpcCreate/Rename/Delete Warehouse`, `rpcAddZone/UpdateZone/DeleteZone` (with cascade soft-delete in JS), `rpcAddShelf/UpdateShelf/DeleteShelf` (with cascade), `rpcAddBox` (uses position-aware RPC if `position` passed), `updateBox`, `deleteBox` (cascades to items), `softDeleteItem`, `restoreBox`, `restoreItem`, `permanentDeleteBox`, `permanentDeleteItem`, `moveItemToBox`, `moveBoxToShelf`, `fetchWarehouseLayout`, `fetchBoxesForShelf`. Plus `PRESET_COLORS` and `PRESET_POSITIONS` (6 zone-on-map placement presets)

---

## 4. Key behaviors and gotchas

### Soft-delete + cascade
- `boxes.deleted_at`, `items.deleted_at`, `checkouts.deleted_at`, `damaged_items.deleted_at`, `donated_items.deleted_at` exist
- Code-level cascade: `deleteBox` first soft-deletes all items in box, then soft-deletes box. `rpcDeleteShelf` and `rpcDeleteZone` cascade through their children in JS before calling SQL hard-delete on the parent.
- ALL queries that fetch boxes/items must filter `is('deleted_at', null)` AND `not('shelf_id', 'is', null)` (defensive against orphans). Already done in `Dashboard.loadAllData` and `GlobalSearch`.
- Recovery bin in `RecoveryBin.jsx` uses `not('deleted_at', 'is', null)` to find soft-deleted records

### Orphan prevention (post-mortem of a real bug)
A previous bug: the `shelf_id` FK has `ON DELETE SET NULL`. So deleting a shelf via the old hard-delete RPC orphaned its boxes (kept rows with `shelf_id = null`, still counted in totals).

Two-layer fix now in place:
1. `rpcDeleteShelf` and `rpcDeleteZone` in `warehouseOps.js` cascade-soft-delete boxes/items in JS before calling the SQL hard-delete RPC
2. All box queries filter `not('shelf_id', 'is', null)` defensively

If you ever see "phantom" counts, suspect this and check `boxes WHERE shelf_id IS NULL`.

### Drag-and-drop
- `<img>` defaults are draggable in browsers, which **steals** the parent's drag. Always `draggable={false}` + `pointer-events-none` on inner images in box visuals (`CardboardBoxMini`, `BigBox`, `ItemFromAbove`).
- For touch devices and accessibility: a tap-to-select alternative is wired in `ZoneView` — clicking a box's drag handle toggles `selectedBoxForMove`, then clicking a shelf or trash zone moves/deletes it. `activeBoxForMove = draggedBox || selectedBoxForMove` is the unified target.
- Drag handles are visible always-on (not just edit mode) for the founder. Square `⊞` icon button on every box and item card.

### Position-aware box add
- ZoneView's rack renders slots by POSITION (1..max(max_boxes, MAX(box_index))), not by render order. This means gaps render correctly: if boxes are at positions 1, 3, 4, position 2 renders an empty `+ صندوق #2` slot.
- Click that slot → `handleQuickAddBox(shelf, 2)` → `rpcAddBox(shelf.id, { position: 2, ... })` → uses `add_box_at_position` RPC if position is passed.
- Without migration_05, the position arg is silently dropped (RPC doesn't exist). User has run all migrations through 06.

### RTL layout
- Page is RTL by default. `flex flex-row` items flow right-to-left visually. Position 1 (first JSX child) renders RIGHTMOST.
- Common confusion: user sometimes says "the box went right" referring to the rightmost (position 1). When in doubt, render with explicit position labels (`#1`, `#2`...).

### Auth and email change
- Founder email change uses `supabase.auth.updateUser({ email })` — sends a confirmation link to the new email. After user clicks the link, `auth.users.email` updates. Then `update_founder_profile` RPC syncs `profiles.email`.
- If user wants to test, give them `evuon1+test@gmail.com` style aliases.

### Stealth mode
- Founder profile has `stealth_mode` boolean
- The trigger `skip_log_for_stealth_founder` on `activity_log` returns NULL on INSERT if `is_founder = true AND stealth_mode = true`. So nothing the founder does in stealth mode is logged.
- Toggle is in the FounderTab page.

### Email alerts
- `scripts/notify-overdue.mjs` queries active checkouts (no returned/damaged/donated) where `daysSince(date_out) > 10`
- Groups by `user_id`, sends one email per user (their items + days late) and a summary to founder
- Uses `from: onboarding@resend.dev` (Resend's default sender). For prettier emails, user can verify a domain in Resend later.

---

## 5. Recent UX iterations (chronological, last → first)

(Read these to understand the user's direction; bottom = oldest)

1. **Always-visible square drag handles** on every box and item, work outside edit mode. Empty slots clickable always (no edit mode required).
2. **Floating modal forms** — all critical edits (zone/shelf/box, add-item-in-box) use `FormModal` (centered overlay) so they don't disappear when scrolling.
3. **Position-aware box insert** — clicking a specific empty slot inserts at exactly that position; existing boxes shift forward.
4. **Cardboard visual styling** — boxes look like brown cardboard boxes with tape and folds; zones render as top-down shelving units with visible shelf grid.
5. **Drag-and-drop boxes between shelves** within a zone, with floating trash drop zone.
6. **All-items views** at warehouse and zone levels (search/filter/click-to-jump).
7. **Hierarchical drill-down** in main flow: Warehouses → Warehouse → Zone → Shelf → Box, breadcrumbs at every level, founder-only inline edit.
8. **Removed المستودع tab for founder** — they enter via المستودعات tab; back-arrow returns to home.
9. **3 production-stability layers**: cron keep-alive, daily DB backup to GitHub `backups` branch, UptimeRobot monitoring with email alerts.
10. **Photos for items and boxes** — Supabase Storage bucket, client-side compression, thumbnails everywhere.
11. **QR scanner from camera** + dynamic QR generation for actual zones/boxes with deep-link URLs.
12. **Email alerts** for overdue checkouts (Resend daily cron).
13. **Global search** in header (4-table parallel query with debounce).
14. **Recovery bin** for restoring soft-deleted boxes/items.
15. **Reports overhaul** — 6 totals, filters, Excel/CSV export, Excel import with template.

---

## 6. Critical files to NOT regress

| File | Why it's critical |
|:---|:---|
| `src/lib/warehouseOps.js` | Single source of truth for structural mutations. JS-level cascade soft-delete logic lives here. Don't replace cascading deletes with direct SQL calls without thinking. |
| `src/pages/Dashboard.jsx` | All navigation state. The `loadAllData` query has carefully-tuned filters (`deleted_at`, `shelf_id NOT NULL`, `boxes.deleted_at`). Don't simplify them. |
| `supabase/migration_*.sql` | Each migration is incremental on top of the previous. The user has run all 6. Don't rewrite migrations; add new ones. |
| `src/components/CardboardBox.jsx` | The `draggable={false}` + `pointer-events-none` on inner img is what makes drag-drop work. Don't restore them. |
| `src/components/BuilderForms.jsx` | Shared forms used by 6+ components. `FormModal` is referenced by ZoneView and BoxView for centered editing. |
| `.claude/settings.local.json` | Permission whitelist. Keeps Claude unblocked on routine git/gh/npm commands. |
| `~/.claude/projects/D--/memory/*.md` | User preferences memory. Refresh when his preferences shift, but don't delete. |

---

## 7. Outstanding / known-good-to-future-improve

- **Item drag-drop across boxes:** the visual handle exists on items in BoxView, but there's no full cross-box move flow. Click-to-select state is local to BoxView; navigating loses it. To finish this, hoist `selectedItemForMove` to Dashboard or AuthContext, and have any BoxView render a prominent "ضع هنا" button when there's a pending item move.
- **Shelf drag-and-drop:** zones don't reorder via drag. Only the position presets work. Could add free-form zone repositioning.
- **PWA + Capacitor:** decided to defer. User wants to first build multiple websites, then bundle them into one Capacitor app and pay store fees once. Architect new modules cleanly so they can join easily — keep the React app modular.
- **Bundle size:** main JS is ~550KB minified. Vite warns. Could code-split (`React.lazy` for tabs) but it's working fine for now.
- **Item move via drag with visible handle:** as above, the handle is there but the cross-page wiring isn't. User asked for it; probably the next thing he'll request again.
- **Sorting boxes alphabetically:** `Dashboard.loadAllData` uses `.order('code')` which is ALPHABETIC, not numeric. Boxes A-1-10 sort before A-1-2 lexically. Not a problem until any shelf has >9 boxes per shelf. If/when reported, sort by `box_index` after fetch or update query.

---

## 8. Useful commands

```bash
# Refresh PATH on Windows (after winget installs)
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","User") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","Machine")

# Build (always use npm.cmd, never npm.ps1)
cd D:\Sraj-Warehouse; npm.cmd run build

# Push to GitHub (Vercel auto-deploys main branch)
git add -A && git commit -m "..." && git push

# Add/update GitHub Secret
gh secret set SECRET_NAME --body "value"

# Trigger a workflow manually
gh workflow run backup.yml
gh run list --workflow=backup.yml --limit 1
gh run watch <run_id> --exit-status

# Verify Supabase RPC exists (using service_role)
curl -s -X POST "https://tfrzyiyoromlgmcissvu.supabase.co/rest/v1/rpc/<rpc_name>" \
  -H "apikey: <service_role_key>" \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{}'

# Query DB with service_role (bypasses RLS — use carefully)
curl -s "https://tfrzyiyoromlgmcissvu.supabase.co/rest/v1/<table>?select=*" \
  -H "apikey: <service_role_key>" \
  -H "Authorization: Bearer <service_role_key>"
```

---

## 9. How to start the next session

1. **Read this file end-to-end first.** Don't skim.
2. **Check the live site** (`https://sraj-warehouse.vercel.app`) — log in as founder if you have credentials, or just verify it loads.
3. **Pull latest:** `cd D:\Sraj-Warehouse && git pull`
4. **Read git log** — the last few commit messages are useful context.
5. **Check open user feedback in the conversation** — if any new feedback came in, prioritize it.
6. **Don't break the production-stability layers** (Cron, backup, UptimeRobot, email cron). They run silently.
7. **When in doubt about user intent, ask.** He'd rather a 1-question detour than a 30-minute wrong build.

The user is patient with thoughtful work but frustrated by re-explaining context. Read his memory files (`~/.claude/projects/D--/memory/`) before any non-trivial decision.

Good luck. — Previous Claude (2026-05-01)
