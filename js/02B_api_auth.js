/**
 * SCMS v12 — 02B_api_auth.js
 * Domain API module.
 * 
 * This file extends the shared window.API surface without changing
 * existing callers such as API.getStudents().
 */

'use strict';

const API = window.API || {};

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

    console.log('[API.bootstrap] POST', SCMS_CONFIG.N8N_BOOTSTRAP);
    console.log('[API.bootstrap] body keys:', Object.keys(body));
    console.log('[API.bootstrap] telegram_id:', telegram_id, 'has initData:', !!initData);

    let resp;
    try {
      resp = await fetch(SCMS_CONFIG.N8N_BOOTSTRAP, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
    } catch (netErr) {
      // Network / CORS / DNS failure
      throw new Error('Network error: ' + (netErr.message || netErr));
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
    const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/rpc_web_bootstrap`, {
      method:  'POST',
      headers: {
        'apikey':        SCMS_CONFIG.SUPABASE_ANON,
        'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        p_session_token: session_token,
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status} ${txt.slice(0, 200)}`);
    }
    const result = await resp.json();
    if (!result || !result.ok) {
      throw new Error((result && result.message) || 'Web bootstrap failed');
    }
    return result;
  },

  // ─── ATTENDANCE ──────────────────────────────────────────────────────────

});

window.API = API;
