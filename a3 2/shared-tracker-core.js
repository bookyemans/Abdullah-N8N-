// ══════════════════════════════════════════════════════════════
// 🧠 Shared Tracker Core v4.0 (Simplified)
// ══════════════════════════════════════════════════════════════
// ✅ النواة المشتركة المبسّطة
// ✅ يجمع فقط البيانات المفيدة للبزنس
// ✅ بدون: fingerprint, vendor, dark mode, cores, screen res
// ✅ يوفر البيانات عبر window.TrackerCore
// ══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ══════════════════════════════════════
  // ⚙️ الإعدادات
  // ══════════════════════════════════════

  var CONF = {
    SESSION_TIMEOUT: 30 * 60 * 1000,
    MIN_EXIT_TIME: 3,

    PAGES: {
      'index':    { name: 'الرئيسية', emoji: '🏠' },
      'about':    { name: 'من أنا',   emoji: '👤' },
      'services': { name: 'الخدمات',  emoji: '📋' },
      'service':  { name: 'الخدمات',  emoji: '📋' },
      'projects': { name: 'المشاريع', emoji: '🗂' },
      'project':  { name: 'المشاريع', emoji: '🗂' },
      'blog':     { name: 'المدونة',  emoji: '📝' },
      'contact':  { name: 'تواصل',    emoji: '📞' }
    },

    GEO_APIS: [
      'https://ipapi.co/json/',
      'https://ipwho.is/'
    ],

    KEY: {
      VID: '_tc_vid',
      SES: '_tc_ses',
      GEO: '_tc_geo',
      VC:  '_tc_vc',
      FV:  '_tc_fv',
      PATH: '_tc_path',
      USER: '_tc_user'
    }
  };

  // ══════════════════════════════════════
  // 🗄️ تخزين آمن
  // ══════════════════════════════════════

  var LS = {
    g: function (k, fb) {
      try {
        var v = localStorage.getItem(k);
        if (v === null) return fb;
        try { return JSON.parse(v); } catch (e) { return v; }
      } catch (e) { return fb; }
    },
    s: function (k, v) {
      try {
        localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      } catch (e) { }
    }
  };

  var SS = {
    g: function (k, fb) {
      try {
        var v = sessionStorage.getItem(k);
        if (v === null) return fb;
        try { return JSON.parse(v); } catch (e) { return v; }
      } catch (e) { return fb; }
    },
    s: function (k, v) {
      try {
        sessionStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      } catch (e) { }
    }
  };

  // ══════════════════════════════════════
  // 🔧 أدوات
  // ══════════════════════════════════════

  function esc(t) {
    if (!t) return '';
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function durAr(s) {
    s = Math.max(0, Math.round(s || 0));
    if (s < 60) return s + ' ثانية';
    var m = Math.floor(s / 60), r = s % 60;
    if (m < 60) return m + ':' + String(r).padStart(2, '0') + ' دقيقة';
    var h = Math.floor(m / 60);
    return h + ':' + String(m % 60).padStart(2, '0') + ' ساعة';
  }

  // ══════════════════════════════════════
  // 👤 المستخدم والجلسة
  // ══════════════════════════════════════

  function getUser() {
    try {
      var p = new URLSearchParams(window.location.search);
      var u = p.get('u') || p.get('et') || p.get('email_track') || p.get('eid') || null;
      if (u) {
        SS.s(CONF.KEY.USER, u);
        LS.s(CONF.KEY.USER, u);
        return u;
      }
      return SS.g(CONF.KEY.USER, null) || LS.g(CONF.KEY.USER, null) || 'مجهول';
    } catch (e) { return 'مجهول'; }
  }

  function getVisitorId() {
    var id = LS.g(CONF.KEY.VID, null);
    if (!id) {
      id = 'V_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
      LS.s(CONF.KEY.VID, id);
    }
    return id;
  }

  function getVisitCount() {
    // مربوط بالجلسة وليس بالصفحة
    var session = SS.g(CONF.KEY.SES, null);
    if (session && session._counted) {
      // نفس الجلسة: لا نزيد العداد
      return parseInt(LS.g(CONF.KEY.VC, '1'), 10);
    }
    var c = parseInt(LS.g(CONF.KEY.VC, '0'), 10);
    if (isNaN(c)) c = 0;
    c++;
    LS.s(CONF.KEY.VC, c.toString());
    return c;
  }

  function isNewVisitor() {
    var f = LS.g(CONF.KEY.FV, null);
    if (!f) {
      LS.s(CONF.KEY.FV, Date.now().toString());
      return true;
    }
    return false;
  }

  function getSession() {
    var s = SS.g(CONF.KEY.SES, null);
    if (s && s.id && (Date.now() - (s.la || 0)) < CONF.SESSION_TIMEOUT) {
      s.la = Date.now();
      s.pv = (s.pv || 0) + 1;
      SS.s(CONF.KEY.SES, s);
      return s;
    }
    s = { id: 'S_' + Date.now().toString(36), st: Date.now(), la: Date.now(), pv: 1, _counted: true };
    SS.s(CONF.KEY.SES, s);
    return s;
  }

  function getParams() {
    try {
      var p = new URLSearchParams(window.location.search);
      return {
        campaign: p.get('campaign') || p.get('c') || p.get('utm_campaign') || '-',
        source: p.get('source') || p.get('utm_source') || '-',
        subject: p.get('subject') || p.get('sub') || p.get('s') || '-',
        messageId: p.get('mid') || p.get('message_id') || '-',
        group: p.get('group') || p.get('g') || '-'
      };
    } catch (e) {
      return { campaign: '-', source: '-', subject: '-', messageId: '-', group: '-' };
    }
  }

  // ══════════════════════════════════════
  // 📱 معلومات الجهاز (مبسّطة)
  // ══════════════════════════════════════

  function getDeviceInfo() {
    var ua = navigator.userAgent || '';

    // نوع الجهاز
    var type = 'Desktop';
    if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) type = 'Tablet';
    else if (/Mobile|iPhone|iPod|Android.*Mobile/i.test(ua)) type = 'Mobile';

    // نظام التشغيل
    var os = 'Unknown';
    if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Mac OS X/i.test(ua)) os = 'macOS';
    else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Linux/i.test(ua)) os = 'Linux';

    // المتصفح
    var browser = 'Unknown';
    var tests = [
      [/Edg\//i, 'Edge'], [/OPR\//i, 'Opera'],
      [/Firefox\//i, 'Firefox'], [/Chrome\//i, 'Chrome'],
      [/Safari\//i, 'Safari']
    ];
    for (var i = 0; i < tests.length; i++) {
      if (tests[i][0].test(ua)) { browser = tests[i][1]; break; }
    }

    // تطبيق البريد (للإيميل فقط)
    var emailClient = '';
    if (/Thunderbird/i.test(ua)) emailClient = 'Thunderbird';
    else if (/Outlook/i.test(ua)) emailClient = 'Outlook';
    else if (/GoogleImageProxy/i.test(ua)) emailClient = 'Gmail';

    return {
      type: type,
      os: os,
      browser: browser,
      emailClient: emailClient
    };
  }

  // ══════════════════════════════════════
  // 🌍 الموقع الجغرافي (مبسّط)
  // ══════════════════════════════════════

  async function fetchGeo() {
    var cached = SS.g(CONF.KEY.GEO, null);
    if (cached && cached._t && (Date.now() - cached._t) < 600000) return cached;

    for (var i = 0; i < CONF.GEO_APIS.length; i++) {
      try {
        var ctrl = new AbortController();
        var tm = setTimeout(function () { ctrl.abort(); }, 5000);
        var r = await fetch(CONF.GEO_APIS[i], { signal: ctrl.signal });
        clearTimeout(tm);
        if (!r.ok) continue;
        var d = await r.json();

        var res = {
          ip: d.ip || d.ipAddress || '-',
          country: d.country_name || d.country || d.countryName || '-',
          city: d.city || d.cityName || '-',
          _t: Date.now()
        };

        SS.s(CONF.KEY.GEO, res);
        return res;
      } catch (e) { continue; }
    }

    return { ip: '-', country: '-', city: '-' };
  }

  // ══════════════════════════════════════
  // 🔎 تحليل المصدر (مبسّط)
  // ══════════════════════════════════════

  function analyzeSource() {
    var ref = document.referrer || '';
    var p;
    try { p = new URLSearchParams(window.location.search); } catch (e) { return { name: 'مباشر', type: 'مباشر 🏠' }; }

    var utm = p.get('utm_source') || p.get('source') || '';
    var medium = (p.get('utm_medium') || p.get('medium') || '').toLowerCase();

    // من UTM
    if (utm) {
      var sl = utm.toLowerCase();
      if (medium === 'email' || sl.includes('mail')) return { name: utm, type: 'إيميل 📧' };
      if (medium === 'cpc' || medium === 'paid' || medium === 'ads') return { name: utm, type: 'إعلان 💰' };

      var socials = ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok', 'telegram', 'whatsapp'];
      for (var s = 0; s < socials.length; s++) {
        if (sl.includes(socials[s])) return { name: utm, type: 'اجتماعي 📱' };
      }
      return { name: utm, type: 'حملة 📊' };
    }

    // من Click IDs
    if (p.get('gclid')) return { name: 'Google Ads', type: 'إعلان 💰' };
    if (p.get('fbclid')) return { name: 'Facebook', type: 'اجتماعي 📱' };

    // من Referrer
    if (ref) {
      try {
        var host = new URL(ref).hostname.toLowerCase();
        if (host === window.location.hostname) return { name: 'داخلي', type: 'داخلي 🔄' };

        var engines = ['google', 'bing', 'yahoo'];
        for (var e = 0; e < engines.length; e++) {
          if (host.includes(engines[e])) return { name: engines[e], type: 'بحث 🔍' };
        }

        var socMap = { facebook: 'Facebook', instagram: 'Instagram', twitter: 'Twitter', youtube: 'YouTube', linkedin: 'LinkedIn', 't.me': 'Telegram' };
        for (var sm in socMap) {
          if (host.includes(sm)) return { name: socMap[sm], type: 'اجتماعي 📱' };
        }

        return { name: host, type: 'إحالة 🌐' };
      } catch (e) { }
    }

    return { name: 'مباشر', type: 'مباشر 🏠' };
  }

  // ══════════════════════════════════════
  // 🔀 تتبع المسار (مبسّط)
  // ══════════════════════════════════════

  var PathTracker = {
    getCurrentPage: function () {
      var path = window.location.pathname.toLowerCase();
      var filename = path.split('/').pop().replace('.html', '');

      // مقال مدونة
      if ((path.indexOf('/blogs/') !== -1 || path.indexOf('/blog/') !== -1) && filename !== 'blog') {
        return { name: 'مقال: ' + filename, emoji: '📰', type: 'blog_article' };
      }
      // مشروع مدير
      if (path.indexOf('/manager/') !== -1) {
        return { name: 'مشروع: ' + filename, emoji: '🏗', type: 'manager_project' };
      }

      // صفحات رئيسية
      for (var key in CONF.PAGES) {
        if (filename.indexOf(key) !== -1 || (key === 'index' && (filename === '' || path.endsWith('/')))) {
          return { name: CONF.PAGES[key].name, emoji: CONF.PAGES[key].emoji, type: key };
        }
      }
      return { name: 'الرئيسية', emoji: '🏠', type: 'index' };
    },

    getPreviousPage: function () {
      var ref = document.referrer || '';
      if (!ref) return 'دخول مباشر';
      try {
        var refUrl = new URL(ref);
        if (refUrl.hostname !== window.location.hostname) return refUrl.hostname;
        var refFile = refUrl.pathname.split('/').pop().replace('.html', '').toLowerCase();

        if (refUrl.pathname.indexOf('/blogs/') !== -1) return '📰 مقال';
        if (refUrl.pathname.indexOf('/manager/') !== -1) return '🏗 مشروع';

        for (var key in CONF.PAGES) {
          if (refFile.indexOf(key) !== -1 || (key === 'index' && (refFile === '' || refUrl.pathname.endsWith('/')))) {
            return CONF.PAGES[key].emoji + ' ' + CONF.PAGES[key].name;
          }
        }
        return refUrl.pathname;
      } catch (e) { return ref.substring(0, 50); }
    },

    recordPath: function (pageInfo) {
      var path = SS.g(CONF.KEY.PATH, []);
      if (!Array.isArray(path)) path = [];
      var entry = { name: pageInfo.name, emoji: pageInfo.emoji, url: window.location.pathname };
      if (path.length > 0 && path[path.length - 1].url === entry.url) return path;
      path.push(entry);
      SS.s(CONF.KEY.PATH, path);
      return path;
    },

    getPathString: function () {
      var path = SS.g(CONF.KEY.PATH, []);
      if (!Array.isArray(path) || path.length === 0) return '-';
      return path.map(function (p) { return p.emoji + ' ' + p.name; }).join(' → ');
    },

    getPageCount: function () {
      var path = SS.g(CONF.KEY.PATH, []);
      return Array.isArray(path) ? path.length : 1;
    }
  };

  // ══════════════════════════════════════
  // 📜 تتبع السكرول (مبسّط - بدون إرسال milestones)
  // ══════════════════════════════════════

  var ScrollTracker = {
    max: 0,
    startTime: 0,
    _handler: null,
    _timer: null,

    init: function () {
      this.startTime = Date.now();
      var me = this;

      this._handler = function () {
        if (me._timer) clearTimeout(me._timer);
        me._timer = setTimeout(function () {
          try {
            var y = window.pageYOffset || document.documentElement.scrollTop || 0;
            var docH = Math.max(
              document.body.scrollHeight || 0,
              document.documentElement.scrollHeight || 0
            ) - window.innerHeight;
            if (docH <= 0) return;
            var pct = Math.min(100, Math.round((y / docH) * 100));
            me.max = Math.max(me.max, pct);
          } catch (e) { }
        }, 300);
      };

      window.addEventListener('scroll', this._handler, { passive: true });
    },

    getTimeOnPage: function () {
      return Math.round((Date.now() - this.startTime) / 1000);
    },

    destroy: function () {
      if (this._handler) window.removeEventListener('scroll', this._handler);
      if (this._timer) clearTimeout(this._timer);
    }
  };

  // ══════════════════════════════════════
  // 👆 تتبع الصفحة التالية
  // ══════════════════════════════════════

  function trackNextPage() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a');
      if (!link) return;
      var href = link.getAttribute('href');
      if (!href) return;
      try {
        var url = new URL(href, window.location.origin);
        if (url.hostname === window.location.hostname) {
          SS.s('_tc_next', url.pathname);
        }
      } catch (e) { }
    });
  }

  // ══════════════════════════════════════
  // 🔄 نظام الأحداث
  // ══════════════════════════════════════

  var EventBus = {
    _listeners: {},
    on: function (event, cb) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(cb);
    },
    emit: function (event, data) {
      if (!this._listeners[event]) return;
      this._listeners[event].forEach(function (cb) {
        try { cb(data); } catch (e) { }
      });
    }
  };

  // ══════════════════════════════════════
  // 🚀 التهيئة
  // ══════════════════════════════════════

  async function init() {
    console.log('[Core] 🧠 v4.0 Simplified');

    var user = getUser();
    var visitorId = getVisitorId();
    var visitCount = getVisitCount();
    var isNew = isNewVisitor();
    var session = getSession();
    var dev = getDeviceInfo();
    var params = getParams();
    var source = analyzeSource();
    var pageInfo = PathTracker.getCurrentPage();

    PathTracker.recordPath(pageInfo);

    // جلب الموقع الجغرافي
    var geo;
    try { geo = await fetchGeo(); }
    catch (e) { geo = { ip: '-', country: '-', city: '-' }; }

    // تشغيل السكرول وتتبع الروابط
    ScrollTracker.init();
    trackNextPage();

    // ── تجميع البيانات ──
    var coreData = {
      user: user,
      visitorId: visitorId,
      visitCount: visitCount,
      isNew: isNew,
      session: session,
      pageInfo: pageInfo,
      previousPage: PathTracker.getPreviousPage(),
      source: source,
      params: params,
      geo: geo,
      dev: dev
    };

    // ── حفظ في window ──
    window.TrackerCore = {
      data: coreData,
      config: CONF,
      scroll: ScrollTracker,
      path: PathTracker,
      events: EventBus,
      utils: { esc: esc, durAr: durAr, LS: LS, SS: SS },
      ready: true
    };

    EventBus.emit('core:ready', coreData);
    console.log('[Core] ✅ Ready | Page:', pageInfo.name, '| User:', user);

    // ── المغادرة ──
    var exited = false;
    function onExit() {
      if (exited) return;
      var t = ScrollTracker.getTimeOnPage();
      if (t < CONF.MIN_EXIT_TIME) return;
      exited = true;

      EventBus.emit('visitor:exit', {
        user: user,
        visitorId: visitorId,
        visitCount: visitCount,
        isNew: isNew,
        session: session,
        pageInfo: pageInfo,
        scrollMax: ScrollTracker.max,
        timeOnPage: t,
        browsePath: PathTracker.getPathString(),
        pageCount: PathTracker.getPageCount(),
        nextPage: SS.g('_tc_next', 'غادر الموقع'),
        source: source,
        geo: geo,
        dev: dev
      });

      ScrollTracker.destroy();
    }

    window.addEventListener('beforeunload', onExit);
    window.addEventListener('pagehide', onExit);
  }

  // البدء
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 100);
  } else {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 100); });
  }

})();