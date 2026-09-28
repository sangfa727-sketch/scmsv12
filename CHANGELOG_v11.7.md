# SCMS v11.7 — Google OAuth + Telegram-Connect

## ဘာတွေလုပ်ခဲ့လဲ (What was built)

Teacher/Admin login အတွက် Google account (email-based) login အသစ်တစ်ခု
ထပ်ထည့်ခဲ့ပါတယ် — v11.6 ရဲ့ Teacher ID/password login နဲ့ Telegram login ကို
**လုံးဝ မဖျက်ပါ** (side by side ရှိနေပါတယ်)။ Email login ဝင်ပြီးနောက်
Settings ထဲက "Connect Telegram" ကနေ Telegram account ကိုပါ ချိတ်ဆက်နိုင်ပါတယ်။

### Login flow
- **School အသစ်**: Google Sign-In ဝင်ပြီး "School အသစ် စတင်မည်" ရွေး → admin
  auto ဖြစ်သွားမယ်
- **Existing school join**: Admin က "Invite via Google" ကနေ code ထုတ်ပေး →
  Teacher က Google Sign-In ဝင်ပြီး code ရိုက်ထည့် → join ဝင်ရမယ် (self-register
  မရှိပါ)
- **Telegram**: ဘာမှ မပြောင်းလဲပါ — parent notification + backup login
  အတွက် ဆက်ရှိနေပါတယ်

## ✅ Database (Supabase) — apply ပြီးသားပါပြီ

Project `rszgbryucqwmrdbsgwbb` ပေါ်မှာ migration 2 ခု run ပြီးပါပြီ:
1. `scms_v11_6_web_auth_foundation` (+ part2) — v11.6 auth foundation
2. `scms_v11_7_google_oauth_telegram_connect` (+ invites/telegram-connect,
   + lock-down fix) — Google OAuth RPCs, invite system, Telegram-connect RPCs

Edge Function `google-login` လည်း deploy ပြီးပါပြီ (ACTIVE)။

### ⚠️ သင်လုပ်ရမယ့်အရာ — Supabase Dashboard ထဲမှာ
1. **Google Cloud Console** → OAuth 2.0 Client ID (Web application) တစ်ခု
   ဖန်တီးပါ → Authorized JavaScript origins မှာ သင့် domain(s) ထည့်ပါ
   (e.g. `https://vavidaedu.online`, `https://sangfa727-sketch.github.io`)
2. **Supabase Dashboard → Edge Functions → google-login → Settings** →
   environment variable `GOOGLE_CLIENT_ID` ကို Google Client ID နဲ့ ထည့်ပါ
3. **`js/01_config.js`** ထဲက `GOOGLE_CLIENT_ID` placeholder ကို အဲဒီ Client
   ID အတိအကျ တူအောင် ပြောင်းထည့်ပါ (Edge Function env var နဲ့ frontend
   config ၂ ခု **အတိအကျ တူရပါမယ်**)

## Files changed (frontend)

| File | Change |
|---|---|
| `js/01_config.js` | `GOOGLE_CLIENT_ID`, `GOOGLE_LOGIN_URL` config ထည့် |
| `index.html` | Google Identity Services script tag ထည့် |
| `js/19_google_auth.js` | **NEW FILE** — Google Sign-In button, new-account choice modal, Telegram-connect modal, invite management |
| `js/00_landing.js` | Google Sign-In button container landing screen ပေါ် ထည့် |
| `js/15_settings.js` | Telegram connect/disconnect row, login-method label, Teacher Manager ထဲ "Invite via Google" ခလုတ်ထည့် |
| `js/14_app.js` | `window.APP.telegram_id` ကို bootstrap data ကနေ အမှန် populate လုပ်ပေး (ယခင်က လုံးဝ set မဖြစ်ခဲ့ပါ) |
| `style.css` | `.landing-google-btn` container style ထပ်ထည့် |

## Security notes

- Google ID token ကို frontend ကနေ **တိုက်ရိုက် database ကို မပို့ပါ** —
  Edge Function (`google-login`) ကနေ Google ရဲ့ tokeninfo endpoint နဲ့
  signature/audience/issuer/expiry အကုန် verify လုပ်ပြီးမှ database RPC ကို
  ခေါ်ပါတယ်
- `rpc_google_login` ကို **service_role ကလွဲရင် ဘယ်သူမှ ခေါ်လို့မရပါ**
  (anon key ကနေ တိုက်ရိုက် ခေါ်လို့ မရအောင် သီးခြား လုပ်ထားပါတယ် — audit
  လုပ်နေစဉ် PostgreSQL ရဲ့ default PUBLIC EXECUTE grant ကို တွေ့ပြီး
  ချက်ချင်း ပိတ်ထားခဲ့ပါတယ်)
- Invite codes က 14 ရက်အတွင်း သက်တမ်းကုန်ပြီး တစ်ကြိမ်သုံးရုံသာ ရပါတယ်

## Still open (RLS security audit — separate from this feature)

2026-09-14 က security audit မှာ တွေ့ခဲ့တဲ့ `anon_read_*` policies
(students/attendance/daily_reports/incidents/parent_comms/timetable/
chat_messages/app_sessions ပေါ်က `USING(true)`) ကို **ဒီ update မှာ မထိပါ**
— ဒါက သီးခြား fix လုပ်ရန် ကျန်နေပါသေးတယ်။
