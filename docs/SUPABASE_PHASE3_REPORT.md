# تقرير المرحلة الثالثة — واجهة الإدارة المرئية

## الحالة
تم إنشاء واجهات إدارة عربية متجاوبة وربطها بواجهات API الخلفية الموجودة في المرحلة الثانية. هذه ملفات محلية جاهزة للاختبار؛ لم يتم نشرها على Cloudflare ولم يتم اختبار تسجيل الدخول على مشروع Supabase حي.

## الملفات الجديدة
- `admin/login.html`: تسجيل دخول البريد وكلمة المرور عبر Supabase Auth.
- `admin/index.html`: لوحة رئيسية ومؤشرات سريعة وروابط الإدارة.
- `admin/settings.html`: إعدادات التتبع والتكاملات.
- `admin/analytics.html`: مخطط يومي، الصفحات الأكثر زيارة، مصادر الزيارات وأنواع الأحداث.
- `admin/visitors.html`: قائمة زوار بترقيم صفحات ومعرفات مخفية جزئياً.
- `assets/css/admin.css`: تصميم موحد ومتجاوب.
- `assets/js/admin-auth.js`: جلسة مصادقة، تسجيل دخول وخروج، وعميل API.
- `assets/js/admin-common.js`: حارس الإدارة والقائمة المشتركة.
- `functions/api/public-config.js`: نشر عنوان Supabase وAnon Key فقط للواجهة؛ لا يكشف Service Role.

## تحسينات خلفية
- توسعة `PUT /api/admin/settings` لدعم تشغيل/إيقاف Google Sheets وTelegram في جدول `integration_settings` مع سجل إداري.
- أصبح مسار التتبع يقرأ `site_settings.tracking` ويطبق مفاتيح `enabled`, `pageviews`, `clicks`.
- أصبح تمرير نسخة Google Sheets مشروطاً بتفعيل التكامل في قاعدة البيانات، إضافة إلى متغيرات Cloudflare الاختيارية.
- صفحات الإدارة لا تحمل ملفات تتبع الموقع العامة، ولذلك لا تدخل زيارات المسؤولين في أحداث الزوار من هذه الصفحات.

## إعداد Supabase قبل تسجيل الدخول
1. أضف `SUPABASE_URL` و`SUPABASE_ANON_KEY` كـVariables في Cloudflare Pages.
2. أضف `SUPABASE_SERVICE_ROLE_KEY` كـSecret فقط.
3. طبق ملفات `supabase/migrations/0001_core_schema.sql` و`0002_analytics_views.sql` في مشروع Supabase.
4. أنشئ مستخدماً من Supabase Authentication بالبريد وكلمة المرور.
5. أضف UUID الخاص به إلى `public.admin_profiles` بدور `owner` كما في `docs/SUPABASE_PHASE2_SETUP.md`.
6. تأكد من تفعيل Email/Password في إعدادات Auth. لا يوجد مستخدم أو كلمة مرور افتراضية في المشروع.

## ملاحظات الأمان
- صفحة الإدارة تستخدم `sessionStorage` للجلسة في هذا الإصدار، وتزيلها عند تسجيل الخروج.
- الـAPI يتحقق من Access Token والدور النشط على الخادم في كل طلب إداري.
- المفتاح السري `service_role` لا يرسل للمتصفح.
- لا تضع أسرار Supabase في ملفات HTML أو JavaScript أو Git.
- حماية الواجهة ليست بديلاً عن حماية API؛ API ترفض الطلبات غير المصادق عليها.

## حدود المرحلة
- لم يحدث اتصال حي مع Supabase ولم يتم إنشاء حساب Owner نيابة عن المستخدم.
- لا تزال بعض مقاييس التحليلات محدودة بطريقة الاستعلام الحالية؛ سيتم تحسين التجميع والترقيم في مرحلة التحليلات التالية.
- أصبح مسار Telegram يتحقق من `integration_settings.telegram` عند توفر إعداد Supabase؛ إذا كان التكامل معطلاً يتخطى الإرسال. إذا لم يكن Supabase مهيأً، يبقى سلوك Telegram القديم حفاظاً على التوافق.
- Google Sheets يحتاج ضبط `GOOGLE_APPS_SCRIPT_URL` و`GOOGLE_SHEETS_ENABLED=true` في Cloudflare، بالإضافة إلى تفعيله من لوحة الإدارة. يجب ضبط القيمتين معاً حتى يعمل التصدير.
- لم يتم نقل بيانات D1 القديمة.

## الاختبارات
شغّل `npm test` و`npm run check`. اختبارات الشبكة تستخدم Fetch mocks، وليست اختباراً حياً مع Supabase أو Cloudflare Preview.
