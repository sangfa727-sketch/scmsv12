/** SCMS v12 — 02J_api_transport.js */
'use strict';
const API = window.API || {};
Object.assign(API, {
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
});
window.API = API;
