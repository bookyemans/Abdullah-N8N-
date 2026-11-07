# تقرير التنفيذ — المرحلة الأولى: مخطط Supabase والحماية

**المشروع:** A5 Website  
**النسخة الأساسية:** `a5_supabase_blueprint_phase0.zip`  
**الحالة:** ملفات المرحلة الأولى جاهزة محليًا؛ لم تُطبق على مشروع Supabase حي.

## 1. المنجز فعليًا

1. إنشاء migration أساسي `supabase/migrations/0001_core_schema.sql`.
2. إنشاء migration للتحليلات `supabase/migrations/0002_analytics_views.sql`.
3. إنشاء عشرة جداول مترابطة:
   - `visitors`
   - `visitor_sessions`
   - `tracking_events`
   - `contact_submissions`
   - `email_open_events`
   - `site_settings`
   - `integration_settings`
   - `admin_profiles`
   - `admin_activity_logs`
   - `export_jobs`
4. إضافة مفاتيح أساسية وخارجية وقيود تحقق ومنع تكرار `event_id`.
5. إضافة فهارس للزمن، الزائر، الجلسة، الصفحة، نوع الحدث، الحالة ومهام التصدير.
6. تفعيل RLS على جميع الجداول.
7. إلغاء صلاحيات `anon` و`authenticated` الافتراضية على الجداول والتسلسلات، ثم منح القراءة للمصادق عليهم فقط مع سياسات تتطلب مسؤولًا نشطًا.
8. إنشاء دالتي `is_active_admin()` و`is_owner()`.
9. إنشاء Views للتحليلات اليومية والصفحات ومصادر الزيارات باستخدام `security_invoker`.
10. إبقاء Google Sheets وTelegram معطلين افتراضيًا.
11. إضافة ملف مثال للإعدادات دون أسرار، وتعليمات تحقق أمني.
12. دمج اختبار فحص مخطط Supabase ضمن `npm test`.

## 2. نتائج الاختبار المحلي

- `npm test`: ناجح.
  - Telegram: 6/6.
  - Tracking tests الحالية: ناجحة.
  - Supabase schema static checks: ناجحة (2 migrations، 10 جداول RLS، 7 أنواع أحداث أساسية).
- `npm run check`: ناجح.
  - 33 صفحة HTML مفحوصة، دون مراجع محلية مفقودة.
  - 12 مشروعًا سليمًا.
  - 33/33 في فحوص الأداء وإمكانية الوصول.

**حدود الاختبار:** فحص SQL ساكن ومراجعة بنية الملفات فقط. لم يتوفر `psql` أو Supabase CLI في بيئة التنفيذ، لذلك لم يتم تطبيق SQL على PostgreSQL ولم يتم تنفيذ اختبارات RLS حية.

## 3. طريقة التطبيق

1. أنشئ مشروع Supabase أو بيئة محلية منفصلة.
2. راجع ملفات SQL ثم نفّذها بالترتيب:
   - `supabase/migrations/0001_core_schema.sql`
   - `supabase/migrations/0002_analytics_views.sql`
3. أنشئ مستخدم Auth أولًا من لوحة Supabase.
4. انسخ UUID الخاص بالمستخدم، ثم أضف حساب المالك من SQL Editor بعد التحقق من الهوية:

```sql
insert into public.admin_profiles (user_id, display_name, role, is_active)
values ('REPLACE-WITH-AUTH-USER-UUID', 'Site Owner', 'owner', true);
```

5. نفّذ جميع اختبارات القبول في `supabase/tests/README.md` باستخدام حسابات اختبار منفصلة.
6. لا تضف `SUPABASE_SERVICE_ROLE_KEY` إلى ملفات المشروع العامة أو Git. سيُضاف لاحقًا كـCloudflare Secret فقط.

## 4. نقاط مؤجلة عمدًا

- لم يتم تغيير `/api/track` بعد؛ ما زال يعتمد على D1 في هذه المرحلة.
- لم يتم تحويل Pixel إلى Supabase.
- لم يتم إنشاء تسجيل الدخول أو صفحات الإدارة بعد.
- لم يتم ترحيل بيانات D1.
- لم يتم تفعيل Google Sheets.
- لم يتم إنشاء مشروع Supabase أو ربطه بـCloudflare أو نشر الموقع.

هذه الحدود مقصودة: المرحلة الحالية تثبت مخطط البيانات والسياسات قبل بناء طبقة الاتصال والخدمات.

## 5. معايير قبول المرحلة التالية

لا ننتقل إلى تحويل التتبع قبل تطبيق migrations على قاعدة تجريبية وإتمام اختبارات RLS. المرحلة الثانية ستكون بناء مكتبة اتصال Supabase داخل Pages Functions، والتحقق من Auth والأدوار، واختبارات وحدات دون كشف أي مفتاح سري.
