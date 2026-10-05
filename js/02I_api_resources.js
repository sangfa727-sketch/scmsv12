/** SCMS v12 — 02I_api_resources.js */
'use strict';
var API = window.API || {};
Object.assign(API, {
  async uploadSchoolAsset(kind, blob) {
      if (!['logo', 'cover', 'teacher'].includes(kind)) throw new Error('Invalid asset type');
      if (!blob || !blob.type || !/^image\\/(jpeg|png|webp)$/.test(blob.type)) {
        throw new Error('Unsupported image type');
      }
      if (blob.size <= 0 || blob.size > 5 * 1024 * 1024) {
        throw new Error('Image exceeds the 5 MB limit');
      }

      const form = new FormData();
      form.append('session_token', _webSessionToken());
      form.append('kind', kind);
      form.append('file', blob, 'asset');

      const resp = await fetch(
        `${SCMS_CONFIG.SUPABASE_URL}/functions/v1/upload-school-asset`,
        {
          method: 'POST',
          headers: {
            'apikey': SCMS_CONFIG.SUPABASE_ANON,
          },
          body: form,
        }
      );

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok || !data.url) {
        throw new Error(data.error || `Upload failed (${resp.status})`);
      }
      return data.url;
    },

    /** patch: { school_logo?: url|null, school_cover?: url|null } — admin only (server-enforced). */
  
  async setSchoolBranding(patch) {
      return _webRpc('rpc_set_school_branding', {
        p_session_token: _webSessionToken(),
        p_patch: patch,
      });
    },
  
    /** Own UI preferences (e.g. { sidebar_modules: ['grades','billing'] }). */
  
  async setTeacherPhoto(photoUrl) {
      return _webRpc('rpc_set_teacher_photo', {
        p_session_token: _webSessionToken(),
        p_photo_url: photoUrl,
      });
    },
  
    // ─── STAFF CHAT (native-only) ─────────────────────────────────────────────
    // Reads come straight from Supabase; writes go through the chat_send TWA
    // route (you must add this on the backend — see README).
  
    // ─── DAILY REPORTS ───────────────────────────────────────────────────────
  
  async getBooks() {
      const res = await _webRpc('rpc_get_books', { p_session_token: _webSessionToken() });
      return res.rows;
    },
  
  async addBook(data) {
      return _webRpc('rpc_add_book', {
        p_session_token: _webSessionToken(),
        p_title: data.title, p_author: data.author || null, p_isbn: data.isbn || null,
        p_category: data.category || null, p_total_copies: data.total_copies ?? 1,
        p_notes: data.notes || null,
      });
    },
  
  async updateBook(id, data) {
      return _webRpc('rpc_update_book', {
        p_session_token: _webSessionToken(),
        p_id: id, p_title: data.title || null, p_author: data.author ?? null, p_isbn: data.isbn ?? null,
        p_category: data.category ?? null, p_total_copies: data.total_copies ?? null, p_notes: data.notes ?? null,
      });
    },
  
  async deleteBook(id) {
      return _webRpc('rpc_delete_book', { p_session_token: _webSessionToken(), p_id: id });
    },
  
  async getBookCheckouts(bookId) {
      const res = await _webRpc('rpc_get_book_checkouts', { p_session_token: _webSessionToken(), p_book_id: bookId });
      return res.rows;
    },
  
  async checkoutBook(bookId, studentId, dueDate, notes) {
      return _webRpc('rpc_checkout_book', {
        p_session_token: _webSessionToken(),
        p_book_id: bookId, p_student_id: studentId, p_due_date: dueDate || null, p_notes: notes || null,
      });
    },
  
  async returnBook(checkoutId) {
      return _webRpc('rpc_return_book', { p_session_token: _webSessionToken(), p_checkout_id: checkoutId });
    },
  
  async getStudentCheckouts(studentId) {
      const res = await _webRpc('rpc_get_student_checkouts', { p_session_token: _webSessionToken(), p_student_id: studentId });
      return res.rows;
    },
  
    // ─── TRANSPORT ──────────────────────────────────────────────────────────
});
window.API = API;
