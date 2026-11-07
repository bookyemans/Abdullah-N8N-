# وثيقة التنفيذ التقنية — Supabase ولوحة الإدارة وتحليلات الزوار

**المشروع:** A5 — موقع ثابت مستضاف على Cloudflare Pages  
**النسخة المرجعية:** `a5_cloudflare_tracking_phase1.zip`  
**تاريخ المراجعة:** 2026-11-06  
**حالة الوثيقة:** مرحلة التصميم والمراجعة قبل تعديل التطبيق  

---

## 1. القرار المعماري المعتمد

سيكون **Supabase PostgreSQL هو مصدر الحقيقة الوحيد للبيانات التشغيلية والتحليلية**. تبقى Cloudflare Pages مسؤولة عن استضافة الواجهة، وتكون Pages Functions طبقة الخادم الوسيطة (BFF/API) بين المتصفح وSupabase. لا يتصل المتصفح بقاعدة البيانات باستخدام مفتاح Service Role.

Google Sheets يصبح موصل تصدير اختياريًا وغير متزامن. لا يدخل في مسار حفظ الحدث الأساسي ولا يؤثر فشله في نجاح حفظ البيانات في Supabase.

```text
Browser (public site / admin)
          |
          v
Cloudflare Pages + Pages Functions
          |
          +---- Supabase Auth (admin authentication)
          |
          +---- Supabase PostgreSQL (primary data store)
          |
          +---- Optional export queue/worker -> Google Sheets
          |
          +---- Optional Telegram notifications
```

### لماذا طبقة Pages Functions؟
- تمنع كشف `service_role` في ملفات JavaScript العامة.
- توحّد التحقق من صحة الأحداث وتحديد الحقول المقبولة.
- تنفذ صلاحيات الإدارة في الخادم، لا بمجرد إخفاء عناصر الواجهة.
- تجعل الانتقال من D1 إلى Supabase تغييرًا في طبقة التخزين بدل إعادة كتابة كل صفحات الموقع.

---

## 2. تدقيق الحالة الفعلية للنسخة المرجعية

تم فك وفحص `a5_cloudflare_tracking_phase1.zip`، وليس الاعتماد على وصف سابق فقط.

### الموجود حاليًا

| المسار | الحالة الفعلية | الملاحظة |
|---|---|---|
| `shared-tracker-core.js` | موجود | نواة هوية الزائر والجلسة ومسار التصفح وGeo lookup |
| `sheets-tracker.js` | موجود | الاسم تاريخي؛ يرسل إلى `/api/track` وليس إلى Sheets مباشرة |
| `email-tracker.js` | موجود | shim قديم يوجّه إلى تتبع صورة البريد |
| `functions/api/track.js` | موجود | يقبل حاليًا `visit` و`visit_exit` ويكتب إلى D1 binding باسم `DB` |
| `functions/api/geo.js` | موجود | يعيد الدولة والمدينة من `request.cf` دون إعادة IP |
| `functions/pixel.html.js` | موجود | يقدم GIF شفافًا ويسجل في D1 عند توفره |
| `functions/api/telegram.js` | موجود | نقطة إشعارات Telegram مع تحقق Origin وقائمة أنواع محدودة |
| `migrations/0001_tracking.sql` | موجود | مخطط D1 الحالي: `tracker_events` و`email_open_events` |
| `scripts/test-tracking-functions.mjs` | موجود | اختبارات Mock لـD1 وPixel وGeo |
| `wrangler.toml` | موجود | لا يحتوي حاليًا على إعداد Supabase؛ وهذا صحيح قبل إضافة الأسرار |
| `admin/` | غير موجود | لا توجد لوحة إدارة منفذة في هذه النسخة |
| `login.html` | غير موجود | لا توجد صفحة تسجيل دخول مخصصة |
| `analytics.html` | غير موجود | لا توجد لوحة تحليلات منفذة |
| Supabase migrations | غير موجودة | لم يبدأ ربط Supabase بعد |

### ملاحظات دقيقة على التنفيذ الحالي

1. `functions/api/track.js` يعتمد على `env.DB`، ويكتب باستخدام D1 SQL (`INSERT OR IGNORE`). يجب استبدال طبقة التخزين، لا إضافة Supabase كوجهة كتابة موازية دائمة.
2. الحدث الحالي محدود إلى `visit` و`visit_exit`. التوسعة إلى `page_view`, `cta_click`, `whatsapp_click`, `contact_submit`, `download` يجب أن تكون جزءًا من عقد API موحد مع تحقق allowlist لكل نوع.
3. إرسال Google Sheets الحالي يحدث مباشرة بعد إدخال D1 داخل نفس طلب التتبع. في التصميم الجديد يجب فصل التصدير عن حفظ الحدث، ويفضل وضع سجل تصدير قابل لإعادة المحاولة.
4. `functions/pixel.html.js` يكتب إلى D1 ويرسل نسخة اختيارية إلى Apps Script. يجب تحويل تخزينه إلى Supabase، مع بقاء استجابة GIF ناجحة حتى عند تعطل قاعدة البيانات.
5. `sameOrigin()` مفيد كإشارة دفاعية ضد بعض الطلبات العابرة للمواقع، لكنه **ليس مصادقة ولا آلية منع روبوتات أو إساءة استخدام**؛ يلزم تحديد معدل الطلبات والتحقق من أحجام/أنواع البيانات.
6. `functions/api/geo.js` يستند إلى بيانات Cloudflare `request.cf`. لا ينبغي تحويل ذلك إلى تخزين IP خام أو اعتباره تحديدًا جغرافيًا دقيقًا دائمًا.
7. صفحة `contact.html` تحتوي قسمًا بمعرف `contact-form` ونموذجًا فعليًا بمعرف `contact-main-form`. يجب أن يكون رصد الإرسال مرتبطًا بالنموذج الفعلي وألا يسبب إرسالًا مزدوجًا.
8. مجلد `Manager/` يحتوي صفحات وملفات مشاريع/محتوى قائمة، ولا ينبغي اعتباره لوحة إدارة للموقع أو استبداله. صفحات الإدارة الجديدة توضع في مسار منفصل مثل `/admin/`.
9. `pixel.html` ملف ثابت للمعاينة المحلية، بينما مسار الإنتاج مقصود أن تتولاه Pages Function. يجب التحقق من أولوية المسار في Cloudflare Preview قبل إطلاقه.
10. لا توجد حاليًا واجهة مصادقة أو صلاحيات مالك/مسؤول أو إعدادات محفوظة في قاعدة بيانات.

---

## 3. نتائج الاختبارات الحالية

تم تشغيل الاختبارات على النسخة المفكوكة محليًا بتاريخ 2026-11-06.

### `npm test`
- اختبارات Telegram: **6/6 ناجحة**.
- اختبارات Tracking الحالية: ناجحة وتشمل التحقق من Origin، إدخال D1 عبر Mock، عدم حفظ البريد الخام في حدث التتبع، استجابة GIF، وGeo fallback.

### `npm run check`
- 33 صفحة HTML جرى فحصها.
- 0 مراجع محلية مفقودة.
- كتالوج المشاريع: 12 سجلًا فريدًا وسليمًا.
- كتالوج المقالات: 14 منشورًا، 13 مقالًا مرتبطًا، ومدخل واحد غير متاح بحسب فاحص المشروع.
- المكونات المشتركة: 12 مكونًا عبر 6 صفحات.
- فحوص الأداء وإمكانية الوصول: 33/33.

### حدود هذه النتائج
هذه اختبارات محلية ثابتة وMocks؛ لا تثبت اتصالًا حيًا بـCloudflare أو Supabase أو Google أو Telegram. لم يتم نشر الموقع، ولم يتم إنشاء مشروع Supabase، ولم يتم ربط D1 الفعلية، ولم يتم اختبار صفحات عبر متصفح حقيقي أو حساب إداري حي.

---

## 4. نموذج قاعدة البيانات المقترح

يُفضّل استخدام PostgreSQL relational schema واضح. لا ننشئ جدولًا واحدًا ضخمًا لكل البيانات.

### 4.1 الجداول الأساسية

| الجدول | الغرض | أهم الحقول |
|---|---|---|
| `visitors` | سجل الزائر المستعار | `id`, `first_seen_at`, `last_seen_at`, `first_source`, `last_source`, `created_at` |
| `visitor_sessions` | جلسات الزيارة | `id`, `visitor_id`, `started_at`, `last_activity_at`, `ended_at`, `landing_path`, `referrer_host`, `utm_*`, `device_type`, `browser`, `country`, `city` |
| `tracking_events` | سجل الأحداث الموحد | `id`, `event_id`, `visitor_id`, `session_id`, `event_type`, `page_path`, `occurred_at`, `properties` JSONB |
| `page_views` | مشاهدات الصفحات (اختياري إذا احتجنا جدولًا ماديًا سريعًا) | `event_id`, `visitor_id`, `session_id`, `page_path`, `viewed_at`, `duration_seconds` |
| `contact_submissions` | طلبات التواصل الواردة | `id`, `created_at`, `status`, `source_page`, `submission_ref`; لا تُنسخ حقول PII إلى التحليلات العامة |
| `email_open_events` | طلبات تحميل صور تتبع البريد | `id`, `recipient_hash`, `campaign`, `message_id`, `country`, `city`, `user_agent`, `requested_at` |
| `site_settings` | إعدادات الموقع غير السرية | `key`, `value` JSONB, `updated_at`, `updated_by` |
| `integration_settings` | حالة وتفضيلات التكاملات غير السرية | `provider`, `enabled`, `options`, `updated_at`, `updated_by` |
| `admin_profiles` | ملف الدور الإداري المرتبط بـAuth UID | `user_id`, `display_name`, `role`, `is_active`, `created_at` |
| `admin_activity_logs` | سجل تعديلات المسؤولين | `id`, `actor_user_id`, `action`, `target_type`, `target_id`, `metadata`, `created_at` |
| `export_jobs` | طابور/سجل تصدير Sheets الاختياري | `id`, `event_id`, `provider`, `status`, `attempts`, `last_error`, `next_attempt_at`, `created_at` |

### 4.2 قواعد تصميم البيانات

- كل الأحداث لها `event_id` فريد لمنع التكرار (idempotency).
- معرف الزائر معرف عشوائي مستعار، وليس بريدًا أو رقم هاتف أو IP.
- `visitor_sessions.visitor_id` يشير إلى `visitors.id`.
- `tracking_events` يحتفظ بالتفاصيل المرنة في `properties JSONB`، بينما الحقول المستخدمة في الفرز والتجميع تكون أعمدة مستقلة.
- التوقيت يخزن `timestamptz` بصيغة UTC، ويعرض حسب المنطقة الزمنية المختارة في لوحة الإدارة.
- تخزن مصادر UTM/referrer بعد تنظيفها وحدود أطوالها.
- لا يخزن البريد أو الهاتف أو محتوى الرسائل داخل `tracking_events`.
- بيانات نماذج التواصل تعامل كبيانات شخصية، وتخضع لصلاحيات واحتفاظ منفصلين.
- لا نضيف `page_views` كجدول منفصل إلا إذا أثبت القياس أن الاستعلامات من `tracking_events` وحده غير كافٍ؛ لتجنب ازدواجية غير ضرورية في المرحلة الأولى.

### 4.3 الفهارس المطلوبة مبدئيًا

- `tracking_events(event_id)` مع قيد UNIQUE.
- `tracking_events(occurred_at DESC)`.
- `tracking_events(event_type, occurred_at DESC)`.
- `tracking_events(page_path, occurred_at DESC)`.
- `tracking_events(session_id, occurred_at)`.
- `tracking_events(visitor_id, occurred_at DESC)`.
- `visitor_sessions(started_at DESC)`.
- `visitor_sessions(visitor_id, started_at DESC)`.
- `email_open_events(message_id, requested_at DESC)`.
- `export_jobs(status, next_attempt_at)`.

لا نبدأ بتقسيم الجداول (partitioning) من اليوم الأول. نراقب حجم البيانات والاستعلامات، ثم نضيف التقسيم/الأرشفة عند وجود حاجة فعلية.

---

## 5. المصادقة والصلاحيات

### القرار
Supabase Auth هو مزود المصادقة. البداية بحساب Owner واحد، ويمكن لاحقًا إضافة Admin بصلاحيات محددة.

### آلية التحقق الموصى بها
1. صفحة `/admin/login.html` تستخدم Supabase Auth لتسجيل الدخول بالبريد وكلمة المرور.
2. الواجهة تحصل على Access Token من Supabase Auth.
3. كل طلب إداري يرسل `Authorization: Bearer <access_token>` إلى Pages Function.
4. Pages Function يتحقق من الرمز عبر Supabase Auth (`/auth/v1/user`) باستخدام مفاتيح الخادم المناسبة.
5. بعد التحقق من هوية المستخدم، يقرأ دور `admin_profiles` من الخادم ويتأكد أن `is_active = true` وأن الدور يسمح بالفعل المطلوب.
6. عمليات قاعدة البيانات الإدارية تستخدم `SUPABASE_SERVICE_ROLE_KEY` داخل Function فقط بعد التحقق من هوية ودور المستخدم.

### أسرار Cloudflare المطلوبة

- `SUPABASE_URL` — رابط مشروع Supabase.
- `SUPABASE_ANON_KEY` — المفتاح العام، يستخدم فقط عند الحاجة في الواجهة أو في التحقق وفق التصميم.
- `SUPABASE_SERVICE_ROLE_KEY` — Secret للخادم فقط؛ ممنوع وضعه في HTML أو JavaScript أو Git.
- `TRACKING_HASH_SECRET` — Secret مستقل لتجزئة معرفات مستلمي البريد القديم إن لزم دعم الروابط القديمة.
- `GOOGLE_APPS_SCRIPT_URL` — اختياري، لا يضاف إلا عند تفعيل التصدير.
- أسرار Telegram الحالية تبقى مستقلة.

### سياسات الوصول
- تفعيل RLS على الجداول التي يمكن أن يصل إليها أي دور عبر PostgREST.
- لا توجد سياسة عامة تسمح للزائر بقراءة بيانات التحليلات.
- لا يُسمح للمتصفح بكتابة أحداث باستخدام Service Role.
- الأفضل أن تمر كتابة أحداث التتبع من Pages Function، التي تتحقق من allowlist ثم تكتب عبر الخادم.
- بيانات `admin_profiles` لا يستطيع المستخدم تغيير دوره بنفسه.
- `admin_activity_logs` سجلات append-only من منظور التطبيق، ولا توجد واجهة لحذفها.
- لا نعتمد على حراسة JavaScript للصفحات؛ كل API إداري يتحقق من الجلسة والدور بنفسه.

### Username أم Email؟
Supabase Auth يوفر تدفقًا قياسيًا بالبريد الإلكتروني وكلمة المرور. يمكن إظهار اسم مستخدم/اسم عرض إداري في الواجهة، لكن لا ننفذ تحويل username إلى بريد داخل المتصفح ولا نخزن كلمات مرور مخصصة. إذا أصبح الدخول باسم المستخدم مطلبًا صريحًا، يصمم endpoint خادمي محدود لذلك دون كشف البريد أو السماح بتعداد الحسابات.

---

## 6. عقد واجهات API المقترح

كل المسارات التالية مقترحة للمرحلة التنفيذية، وليست موجودة كلها حاليًا.

| المسار | الطريقة | الاستخدام | الحماية |
|---|---|---|---|
| `/api/track` | POST | استقبال أحداث الموقع العامة | Origin/size/schema validation + rate limit + bot controls |
| `/api/geo` | GET | معلومات دولة/مدينة تقريبية | عام، دون IP في الاستجابة |
| `/api/admin/me` | GET | التحقق من حساب الإدارة الحالي | Auth + role |
| `/api/admin/settings` | GET/PUT | قراءة/تحديث الإعدادات | Owner/Admin حسب الصلاحية |
| `/api/admin/analytics/summary` | GET | مؤشرات KPI | Auth + role |
| `/api/admin/analytics/timeseries` | GET | سلسلة زمنية | Auth + role + حدود للفترة |
| `/api/admin/analytics/pages` | GET | الصفحات الأكثر زيارة | Auth + role |
| `/api/admin/analytics/sources` | GET | مصادر الزيارات والحملات | Auth + role |
| `/api/admin/visitors` | GET | قائمة الزوار/الجلسات ببيانات مستعارة | Auth + role + pagination |
| `/api/admin/visitors/:id/timeline` | GET | رحلة جلسة/زائر | Auth + role |
| `/api/admin/exports/sheets` | POST | تشغيل/إعادة محاولة تصدير | Owner only أو صلاحية مستقلة |
| `/api/admin/integrations/test` | POST | اختبار تكامل | Owner only |
| `/api/telegram` | POST | إشعارات محددة | تحقق خادمي + rate limit |

### عقد `/api/track`

أنواع الأحداث المستهدفة:
- `page_view`
- `session_start`
- `session_end`
- `cta_click`
- `whatsapp_click`
- `contact_submit` (metadata فقط، وليس محتوى النموذج)
- `download`

الحقول العامة:
- `eventId` (UUID أو معرف عشوائي مضبوط)
- `eventType`
- `visitorId`
- `sessionId`
- `pagePath`
- `occurredAt`
- `properties` (مفاتيح مسموحة حسب نوع الحدث)

يرفض الخادم أي حقل غير مسموح، أو payload كبير، أو مسار غير صالح. ويستخدم UNIQUE(event_id) لمنع التكرار.

---

## 7. صفحات الإدارة المقترحة

توضع في `/admin/` منفصلة عن مجلد `Manager/` الحالي.

| الصفحة | المسؤولية |
|---|---|
| `/admin/login.html` | تسجيل الدخول واستعادة الجلسة |
| `/admin/index.html` | الصفحة الرئيسية الإدارية وحالة الخدمات |
| `/admin/settings.html` | إعدادات الموقع والتتبع والتكاملات |
| `/admin/analytics.html` | ملخص وتحليلات الأداء |
| `/admin/visitors.html` | الزوار والجلسات والبحث والتصفية |
| `/admin/activity-log.html` | سجل عمليات المسؤولين |

### تجربة لوحة التحليلات
- فلاتر اليوم/7 أيام/30 يومًا/الشهر/فترة مخصصة.
- KPI: زوار فريدون، جلسات، مشاهدات، عائدون، نقرات CTA، نقرات WhatsApp، طلبات تواصل.
- رسوم زمنية ومقارنات فترات.
- مصادر الزيارات وUTM.
- صفحات الدخول والخروج والأكثر مشاهدة.
- جدول جلسات مع Timeline.
- نسب التحويل مع تعريف واضح للبسط والمقام.
- pagination للخوادم؛ لا يتم تحميل سجل الأحداث الكامل إلى المتصفح.

### تجربة صفحة الإعدادات
تبويبات: عام، التتبع والخصوصية، التكاملات، الإشعارات، الحساب والأمان.

تُحفظ الإعدادات غير السرية في `site_settings`/`integration_settings`. الأسرار الفعلية لا تُعرض ولا تُخزن في قاعدة البيانات؛ تدار من Cloudflare Secrets. تظهر الواجهة حالة التكامل فقط، مع زر اختبار لا يعرض أي قيمة سرية.

---

## 8. استراتيجية Google Sheets الاختيارية

لا نربط نجاح حفظ الحدث بنجاح Sheets.

المسار الصحيح:
1. يستقبل Function الحدث ويتحقق منه.
2. يحفظه في Supabase.
3. إذا كان التصدير مفعلًا، ينشئ سجلًا في `export_jobs` أو يضع المهمة في Queue.
4. منفذ التصدير يرسل البيانات إلى Apps Script.
5. يسجل نجاح/فشل المحاولة ويعيد المحاولة وفق سياسة محدودة.

في الإصدار الأول يمكن تنفيذ التصدير بطريقة مبسطة بعد نجاح الحفظ، مع سجل إخفاق وإعادة محاولة إدارية. لكن يجب ألا ينتظر الزائر استجابة Google Sheets، وألا يُعاد إرسال الحدث الأساسي بسبب فشل التصدير.

---

## 9. الانتقال من D1 إلى Supabase

### سياسة الانتقال
لا نوصي بكتابة دائمة مزدوجة إلى D1 وSupabase. نعتمد انتقالًا قصيرًا ومراقبًا.

1. إنشاء مشروع Supabase وإعداد الجداول والسياسات.
2. إضافة مفاتيح Supabase إلى Cloudflare Preview أولًا.
3. تطوير Function جديدة مع اختبارات Supabase Mock/Integration.
4. استيراد البيانات القديمة من D1 عند وجود بيانات تستحق الاحتفاظ بها.
5. مقارنة عدد السجلات ومعرفات الأحداث والعينات الزمنية.
6. تحويل `/api/track` و`/pixel.html` إلى Supabase.
7. اختبار Preview والتأكد من عدم وجود تكرار أو فقد.
8. تحويل Production بعد الموافقة.
9. الاحتفاظ بنسخة D1 الاحتياطية لفترة رجوع متفق عليها، ثم إيقافها.

### تحويل بيانات D1
- `tracker_events` تتحول إلى `tracking_events` مع mapping لأنواع `visit` و`visit_exit` إلى أسماء الأحداث الجديدة أو الاحتفاظ بها كأنواع legacy.
- `email_open_events` تنقل إلى الجدول الجديد مع الحفاظ على `recipient_hash` وعدم محاولة استعادة البريد الخام.
- تفحص التكرارات قبل الاستيراد، ويستخدم `event_id` كمفتاح منع تكرار.
- تحفظ نسخة SQL/CSV احتياطية قبل أي ترحيل.

---

## 10. الخصوصية وجودة القياس

- يجب إظهار إشعار/سياسة خصوصية مناسبة توضح ما يجري قياسه، مع احترام متطلبات الموافقة المعمول بها في البلدان المستهدفة.
- نوصي بتقليل البيانات: لا IP خام، لا بريد داخل أحداث التصفح، لا بصمة جهاز فريدة.
- معرف الزائر المستعار يفضل أن يكون first-party وبمدة احتفاظ محددة، مع خيار عدم التتبع إذا تطلبت السياسة ذلك.
- لا نسجل أحداث المسؤول نفسه ضمن تحليلات الزوار، أو نضع علامة `is_admin` ونستبعده من التقارير.
- مدة الجلسة تقديرية بناءً على آخر نشاط، وليست وقتًا يقينيًا أمام الشاشة.
- فتح البريد عبر pixel يعني طلب تحميل الصورة فقط، وليس إثبات قراءة الرسالة.
- بيانات تحديد الدولة/المدينة تقريبية وقد تتأثر بـVPN أو Proxy.

---

## 11. الأداء والتوسع

- استخدام pagination وقيود زمنية إلزامية على endpoints التحليل.
- استخدام SQL views أو RPC آمنة/استعلامات مجمعة لحساب المؤشرات بدل تنزيل الأحداث الخام.
- إنشاء فهارس مبنية على أنماط الاستعلام الفعلية.
- تحديد سقف حجم الحدث وعدد الخصائص.
- إضافة rate limiting على endpoints العامة.
- عدم تشغيل استعلامات غير محدودة على كل تاريخ البيانات.
- وضع خطة احتفاظ وأرشفة بعد قياس حجم الأحداث.
- مراقبة Supabase usage والاتصالات وحجم التخزين قبل اختيار خطة مدفوعة أو إعدادات pooling.

---

## 12. خطة التنفيذ المعتمدة

| المرحلة | نطاق العمل | مخرجات القبول |
|---|---|---|
| 0 | تدقيق النسخة وكتابة هذه الوثيقة | تقرير واقع + تصميم + مخاطر (هذه المرحلة) |
| 1 | مخطط Supabase | SQL migrations، العلاقات، indexes، RLS، اختبارات صلاحيات |
| 2 | طبقة اتصال الخادم | Supabase client/server helper، تحقق Auth/roles، اختبارات |
| 3 | نقل التتبع | `/api/track` وPixel وGeo متوافقة مع Supabase |
| 4 | مصادقة الإدارة | login/logout/session guard/owner seed آمن |
| 5 | صفحة الإعدادات | إعدادات محفوظة، validation، audit log |
| 6 | لوحة التحليلات | KPI، timeseries، sources، pages، conversions |
| 7 | صفحة الزوار | list/search/filter/session timeline |
| 8 | Sheets optional export | queue/retry/status وتعطيل آمن |
| 9 | اختبار أمني وتكامل | RLS/API/abuse/backup/restore/preview |
| 10 | إطلاق إنتاجي | إعداد Cloudflare وSupabase ومراقبة ما بعد الإطلاق |

### معايير إتمام كل مرحلة
- لا يتم تجاوز اختبارات المرحلة السابقة.
- تحديث الوثائق وملف الإعدادات المثال.
- عدم إضافة أسرار حقيقية إلى ZIP أو Git.
- تقديم تقرير يميز بين Mock وIntegration وLive tests.
- حفظ نسخة ZIP مستقلة لكل مرحلة.

---

## 13. ما يلزم من صاحب الموقع قبل الربط الحي

لا نحتاج أي كلمة مرور أو Secret في المحادثة. عند مرحلة الربط الحي، ينشئ صاحب الموقع مشروع Supabase ويضيف القيم بنفسه إلى Cloudflare Pages > Settings > Variables and Secrets.

المطلوب لاحقًا:
- Supabase Project URL.
- مفاتيح المشروع عبر لوحة Cloudflare Secrets، لا عبر المحادثة.
- تحديد البريد الإداري الذي سيُنشأ له حساب Owner.
- تحديد سياسة الاحتفاظ بالبيانات إذا كانت تختلف عن الإعداد الافتراضي المقترح.
- قرار بشأن تفعيل Google Sheets من البداية أم إبقائه معطلاً.

لا يوجد حاليًا اتصال بحساب Cloudflare أو Supabase من بيئة التطوير هذه، لذلك لن نزعم إنشاء المشروع أو ضبط الأسرار أو النشر.

---

## 14. المخاطر وقرارات المنع

| الخطر | المعالجة |
|---|---|
| كشف Service Role | Cloudflare Secret فقط، واستخدامه داخل Functions بعد التحقق من الدور |
| وصول غير مصرح للتحليلات | Auth + role check لكل endpoint + RLS |
| تزوير أحداث التتبع | schema validation، rate limit، dedupe، حدود أحجام، bot filtering |
| تكرار الحدث | UNIQUE(event_id) وidempotency |
| فشل Google Sheets | تصدير منفصل مع retry، Supabase يبقى المصدر الأساسي |
| فقد بيانات عند الانتقال | backup، migration dry-run، reconciliation، rollback window |
| تضخم جدول الأحداث | indexes، pagination، retention/archive بعد قياس فعلي |
| تسجيل بيانات شخصية | allowlist، عدم تخزين IP خام، فصل بيانات النماذج |
| التباس صفحات الإدارة مع محتوى Manager | إنشاء `/admin/` دون تغيير مجلد `Manager/` |
| قياس بريد مضلل | تسمية الحدث image request وليس قراءة مؤكدة |

---

## 15. خلاصة التدقيق والتوصية التنفيذية

النسخة الحالية مناسبة كأساس للانتقال؛ لأنها تملك نقطة استقبال موحدة للتتبع وبعض قواعد التحقق والاختبارات، لكنها ما زالت تعتمد على D1 ولم تتضمن أي مصادقة أو لوحة إدارة أو تكامل Supabase.

**الترتيب الصحيح للبدء بالبرمجة:** المرحلة 1 (SQL + RLS + اختبارات) أولًا، ثم طبقة الخادم، ثم نقل التتبع. لا نبدأ بواجهة لوحة التحليلات قبل وجود نموذج بيانات وصلاحيات ثابتة؛ وإلا سنبني واجهة على بيانات مؤقتة ثم نعيد كتابتها.

**حالة التنفيذ بعد هذه المرحلة:** تم التدقيق المحلي وإعداد وثيقة التنفيذ. لم يتم تعديل وظائف الموقع أو إنشاء مشروع Supabase أو تنفيذ migrations أو نشر أي شيء.
