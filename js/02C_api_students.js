/**
 * SCMS v12 — 02C_api_students.js
 * Domain API module.
 * 
 * This file extends the shared window.API surface without changing
 * existing callers such as API.getStudents().
 */

'use strict';

var API = window.API || {};

async function _nativeStudentRpc(name, payload) {
  const session = window.getSavedSession?.();
  if (!session?.token) throw new Error('A valid Telegram school session is required');
  const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SCMS_CONFIG.SUPABASE_ANON,
      'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
    },
    body: JSON.stringify({ ...payload, p_token: session.token }),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok || !result?.ok) {
    throw new Error(result?.message || result?.error || `Student operation failed (${resp.status})`);
  }
  return result;
}

Object.assign(API, {

  async getStudents() {
    if (window.APP.platform === 'web') {
      const res = await _webRpc('rpc_get_students', { p_session_token: _webSessionToken() });
      return res.rows;
    }
    return twaPost('get_students', {
      school_id: window.APP.school_id,
      status: 'Active',
      order: 'class,name_en',
    });
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
      const result = await _webRpc('rpc_register_student', {
        p_session_token: sess.session_token,
        p_name_local: data.name_local || null,
        p_name_en: data.name_en,
        p_class: data.class,
        p_grade: data.grade || null,
        p_gender: data.gender || null,
        p_date_of_birth: data.date_of_birth || null,
        p_home_color: data.home_color || null,
        p_parent_name: data.parent_name || null,
        p_parent_phone: data.parent_phone || null,
        p_parent_email: data.parent_email || null,
      });
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
    // Student photos must use the trusted Edge Function: direct anonymous
    // writes to the public Storage bucket are intentionally disabled.
    const sessionToken = window.APP.platform === 'web'
      ? _webSessionToken()
      : (window.getSavedSession?.()?.token || '');
    if (!sessionToken) throw new Error('A valid school session is required to upload a student photo');

    // Phone photos are often HEIC or > 3 MB; normalize to a small square JPEG.
    const blob = await _prepStudentPhoto(file);
    const form = new FormData();
    form.append('session_token', sessionToken);
    form.append('kind', 'student');
    form.append('student_id', studentId);
    form.append('file', blob, 'student.jpg');

    const resp = await fetch(
      `${SCMS_CONFIG.SUPABASE_URL}/functions/v1/upload-school-asset`,
      {
        method: 'POST',
        headers: {
          'apikey': SCMS_CONFIG.SUPABASE_ANON,
          'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
        },
        body: form,
      }
    );
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok || !result?.ok || !result?.url) {
      throw new Error(result?.error || `Photo upload failed (${resp.status})`);
    }
    return result.url;
  },

  async setStudentPhoto(studentId, photoUrl) {
    return _webRpc('rpc_set_student_photo', {
      p_session_token: _webSessionToken(),
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
      p_session_token: _webSessionToken(),
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

    // Native/TWA clients cannot write directly to public.students with the anon key.
    // Route mutations through the tenant-scoped RPC and the linked Telegram session.
    const allowed = ['name_en', 'name_mm', 'name_local', 'class', 'grade',
                     'gender', 'date_of_birth', 'parent_name', 'parent_phone',
                     'parent_phone2', 'parent_email', 'home_color'];
    const clean = {};
    for (const k of allowed) if (k in patch) clean[k] = patch[k];
    return _nativeStudentRpc('rpc_app_update_student', {
      p_student_id: studentId,
      p_patch: clean,
    });
  },

  /** Soft-delete (status=Inactive) — admin only. */

  async reactivateStudent(studentId) {
    return _webRpc('rpc_reactivate_student', { p_session_token: _webSessionToken(), p_student_id: studentId });
  },

  async deleteStudent(studentId) {
    if (window.APP.platform === 'web') return _webRpc('rpc_deactivate_student', {
      p_session_token: _webSessionToken(),
      p_student_id: studentId,
    });

    return _nativeStudentRpc('rpc_app_delete_student', {
      p_student_id: studentId,
    });
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

  // ─── BRANDING & PROFILE PHOTOS (web only — secure Edge Function upload) ──
  // Upload authorization is enforced server-side using the existing app web
  // session token. The browser never receives a service-role credential.
  async uploadSchoolAsset(kind, blob) {
    const allowed = ['logo', 'cover', 'teacher'];
    if (!allowed.includes(kind)) throw new Error('Invalid asset type');
    if (!(blob instanceof Blob) || blob.size <= 0) throw new Error('Invalid image');
    if (blob.size > 5 * 1024 * 1024) throw new Error('Image is too large');
    if (!/^image\/(jpeg|png|webp)$/i.test(blob.type || '')) {
      throw new Error('Unsupported image type');
    }

    const form = new FormData();
    form.append('session_token', _webSessionToken());
    form.append('kind', kind);
    form.append('file', blob, `scms-${kind}.${blob.type === 'image/png' ? 'png' : 'jpg'}`);

    const resp = await fetch(
      `${SCMS_CONFIG.SUPABASE_URL}/functions/v1/upload-school-asset`,
      {
        method: 'POST',
        headers: { 'apikey': SCMS_CONFIG.SUPABASE_ANON },
        body: form,
      }
    );
    const body = await resp.text().catch(() => '');
    let data = null;
    try { data = body ? JSON.parse(body) : null; } catch (_) {}
    if (!resp.ok || !data?.url) {
      throw new Error(data?.error || `Asset upload failed (${resp.status})`);
    }
    return data.url;
  },

  // ─── BRANDING & PROFILE PHOTOS (web only — direct Supabase, no n8n) ──────
  // Images are stored in the public `school-assets` bucket; only the URL is
  // kept in the DB (schools.config_json.school_logo / school_cover and
  // teachers.photo_url), so bootstrap stays small.

  /** Upload an image Blob to school-assets, return its public URL.
   *  kind: 'logo' | 'cover' | 'teacher'. Every upload gets a unique path — never overwrites. */

  async updateStudentParent(studentId, data) {
    if (window.APP.platform !== 'web') {
      return _nativeStudentRpc('rpc_app_update_student', {
        p_student_id: studentId,
        p_patch: {
          parent_name: data.parent_name || null,
          parent_phone: data.parent_phone || null,
          parent_phone2: data.parent_phone2 || null,
          parent_email: data.parent_email || null,
        },
      });
    }
    return _webRpc('rpc_update_student_parent', {
      p_session_token: _webSessionToken(),
      p_student_id: studentId,
      p_parent_name: data.parent_name || null,
      p_parent_phone: data.parent_phone || null,
      p_parent_phone2: data.parent_phone2 || null,
      p_parent_email: data.parent_email || null,
    });
  },

  async getStudentHistory(studentId, limit = 50) {
    return _webRpc('rpc_get_student_history', {
      p_session_token: _webSessionToken(),
      p_student_id: studentId,
      p_limit: limit,
    });
  },

  async getStudentById(studentId) {
    return _webRpc('rpc_get_student_by_id', {
      p_session_token: _webSessionToken(),
      p_student_id: studentId,
    });
  },

  async getOrCreateStudentQr(studentId) {
    return _webRpc('rpc_get_or_create_student_qr', {
      p_session_token: _webSessionToken(),
      p_student_id: studentId,
    });
  },

  async regenerateStudentQr(studentId) {
    return _webRpc('rpc_regenerate_student_qr', {
      p_session_token: _webSessionToken(),
      p_student_id: studentId,
    });
  },

  // ─── HEALTH RECORDS ────────────────────────────────────────────────────

});

window.API = API;
