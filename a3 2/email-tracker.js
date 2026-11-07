// ══════════════════════════════════════════════════════════════
// 📧 Email Tracker v4.0 (Simplified)
// ══════════════════════════════════════════════════════════════
// ✅ يعمل فقط في pixel.html عندما يوجد user parameter
// ✅ يرسل لـ Google Sheets + Telegram
// ✅ بدون بيانات تقنية زائدة
// ══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var CONF = {
    BOT: {
      TOKEN: '',
      CHAT: '7203463194'
    },
    // ⚠️ ضع رابط Google Apps Script الجديد هنا
    SHEETS_URL: 'https://script.google.com/macros/s/AKfycbzBbnOyZxie6-pVCkiwVAXlQkIqEzXYSwlwyq_EWWwk-bhGs5y4ScJ-3rth93EjkTJOGw/exec',
    KEY: {
      SENT: '_em_sent_',
      COUNT: '_em_cnt_'
    }
  };

  function waitForCore(callback) {
    var start = Date.now();
    var check = setInterval(function () {
      if (window.TrackerCore && window.TrackerCore.ready) {
        clearInterval(check);
        callback(window.TrackerCore);
      } else if (Date.now() - start > 10000) {
        clearInterval(check);
      }
    }, 100);
  }

  waitForCore(function (core) {
    var d = core.data;
    var LS = core.utils.LS;
    var esc = core.utils.esc;

    // ── التحقق من اليوزر ──
    if (!d.user || d.user === 'مجهول') {
      console.log('[EM] No user - skip');
      return;
    }

    console.log('[EM] 📧 Email Tracker v4.0 | User:', d.user);

    // ── منع التكرار (3 دقائق) ──
    var sk = CONF.KEY.SENT + d.user + '_' + d.params.messageId;
    var lastSent = LS.g(sk, null);
    if (lastSent && (Date.now() - parseInt(lastSent, 10)) < 180000) {
      console.log('[EM] Recently tracked - skip');
      return;
    }
    LS.s(sk, Date.now().toString());

    // ── عداد الفتحات ──
    var ck = CONF.KEY.COUNT + d.user;
    var cnt = parseInt(LS.g(ck, '0'), 10);
    if (isNaN(cnt)) cnt = 0;
    cnt++;
    LS.s(ck, cnt.toString());

    // ── مستوى التفاعل ──
    var engLevel =
      cnt >= 10 ? '💎 عميل مخلص' :
      cnt >= 5 ? '🔥🔥🔥 مهتم جداً' :
      cnt >= 3 ? '🔥🔥 مهتم' :
      cnt >= 2 ? '🔥 فضولي' : '🆕 أول فتح';

    // ── إرسال لـ Google Sheets ──
    (async function () {
      try {
        await fetch(CONF.SHEETS_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            type: 'email_open',
            timestamp: new Date().toISOString(),
            recipient: d.user,
            campaign: d.params.campaign,
            subject: d.params.subject,
            openNumber: cnt,
            country: d.geo.country,
            deviceType: d.dev.type,
            emailClient: d.dev.emailClient || d.dev.browser,
            ip: d.geo.ip
          })
        });
      } catch (e) { }
    })();

    // ── إرسال لتيليجرام ──
    (async function () {
      try {
        var now = new Date();
        var h = now.getHours(), ap = h >= 12 ? 'م' : 'ص';
        h = h % 12 || 12;
        var timeStr = String(h).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ' ' + ap;

        var icon = cnt === 1 ? '🔔' : '🔁';
        var title = cnt === 1 ? 'فتح إيميل جديد' : 'إعادة فتح #' + cnt;

        var m = icon + ' <b>' + title + '</b>\n';
        m += '━━━━━━━━━━━━━━━━━━━━━\n\n';
        m += '👤 <b>' + esc(d.user) + '</b>\n';
        m += '📧 حملة: <b>' + esc(d.params.campaign) + '</b>\n';
        m += '📝 الموضوع: ' + esc(d.params.subject) + '\n';
        m += '🔢 الفتحات: <b>' + cnt + '</b>\n';
        m += '📈 ' + engLevel + '\n\n';
        m += '🌍 ' + esc(d.geo.country);
        if (d.geo.city && d.geo.city !== '-') m += '، ' + esc(d.geo.city);
        m += '\n';
        m += (d.dev.type === 'Mobile' ? '📱' : '💻') + ' ' + d.dev.type;
        m += ' | ' + (d.dev.emailClient || d.dev.browser) + '\n';
        m += '🕐 ' + timeStr + ' | ' + now.getDate() + '/' + (now.getMonth() + 1) + '\n';
        m += '━━━━━━━━━━━━━━━━━━━━━';

        await fetch('/api/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: CONF.BOT.CHAT,
            text: m,
            parse_mode: 'HTML',
            disable_web_page_preview: true
          })
        });
      } catch (e) { }
    })();

    console.log('[EM] ✅ Done | Opens:', cnt);
  });

})();