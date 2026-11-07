# ربط مشروع A5 بمفاتيح Supabase الحديثة

## البيانات العامة المستلمة
- Project URL: يضاف في `SUPABASE_URL`.
- Publishable Key: يضاف في `SUPABASE_PUBLISHABLE_KEY`.

هذه بيانات عامة مخصصة للعميل، وليست بديلاً عن مفتاح الخادم السري.

## المطلوب في Cloudflare Pages قبل أول تسجيل دخول
أضف القيم في مشروع Cloudflare Pages ضمن Settings → Variables and Secrets، وطبّقها على Preview وProduction حسب البيئة:

| الاسم | النوع | القيمة |
|---|---|---|
| `SUPABASE_URL` | Variable | Project URL من Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Variable | Publishable Key |
| `SUPABASE_SECRET_KEY` | Secret | Secret Key من Supabase؛ لا يوضع في Git أو المتصفح |
| `CONFIG_ENCRYPTION_KEY` | Secret | قيمة عشوائية قوية بطول 32 حرفاً أو أكثر |

اربط Cloudflare KV namespace باسم `CONFIG_KV`.

تحتاج الوظائف الخلفية إلى Secret Key حتى تتمكن من تنفيذ عمليات الخادم. لا ترسل هذا المفتاح في المحادثة. أنشئه/انسخه من Supabase Dashboard → Project Settings → API Keys ثم خزّنه مباشرة كـ Cloudflare Secret.

## التوافق التقني
- يدعم هذا الإصدار `sb_publishable_` و`sb_secret_` الحديثة.
- يبقي التوافق مع `anon` و`service_role` القديمة.
- المفاتيح الحديثة ليست JWT؛ تُرسل في ترويسة `apikey` فقط، ولا تُرسل كـ `Authorization: Bearer`.
- جلسة المستخدم بعد تسجيل الدخول تبقى JWT وتُرسل في `Authorization: Bearer <user access token>`.

## إعداد قاعدة البيانات
الملف `supabase/setup_all_migrations.sql` نسخة مجمعة حرفياً من ملفات `supabase/migrations/0001` إلى `0007` بالترتيب، مع فحص ما بعد الترحيل. استخدمه فقط على مشروع جديد فارغ ولمرة واحدة. إذا سبق تشغيل أي SQL في المشروع، لا تعِد تشغيل الملف؛ افحص حالة الجداول أولاً.

## ما لم يتم بعد
لم يتم إجراء اتصال حي من بيئة البناء إلى مشروع Supabase، ولم يتم تنفيذ migrations على قاعدة البيانات، ولم يتم ربط Cloudflare Pages أو نشر الموقع. بعد ضبط الأسرار والـ KV وربط المستودع، شغّل `npm run check:supabase-live` في بيئة لديها اتصال إنترنت، ثم نفّذ اختبار PostgreSQL/RLS الفعلي.
