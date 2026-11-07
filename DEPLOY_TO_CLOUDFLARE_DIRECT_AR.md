# دليل رفع مشروع A5 مباشرة إلى Cloudflare Pages (بدون GitHub)

## القرار التقني المهم
المشروع يستخدم Cloudflare Pages Functions في مجلد `functions/` لتشغيل واجهات API والاتصال الآمن بـ Supabase. لذلك **لا تستخدم السحب والإفلات (Drag and Drop) من لوحة Cloudflare لهذا المشروع**؛ هذه الطريقة لا تنشر مجلد `functions/`.

الطريقة المناسبة للرفع المباشر هي **Wrangler CLI** من جهاز كمبيوتر. لا تحتاج إلى إنشاء مستودع GitHub.

ملاحظة: مشروع Direct Upload لا يمكن تحويله لاحقاً إلى Git Integration. إذا أردت النشر التلقائي من GitHub مستقبلاً، ستحتاج إلى إنشاء مشروع Pages جديد وربطه بالمستودع.

## ما الذي أعددناه؟
- ملفات الموقع الحالية كاملة.
- مجلد `functions/` الذي يحتوي وظائف Pages API.
- ملف `wrangler.toml` باسم المشروع `site-a5`.
- دعم مفاتيح Supabase الحديثة `sb_publishable_` و`sb_secret_`.
- ملفات SQL ليست مطلوبة لإعادة التشغيل؛ قاعدة البيانات تم إعدادها مسبقاً وفق تأكيدك.
- لا يحتوي هذا الملف على Supabase Secret Key أو مفاتيح Cloudflare أو رموز Telegram الحقيقية.

## المتطلبات
نفّذ الخطوات التالية من كمبيوتر Windows أو macOS أو Linux:
1. حساب Cloudflare.
2. تثبيت Node.js (يتضمن npm).
3. اتصال إنترنت.
4. فك ضغط هذا الملف، ثم فتح الطرفية داخل مجلد `a5` الذي يحتوي `wrangler.toml` و`functions/`.

## الخطوة 1 — تسجيل الدخول وإنشاء مشروع Pages
افتح Terminal أو PowerShell داخل مجلد `a5`، ثم نفّذ:

```bash
npx wrangler@latest login
```

ستفتح صفحة متصفح لتسجيل الدخول ومنح Wrangler صلاحية الاتصال بحسابك.

بعد نجاح تسجيل الدخول، أنشئ مشروع Pages:

```bash
npx wrangler@latest pages project create
```

عندما يسألك عن اسم المشروع، اكتب:

```text
site-a5
```

وعندما يسألك عن Production branch، اكتب:

```text
main
```

إذا أخبرك أن الاسم مستخدم بالفعل، اختر اسماً فريداً، ثم استخدم الاسم نفسه في أمر النشر أدناه.

## الخطوة 2 — إنشاء KV وربطه
من لوحة Cloudflare:
1. افتح Workers & Pages.
2. أنشئ KV namespace جديداً باسم واضح مثل `A5_PRIVATE_CONFIG`.
3. ارجع إلى مشروع Pages `site-a5`.
4. افتح Settings ثم Bindings.
5. اختر Add ثم KV namespace.
6. اجعل Variable name حرفياً:

```text
CONFIG_KV
```

7. اختر مساحة KV التي أنشأتها واحفظ.
8. تأكد من إضافة الربط لبيئة Production (وPreview إن كانت ظاهرة).
9. ستحتاج إلى إعادة النشر بعد إضافة الربط.

## الخطوة 3 — إضافة متغيرات Supabase والأسرار
من مشروع Pages افتح Settings ثم Variables and Secrets. أضف القيم التالية لبيئة Production:

| الاسم | النوع | القيمة |
|---|---|---|
| `SUPABASE_URL` | Variable | رابط مشروع Supabase الكامل |
| `SUPABASE_PUBLISHABLE_KEY` | Variable | Publishable Key الذي يبدأ عادةً بـ `sb_publishable_` |
| `SUPABASE_SECRET_KEY` | Secret / Encrypt | Secret Key الذي يبدأ عادةً بـ `sb_secret_` |
| `CONFIG_ENCRYPTION_KEY` | Secret / Encrypt | سر عشوائي قوي بطول 32 حرفاً على الأقل |

**تنبيه أمني:** أدخل `SUPABASE_SECRET_KEY` و`CONFIG_ENCRYPTION_KEY` بنفسك داخل Cloudflare فقط. لا ترسلهما في المحادثة، ولا تضعهما في ملفات الموقع أو GitHub أو هذا الدليل.

أنشئ `CONFIG_ENCRYPTION_KEY` عشوائياً من مدير كلمات مرور موثوق، أو من مولّد أسرار محلي. لا تستخدم كلمة مرور سهلة أو قيمة منشورة.

لا تضع `SUPABASE_SECRET_KEY` في خانة Variable؛ يجب أن يكون Secret مشفراً. لا تستخدم Publishable Key بدلاً من Secret Key.

## الخطوة 4 — نشر الموقع مع وظائف API
ارجع إلى الطرفية التي تعمل داخل مجلد `a5` (المجلد الذي يحتوي `wrangler.toml` ومجلد `functions/`) ثم نفّذ:

```bash
npx wrangler@latest pages deploy . --project-name site-a5
```

إذا اخترت اسماً مختلفاً في الخطوة الأولى، استبدل `site-a5` بالاسم الذي اخترته.

**مهم:** نفّذ الأمر من داخل مجلد `a5` نفسه حتى يكتشف Wrangler مجلد `functions/` ويرفعه مع ملفات الموقع. لا ترفع ملف ZIP إلى لوحة Cloudflare يدوياً.

## الخطوة 5 — اختبارات ما بعد النشر
بعد انتهاء النشر، افتح عنوان `https://site-a5.pages.dev` (أو العنوان الذي يعرضه Cloudflare) واختبر بالترتيب:

1. الصفحة الرئيسية والصفحات الداخلية والصور.
2. صفحة تسجيل دخول الإدارة.
3. تسجيل الدخول بحساب Owner الذي أنشأته في Supabase Auth.
4. فتح صفحة إعدادات الاتصالات والتأكد أن التخزين الآمن جاهز.
5. تجربة قراءة بيانات لوحة الإدارة.
6. تجربة نموذج التواصل، ثم التأكد من وصول السجل إلى Supabase.
7. مراجعة Cloudflare Pages > Deployments وFunctions logs عند ظهور أي خطأ.

لا تعتبر النشر ناجحاً بالكامل بمجرد ظهور الصفحة الرئيسية؛ يجب اختبار وظائف `/api/` أيضاً.

## إعدادات اختيارية — لا تضفها إلا إذا كنت تستخدم الميزة
| الاسم | النوع | متى تحتاجه؟ |
|---|---|---|
| `TRACKING_HASH_SECRET` | Secret | لدعم روابط تتبع البريد القديمة التي تحتوي عنوان بريد |
| `TELEGRAM_BOT_TOKEN` | Secret | إذا أردت تفعيل إشعارات Telegram؛ أنشئ رمزاً جديداً ولا تستخدم الرمز القديم الذي سبق كشفه |
| `TELEGRAM_CHAT_ID` | Variable | مع إعداد Telegram |
| `WEB3FORMS_ACCESS_KEY` | Secret | إذا أردت إشعار البريد عبر Web3Forms |
| `TURNSTILE_SECRET_KEY` | Secret | لا تضفه إلا بعد تركيب Widget المطابق في نموذج التواصل |
| `GOOGLE_APPS_SCRIPT_URL` | Variable/Secret | فقط إذا أعددت تكامل Google Sheets |
| `GOOGLE_SHEETS_ENABLED` | Variable | اجعله `true` فقط عند تفعيل تكامل Google Sheets |

يمكن ترك الخيارات الاختيارية غير مضبوطة في البداية. لا تُفعّل Turnstile قبل إضافة عنصره المطابق إلى الواجهة.

## حل المشكلات
- `secure_storage_not_configured`: تحقق من ربط KV بالاسم `CONFIG_KV` ومن إضافة `CONFIG_ENCRYPTION_KEY` كـ Secret بطول 32 حرفاً على الأقل، ثم أعد النشر.
- خطأ Supabase أو `invalid API key`: راجع `SUPABASE_URL` وPublishable Key وSecret Key وتأكد من اختيار بيئة Production.
- الصفحة تعمل لكن `/api/` لا يعمل: غالباً تم استخدام Drag and Drop بدلاً من Wrangler أو تم تنفيذ أمر النشر من مجلد خاطئ.
- فشل تسجيل الدخول: تأكد أن المستخدم موجود في Supabase Auth وأن صفه في `admin_profiles` نشط ودوره `owner`، ثم راجع سجلات Pages Functions.

## ما لم يتم تنفيذه بعد
هذا الدليل والحزمة لا ينشئان مشروع Cloudflare داخل حسابك، ولا يضيفان الأسرار، ولا ينفذان النشر نيابة عنك؛ لا نملك جلسة دخول إلى حساب Cloudflare. هذه خطوات يجب تنفيذها من حسابك.

كما أن نجاح اختبارات المشروع المحلية لا يثبت نجاح الاتصال الحي. بعد النشر سنحتاج إلى مراجعة نتيجة الاختبارات الحية وسجلات Cloudflare.

## مراجع Cloudflare الرسمية
- Direct Upload وWrangler: https://developers.cloudflare.com/pages/get-started/direct-upload/
- Pages Functions: https://developers.cloudflare.com/pages/functions/get-started/
- Pages Bindings وKV وSecrets: https://developers.cloudflare.com/pages/functions/bindings/
