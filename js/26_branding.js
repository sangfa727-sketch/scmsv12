/**
 * SCMS v11 — 26_branding.js
 * School logo, school cover photo (Facebook/YouTube-style banner) and each
 * user's own profile photo.
 *
 *   • Files go to the public `school-assets` Storage bucket; only the URL is
 *     saved in the DB → no n8n involved.
 *   • Logo + cover: admin only (enforced server-side by rpc_set_school_branding).
 *   • Profile photo: every logged-in teacher/role sets their OWN photo
 *     (rpc_set_teacher_photo).
 */

'use strict';

const _BRAND_KINDS = {
  logo: {
    title: 'School logo',
    subtitle: 'Shown in the sidebar, app header and More page.',
    adminOnly: true, frame: 'square', maxW: 256, maxH: 256, crop: false, keepAlpha: true,
    tip: 'Use a square image — PNG with a transparent background works best. It is auto-resized to 256×256.',
  },
  cover: {
    title: 'Cover photo',
    subtitle: 'Banner behind the school logo at the top of the sidebar.',
    adminOnly: true, frame: 'wide', maxW: 1200, maxH: 400, crop: true, keepAlpha: false,
    tip: 'Use a wide image (about 3:1). It is auto-cropped from the centre to 1200×400.',
  },
  photo: {
    title: 'My profile photo',
    subtitle: 'Shown in the sidebar and on your profile card.',
    adminOnly: false, frame: 'round', maxW: 320, maxH: 320, crop: true, keepAlpha: false,
    tip: 'A clear, front-facing photo works best. It is auto-cropped to a square.',
  },
};

const _BRAND_MAX_BYTES = 8 * 1024 * 1024; // raw pick limit; output is resized far smaller

/** File → resized Blob. crop=true centre-crops to maxW:maxH aspect; crop=false fits inside. */
function _brandImageToBlob(file, { maxW, maxH, crop, keepAlpha }) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      let sx = 0, sy = 0, sw = img.width, sh = img.height, dw, dh;
      if (crop) {
        const target = maxW / maxH, have = sw / sh;
        if (have > target) { sw = Math.round(sh * target); sx = Math.round((img.width - sw) / 2); }
        else               { sh = Math.round(sw / target); sy = Math.round((img.height - sh) / 2); }
        const scale = Math.min(1, maxW / sw);
        dw = Math.round(sw * scale); dh = Math.round(sh * scale);
      } else {
        const scale = Math.min(maxW / sw, maxH / sh, 1);
        dw = Math.round(sw * scale); dh = Math.round(sh * scale);
      }
      const c = document.createElement('canvas');
      c.width = dw; c.height = dh;
      const ctx = c.getContext('2d');
      const asPng = keepAlpha && /png|webp/i.test(file.type);
      if (!asPng) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dw, dh); }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
      c.toBlob(
        b => b ? resolve(b) : reject(new Error('Could not process image')),
        asPng ? 'image/png' : 'image/jpeg',
        0.88
      );
    };
    img.src = url;
  });
}

function _brandCurrent(kind) {
  const A = window.APP, cfg = A.config || {};
  if (kind === 'logo')  return A.school_logo  || cfg.school_logo  || '';
  if (kind === 'cover') return A.school_cover || cfg.school_cover || '';
  return A.teacher_photo_url || '';
}

function _brandPreviewHtml(kind, url) {
  const A = window.APP;
  if (url) return `<img src="${esc(url)}" alt="">`;
  const letter = kind === 'photo' ? (A.teacher_name || '?')[0] : (A.school_name || 'S')[0];
  return `<div class="brand-preview-placeholder">${kind === 'cover' ? '🌄' : esc(letter)}</div>`;
}

function _brandRefreshViews() {
  try { renderSidebar(); }        catch (e) {}
  try { renderMore(); }           catch (e) {}
  try { _applyLogoToHeader(); }   catch (e) {}
}

window.openBrandingModal = function (kind) {
  const K = _BRAND_KINDS[kind];
  if (!K) return;
  if (K.adminOnly && !window.APP.is_admin) { showToast(t('branding.adminOnly')); return; }
  if (window.APP.platform !== 'web') { showToast(t('modules.needWeb')); return; }

  const cur = _brandCurrent(kind);
  openModal(`
    <div class="modal-sheet" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <h3 class="modal-title">${esc(K.title)}</h3>
      <p class="modal-subtitle">${esc(K.subtitle)}</p>

      <div class="brand-preview brand-preview-${K.frame}" id="brandPreview">${_brandPreviewHtml(kind, cur)}</div>

      <input type="file" id="brandFileInput" accept="image/png,image/jpeg,image/webp" style="display:none">
      <div class="logo-actions">
        <button class="btn-secondary" id="btnBrandPick">${t('branding.chooseImage')}</button>
        ${cur ? `<button class="btn-danger" id="btnBrandRemove">${t('picker.remove')}</button>` : ''}
      </div>

      <div class="info-tip" style="margin-top:14px">
        <span class="info-tip-icon">💡</span><div>${esc(K.tip)}</div>
      </div>

      <div id="brandStatus" class="brand-status" style="display:none"></div>

      <div class="modal-actions" style="margin-top:18px">
        <button class="btn-secondary" onclick="closeModal()">${t('common.done')}</button>
      </div>
    </div>`);

  const picker = document.getElementById('brandFileInput');
  document.getElementById('btnBrandPick').onclick = () => picker.click();
  picker.onchange = e => _brandHandlePick(kind, e.target.files && e.target.files[0]);
  const rm = document.getElementById('btnBrandRemove');
  if (rm) rm.onclick = () => showConfirm(
    'Remove?', `Remove the ${K.title.toLowerCase()}?`, 'Remove',
    () => _brandSave(kind, null), { danger: true });
};

function _brandStatus(msg, ok) {
  const el = document.getElementById('brandStatus');
  if (!el) return;
  el.style.display = msg ? 'block' : 'none';
  el.textContent = msg || '';
  el.className = 'brand-status' + (ok === true ? ' ok' : ok === false ? ' err' : '');
}

async function _brandHandlePick(kind, file) {
  if (!file) return;
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { showToast(t('branding.imageTypes')); return; }
  if (file.size > _BRAND_MAX_BYTES) { showToast(t('branding.imageTooBig')); return; }
  try {
    _brandStatus('Processing…');
    const blob = await _brandImageToBlob(file, _BRAND_KINDS[kind]);
    const prev = document.getElementById('brandPreview');
    if (prev) prev.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="">`;
    await _brandSave(kind, blob);
  } catch (err) {
    console.error('[branding] failed', err);
    _brandStatus(err.message || 'Failed', false);
    showToast(t('modules.saveFailed', { err: err.message || t('branding.tryAgain') }));
  }
}

/** blob = Blob to upload, or null to remove. */
async function _brandSave(kind, blob) {
  try {
    _brandStatus(blob ? 'Uploading…' : 'Removing…');
    const url = blob ? await API.uploadSchoolAsset(kind === 'photo' ? 'teacher' : kind, blob) : null;

    if (kind === 'photo') {
      await API.setTeacherPhoto(url);
      window.APP.teacher_photo_url = url || '';
    } else {
      const key = kind === 'logo' ? 'school_logo' : 'school_cover';
      const res = await API.setSchoolBranding({ [key]: url });
      const saved = (res && res[key]) || '';
      // RPC returns the stored value; fall back to what we just uploaded
      window.APP[key] = blob ? (saved || url) : '';
      if (window.APP.config) window.APP.config[key] = window.APP[key];
    }

    _brandStatus(blob ? 'Saved ✓' : 'Removed ✓', true);
    showToast(blob ? 'Saved' : 'Removed');
    _brandRefreshViews();
    if (!blob) {
      const prev = document.getElementById('brandPreview');
      if (prev) prev.innerHTML = _brandPreviewHtml(kind, '');
      const rm = document.getElementById('btnBrandRemove');
      if (rm) rm.remove();
    }
  } catch (err) {
    console.error('[branding] save failed', err);
    _brandStatus(err.message || 'Save failed', false);
    showToast(t('modules.saveFailed', { err: err.message || t('branding.tryAgain') }));
  }
}

window.openSchoolLogoModal  = () => openBrandingModal('logo');
window.openSchoolCoverModal = () => openBrandingModal('cover');
window.openMyPhotoModal     = () => openBrandingModal('photo');
