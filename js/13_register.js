/**
 * SCMS v11 — 13_register.js
 * Registration flows handled via Telegram bot — no frontend registration UI needed.
 * Kept for compatibility with existing module loading order.
 */

'use strict';

window.openRegisterModal = function() {
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${t('reg.title')}</h3>
      <p style="color:var(--muted);font-size:14px;line-height:1.6">
        ${t('reg.instructions')}
      </p>
      <div class="cmd-block"><code>/register_school</code> — ${t('reg.createSchool')}</div>
      <div class="cmd-block"><code>/register_teacher</code> — ${t('reg.joinSchool')}</div>
      <p style="color:var(--muted);font-size:13px;margin-top:12px">
        ${t('reg.approvedNote')}
      </p>
      <button class="btn-secondary mt16" onclick="closeModal()">${t('reg.gotIt')}</button>
    </div>`);
};
