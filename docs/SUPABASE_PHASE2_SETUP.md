# Supabase + Cloudflare setup checklist

1. Apply `supabase/migrations/0001_core_schema.sql` and `0002_analytics_views.sql` in Supabase SQL Editor.
2. Create the first Auth user, then insert its UUID into `public.admin_profiles` with role `owner`.
3. Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `TRACKING_HASH_SECRET` to Cloudflare Pages Preview and Production settings. The service role value must be a Secret.
4. Keep `GOOGLE_SHEETS_ENABLED=false` initially. Do not configure the Apps Script URL until the Supabase path is confirmed.
5. Deploy a Preview build and verify `/api/track` receives events and creates rows in `visitors`, `visitor_sessions`, and `tracking_events`.
6. Verify `/api/admin/me` returns 401 without a token, 403 for a signed-in non-admin, and 200 for the active Owner.
7. Verify `/api/admin/analytics` and `/api/admin/visitors` only work with an active admin token.
8. Verify `/pixel.html?rid=...&mid=...` returns a 1x1 GIF and creates an `email_open_events` row.
9. Configure WAF/rate limits before Production rollout.
10. Back up D1 before any migration or decommission. D1 is not deleted by this code change.

No live Supabase or Cloudflare resources are created by these repository files alone.

## إضافات المرحلة الخامسة — إدارة طلبات التواصل

1. طبّق `supabase/migrations/0004_lead_management.sql` بعد بقية ملفات الترحيل.
2. أضف `WEB3FORMS_ACCESS_KEY` إلى Cloudflare Pages Secrets إذا كنت تريد استمرار إشعار البريد عبر Web3Forms. لن يظهر المفتاح للمتصفح.
3. لا تضف `TURNSTILE_SECRET_KEY` إلا بعد تركيب Widget المطابق في نموذج التواصل؛ في حال ضبطه يصبح رمز التحقق مطلوباً.
4. فعّل Rate Limiting/WAF على `POST /api/contact`.
5. بعد النشر، أرسل طلباً تجريبياً ثم تحقق من ظهوره في `/admin/leads.html`، ومن تسجيل `contact_submit` في `tracking_events`.
6. جرّب تحديث حالة الطلب وإضافة ملاحظة، ثم تحقق من `admin_activity_logs`.
7. تصدير CSV متاح لحساب `owner` فقط لأنه يحتوي بيانات شخصية.
