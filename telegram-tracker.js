// ══════════════════════════════════════════════════════════════
// 📨 Telegram Tracker v4.1 (With Smart Identity)
// ══════════════════════════════════════════════════════════════
// ✅ رسالتان فقط: زيارة + مغادرة
// ✅ يعرض طريقة التعرف على الزائر
// ══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var CONF = { ENDPOINT: '/api/telegram', KEY: { SENT: '_tg_sent' } };

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

  async function tgSend(msg) {
    if (!msg || !msg.trim()) return false;
    try {
      var response = await fetch(CONF.ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'visit', message: msg.substring(0, 3900) }),
        keepalive: true
      });
      return response.ok;
    } catch (e) { return false; }
  }

  function tgBeacon(msg) {
    try {
      if (!msg || !msg.trim()) return false;
      var body = JSON.stringify({ kind: 'exit', message: msg.substring(0, 3900) });
      if (navigator.sendBeacon) {
        return navigator.sendBeacon(CONF.ENDPOINT, new Blob([body], { type: 'application/json' }));
      }
      fetch(CONF.ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
      return true;
    } catch (e) { return false; }
  }

  // ══════════════════════════════════════
  // 📝 بناء الرسائل
  // ══════════════════════════════════════

  function buildVisitMsg(core) {
    var d = core.data;
    var esc = core.utils.esc;

    var now = new Date();
    var days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    var h = now.getHours(), ap = h >= 12 ? 'م' : 'ص';
    h = h % 12 || 12;
    var timeStr = String(h).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ' ' + ap;
    var dateStr = days[now.getDay()] + ' ' + now.getDate() + '/' + (now.getMonth() + 1);

    var icon = d.isNew ? '🆕' : '🔄';
    var label = d.isNew ? 'زائر جديد' : 'زائر عائد (#' + d.visitCount + ')';

    var m = icon + ' <b>' + label + '</b>\n';
    m += '━━━━━━━━━━━━━━━━━━━━━\n\n';

    // ── معلومات التعرف ──
    if (d.user !== 'مجهول') {
      m += '👤 <b>' + esc(d.user) + '</b>\n';
    }
    m += '🔑 ' + d.identifyMethod + '\n';
    m += '🆔 <code>' + d.visitorId + '</code>\n\n';

    // ── الصفحة والتنقل ──
    m += d.pageInfo.emoji + ' <b>' + esc(d.pageInfo.name) + '</b>\n';
    m += '⬅️ جاء من: ' + esc(d.previousPage) + '\n';
    m += '📊 ' + core.path.getPageCount() + ' صفحة | ' + core.path.getPathString() + '\n\n';

    // ── المصدر ──
    m += '🔎 ' + esc(d.source.name) + ' (' + esc(d.source.type) + ')\n';
    if (d.params.campaign !== '-') m += '🎯 حملة: ' + esc(d.params.campaign) + '\n';

    // ── الموقع والجهاز ──
    m += '🌍 ' + esc(d.geo.country);
    if (d.geo.city && d.geo.city !== '-') m += '، ' + esc(d.geo.city);
    m += '\n';

    m += (d.dev.type === 'Mobile' ? '📱' : d.dev.type === 'Tablet' ? '📟' : '💻');
    m += ' ' + d.dev.type + ' | ' + d.dev.browser + '\n';
    m += '🕐 ' + dateStr + ' ' + timeStr + '\n';
    m += '━━━━━━━━━━━━━━━━━━━━━';

    return m;
  }

  function buildExitMsg(eventData, core) {
    var esc = core.utils.esc;
    var durAr = core.utils.durAr;

    var t = eventData.timeOnPage;
    var s = eventData.scrollMax;
    var eng, icon;
    if (t > 300 && s > 70) { eng = 'ممتاز'; icon = '🔥🔥🔥'; }
    else if (t > 120 && s > 50) { eng = 'عالي'; icon = '🔥🔥'; }
    else if (t > 30 && s > 25) { eng = 'متوسط'; icon = '⚡'; }
    else { eng = 'منخفض'; icon = '📉'; }

    var m = '👋 <b>مغادرة</b>\n';
    m += '━━━━━━━━━━━━━━━━━━━━━\n';

    if (eventData.user !== 'مجهول') {
      m += '👤 <b>' + esc(eventData.user) + '</b> (' + eventData.identifyMethod + ')\n';
    }
    m += '🆔 <code>' + eventData.visitorId + '</code>\n';

    m += '⏱ ' + durAr(t) + ' | 📄 ' + eventData.pageCount + ' صفحة | 📜 ' + s + '%\n';
    m += icon + ' تفاعل: ' + eng + '\n';
    m += '🗺 ' + esc(eventData.browsePath) + '\n';
    m += '➡️ ' + esc(eventData.nextPage) + '\n';
    m += '━━━━━━━━━━━━━━━━━━━━━';

    return m;
  }

  // ══════════════════════════════════════
  // 🚀 التشغيل
  // ══════════════════════════════════════

  waitForCore(function (core) {
    console.log('[TG] 📨 Telegram v4.1');

    var SS = core.utils.SS;

    var sentKey = CONF.KEY.SENT + '_' + window.location.pathname;
    if (!SS.g(sentKey, false)) {
      tgSend(buildVisitMsg(core));
      SS.s(sentKey, true);
      console.log('[TG] ✅ Visit sent');
    }

    core.events.on('visitor:exit', function (eventData) {
      tgBeacon(buildExitMsg(eventData, core));
    });

    console.log('[TG] ✅ Ready');
  });

})();