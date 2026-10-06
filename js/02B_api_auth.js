/**
 * SCMS v12 — 02B_api_auth.js
 * Domain API module.
 * 
 * This file extends the shared window.API surface without changing
 * existing callers such as API.getStudents().
 */

'use strict';

var API = window.API || {};

Object.assign(API, {

  async bootstrap(telegram_id, school_id) {
    const initData = window.APP.initData || '';
    const body = {
      action:        'bootstrap',
      telegram_id,
      school_id:     school_id || undefined,
      // Send under BOTH key names so the backend works whether it expects
      // `initData` (v10 convention) or `tg_init_data` (n8n convention).
      initData,
      tg_init_data:  initData,
      platform:      window.APP.platform,
    };


    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let resp;
    try {
      resp = await fetch(SCMS_CONFIG.N8N_BOOTSTRAP, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (netErr) {
      if (netErr?.name === 'AbortError') {
        const err = new Error('Bootstrap request timed out. Please retry.');
        err.code = 'TIMEOUT';
        throw err;
      }
      // Network / CORS / DNS failure
      throw new Error('Network error: ' + (netErr.message || netErr));
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      let txt = '';
      try { txt = await resp.text(); } catch (_) {}
      throw new Error(`HTTP ${resp.status} ${resp.statusText} ${txt.slice(0, 200)}`);
    }

    let json;
    try {
      json = await resp.json();
    } catch (e) {
      throw new Error('Server returned non-JSON response');
    }
    return json;
  },

  /** v11.6 — bootstrap via web session (no Telegram, direct RPC).
   *  Verifies session token and returns full school+teacher bootstrap data
   *  in one call. Doesn't depend on n8n. */

  async bootstrapByTeacher(teacher_id, session_token) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/rpc_web_bootstrap`, {
        method:  'POST',
        headers: {
          'apikey':        SCMS_CONFIG.SUPABASE_ANON,
          'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ p_session_token: session_token }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status} ${txt.slice(0, 200)}`);
      }
      const result = await resp.json();
      if (!result || !result.ok) throw new Error((result && result.message) || 'Web bootstrap failed');
      return result;
    } catch (e) {
      if (e?.name === 'AbortError') throw new Error('Web bootstrap timed out. Please retry.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },

  // ─── ATTENDANCE ──────────────────────────────────────────────────────────

});

window.API = API;
