// Japanese locale — complete key parity with English; common UI strings translated natively.
// Unlisted keys intentionally inherit the English source text so new features remain usable.
(function () {
  const base = window.I18N_EN || {};
  const overrides = {
    'app.title':'SCMS — 学校クラス管理システム',
    'common.all':'すべて','common.edit':'編集','common.close':'閉じる','common.cancel':'キャンセル','common.add':'追加','common.saving':'保存中…','common.years':'年','common.failed':'失敗:','common.saveFailed':'保存できません — もう一度お試しください','common.removed':'削除しました',
    'nav.dashboard':'ダッシュボード','nav.students':'生徒','nav.attendance':'出欠','nav.homework':'宿題','nav.messages':'メッセージ','nav.incidents':'インシデント','nav.timetable':'時間割','nav.reports':'レポート','nav.settings':'設定',
    'topbar.search':'検索...','topbar.notifications':'通知','topbar.profile':'プロフィール','topbar.logout':'ログアウト','topbar.language':'言語',
    'btn.save':'保存','btn.cancel':'キャンセル','btn.delete':'削除','btn.edit':'編集','btn.add':'追加','btn.close':'閉じる','btn.confirm':'確認','btn.export':'エクスポート','btn.refresh':'更新','btn.submit':'送信',
    'msg.loading':'読み込み中...','msg.saving':'保存中...','msg.saved':'正常に保存しました','msg.error':'問題が発生しました','msg.noData':'データがありません','msg.offline':'オフラインです','msg.confirmDelete':'本当に削除しますか？',
    'students.title':'生徒','students.name':'名前','students.class':'クラス','students.parent':'保護者','students.phone':'電話','students.addNew':'新しい生徒を追加','att.title':'出欠','att.present':'出席','att.absent':'欠席','att.late':'遅刻','att.leave':'休み','att.markAll':'全員を出席にする','att.date':'日付','att.saveAttendance':'出欠を保存',
    'landing.title':'学校クラス管理を','landing.titleEm':'シンプルに','landing.emailLink':'メールでログイン','landing.or':'または','landing.telegram':'Telegramでログイン','landing.teacherId':'教師IDでログイン','landing.registerSchool':'新しい学校を登録','landing.joinSchool':'既存の学校に参加',
    'login.title':'🔐 ログイン','login.teacherId':'教師ID','login.password':'パスワード','login.btn':'ログイン','login.signingIn':'ログイン中…','pw.old':'現在のパスワード','pw.new':'新しいパスワード（6文字以上）','pw.confirm':'新しいパスワードを再入力','pw.btnChange':'パスワードを変更',
    'page.dashboard.eyebrow':'概要','page.dashboard.title':'今日の<em>ダッシュボード</em>','page.students.title':'私の<em>生徒</em>','page.attend.title':'<em>出欠</em>','page.hw.title':'<em>宿題</em>','page.grades.title':'<em>成績</em>','page.billing.title':'<em>請求</em>','page.admissions.title':'<em>入学受付</em>','page.library.title':'<em>図書館</em>','page.transport.title':'<em>送迎</em>','page.incidents.title':'<em>インシデント</em>','page.timetable.title':'<em>時間割</em>','page.summary.title':'月間<em>サマリー</em>','page.more.title':'その他の<em>機能</em>',
    'tab.students':'生徒','tab.attend':'出欠','tab.daily':'日次','tab.hw':'宿題','tab.chat':'チャット','tab.more':'その他',
    'att.clearMarks':'記録をクリア','att.history':'履歴','att.historyTitle':'履歴とレポート','att.codes':'コード'
  };
  window.I18N_JP = Object.assign({}, base, overrides);
})();
