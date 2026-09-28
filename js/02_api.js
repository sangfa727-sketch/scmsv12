/**
 * SCMS v11 — 02_api.js
 * All data operations. Read = Supabase anon. Write = n8n TWA webhook.
 * Every call automatically includes school_id + teacher_id + platform from APP context.
 */

'use strict';


/** Call a Postgres RPC directly via PostgREST for web sessions.
 *  Throws on transport/HTTP error or on {ok:false} from the function,
 *  with e.duplicate/e.existing_student_id/etc. carried through when present. */
async function _webRpc(fnName, params) {
  const resp = await fetch(`${SCMS_CONFIG.SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method:  'POST',
    headers: {
      'apikey':        SCMS_CONFIG.SUPABASE_ANON,
      'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(params),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${txt.slice(0, 200)}`);
  }
  const result = await resp.json();
  if (!result || !result.ok) {
    const err = new Error(result?.message || result?.error || `${fnName} failed`);
    Object.assign(err, result || {});
    throw err;
  }
  return result;
}

const API = {

  // ─── BOOTSTRAP ───────────────────────────────────────────────────────────

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

    async saveAttendance(cls, date, records) {
    if (window.APP.platform === 'web') return _webRpc('rpc_save_attendance', {
      p_session_token: getWebSession()?.session_token,
      p_class: cls, p_date: date, p_records: records,
    });
    return twaPost('save_attendance', { class: cls, date, records });
  },

    async getAttendance(daysBack = 30) {
    if (window.APP.platform === 'web') {
      const res = await _webRpc('rpc_get_attendance', {
        p_session_token: getWebSession()?.session_token, p_days_back: daysBack,
      });
      return res.rows;
    }
    const since = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
    return sbQuery('attendance',
      `school_id=eq.${window.APP.school_id}&date=gte.${since}&order=date.desc,class`);
  },

  // ─── STUDENTS ────────────────────────────────────────────────────────────

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
  async uploadSchoolAsset(kind, blob) {
    const ext = blob.type === 'image/png' ? 'png' : 'jpg';
    const school = window.APP.school_id;
    let path;
    const uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (kind === 'teacher') path = `${school}/teachers/${window.APP.teacher_id}-${uid}.${ext}`;
    else                    path = `${school}/${kind}-${uid}.${ext}`;
    const resp = await fetch(
      `${SCMS_CONFIG.SUPABASE_URL}/storage/v1/object/school-assets/${path}`,
      {
        method:  'POST',
        headers: {
          'apikey':        SCMS_CONFIG.SUPABASE_ANON,
          'Authorization': `Bearer ${SCMS_CONFIG.SUPABASE_ANON}`,
          'Content-Type':  blob.type,
        },
        body: blob,
      }
    );
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(`Upload failed (${resp.status}): ${t.slice(0, 200)}`);
    }
    return `${SCMS_CONFIG.SUPABASE_URL}/storage/v1/object/public/school-assets/${path}?t=${Date.now()}`;
  },

  /** patch: { school_logo?: url|null, school_cover?: url|null } — admin only (server-enforced). */
  async setSchoolBranding(patch) {
    return _webRpc('rpc_set_school_branding', {
      p_session_token: getWebSession()?.session_token,
      p_patch: patch,
    });
  },

  /** Own UI preferences (e.g. { sidebar_modules: ['grades','billing'] }). */
  async setMyUiPrefs(patch) {
    return _webRpc('rpc_set_my_ui_prefs', {
      p_session_token: getWebSession()?.session_token,
      p_patch: patch,
    });
  },

  /** Sets the CURRENT teacher's own profile photo. */
  async setTeacherPhoto(photoUrl) {
    return _webRpc('rpc_set_teacher_photo', {
      p_session_token: getWebSession()?.session_token,
      p_photo_url: photoUrl,
    });
  },

  // ─── STAFF CHAT (native-only) ─────────────────────────────────────────────
  // Reads come straight from Supabase; writes go through the chat_send TWA
  // route (you must add this on the backend — see README).

  // ─── DAILY REPORTS ───────────────────────────────────────────────────────

    async saveDailyReport(data) {
    const date = data.date || new Date().toISOString().slice(0, 10);
    if (window.APP.platform === 'web') return _webRpc('rpc_save_daily_report', {
      p_session_token: getWebSession()?.session_token,
      p_student_id: data.student_id, p_name_en: data.name_en, p_class: data.class,
      p_date: date, p_meal: data.meal, p_nap_min: data.nap_min ?? null,
      p_mood: data.mood, p_behaviour_note: data.behaviour_note || null,
      p_toilet_ok: data.toilet_ok ?? null,
    });
    return twaPost('save_daily_report', { ...data, date });
  },

  async updateDailyReport(id, patch) {
    return twaPost('update_daily_report', { id, patch });
  },

  async deleteDailyReport(id) {
    return twaPost('delete_daily_report', { id });
  },

    async getDailyReports(daysBack = 7) {
    if (window.APP.platform === 'web') {
      const res = await _webRpc('rpc_get_daily_reports', {
        p_session_token: getWebSession()?.session_token, p_days_back: daysBack,
      });
      return res.rows;
    }
    const since = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
    return sbQuery('daily_reports',
      `school_id=eq.${window.APP.school_id}&date=gte.${since}&order=date.desc,name_en`);
  },

  // ─── HOMEWORK ────────────────────────────────────────────────────────────

   async saveHomework(data) {
    const date = data.date || new Date().toISOString().slice(0, 10);
    if (window.APP.platform === 'web') return _webRpc('rpc_save_homework', {
      p_session_token: getWebSession()?.session_token,
      p_class: data.class, p_subject: data.subject, p_type: data.type,
      p_description: data.description, p_lb_page: data.lb_page || null,
      p_wb_page: data.wb_page || null, p_due_date: data.due_date || null,
      p_date: date,
    });
    return twaPost('save_homework', {
      ...data,
      date,
      school_id:  window.APP.school_id,
      teacher_id: window.APP.teacher_id,
    });
  },

    async updateHomework(id, patch) {
    if (window.APP.platform === 'web') return _webRpc('rpc_update_homework', {
      p_session_token: getWebSession()?.session_token,
      p_id: id, p_subject: patch.subject, p_class: patch.class, p_type: patch.type,
      p_description: patch.description, p_lb_page: patch.lb_page || null,
      p_wb_page: patch.wb_page || null, p_due_date: patch.due_date || null,
    });
    return twaPost('update_homework', { id, patch });
  },

  async deleteHomework(id) {
    if (window.APP.platform === 'web') return _webRpc('rpc_delete_homework', {
      p_session_token: getWebSession()?.session_token,
      p_id: id,
    });
    return twaPost('delete_homework', { id });
  },
    async getHomework(daysBack = 30) {
    if (window.APP.platform === 'web') {
      const res = await _webRpc('rpc_get_homework', {
        p_session_token: getWebSession()?.session_token, p_days_back: daysBack,
      });
      return res.rows;
    }
    const since = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
    return sbQuery('homework_log',
      `school_id=eq.${window.APP.school_id}&date=gte.${since}&order=date.desc`);
  },

  // ─── INCIDENTS ───────────────────────────────────────────────────────────

  async saveIncident(data) {
    if (window.APP.platform === 'web') return _webRpc('rpc_save_incident', {
      p_session_token: getWebSession()?.session_token,
      p_student_id: data.student_id, p_name_en: data.name_en, p_class: data.class,
      p_type: data.type, p_severity: data.severity, p_description: data.description,
      p_action_taken: data.action_taken, p_parent_notified: !!data.parent_notified,
      p_date: data.date,
    });
    return twaPost('save_incident', {
      ...data,
      date: data.date || new Date().toISOString().slice(0, 10),
      school_id:  window.APP.school_id,
      teacher_id: window.APP.teacher_id,
    });
  },

  async updateIncident(id, patch) {
    if (window.APP.platform === 'web') return _webRpc('rpc_update_incident', {
      p_session_token: getWebSession()?.session_token,
      p_id: id, p_type: patch.type, p_severity: patch.severity,
      p_description: patch.description, p_action_taken: patch.action_taken,
      p_parent_notified: !!patch.parent_notified,
    });
    return twaPost('update_incident', { id, patch });
  },

  async deleteIncident(id) {
    if (window.APP.platform === 'web') return _webRpc('rpc_delete_incident', {
      p_session_token: getWebSession()?.session_token, p_id: id,
    });
    return twaPost('delete_incident', { id });
  },

    async getIncidents(daysBack = 30) {
    if (window.APP.platform === 'web') {
      const res = await _webRpc('rpc_get_incidents', {
        p_session_token: getWebSession()?.session_token, p_days_back: daysBack,
      });
      return res.rows;
    }
    const since = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
    return sbQuery('incidents',
      `school_id=eq.${window.APP.school_id}&date=gte.${since}&order=date.desc`);
  },

  // ─── LEAVE REQUESTS ──────────────────────────────────────────────────────
  // Manual approve/reject only — deliberately not wired to n8n/AI, since
  // that backend is not currently deployed. Approving auto-marks attendance
  // (handled server-side in rpc_decide_leave_request).

    async getLeaveRequests(status = null) {
    if (window.APP.platform === 'web') {
      const res = await _webRpc('rpc_get_leave_requests', {
        p_session_token: getWebSession()?.session_token, p_status: status,
      });
      return res.rows;
    }
    return twaPost('get_leave_requests', { status });
  },

    async decideLeaveRequest(id, decision, teacherNote = null) {
    if (window.APP.platform === 'web') return _webRpc('rpc_decide_leave_request', {
      p_session_token: getWebSession()?.session_token, p_id: id,
      p_decision: decision, p_teacher_note: teacherNote,
    });
    return twaPost('decide_leave_request', { id, decision, teacher_note: teacherNote });
  },

  // ─── PARENT COMMS ────────────────────────────────────────────────────────

    async sendParentComm(data) {
    if (window.APP.platform === 'web') return _webRpc('rpc_send_parent_comm', {
      p_session_token: getWebSession()?.session_token,
      p_student_id: data.student_id, p_name_en: data.name_en, p_class: data.class,
      p_type: data.type, p_message_preview: data.message_preview, p_date: data.date,
    });
    return twaPost('send_parent_comm', {
      ...data,
      school_id:  window.APP.school_id,
      teacher_id: window.APP.teacher_id,
    });
  },

  async updateParentComm(id, patch) {
    return twaPost('update_parent_comm', { id, patch });
  },

  async deleteParentComm(id) {
    if (window.APP.platform === 'web') return _webRpc('rpc_delete_parent_comm', {
      p_session_token: getWebSession()?.session_token, p_id: id,
    });
    return twaPost('delete_parent_comm', { id });
  },

    async getParentComms(daysBack = 30) {
    if (window.APP.platform === 'web') {
      const res = await _webRpc('rpc_get_parent_comms', {
        p_session_token: getWebSession()?.session_token, p_days_back: daysBack,
      });
      return res.rows;
    }
    const since = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
    return sbQuery('parent_comms',
      `school_id=eq.${window.APP.school_id}&date=gte.${since}&order=date.desc`);
  },

  // ─── TIMETABLE ───────────────────────────────────────────────────────────

    async saveTimetable(data) {
    if (window.APP.platform === 'web') return _webRpc('rpc_save_timetable', {
      p_session_token: getWebSession()?.session_token,
      p_day: data.day, p_period: data.period, p_start_time: data.start_time,
      p_class: data.class, p_subject: data.subject, p_room: data.room,
    });
    return twaPost('save_timetable', {
      ...data,
      school_id:  window.APP.school_id,
    });
  },

  async updateTimetable(id, patch) {
    if (window.APP.platform === 'web') return _webRpc('rpc_update_timetable', {
      p_session_token: getWebSession()?.session_token,
      p_id: id, p_day: patch.day, p_period: patch.period, p_start_time: patch.start_time,
      p_class: patch.class, p_subject: patch.subject, p_room: patch.room,
    });
    return twaPost('update_timetable', { id, patch });
  },

  async deleteTimetable(id) {
    if (window.APP.platform === 'web') return _webRpc('rpc_delete_timetable', {
      p_session_token: getWebSession()?.session_token, p_id: id,
    });
    return twaPost('delete_timetable', { id });
  },

    async getTimetable() {
    if (window.APP.platform === 'web') {
      const res = await _webRpc('rpc_get_timetable', { p_session_token: getWebSession()?.session_token });
      return res.rows;
    }
    return sbQuery('timetable',
      `school_id=eq.${window.APP.school_id}&order=day,period`);
  },

  // ─── MONTHLY SUMMARY ─────────────────────────────────────────────────────

    async getMonthlySummary(yearMonth) {
    const ym = yearMonth || new Date().toISOString().slice(0, 7);
    if (window.APP.platform === 'web') {
      const res = await _webRpc('rpc_get_monthly_summary', {
        p_session_token: getWebSession()?.session_token, p_year_month: ym,
      });
      return res.rows;
    }
    return sbQuery('monthly_summary',
      `school_id=eq.${window.APP.school_id}&year_month=eq.${ym}&order=class,name_en`);
  },

  // ─── SCHOOL CONFIG ───────────────────────────────────────────────────────

    async updateSchoolConfig(patch) {
    if (window.APP.platform === 'web') return _webRpc('rpc_update_school_config_web', {
      p_session_token: getWebSession()?.session_token,
      p_patch: patch,
    });
    return twaPost('update_school_config', { patch });
  },

    // ─── GRADING & ASSESSMENT (web only for now — new feature, not on n8n) ────

    async getSubjects() {
    const res = await _webRpc('rpc_get_subjects', { p_session_token: getWebSession()?.session_token });
    return res.rows;
  },

  async addSubject(name, code, color) {
    return _webRpc('rpc_add_subject', {
      p_session_token: getWebSession()?.session_token,
      p_subject_name: name, p_subject_code: code || null, p_subject_color: color || null,
    });
  },

    async getTerms() {
    const res = await _webRpc('rpc_get_terms', { p_session_token: getWebSession()?.session_token });
    return res.rows;
  },

  async addTerm(data) {
    return _webRpc('rpc_add_term', {
      p_session_token:  getWebSession()?.session_token,
      p_academic_year:  data.academic_year || null,
      p_term_name:      data.term_name,
      p_term_order:     data.term_order || null,
      p_start_date:     data.start_date || null,
      p_end_date:       data.end_date || null,
      p_is_current:     !!data.is_current,
    });
  },

    async getAssessments(filters = {}) {
    const res = await _webRpc('rpc_get_assessments', {
      p_session_token: getWebSession()?.session_token,
      p_class:      filters.class || null,
      p_subject_id: filters.subject_id || null,
      p_term_id:    filters.term_id || null,
    });
    return res.rows;
  },

  async createAssessment(data) {
    return _webRpc('rpc_create_assessment', {
      p_session_token: getWebSession()?.session_token,
      p_term_id:    data.term_id || null,
      p_subject_id: data.subject_id || null,
      p_class:      data.class,
      p_title:      data.title,
      p_type:       data.type,
      p_max_score:  data.max_score,
      p_weight:     data.weight,
      p_date:       data.date,
    });
  },

  async deleteAssessment(id) {
    return _webRpc('rpc_delete_assessment', {
      p_session_token: getWebSession()?.session_token,
      p_id: id,
    });
  },

    async getGrades(assessmentId) {
    const res = await _webRpc('rpc_get_grades', {
      p_session_token: getWebSession()?.session_token,
      p_assessment_id: assessmentId,
    });
    return res.rows;
  },

  async saveGrades(assessmentId, records) {
    return _webRpc('rpc_save_grades', {
      p_session_token: getWebSession()?.session_token,
      p_assessment_id: assessmentId,
      p_records:       records,
    });
  },
    async getReportCard(termId, cls) {
    return _webRpc('rpc_get_report_card', {
      p_session_token: getWebSession()?.session_token,
      p_term_id: termId,
      p_class: cls,
    });
  },
  // ─── FEE / BILLING (web only for now — new feature, not on n8n) ──────────

  async getFeeItems() {
    const res = await _webRpc('rpc_get_fee_items', { p_session_token: getWebSession()?.session_token });
    return res.rows;
  },

  async addFeeItem(data) {
    return _webRpc('rpc_add_fee_item', {
      p_session_token: getWebSession()?.session_token,
      p_name: data.name, p_category: data.category, p_default_amount: data.default_amount,
      p_is_recurring: !!data.is_recurring,
    });
  },

  async updateFeeItem(id, data) {
    return _webRpc('rpc_update_fee_item', {
      p_session_token: getWebSession()?.session_token,
      p_id: id, p_name: data.name ?? null, p_category: data.category ?? null,
      p_default_amount: data.default_amount ?? null, p_is_recurring: data.is_recurring ?? null,
      p_is_active: data.is_active ?? null,
    });
  },

  async deleteFeeItem(id) {
    return _webRpc('rpc_delete_fee_item', { p_session_token: getWebSession()?.session_token, p_id: id });
  },

  async getInvoices(filters = {}) {
    const res = await _webRpc('rpc_get_invoices', {
      p_session_token: getWebSession()?.session_token,
      p_class: filters.class || null, p_status: filters.status || null, p_term_id: filters.term_id || null,
    });
    return res.rows;
  },

  async getInvoiceDetail(id) {
    return _webRpc('rpc_get_invoice_detail', { p_session_token: getWebSession()?.session_token, p_id: id });
  },

  async createInvoice(data) {
    return _webRpc('rpc_create_invoice', {
      p_session_token: getWebSession()?.session_token,
      p_student_id: data.student_id, p_term_id: data.term_id || null, p_due_date: data.due_date || null,
      p_notes: data.notes || null, p_items: data.items,
    });
  },

  async deleteInvoice(id) {
    return _webRpc('rpc_delete_invoice', { p_session_token: getWebSession()?.session_token, p_id: id });
  },

  async recordPayment(invoiceId, data) {
    return _webRpc('rpc_record_payment', {
      p_session_token: getWebSession()?.session_token,
      p_invoice_id: invoiceId, p_amount: data.amount, p_payment_date: data.payment_date || null,
      p_method: data.method || 'Cash', p_notes: data.notes || null,
    });
  },

  async deletePayment(id) {
    return _webRpc('rpc_delete_payment', { p_session_token: getWebSession()?.session_token, p_payment_id: id });
  },

  async getBillingSummary(filters = {}) {
    return _webRpc('rpc_get_billing_summary', {
      p_session_token: getWebSession()?.session_token,
      p_class: filters.class || null, p_term_id: filters.term_id || null,
    });
  },

  // ─── ADMISSIONS (web only for now — new feature, not on n8n) ─────────────

  async getAdmissions(filters = {}) {
    const res = await _webRpc('rpc_get_admissions', {
      p_session_token: getWebSession()?.session_token,
      p_status: filters.status || null, p_class: filters.class || null,
    });
    return res.rows;
  },

  async getAdmissionDetail(id) {
    return _webRpc('rpc_get_admission_detail', { p_session_token: getWebSession()?.session_token, p_id: id });
  },

  async createAdmission(data) {
    return _webRpc('rpc_create_admission', {
      p_session_token: getWebSession()?.session_token,
      p_applicant_name_en: data.applicant_name_en, p_applicant_name_local: data.applicant_name_local || null,
      p_date_of_birth: data.date_of_birth || null, p_gender: data.gender || null,
      p_desired_class: data.desired_class || null, p_parent_name: data.parent_name || null,
      p_parent_phone: data.parent_phone || null, p_parent_email: data.parent_email || null,
      p_application_date: data.application_date || null, p_source: data.source || null,
      p_notes: data.notes || null,
    });
  },

  async updateAdmission(id, data) {
    return _webRpc('rpc_update_admission', {
      p_session_token: getWebSession()?.session_token,
      p_id: id,
      p_applicant_name_en: data.applicant_name_en || null, p_applicant_name_local: data.applicant_name_local || null,
      p_date_of_birth: data.date_of_birth || null, p_gender: data.gender || null,
      p_desired_class: data.desired_class || null, p_parent_name: data.parent_name || null,
      p_parent_phone: data.parent_phone || null, p_parent_email: data.parent_email || null,
      p_source: data.source || null, p_notes: data.notes || null,
    });
  },

  async updateAdmissionStatus(id, status, extra = {}) {
    return _webRpc('rpc_update_admission_status', {
      p_session_token: getWebSession()?.session_token,
      p_id: id, p_status: status,
      p_interview_date: extra.interview_date || null, p_notes: extra.notes || null,
    });
  },

  async deleteAdmission(id) {
    return _webRpc('rpc_delete_admission', { p_session_token: getWebSession()?.session_token, p_id: id });
  },

  async convertAdmissionToStudent(id, data = {}) {
    return _webRpc('rpc_convert_admission_to_student', {
      p_session_token: getWebSession()?.session_token,
      p_id: id, p_class: data.class || null, p_home_color: data.home_color || null,
      p_status: data.status || 'Pending',
    });
  },

  async uploadAdmissionPhoto(admissionId, file) {
    const blob = await _prepStudentPhoto(file);
    const path = `${window.APP.school_id}/admissions/${admissionId}-${Date.now().toString(36)}.jpg`;
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

  async setAdmissionPhoto(id, photoUrl) {
    return _webRpc('rpc_set_admission_photo', {
      p_session_token: getWebSession()?.session_token,
      p_id: id, p_photo_url: photoUrl,
    });
  },

  async linkAdmissionInvoice(id, invoiceId) {
    return _webRpc('rpc_link_admission_invoice', {
      p_session_token: getWebSession()?.session_token,
      p_id: id, p_invoice_id: invoiceId,
    });
  },

  async activateStudent(studentId) {
    return _webRpc('rpc_activate_student', {
      p_session_token: getWebSession()?.session_token,
      p_student_id: studentId,
    });
  },

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

  async getHealthProfile(studentId) {
    return _webRpc('rpc_get_health_profile', {
      p_session_token: getWebSession()?.session_token,
      p_student_id: studentId,
    });
  },

  async upsertHealthProfile(studentId, data) {
    return _webRpc('rpc_upsert_health_profile', {
      p_session_token: getWebSession()?.session_token,
      p_student_id: studentId,
      p_blood_type: data.blood_type || null,
      p_allergies: data.allergies || null,
      p_medical_conditions: data.medical_conditions || null,
      p_medications: data.medications || null,
      p_emergency_contact_name: data.emergency_contact_name || null,
      p_emergency_contact_phone: data.emergency_contact_phone || null,
      p_doctor_name: data.doctor_name || null,
      p_doctor_phone: data.doctor_phone || null,
      p_notes: data.notes || null,
    });
  },

  async addVaccination(studentId, data) {
    return _webRpc('rpc_add_vaccination', {
      p_session_token: getWebSession()?.session_token,
      p_student_id: studentId,
      p_vaccine_name: data.vaccine_name,
      p_date_given: data.date_given || null,
      p_notes: data.notes || null,
    });
  },

  async deleteVaccination(id) {
    return _webRpc('rpc_delete_vaccination', { p_session_token: getWebSession()?.session_token, p_id: id });
  },

  async addHealthVisit(studentId, data) {
    return _webRpc('rpc_add_health_visit', {
      p_session_token: getWebSession()?.session_token,
      p_student_id: studentId,
      p_date: data.date || null,
      p_reason: data.reason,
      p_treatment: data.treatment || null,
      p_notes: data.notes || null,
    });
  },

  async deleteHealthVisit(id) {
    return _webRpc('rpc_delete_health_visit', { p_session_token: getWebSession()?.session_token, p_id: id });
  },

  // ─── LIBRARY ────────────────────────────────────────────────────────────

  async getBooks() {
    const res = await _webRpc('rpc_get_books', { p_session_token: getWebSession()?.session_token });
    return res.rows;
  },

  async addBook(data) {
    return _webRpc('rpc_add_book', {
      p_session_token: getWebSession()?.session_token,
      p_title: data.title, p_author: data.author || null, p_isbn: data.isbn || null,
      p_category: data.category || null, p_total_copies: data.total_copies ?? 1,
      p_notes: data.notes || null,
    });
  },

  async updateBook(id, data) {
    return _webRpc('rpc_update_book', {
      p_session_token: getWebSession()?.session_token,
      p_id: id, p_title: data.title || null, p_author: data.author ?? null, p_isbn: data.isbn ?? null,
      p_category: data.category ?? null, p_total_copies: data.total_copies ?? null, p_notes: data.notes ?? null,
    });
  },

  async deleteBook(id) {
    return _webRpc('rpc_delete_book', { p_session_token: getWebSession()?.session_token, p_id: id });
  },

  async getBookCheckouts(bookId) {
    const res = await _webRpc('rpc_get_book_checkouts', { p_session_token: getWebSession()?.session_token, p_book_id: bookId });
    return res.rows;
  },

  async checkoutBook(bookId, studentId, dueDate, notes) {
    return _webRpc('rpc_checkout_book', {
      p_session_token: getWebSession()?.session_token,
      p_book_id: bookId, p_student_id: studentId, p_due_date: dueDate || null, p_notes: notes || null,
    });
  },

  async returnBook(checkoutId) {
    return _webRpc('rpc_return_book', { p_session_token: getWebSession()?.session_token, p_checkout_id: checkoutId });
  },

  async getStudentCheckouts(studentId) {
    const res = await _webRpc('rpc_get_student_checkouts', { p_session_token: getWebSession()?.session_token, p_student_id: studentId });
    return res.rows;
  },

  // ─── TRANSPORT ──────────────────────────────────────────────────────────

  async getRoutes() {
    const res = await _webRpc('rpc_get_routes', { p_session_token: getWebSession()?.session_token });
    return res.rows;
  },

  async addRoute(data) {
    return _webRpc('rpc_add_route', {
      p_session_token: getWebSession()?.session_token,
      p_route_name: data.route_name, p_driver_name: data.driver_name || null,
      p_driver_phone: data.driver_phone || null, p_vehicle_info: data.vehicle_info || null,
      p_notes: data.notes || null,
    });
  },

  async updateRoute(id, data) {
    return _webRpc('rpc_update_route', {
      p_session_token: getWebSession()?.session_token,
      p_id: id, p_route_name: data.route_name || null, p_driver_name: data.driver_name ?? null,
      p_driver_phone: data.driver_phone ?? null, p_vehicle_info: data.vehicle_info ?? null, p_notes: data.notes ?? null,
    });
  },

  async deleteRoute(id) {
    return _webRpc('rpc_delete_route', { p_session_token: getWebSession()?.session_token, p_id: id });
  },

  async getRouteDetail(routeId) {
    return _webRpc('rpc_get_route_detail', { p_session_token: getWebSession()?.session_token, p_route_id: routeId });
  },

  async assignStudentTransport(studentId, data) {
    return _webRpc('rpc_assign_student_transport', {
      p_session_token: getWebSession()?.session_token,
      p_student_id: studentId, p_route_id: data.route_id,
      p_pickup_stop: data.pickup_stop || null, p_pickup_time: data.pickup_time || null,
      p_dropoff_time: data.dropoff_time || null, p_notes: data.notes || null,
    });
  },

  async removeStudentTransport(studentId) {
    return _webRpc('rpc_remove_student_transport', { p_session_token: getWebSession()?.session_token, p_student_id: studentId });
  },

  async getStudentTransport(studentId) {
    return _webRpc('rpc_get_student_transport', { p_session_token: getWebSession()?.session_token, p_student_id: studentId });
  },

  // ─── STAFF CHAT (native app only — hidden in TWA) ────────────────────────
  // Reads/writes go through session-checked RPCs (rpc_get_chat_messages / rpc_send_chat_message).

  async getChatMessages(channel = 'staff', limit = 50) {
    try {
      const res = await _webRpc('rpc_get_chat_messages', {
        p_session_token: getWebSession()?.session_token,
        p_channel: channel, p_limit: Number(limit) || 50,
      });
      return Array.isArray(res.rows) ? res.rows : [];   // oldest first
    } catch (err) {
      console.warn('[chat] read failed', err);
      return [];
    }
  },

  async sendChatMessage(channel, text) {
    // school/teacher identity comes from the session on the server
    return _webRpc('rpc_send_chat_message', {
      p_session_token: getWebSession()?.session_token,
      p_channel: channel, p_text: text,
    });
  },

  // ─── REFRESH ALL ─────────────────────────────────────────────────────────

  async refreshAll() {
    const [students, attendance, dailyReports, homework, parentComms, incidents, timetable, pendingLeave] =
      await Promise.allSettled([
        API.getStudents(),
        API.getAttendance(30),
        API.getDailyReports(30),
        API.getHomework(30),
        API.getParentComms(30),
        API.getIncidents(30),
        API.getTimetable(),
        API.getLeaveRequests('Pending'),
      ]);

    if (students.status     === 'fulfilled') window.APP.students     = students.value     || [];
    if (attendance.status   === 'fulfilled') window.APP.attendance   = attendance.value   || [];
    if (dailyReports.status === 'fulfilled') window.APP.dailyReports = dailyReports.value || [];
    if (homework.status     === 'fulfilled') window.APP.homework     = homework.value     || [];
    if (parentComms.status  === 'fulfilled') window.APP.parentComms  = parentComms.value  || [];
    if (incidents.status    === 'fulfilled') window.APP.incidents    = incidents.value    || [];
    if (timetable.status    === 'fulfilled') window.APP.timetable    = timetable.value    || [];
    // Sidebar badge only — the Leave Requests page itself always re-fetches
    // its own full list, this is just so the count shows before you visit it.
    window.APP.pendingLeaveCount = pendingLeave.status === 'fulfilled' ? (pendingLeave.value?.length || 0) : 0;

    return window.APP;
  },
};

window.API = API;


/** Resize/compress any picked image to a ≤640px square JPEG (typically 30–90 KB). */
async function _prepStudentPhoto(file) {
  try {
    return await _brandImageToBlob(file, { maxW: 640, maxH: 640, crop: true, keepAlpha: false });
  } catch (e) {
    throw new Error('Could not read that image — please choose a JPG or PNG');
  }
}
