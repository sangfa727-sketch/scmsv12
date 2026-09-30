  }
  try {
    new QR(el, {
      text: value,
      width: 148,
      height: 148,
      correctLevel: QR.CorrectLevel?.M || 0
    });
  } catch (_) {
    el.innerHTML = '<span class="teacher-id-card-qr-error">' + t('teacher.qrUnavailable') + '</span>';
  }
}

window.printTeacherCard = function() {
  const card = document.querySelector('.teacher-id-card');