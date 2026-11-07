// ══════════════════════════════════════════════════════════════
// 📊 Google Sheets Tracker v4.1 (With Smart Identity)
// ══════════════════════════════════════════════════════════════
// ✅ يرسل طلبين فقط: زيارة + مغادرة
// ✅ يرسل معرّف الزائر وطريقة التعرف
// ══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var CONF = {
    // ⚠️ ضع رابط Google Apps Script هنا
    TRACKING_URL: '/api/track',
    MAX_RETRIES: 2,
    RETRY_DELAY: 3000,
    MAX_QUEUE: 30,
    KEY: {
      SENT: '_gs_sent',
      Q: '_gs_q'
    }
  };

  // ══════════════════════════════════════
  // ⏳ انتظار النواة
  // ══════════════════════════════════════

  function waitForCore(callback) {
    var start = Date.now();
    var check = setInterval(function () {
      if (window.TrackerCore && window.TrackerCore.ready) {
        clearInterval(check);
        callback(window.TrackerCore);
      } else if (Date.now() - start > 10000) {
        clearInterval(check);
        console.error('[GS] ❌ Core not found');
      }
    }, 100);
  }

  // ══════════════════════════════════════
  // 📤 نظام الإرسال
  // ══════════════════════════════════════

  var LS;

  var Queue = {
    items: [],
    load: function () {
      this.items = LS.g(CONF.KEY.Q, []);
      if (!Array.isArray(this.items)) this.items = [];
      var now = Date.now();
      this.items = this.items.filter(function (x) { return (now - (x._qt || 0)) < 3600000; });
    },
    save: function () {
      if (this.items.length > CONF.MAX_QUEUE) this.items = this.items.slice(-CONF.MAX_QUEUE);
      LS.s(CONF.KEY.Q, this.items);
    },
    add: function (data) {
      data._qt = Date.now();
      this.items.push(data);
      this.save();
    },
    flush: async function () {
      if (this.items.length === 0) return;
      var keep = [];
      for (var i = 0; i < this.items.length; i++) {
        var item = this.items[i];
        delete item._qt;
        var ok = await post(item, 0);
        if (!ok) { item._qt = Date.now(); keep.push(item); }
        if (i < this.items.length - 1) await delay(500);
      }
      this.items = keep;
      this.save();
    }
  };

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function post(data, retry) {
    try {
      data.timestamp = data.timestamp || new Date().toISOString();
      var response = await fetch(CONF.TRACKING_URL, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Tracking endpoint returned ' + response.status);
      var result = await response.json();
      return result && result.ok === true;
    } catch (e) {
      if ((retry || 0) < CONF.MAX_RETRIES) {
        await delay(CONF.RETRY_DELAY);
        return post(data, (retry || 0) + 1);
      }
      return false;
    }
  }

  async function send(data) {
    var ok = await post(data, 0);
    if (!ok) Queue.add(data);
    return ok;
  }

  function beacon(data) {
    data.timestamp = data.timestamp || new Date().toISOString();
    // Queue is flushed on the next page load; sendBeacon cannot confirm server-side persistence.
    Queue.add(data);
    post(data, 0).then(function (ok) {
      if (ok) {
        Queue.items = Queue.items.filter(function (item) { return item.eventId !== data.eventId; });
        Queue.save();
      }
    });
    return true;
  }

  // ══════════════════════════════════════
  // 📊 بناء البيانات
  // ══════════════════════════════════════

  function buildVisitData(core) {
    var d = core.data;
    return {
      type: 'visit',
      eventId: 'visit_' + d.session.id + '_' + d.session.pv + '_' + window.location.pathname,
      sessionId: d.session.id,
      page: window.location.pathname,
      identifyMethod: d.identifyMethod,
      visitorId: d.visitorId,
      isNew: d.isNew,
      visitCount: d.visitCount,
      pageName: d.pageInfo.name,
      browsePath: core.path.getPathString(),
      pageCount: core.path.getPageCount(),
      source: d.source.name,
      sourceType: d.source.type,
      campaign: d.params.campaign,
      country: d.geo.country,
      deviceType: d.dev.type,
      browser: d.dev.browser
    };
  }

  function buildExitData(eventData) {
    return {
      type: 'visit_exit',
      eventId: 'exit_' + eventData.session.id + '_' + eventData.session.pv + '_' + window.location.pathname,
      sessionId: eventData.session.id,
      page: window.location.pathname,
      identifyMethod: eventData.identifyMethod,
      visitorId: eventData.visitorId,
      isNew: eventData.isNew,
      visitCount: eventData.visitCount,
      pageName: eventData.pageInfo.name,
      browsePath: eventData.browsePath,
      pageCount: eventData.pageCount,
      timeOnPage: eventData.timeOnPage,
      scrollMax: eventData.scrollMax,
      source: eventData.source.name,
      sourceType: eventData.source.type,
      campaign: (eventData.source.name === 'مباشر' || eventData.source.name === 'داخلي') ? '-' : '-',
      country: eventData.geo.country,
      deviceType: eventData.dev.type,
      browser: eventData.dev.browser
    };
  }

  // ══════════════════════════════════════
  // 🚀 التشغيل
  // ══════════════════════════════════════

  waitForCore(function (core) {
    console.log('[GS] 📊 Sheets Tracker v4.1');

    LS = core.utils.LS;
    var SS = core.utils.SS;
    Queue.load();

    // ── إرسال الزيارة ──
    var sentKey = CONF.KEY.SENT + '_' + window.location.pathname;
    if (!SS.g(sentKey, false)) {
      send(buildVisitData(core));
      SS.s(sentKey, true);
      console.log('[GS] ✅ Visit sent');
    }

    // ── تحديث عند المغادرة ──
    core.events.on('visitor:exit', function (eventData) {
      beacon(buildExitData(eventData));
      console.log('[GS] 👋 Exit sent');
    });

    // ── إفراغ الطابور ──
    if (Queue.items.length > 0) {
      setTimeout(function () { Queue.flush(); }, 5000);
    }
    setInterval(function () { Queue.flush(); }, 60000);

    console.log('[GS] ✅ Ready');
  });

})();