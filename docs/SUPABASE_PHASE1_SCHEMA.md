# المرحلة الأولى — مخطط Supabase والحماية

## ما تم إنشاؤه

- `supabase/migrations/0001_core_schema.sql`: الجداول الأساسية، العلاقات، القيود، الفهارس، triggers، دوال فحص دور الإدارة، وسياسات RLS.
- `supabase/migrations/0002_analytics_views.sql`: Views أولية مجمعة للتحليلات اليومية والصفحات والمصادر.
- `supabase/tests/README.md`: خطوات تحقق أمني وقبول للمخطط.

## الجداول

`visitors`, `visitor_sessions`, `tracking_events`, `contact_submissions`, `email_open_events`, `site_settings`, `integration_settings`, `admin_profiles`, `admin_activity_logs`, `export_jobs`.

## قرارات الحماية

- RLS مفعّل على جميع الجداول.
- لا توجد سياسات للـ`anon`.
- القراءة الإدارية تتطلب مستخدمًا مصادقًا عليه وله سجل نشط في `admin_profiles`.
- بيانات التحليلات لا تُكتب من المتصفح مباشرة؛ ستتم الكتابة عبر Cloudflare Pages Functions بعد التحقق الخادمي.
- `service_role` لا يوضع في ملفات الواجهة أو Git.
- لا تنشئ الهجرة حساب Owner تلقائيًا؛ يلزم إنشاء Auth user أولًا ثم تهيئة دوره بواسطة إجراء موثوق.
- Google Sheets وTelegram يبدأان معطلين.

## تنبيه قبل التطبيق

هذه ملفات SQL جاهزة للمراجعة والتطبيق على مشروع Supabase. لم تُطبق على مشروع حي لأن بيانات مشروع Supabase غير متاحة في بيئة التطوير، ولم يتم إنشاء مشروع أو اتصال حي. نفّذها أولًا على مشروع تجريبي/محلي، ثم شغّل قائمة القبول في `supabase/tests/README.md`.

## قرار بخصوص جدول page_views

لم ننشئ جدول `page_views` منفصلًا في هذه المرحلة؛ أحداث مشاهدة الصفحات تسجل في `tracking_events` لتجنب ازدواجية البيانات. يمكن إضافة جدول متخصص أو partitioning بعد قياس حجم البيانات وأنماط الاستعلام الفعلية.
