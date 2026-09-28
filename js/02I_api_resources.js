/** SCMS v12 — 02I_api_resources.js */
'use strict';
const API = window.API || {};
Object.assign(API, {
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
});
window.API = API;
