# تقرير التنفيذ — المرحلة الثانية: طبقة اتصال Supabase وواجهات الإدارة الأساسية

**المشروع:** A5 Website  
**النسخة المرجعية:** `a5_supabase_phase1_schema.zip`  
**الحالة:** تم تطوير الملفات واختبارها محليًا باستخدام Fetch mocks؛ لم يتم ربط مشروع Supabase حي أو نشر Cloudflare.

## 1. ما تم تنفيذه

### 1.1 طبقة Supabase المشتركة
- `functions/api/_lib/supabase.js`
- قراءة إعدادات Supabase من بيئة Cloudflare فقط.
- طلبات PostgREST باستخدام Service Role من جهة الخادم فقط.
- التحقق من Access Token عبر Supabase Auth `/auth/v1/user`.
- التحقق من `admin_profiles` والتأكد من أن الحساب نشط ودوره `owner` أو `admin`.
- أدوات موحدة لإرجاع JSON والتحقق من Origin وتنظيف النصوص.
- عدم إرسال تفاصيل أخطاء Supabase الداخلية إلى المتصفح.

### 1.2 تحويل التتبع إلى Supabase
تم استبدال اعتماد `functions/api/track.js` على D1 بكتابة Supabase:
- تسجيل/تحديث سجل الزائر في `visitors`.
- تسجيل/تحديث الجلسة في `visitor_sessions` مع الحفاظ على بيانات بداية الجلسة.
- تسجيل الحدث في `tracking_events`.
- تحويل `visit` إلى `page_view` و`visit_exit` إلى `session_end` للتوافق مع المتتبع الحالي.
- منع التكرار بالاعتماد على `event_id` الفريد و`resolution=ignore-duplicates`.
- وضع البيانات الإضافية في `properties` بعد تنظيفها وتحديد أطوالها.
- عدم تخزين البريد الخام الذي قد يصل من المتصفح.
- عدم استخدام D1 في مسار الكتابة الجديد.

### 1.3 تحويل تتبع البريد
- `functions/pixel.html.js` أصبح يحفظ أحداث pixel في `email_open_events` عبر Supabase.
- يظل GIF شفافًا حتى إذا تعذر الاتصال بقاعدة البيانات.
- يدعم `rid` كمعرف opaque token، ويدعم الروابط القديمة `u=email` باستخدام HMAC عند توفر `TRACKING_HASH_SECRET`.
- لا يخزن البريد الخام.
- Google Sheets لا يستقبل نسخة إلا عند ضبط `GOOGLE_SHEETS_ENABLED=true` مع وجود `GOOGLE_APPS_SCRIPT_URL`.

### 1.4 واجهات الإدارة الأساسية
- `GET /api/admin/me`: التحقق من المستخدم والدور.
- `GET /api/admin/settings`: قراءة الإعدادات والتكاملات.
- `PUT /api/admin/settings`: تحديث إعداد واحد، ومتاح للـOwner فقط في هذه المرحلة، مع سجل نشاط.
- `GET /api/admin/analytics?days=30`: إرجاع ملخص يومي وصفحات ومصادر وأعداد أنواع الأحداث.
- `GET /api/admin/visitors?limit=50&offset=0`: قائمة زوار مع pagination وإخفاء جزء من معرف الزائر.

كل واجهات الإدارة تتحقق من الجلسة والدور داخل Pages Function؛ لا تعتمد على إخفاء صفحات HTML.

## 2. إعدادات Cloudflare المطلوبة

أضف المتغيرات التالية في Cloudflare Pages > Settings > Variables and Secrets لكل من Preview وProduction:

| الاسم | النوع | الملاحظة |
|---|---|---|
| `SUPABASE_URL` | Variable | رابط مشروع Supabase |
| `SUPABASE_ANON_KEY` | Variable | المفتاح العام للتحقق من Auth من الخادم |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | مفتاح سري للخادم فقط، لا يوضع في Git أو الواجهة |
| `TRACKING_HASH_SECRET` | Secret | سر عشوائي مستقل لا يقل عن 32 بايت لدعم الروابط القديمة |
| `GOOGLE_APPS_SCRIPT_URL` | Variable/Secret | اختياري فقط |
| `GOOGLE_SHEETS_ENABLED` | Variable | `false` افتراضيًا؛ اجعله `true` فقط عند اختبار التصدير |

لا تضع أي قيمة حقيقية في `.env.supabase.example` أو `wrangler.toml`.

## 3. إعداد أول مسؤول

1. أنشئ مستخدمًا من Supabase Auth (بريد + كلمة مرور قوية).
2. فعّل تأكيد البريد أو سياسة الدخول التي تريدها.
3. خذ UUID الخاص بالمستخدم من Authentication > Users.
4. نفّذ في SQL Editor بعد التأكد من UUID:

```sql
insert into public.admin_profiles (user_id, display_name, role, is_active)
values ('YOUR_AUTH_USER_UUID', 'Site Owner', 'owner', true)
on conflict (user_id) do update
set role = 'owner', is_active = true, display_name = excluded.display_name;
```

لا يوجد حساب افتراضي ولا كلمة مرور مضمّنة في المشروع.

## 4. عقد تسجيل الدخول للواجهة الأمامية

صفحة تسجيل الدخول المستقبلية تستخدم Supabase Auth SDK أو Auth REST لتسجيل الدخول بالبريد وكلمة المرور، ثم تحتفظ بجلسة Auth وفق إعدادات Supabase. عند استدعاء صفحات الإدارة ترسل:

`Authorization: Bearer <access_token>`

لا ترسل `SUPABASE_SERVICE_ROLE_KEY` إلى المتصفح مطلقًا. لا توجد صفحة Login UI في هذه المرحلة؛ المنفذ الآن هو التحقق الخادمي من الجلسات والأدوار وواجهات الإدارة.

## 5. نتائج الاختبارات المحلية

### `npm test`
- Telegram: 6/6 ناجحة.
- Tracking: ناجح — Origin، إدخال الزائر والجلسة والحدث في Supabase mock، عدم تخزين البريد الخام، Pixel، Geo fallback.
- Admin API: ناجح — رفض غياب المصادقة، قبول مسؤول نشط، حماية API الزوار، تحديد pagination، إخفاء جزء من معرف الزائر، منع Admin من تغيير الإعدادات والسماح للـOwner.
- Supabase schema static checks: ناجحة — 10 جداول RLS وملفا migration.

### `npm run check`
- 33 صفحة HTML، صفر مراجع محلية مفقودة.
- 12 مشروعًا سليمًا.
- فحوص المكونات المشتركة والكتالوج والأداء وإمكانية الوصول ناجحة.

**حدود الاختبارات:** استخدمت mocks لـ`fetch`؛ لم يحدث اتصال حي مع Supabase، ولم يتم اختبار RLS على PostgreSQL فعلي، ولم يتم اختبار Cloudflare Preview أو متصفح حقيقي.

## 6. ملاحظات تقنية قبل الإنتاج

1. يلزم إضافة Rate Limiting/WAF على `/api/track` و`/pixel.html` وواجهات تسجيل الدخول. التحقق من Origin ليس حماية من الروبوتات.
2. يفضّل لاحقًا تحويل تصدير Sheets إلى Queue/Worker قابل لإعادة المحاولة. النسخة الحالية تجعل Sheets مرآة اختيارية ولا تؤثر في حفظ Supabase، لكنها لا تنفذ بعد نظام إعادة المحاولة الدائم.
3. واجهة تسجيل الدخول وصفحات الإعدادات والتحليلات والزوار ستبنى في المرحلة التالية.
4. نقل بيانات D1 التاريخية لم ينفذ؛ ولا تحذف قاعدة D1 أو بياناتها قبل إجراء تصدير ونسخة احتياطية والتحقق من أعداد السجلات.
5. لا تعتبر طلبات تحميل Pixel قراءات مؤكدة للبريد.
6. الواجهة الحالية لم تتغير بعد، ولا توجد صفحة إدارة مرئية حتى الآن.

## 7. الخطوة التالية

المرحلة الثالثة: بناء واجهة `/admin/login.html`، وحارس الصفحات، ولوحة الإدارة الرئيسية، وصفحة الإعدادات، وربطها بواجهات API التي أصبحت جاهزة. بعدها نبني واجهة تحليلات الزوار ورحلاتهم على البيانات الحقيقية.
