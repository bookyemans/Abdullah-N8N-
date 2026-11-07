# إعداد المالك الأول وإدارة حسابات الإدارة

## تهيئة المالك الأول (مرة واحدة)
1. أنشئ مشروع Supabase واضبط إعدادات Auth والبريد الإلكتروني.
2. من Authentication > Users أرسل دعوة إلى بريد المالك الأول، أو أنشئ المستخدم من لوحة Supabase.
3. بعد تأكيد المستخدم، انسخ UUID الخاص به.
4. نفّذ في SQL Editor، مع استبدال UUID والاسم:

```sql
begin;
do $$
declare
  target_user uuid := '00000000-0000-0000-0000-000000000000';
begin
  if exists (select 1 from public.admin_profiles where role = 'owner') then
    raise exception 'An owner already exists; bootstrap is closed';
  end if;
  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'Target auth user does not exist';
  end if;
  insert into public.admin_profiles(user_id, display_name, role, is_active)
  values (target_user, 'اسم المالك', 'owner', true);
end $$;
commit;
```

هذه العملية ليست endpoint عامة ولا تسمح بالتسجيل الإداري المفتوح. لا تضع Service Role Key في SQL أو المتصفح.

## إدارة المستخدمين لاحقاً
- سجّل الدخول بحساب المالك.
- افتح `/admin/users.html`.
- أدخل البريد والاسم والصلاحية لإرسال دعوة عبر Supabase Auth.
- بعد إنشاء الدعوة يضاف سجل `admin_profiles` بصلاحية admin أو owner.
- يمكن للمالك تغيير الصلاحية أو تعطيل الحساب.
- يمنع النظام تعطيل حساب المالك الحالي أو إزالة آخر مالك نشط.
- تعطيل `admin_profiles.is_active` يمنع استخدام API الإدارية حتى لو بقي حساب Auth موجوداً.

## متطلبات Cloudflare
يجب توفير إعدادات Supabase وService Role Key في مخزن الخادم المشفر وفق `CONNECTION_SETTINGS_SETUP.md`. مفتاح الخدمة لا يرسل إلى المتصفح.

## حدود الاختبار
الاختبارات المحلية لا ترسل دعوات بريدية ولا تختبر Auth أو RLS على مشروع فعلي. يجب التحقق من إعداد SMTP/Email templates في Supabase عند إنشاء المشروع.
