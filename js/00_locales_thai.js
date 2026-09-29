// Thai locale — complete key parity with English; common UI strings translated natively.
// Unlisted keys intentionally inherit the English source text so new features remain usable.
(function () {
  const base = window.I18N_EN || {};
  const overrides = {
    'common.all':'ทั้งหมด','common.edit':'แก้ไข','common.close':'ปิด','common.cancel':'ยกเลิก','common.add':'เพิ่ม','common.saving':'กำลังบันทึก…','common.years':'ปี','common.failed':'ล้มเหลว:','common.saveFailed':'บันทึกไม่ได้ — ลองอีกครั้ง','common.removed':'ลบแล้ว',
    'nav.dashboard':'แดชบอร์ด','nav.students':'นักเรียน','nav.attendance':'การเข้าเรียน','nav.homework':'การบ้าน','nav.messages':'ข้อความ','nav.incidents':'เหตุการณ์','nav.timetable':'ตารางเรียน','nav.reports':'รายงาน','nav.settings':'การตั้งค่า',
    'topbar.search':'ค้นหา...','topbar.notifications':'การแจ้งเตือน','topbar.profile':'โปรไฟล์','topbar.logout':'ออกจากระบบ','topbar.language':'ภาษา',
    'btn.save':'บันทึก','btn.cancel':'ยกเลิก','btn.delete':'ลบ','btn.edit':'แก้ไข','btn.add':'เพิ่ม','btn.close':'ปิด','btn.confirm':'ยืนยัน','btn.export':'ส่งออก','btn.refresh':'รีเฟรช','btn.submit':'ส่ง',
    'msg.loading':'กำลังโหลด...','msg.saving':'กำลังบันทึก...','msg.saved':'บันทึกสำเร็จ','msg.error':'เกิดข้อผิดพลาด','msg.noData':'ไม่มีข้อมูล','msg.offline':'คุณออฟไลน์อยู่','msg.confirmDelete':'คุณแน่ใจหรือไม่ว่าต้องการลบ?',
    'students.title':'นักเรียน','students.name':'ชื่อ','students.class':'ชั้นเรียน','students.parent':'ผู้ปกครอง','students.phone':'โทรศัพท์','students.addNew':'เพิ่มนักเรียนใหม่','att.title':'การเข้าเรียน','att.present':'มาเรียน','att.absent':'ขาดเรียน','att.late':'สาย','att.leave':'ลา','att.markAll':'ทำเครื่องหมายมาครบทั้งหมด','att.date':'วันที่','att.saveAttendance':'บันทึกการเข้าเรียน',
    'landing.title':'การจัดการชั้นเรียนโรงเรียน','landing.titleEm':'ทำได้ง่ายๆ','landing.emailLink':'เข้าสู่ระบบด้วยอีเมล','landing.or':'หรือ','landing.telegram':'เข้าสู่ระบบด้วย Telegram','landing.teacherId':'เข้าสู่ระบบด้วยรหัสครู','landing.registerSchool':'ลงทะเบียนโรงเรียนใหม่','landing.joinSchool':'เข้าร่วมโรงเรียนที่มีอยู่แล้ว',
    'login.title':'🔐 เข้าสู่ระบบ','login.teacherId':'รหัสครู','login.password':'รหัสผ่าน','login.btn':'เข้าสู่ระบบ','login.signingIn':'กำลังเข้าสู่ระบบ…','pw.old':'รหัสผ่านปัจจุบัน','pw.new':'รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)','pw.confirm':'ยืนยันรหัสผ่านใหม่','pw.btnChange':'เปลี่ยนรหัสผ่าน',
    'page.dashboard.eyebrow':'ภาพรวม','page.dashboard.title':'<em>แดชบอร์ด</em> วันนี้','page.students.title':'<em>นักเรียน</em>ของฉัน','page.attend.title':'<em>การเข้าเรียน</em>','page.hw.title':'<em>การบ้าน</em>','page.grades.title':'<em>ผลการเรียน</em>','page.billing.title':'<em>การเรียกเก็บเงิน</em>','page.admissions.title':'<em>การรับสมัคร</em>','page.library.title':'<em>ห้องสมุด</em>','page.transport.title':'<em>การเดินทาง</em>','page.incidents.title':'<em>เหตุการณ์</em>','page.timetable.title':'<em>ตารางเรียน</em>','page.summary.title':'<em>สรุปรายเดือน</em>','page.more.title':'<em>ฟีเจอร์เพิ่มเติม</em>',
    'tab.students':'นักเรียน','tab.attend':'เข้าเรียน','tab.daily':'รายวัน','tab.hw':'การบ้าน','tab.chat':'แชต','tab.more':'เพิ่มเติม'
    'att.clearMarks':'ล้างเครื่องหมาย','att.history':'ประวัติ','att.historyTitle':'ประวัติและรายงาน','att.codes':'รหัส'
  };
  window.I18N_TH = Object.assign({}, base, overrides);
})();
