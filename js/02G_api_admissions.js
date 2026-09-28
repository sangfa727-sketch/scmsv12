/** SCMS v12 — 02G_api_admissions.js */
'use strict';
var API = window.API || {};
Object.assign(API, {
  async getAdmissions(filters = {}) {
      const res = await _webRpc('rpc_get_admissions', {
        p_session_token: _webSessionToken(),
        p_status: filters.status || null, p_class: filters.class || null,
      });
      return res.rows;
    },
  
  async getAdmissionDetail(id) {
      return _webRpc('rpc_get_admission_detail', { p_session_token: _webSessionToken(), p_id: id });
    },
  
  async createAdmission(data) {
      return _webRpc('rpc_create_admission', {
        p_session_token: _webSessionToken(),
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
        p_session_token: _webSessionToken(),
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
        p_session_token: _webSessionToken(),
        p_id: id, p_status: status,
        p_interview_date: extra.interview_date || null, p_notes: extra.notes || null,
      });
    },
  
  async deleteAdmission(id) {
      return _webRpc('rpc_delete_admission', { p_session_token: _webSessionToken(), p_id: id });
    },
  
  async convertAdmissionToStudent(id, data = {}) {
      return _webRpc('rpc_convert_admission_to_student', {
        p_session_token: _webSessionToken(),
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
        p_session_token: _webSessionToken(),
        p_id: id, p_photo_url: photoUrl,
      });
    },
  
  async linkAdmissionInvoice(id, invoiceId) {
      return _webRpc('rpc_link_admission_invoice', {
        p_session_token: _webSessionToken(),
        p_id: id, p_invoice_id: invoiceId,
      });
    },
  
  async activateStudent(studentId) {
      return _webRpc('rpc_activate_student', {
        p_session_token: _webSessionToken(),
        p_student_id: studentId,
      });
    },
});
window.API = API;
