/** SCMS v12 — 02K_api_health.js */
'use strict';
var API = window.API || {};
Object.assign(API, {
  async getHealthProfile(studentId) {
      return _webRpc('rpc_get_health_profile', {
        p_session_token: _webSessionToken(),
        p_student_id: studentId,
      });
    },
  
  async upsertHealthProfile(studentId, data) {
      return _webRpc('rpc_upsert_health_profile', {
        p_session_token: _webSessionToken(),
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
        p_session_token: _webSessionToken(),
        p_student_id: studentId,
        p_vaccine_name: data.vaccine_name,
        p_date_given: data.date_given || null,
        p_notes: data.notes || null,
      });
    },
  
  async deleteVaccination(id) {
      return _webRpc('rpc_delete_vaccination', { p_session_token: _webSessionToken(), p_id: id });
    },
  
  async addHealthVisit(studentId, data) {
      return _webRpc('rpc_add_health_visit', {
        p_session_token: _webSessionToken(),
        p_student_id: studentId,
        p_date: data.date || null,
        p_reason: data.reason,
        p_treatment: data.treatment || null,
        p_notes: data.notes || null,
      });
    },
  
  async deleteHealthVisit(id) {
      return _webRpc('rpc_delete_health_visit', { p_session_token: _webSessionToken(), p_id: id });
    },
  
    // ─── LIBRARY ────────────────────────────────────────────────────────────
});
window.API = API;
