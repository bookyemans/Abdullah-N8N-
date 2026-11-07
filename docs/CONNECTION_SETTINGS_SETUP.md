# إعدادات الاتصال من لوحة الموقع

## ما تم تجهيزه برمجياً
- صفحة `/admin/settings.html` لإدارة بيانات Supabase وTelegram وGoogle Sheets.
- نقطة API للمالك فقط: `/api/admin/connections`.
- تشفير AES-GCM للإعدادات الخاصة قبل حفظها في Cloudflare KV.
- لا يتم إرجاع مفاتيح Supabase السرية أو Telegram Bot Token إلى المتصفح؛ تعرض الواجهة حالة وجود المفتاح فقط.
- إعدادات Supabase المحفوظة في KV تتقدم على قيم البيئة الاحتياطية. المفتاح العام فقط يُعرض عبر `/api/public-config` لتشغيل Supabase Auth في المتصفح.
- Telegram يرسل رسالة اختبار فعلية عند الضغط على زر الاختبار.
- Google Sheets يستخدم Google Apps Script Web App URL الحالي كوسيط استقبال، مع تمرير Spreadsheet ID في الحمولة. يجب أن يقبل Apps Script نوع `connection_test` وأن يرد باستجابة HTTP ناجحة لاختبار كامل موثوق.

## تجهيز Cloudflare لاحقاً
1. أنشئ Cloudflare KV Namespace باسم تختاره.
2. في Cloudflare Pages > Settings > Functions > KV namespace bindings، اربط الاسم `CONFIG_KV` بالـNamespace.
3. أضف Secret باسم `CONFIG_ENCRYPTION_KEY` بقيمة عشوائية طويلة (32 حرفاً على الأقل). لا تضعها في GitHub أو ملفات الموقع.
4. أثناء التجهيز الأولي، أضف مؤقتاً `SUPABASE_URL` و`SUPABASE_ANON_KEY` و`SUPABASE_SERVICE_ROLE_KEY` كـSecrets/Variables في Cloudflare كي يعمل تسجيل دخول المالك لأول مرة.
5. بعد تشغيل الموقع وتسجيل دخول المالك، أدخل إعدادات الخدمات في صفحة الإعدادات واحفظها. يتم تشفيرها وتخزينها في KV.
6. لا تحذف مفاتيح Supabase الاحتياطية من Cloudflare حتى تتأكد من نجاح قراءة الإعدادات المشفرة وإعادة تسجيل الدخول. الأفضل إبقاؤها كخطة استرداد حتى انتهاء التحقق.

## ملاحظات مهمة
- لا يمكن للموقع حفظ إعداداته المشفرة في KV قبل ربط KV ومفتاح التشفير؛ لذلك يلزم إعداد هذين العنصرين مرة واحدة في Cloudflare.
- أول جلسة إدارة تحتاج بيانات Supabase bootstrap في Cloudflare، لأن الموقع لا يستطيع مصادقة المالك قبل معرفة مشروع Supabase. بعد ذلك تتم إدارة القيم من لوحة الموقع.
- عند تبديل URL إلى مشروع Supabase مختلف، جلسة الإدارة الحالية لا تنتقل تلقائياً؛ يجب إنشاء حساب المالك وصلاحياته في المشروع الجديد ثم تسجيل الدخول مجدداً. تغيير المفاتيح للمشروع نفسه لا يتطلب تغيير حساب المالك.
- لا توجد أي قاعدة Supabase حقيقية مهيأة الآن، ولا تم اختبار اتصالات حقيقية في هذه المرحلة.
- اختبار Supabase يتحقق من الوصول إلى Auth settings باستخدام المفتاح العام. اختبار Google Sheets الحالي يتحقق من وصول طلب HTTP إلى Apps Script؛ يجب تطوير/ضبط Apps Script ليتحقق من صلاحيات Spreadsheet ويعيد JSON صريحاً لتأكيد الكتابة.
- الإعدادات المشفرة محفوظة في KV، بينما `integration_settings` في Supabase يحتفظ بحالة التفعيل فقط، ولا يخزن الرموز السرية.


## Supabase API keys (current format)

The connection layer accepts current `SUPABASE_PUBLISHABLE_KEY` and server-only `SUPABASE_SECRET_KEY` values, while retaining `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as legacy fallbacks. Opaque `sb_publishable_` and `sb_secret_` keys are sent in the `apikey` header only; they are not JWTs and must not be copied into `Authorization: Bearer`. Keep the Secret Key only in Cloudflare secrets or the encrypted private configuration store.
