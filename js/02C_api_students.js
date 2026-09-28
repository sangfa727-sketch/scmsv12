/**
 * SCMS v12 — 02C_api_students.js
 * Domain API module.
 * 
 * This file extends the shared window.API surface without changing
 * existing callers such as API.getStudents().
 */

'use strict';

var API = window.API || {};

Object.assign(API, {

  async getStudents() {
    if (window.APP.platform === 'web') {
      const res = await _webRpc('rpc_get_students', { p_session_token: getWebSession()?.session_token });
      return res.rows;
    }
    return sbQuery('students',
      `school_id=eq.${window.APP.school_id}&status=eq.Active&order=class,name_en`);
  },

    /** Register new student.
   *  Web sessions call rpc_register_student directly — no n8n dependency,
   *  and it de-dupes server-side (same school+class+english name) so manual
   *  entry and future AI/chat entry can never create two rows for one student.
   *  Telegram/native platforms still go through the n8n TWA webhook. */

  async registerStudent(data) {
    if (window.APP.platform === 'web') {
      const sess = getWebSession();
      if (!sess || !sess.session_token) {
        throw new Error('No active web session — please sign in again.');
      }
      const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/rpc_register_student`, {
        method:  'POST',
        headers: {
          'apikey':        SCMS_CONFIG.SUPABASE_ANON,
          'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          p_session_token:  sess.session_token,
          p_name_local:     data.name_local || null,
          p_name_en:        data.name_en,
          p_class:          data.class,
          p_grade:          data.grade || null,
          p_gender:         data.gender || null,
          p_date_of_birth:  data.date_of_birth || null,
          p_home_color:     data.home_color || null,
          p_parent_name:    data.parent_name || null,
          p_parent_phone:   data.parent_phone || null,
          p_parent_email:   data.parent_email || null,
        }),
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status} ${txt.slice(0, 200)}`);
      }
      const result = await resp.json();
      if (!result || !result.ok) {
        const err = new Error(result?.message || result?.error || 'Registration failed');
        err.duplicate = !!result?.duplicate;
        err.existing_student_id = result?.existing_student_id;
        throw err;
      }
      return { student: result.student };
    }
    return twaPost('register_student', data);
  },

    /** Upload a student's photo to Supabase Storage and return its public URL.
   *  Path: <school_id>/<student_id>-<uid>.<ext> — unique per upload, never overwrites. */

  async uploadStudentPhoto(studentId, file) {
    // Phone photos are often HEIC or > 3 MB, which the bucket rejects — always
    // resize to a small square JPEG first.
    const blob = await _prepStudentPhoto(file);
    const path = `${window.APP.school_id}/${studentId}-${Date.now().toString(36)}.jpg`;
    const resp = await fetch(
      `${SCMS_CONFIG.SUPABASE_URL}/storage/v1/object/student-photos/${path}`,
      {
        method:  'POST',
        headers: {
          'apikey':        SCMS_CONFIG.SUPABASE_ANON,
          'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
          'Content-Type':  'image/jpeg',
        },
        body: blob,
      }
    );
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(`Photo upload failed (${resp.status}): ${t.slice(0, 200)}`);
    }
    return `${SCMS_CONFIG.SUPABASE_URL}/storage/v1/object/public/student-photos/${path}?t=${Date.now()}`;
  },

  async setStudentPhoto(studentId, photoUrl) {
    return _webRpc('rpc_set_student_photo', {
      p_session_token: getWebSession()?.session_token,
      p_student_id: studentId,
      p_photo_url: photoUrl,
    });
  },
  /** Edit / update an existing student.
   *  Backend has no `update_student` TWA route yet — we PATCH Supabase directly
   *  (allowed by RLS for authenticated reads). For best results, replicate
   *  fields the bot's `/editstudent` wizard supports. */

  async updateStudent(studentId, patch) {
    if (window.APP.platform === 'web') return _webRpc('rpc_update_student', {
      p_session_token: getWebSession()?.session_token,
      p_student_id: studentId,
      p_name_local: patch.name_local || null,
      p_name_en:    patch.name_en,
      p_class:      patch.class,
      p_grade:      patch.grade || null,
      p_gender:     patch.gender || null,
      p_date_of_birth: patch.date_of_birth || null,
      p_home_color: patch.home_color || null,
      p_parent_name:  patch.parent_name || null,
      p_parent_phone: patch.parent_phone || null,
      p_parent_email: patch.parent_email || null,
    });

    // Whitelist fields that exist in the DB schema (matches Apply Student Edit)
    const allowed = ['name_en', 'name_mm', 'name_local', 'class', 'grade',
                     'gender', 'date_of_birth', 'parent_name', 'parent_phone',
                     'parent_tg_id', 'status', 'parent_email', 'home_color'];
    const clean = {};
    for (const k of allowed) if (k in patch) clean[k] = patch[k];
    clean.updated_at = new Date().toISOString();

    const url = `${SCMS_CONFIG.SUPABASE_URL}/rest/v1/students`
              + `?student_id=eq.${encodeURIComponent(studentId)}`
              + `&school_id=eq.${encodeURIComponent(window.APP.school_id)}`;
    const resp = await fetch(url, {
      method:  'PATCH',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SCMS_CONFIG.SUPABASE_ANON,
        'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
        'Prefer':        'return=representation',
      },
      body: JSON.stringify(clean),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`update_student failed (${resp.status}): ${t}`);
    }
    const rows = await resp.json();
    return { ok: true, success: true, student: rows[0] || null };
  },

  /** Soft-delete (status=Inactive) — admin only. */

  async deleteStudent(studentId) {
    if (window.APP.platform === 'web') return _webRpc('rpc_delete_student', {
      p_session_token: getWebSession()?.session_token,
      p_student_id: studentId,
    });

    const url = `${SCMS_CONFIG.SUPABASE_URL}/rest/v1/students`
              + `?student_id=eq.${encodeURIComponent(studentId)}`
              + `&school_id=eq.${encodeURIComponent(window.APP.school_id)}`;
    const resp = await fetch(url, {
      method:  'PATCH',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SCMS_CONFIG.SUPABASE_ANON,
        'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
      },
      body: JSON.stringify({
        status: 'Inactive',
        updated_at: new Date().toISOString(),
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`delete_student failed (${resp.status}): ${t}`);
    }
    return { ok: true, success: true };
  },

  /** Poll Supabase to see if the bot has captured the parent's Telegram ID
   *  (via the `/start parent_<STU-id>` deep link → `Update Parent TG ID` node).
   *  Returns { parent_tg_id, parent_name } once linked, else { parent_tg_id: null }. */

  async checkParentLink(studentId) {
    const url = `${SCMS_CONFIG.SUPABASE_URL}/rest/v1/students`
              + `?student_id=eq.${encodeURIComponent(studentId)}`
              + `&school_id=eq.${encodeURIComponent(window.APP.school_id)}`
              + `&select=parent_tg_id,parent_name`;
    const resp = await fetch(url, {
      headers: {
        'apikey':        SCMS_CONFIG.SUPABASE_ANON,
        'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
      },
    });
    if (!resp.ok) return { parent_tg_id: null };
    const rows = await resp.json();
    const r = rows[0] || {};
    const tg = r.parent_tg_id ? String(r.parent_tg_id).trim() : '';
    return {
      ok: true,
      parent_tg_id: tg || null,
      parent_name:  r.parent_name || null,
    };
  },

  // ─── BRANDING & PROFILE PHOTOS (web only — direct Supabase, no n8n) ──────
  // Images are stored in the public `school-assets` bucket; only the URL is
  // kept in the DB (schools.config_json.school_logo / school_cover and
  // teachers.photo_url), so bootstrap stays small.

  /** Upload an image Blob to school-assets, return its public URL.
   *  kind: 'logo' | 'cover' | 'teacher'. Every upload gets a unique path — never overwrites. */

  async getStudentById(studentId) {
    return _webRpc('rpc_get_student_by_id', {
      p_session_token: getWebSession()?.session_token,
      p_student_id: studentId,
    });
  },

  async getOrCreateStudentQr(studentId) {
    return _webRpc('rpc_get_or_create_student_qr', {
      p_session_token: getWebSession()?.session_token,
      p_student_id: studentId,
    });
  },

  async regenerateStudentQr(studentId) {
    return _webRpc('rpc_regenerate_student_qr', {
      p_session_token: getWebSession()?.session_token,
      p_student_id: studentId,
    });
  },

  // ─── HEALTH RECORDS ────────────────────────────────────────────────────

});

window.API = API;
