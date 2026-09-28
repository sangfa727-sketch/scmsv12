# SCMS v11 — School Class Management System

A single frontend that runs in **three modes**, automatically detected at boot:

| Mode | When | UI |
|------|------|----|
| **TWA** (Telegram Web App) | Opened from a Telegram bot | Tab bar, no sidebar, no in-app chat (Telegram already does chat) |
| **Native** (Capacitor) | Wrapped as Android/iOS app | Tab bar **+ sidebar drawer + staff chat** |
| **Web** | Plain browser (testing) | Tab bar, no chat (no signed-in user) |

The same `index.html`, `style.css`, and `js/*.js` files cover all three.

---

## ✨ What's new in v11

1. **Student edit** — tap any student card → detail view → ✎ Edit button. Edit name, class, parent contacts, **birthday**, **parent email**, and **home color**.
2. **New student fields** — `birthday`, `parent_email`, `home_color` (used for the avatar tint everywhere).
3. **Parent auto-link via deep link** — no more typing parent Telegram IDs. After you add a student you get a `https://t.me/YourBot?start=link_parent_<id>` link. Send it to the parent; when they tap it the bot captures their TG ID and the app polls until linked.
4. **Attendance codes with labels** — every code (P/A/L/T/S/E/H) now shows its name underneath the letter (`P / Present`, `A / Absent`, …). Includes a legend sheet and bulk "All Present" / "Clear" toolbar.
5. **Smart student picker** — replaced the awkward `<datalist>` with a full bottom-sheet picker: search, class chips, grouped list, avatars. Used everywhere a student is selected.
6. **Telegram-style sidebar + staff chat** — visible only in the native app (hidden inside Telegram). Burger button in the header opens it.
7. **School logo** — admins can upload a school logo (PNG/JPG/WebP, ≤ 1 MB, auto-resized to 256×256). Shows in the header, sidebar, More page, and is sent to the server for reuse in parent messages and reports.
8. **Capacitor-ready** — wrap the same codebase as a native Android/iOS app with no code changes.

---

## 📂 Folder structure

```
scms_v11/
├── index.html                # Single page, all routes are sections
├── style.css                 # All styling (light + dark theme via [data-theme])
├── capacitor.config.json     # Native app config
├── package.json              # npm scripts for Capacitor build
├── README.md                 # This file
└── js/
    ├── 01_config.js          # Constants, platform detection, twaPost()
    ├── 02_api.js             # API surface (students, attend, daily, hw, comms, ...)
    ├── 03_utils.js           # Helpers + ATTENDANCE_CODE_LABELS, HOME_COLORS
    ├── 03b_student_picker.js # Bottom-sheet picker (used by daily/hw/comms/incidents)
    ├── 04_students.js        # List, detail, ADD + EDIT modal, parent deep-link flow
    ├── 05_attendance.js      # Date strip + new code grid with labels + legend
    ├── 06_daily.js
    ├── 07_homework.js
    ├── 08_comms.js
    ├── 09_incidents.js
    ├── 10_timetable.js
    ├── 11_summary.js
    ├── 12_more.js            # Profile, admin tools, school logo upload
    ├── 13_register.js        # Stub (registration via TG bot)
    ├── 14_app.js             # Boot, bootstrap, tab bar, FAB, burger, page routing
    ├── 15_settings.js        # Stub
    ├── 16_chat.js            # Staff chat (native only)
    └── 17_sidebar.js         # Slide-in drawer (native only)
```

---

## 🚀 Deploying

### 1) Telegram WebApp (default)

1. Open `js/01_config.js` and set:
   - `SUPABASE_URL`, `SUPABASE_ANON` — your Supabase project
   - `N8N_WEBHOOK` — your TWA webhook (writes go through here)
   - `N8N_BOOTSTRAP` — your bootstrap webhook (returns full school context)
   - `BOT_USERNAME` — your Telegram bot username (without `@`)
2. Host the folder on any static host (GitHub Pages, Netlify, Cloudflare Pages, your own server, …).
3. In **@BotFather** → Bot settings → Menu Button → set the URL to your hosted index.
4. Open the bot from Telegram → tap the menu button → the app loads with the user's session.

### 2) Native Android / iOS (Capacitor)

Requirements: Node ≥ 18, JDK 17 + Android Studio (for Android), Xcode (for iOS).

```bash
cd scms_v11

# One-time
npm install
npx cap add android
npx cap add ios          # macOS only

# Every time you change web files:
npx cap sync

# Open in IDE to build / run on device
npx cap open android     # → Android Studio
npx cap open ios         # → Xcode
```

The platform detection in `01_config.js` checks `window.Capacitor?.isNativePlatform()` — when running inside the wrapper it switches `data-platform="native"` and reveals the sidebar + chat tab automatically.

### 3) Plain web (local dev / testing)

```bash
npm run serve
# → opens http://localhost:5173
```

In this mode the app loads the **demo dataset** baked into `_demoBootstrap()` so you can click around without Telegram or a backend.

---

## 🔌 Backend integration

Your existing **`SCMS v10.9.47 - Wizard Escape + UX`** n8n workflow already supports almost everything v11 needs. The few additions are documented in **`BACKEND_INTEGRATION.md`** — TL;DR:

1. **Run `db_migration.sql`** in Supabase SQL editor (adds `chat_messages`, `parent_email`, `home_color` columns).
2. **Add one new route** to your existing **TWA Action Router** node: `chat_send` (full screenshot-style instructions in `BACKEND_INTEGRATION.md`).
3. **Everything else just works.**

| v11 frontend action | Status | Notes |
|---|---|---|
| `save_attendance`, `save_daily_report`, `save_homework`, `save_incident`, `send_parent_comm`, `register_student`, `update_school_config` | ✅ Already in your workflow | No change |
| `update_school_config` with `patch:{school_logo}` | ✅ Reuses existing route | Stores logo in `config_json` |
| `update_student`, `delete_student` | ✅ Frontend PATCHes Supabase directly | RLS + anon key |
| `check_parent_link` | ✅ Frontend reads Supabase directly | Polls `students.parent_tg_id` |
| `chat_send` | ❌ Add this — see `BACKEND_INTEGRATION.md` | One new HTTP Request node |

The parent deep-link format is **`t.me/<bot>?start=parent_<student_id>`** — your `Merge Pre-State` node already parses this exact format (regex `/^\/start\s+parent_(STU-[A-Z0-9]+)/i`).

---

## 🎨 Customisation

| Thing | Where |
|-------|-------|
| Colors / dark mode | CSS variables at the top of `style.css` |
| School logo | Admin → More → 🖼️ School logo (or any user with `is_admin = true`) |
| Attendance codes (which letters exist) | Server `config.attendance_codes`; labels live in `js/03_utils.js` `ATTENDANCE_CODE_LABELS` |
| Home colors palette | `js/03_utils.js` `HOME_COLORS` array (16 colors) |
| App name / app id | `capacitor.config.json` |

---

## 🐛 Troubleshooting

- **Sidebar doesn't open** — sidebar is hidden inside Telegram by design. Open the app via Capacitor (native build) or plain browser to see it.
- **Chat tab not visible** — same: only shows when `data-platform` is `native`.
- **Parent link never confirms** — make sure your bot is actually handling `/start link_parent_…`. Check that `check_parent_link` is wired in n8n and returns the parent's tg id once the bot saves it.
- **Logo doesn't appear after upload** — confirm your `update_school_logo` handler is saving the data URL to a column that the bootstrap webhook reads back into `schoolConfig.school_logo`. If your bootstrap reads from `config.school_logo` instead, that also works — the frontend checks both.

---

## 📝 Version

`v11.0.0` — see `<meta name="version">` in `index.html` and `SCMS_CONFIG.VERSION` in `js/01_config.js`.
