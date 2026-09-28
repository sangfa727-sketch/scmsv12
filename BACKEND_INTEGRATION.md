# Backend (n8n) Integration Guide — v11

Your existing n8n workflow **`SCMS v10.9.47 - Wizard Escape + UX`** already supports most of what v11 needs:

| v11 frontend action     | Status in your current workflow | What to do |
|-------------------------|--------------------------------|------------|
| `save_attendance`       | ✅ Already there                | Nothing |
| `save_daily_report`     | ✅ Already there                | Nothing |
| `save_homework`         | ✅ Already there                | Nothing |
| `save_incident`         | ✅ Already there                | Nothing |
| `send_parent_comm`      | ✅ Already there                | Nothing |
| `register_student`      | ✅ Already there                | Nothing |
| `update_school_config`  | ✅ Already there                | Nothing — used for **school logo** too |
| `update_student`        | ⚠️ Frontend uses Supabase direct PATCH | Run `db_migration.sql` for RLS |
| `delete_student`        | ⚠️ Frontend uses Supabase direct PATCH | Same |
| `check_parent_link`     | ⚠️ Frontend reads Supabase direct | Nothing — works already |
| `chat_send`             | ❌ NEEDS NEW ROUTE              | See below ⬇ |

The deep-link format for parent linking now matches your backend: `t.me/<bot>?start=parent_STU-XXXXXX`. The `Merge Pre-State` node already parses this correctly — no change needed.

---

## ① Run the SQL migration

Open Supabase → SQL editor → paste the contents of `db_migration.sql` → Run.

This adds:
- `students.parent_email`, `students.home_color`, `students.date_of_birth` (if missing)
- `chat_messages` table with RLS + an `rpc_chat_send` function
- An email format check constraint

After running, **verify** that `rpc_bootstrap` returns `config_json.school_logo` (or surfaces it on `schoolConfig.school_logo` / `config.school_logo`) so the header logo appears for everyone. If not, edit your `rpc_bootstrap` to include it.

---

## ② Add the `chat_send` route to n8n

Open `SCMS v10.9.47 - Wizard Escape + UX` in n8n.

### Step 1 — Add a new rule to **TWA Action Router**

Click into **TWA Action Router** → add another rule at the end of the rules list:

| Field | Value |
|---|---|
| Left value | `={{ $json.body.action }}` |
| Right value | `chat_send` |
| Operator | string · equals |
| Output key | `chat_send` |

### Step 2 — Add an HTTP Request node connected to the new output

Drag a new **HTTP Request** node from `TWA Action Router → chat_send` output. Name it **`TWA: Save Chat Message`**.

| Field | Value |
|---|---|
| Method | POST |
| URL | `https://rszgbryucqwmrdbsgwbb.supabase.co/rest/v1/rpc/rpc_chat_send` |
| Authentication | use the same Supabase service-role credential you use for other TWA nodes |
| Send Headers | `Content-Type: application/json`, `apikey: <service_role>`, `Authorization: Bearer <service_role>` |
| Send Body | yes — JSON |
| Body | (see below) |

Body (n8n expression mode):

```
={
  "p_school_id":    "{{ $json.body.school_id }}",
  "p_channel":      "{{ $json.body.channel || 'staff' }}",
  "p_teacher_id":   "{{ $json.body.teacher_id }}",
  "p_teacher_name": "{{ $json.body.teacher_name }}",
  "p_text":         "{{ $json.body.text }}"
}
```

### Step 3 — Wire its output

Connect `TWA: Save Chat Message` → **TWA Response (OK)**.

That's it — chat now writes to `chat_messages`. The frontend reads directly from Supabase, so reads are already working as soon as the table exists.

---

## ③ (Optional) Real-time chat

The frontend polls every 8 seconds. To upgrade to instant push:

1. Enable Supabase **Realtime** on the `chat_messages` table (Database → Replication → toggle on).
2. In `js/16_chat.js`, replace `startChatPolling` with a Supabase channel subscription:

```js
const chan = window.APP.sb
  .channel('chat-' + window.APP.school_id)
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `school_id=eq.${window.APP.school_id}` },
      (payload) => {
        if (payload.new.channel === _chatChannel) {
          window.APP.chatMessages.push(payload.new);
          _renderChatStream(window.APP.chatMessages);
        }
      })
  .subscribe();
```

Polling still works fine for small teams (< 20 active users) so this is optional.

---

## ④ Smoke-test checklist after upgrade

- [ ] Open the app in Telegram → header logo shows (if admin uploaded one)
- [ ] Admin → More → 🖼️ School logo → upload an image → header refreshes
- [ ] Add student → see deep-link modal → tap link in Telegram → bot says "Welcome parent" → frontend modal turns green
- [ ] Tap a student → ✎ Edit → change phone → save → list updates
- [ ] Build native app via Capacitor → burger menu appears → Chat tab visible → send a message → other native users see it within 8s
- [ ] Open the same app inside Telegram → burger and chat tab are hidden ✓

---

## ⑤ App login flow (native-app only)

The native app's landing page lets the user "Sign in with Telegram". To make this work, the bot needs to recognise one more `/start` parameter and call an RPC. **Two small additions to your n8n workflow:**

### A. Update the `Merge Pre-State` regex

In **Merge Pre-State** node, find this line (currently around line 30):

```js
const parentLinkMatch = rawText.match(/^\/start\s+parent_(STU-[A-Z0-9]+)/i);
const parent_link_student_id = parentLinkMatch ? parentLinkMatch[1].toUpperCase() : '';
```

…and add right below it:

```js
// v11: native-app login deep link → /start app_login_<token>
const appLoginMatch = rawText.match(/^\/start\s+app_login_([a-z0-9]+)/i);
const app_login_token = appLoginMatch ? appLoginMatch[1] : '';
```

Also extend the returned `json` object:

```js
return [{ json: {
  ...ctx,
  has_wizard_state: has_state,
  wizard_state,
  wizard_step,
  wizard_temp_data: wizard_temp,
  parent_link_student_id,
  app_login_token,   // ← add this
  pre_auth_route,
  // ...
}}];
```

And in the route decision block, add a new branch at the top (right after `parent_link`):

```js
// PRIORITY 0a (v11): App-login deep link
if (app_login_token) {
  pre_auth_route = 'app_login';
}
// PRIORITY 0: Parent deep link
else if (parent_link_student_id) {
  pre_auth_route = 'parent_link';
}
// ... existing logic continues
```

### B. Add `app_login` to Pre-Auth Switch

Open **Pre-Auth Switch** → add a new rule at the top:

| Field | Value |
|---|---|
| Left value | `={{ $json.pre_auth_route }}` |
| Right value | `app_login` |
| Operator | string · equals |
| Output key | `app_login` |

### C. Add an HTTP Request node `App Login Bind`

Drag a new HTTP Request from the `app_login` output:

| Field | Value |
|---|---|
| Method | POST |
| URL | `https://rszgbryucqwmrdbsgwbb.supabase.co/rest/v1/rpc/rpc_app_login_bind` |
| Authentication | service-role Supabase credential |
| Headers | `Content-Type: application/json`, `apikey: <service_role>`, `Authorization: Bearer <service_role>` |
| Body (JSON) | see below |

```
={
  "p_token":       "{{ $json.app_login_token }}",
  "p_telegram_id": "{{ $json.from_id }}"
}
```

### D. Notify the user in Telegram

Connect `App Login Bind` → a new **Telegram** node (`App Login Reply`) → wire its output anywhere (or to a `respondToWebhook` no-op).

Message text:

```
{{ $json.ok ? '✅ Signed in! Return to the SCMS app — it should load in a moment.' : '⚠️ ' + $json.message }}
```

### E. Test

1. Run `db_migration.sql` again (or just the v11 PART 2 block) — adds the `app_sessions` table and `rpc_app_login_bind`.
2. Open the SCMS native app → "Sign in with Telegram" → Telegram opens with `/start app_login_<token>`
3. Bot replies "✅ Signed in!"
4. App auto-detects (polls every 2s) → bootstraps → main UI

Total bot-side flow time: **~3 seconds**.

---

## ⑥ Smoke test (updated for login flow)

- [ ] Install Capacitor app on phone → first launch → landing page shows
- [ ] Tap "Sign in with Telegram" → Telegram opens with `/start app_login_…`
- [ ] Bot replies "Signed in!" → app loads within 2s
- [ ] Close app → reopen → goes straight in (saved session in localStorage)
- [ ] Settings → "Sign out" → confirms → back to landing
- [ ] Try landing → "Register a new school" → Telegram opens with `/register_school` wizard
- [ ] Try landing → "Join existing school" → Telegram opens with `/register_teacher` wizard
