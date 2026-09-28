/** SCMS v12 — 02F_api_billing.js */
'use strict';
var API = window.API || {};
Object.assign(API, {
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
});
window.API = API;
