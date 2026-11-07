// ============================================================
// 📋 global-forms.js — نظام إدارة الفورمات الموحد v2.1
// ============================================================
// ✅ يتعامل مع: فورم التواصل + فورم النشرة البريدية
// ✅ يرسل إلى: Web3Forms + Telegram Bot
// ✅ متوافق تماماً مع: shared-tracker-core.js, telegram-tracker.js,
//    sheets-tracker.js, email-tracker.js
// ✅ يستخدم parse_mode: HTML (نفس التراكر — لا تعارض)
// ✅ لا يعدّل على window.TrackerCore أو EventBus
// ============================================================

(function () {
    'use strict';

    // ============================================================
    // ⚙️ الإعدادات
    // ============================================================
    var CONFIG = {
        // — Web3Forms —
        web3forms: {
            contactAccessKey: 'd5649aba-c651-4dfe-b15d-a6fe1438da10',
            newsletterAccessKey: '94b920e4-a574-497a-a553-a3841670258f',
            endpoint: 'https://api.web3forms.com/submit'
        },

        // Telegram credentials are stored only as Cloudflare Pages secrets.
        telegram: { endpoint: '/api/telegram', enabled: true },

// — رسائل المستخدم —
        messages: {
            sending: 'جاري الإرسال...',
            contactSuccess: 'تم إرسال رسالتك بنجاح! 🎉',
            contactSuccessSub: 'سأرد عليك خلال 24 ساعة.',
            contactError: 'حدث خطأ أثناء الإرسال. يرجى المحاولة مرة أخرى أو التواصل عبر واتساب.',
            newsletterSuccess: '✓ تم الاشتراك!',
            newsletterError: 'خطأ في الاشتراك!',
            validationName: 'يرجى إدخال الاسم الكامل',
            validationEmail: 'يرجى إدخال بريد إلكتروني صحيح',
            validationMessage: 'يرجى كتابة تفاصيل المشروع'
        },

        // — إعدادات عامة —
        successResetDelay: 3000,
        debug: false
    };

    // ============================================================
    // 🛠️ أدوات مساعدة
    // ============================================================

    function log(message, data) {
        if (!CONFIG.debug) return;
        if (data !== undefined) {
            console.log('[Forms] ' + message, data);
        } else {
            console.log('[Forms] ' + message);
        }
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function getCurrentPageName() {
        var path = window.location.pathname;
        var fileName = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
        return fileName;
    }

    function getSaudiDateTime() {
        try {
            return new Date().toLocaleString('ar-SA', {
                timeZone: 'Asia/Riyadh',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
        } catch (e) {
            return new Date().toLocaleString();
        }
    }

    /**
     * Escape لـ HTML (نفس أسلوب التراكر — لضمان التوافق)
     */
    function escHTML(t) {
        if (!t) return '';
        return String(t)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * محاولة الحصول على معلومات الزائر من TrackerCore (إن وجد)
     * هذا للإثراء فقط — لا يعدّل شيئاً في التراكر
     */
    function getVisitorInfo() {
        var info = {
            user: 'غير محدد',
            visitorId: '-',
            country: '-',
            city: '-',
            device: '-',
            browser: '-',
            source: '-'
        };

        try {
            if (window.TrackerCore && window.TrackerCore.ready && window.TrackerCore.data) {
                var d = window.TrackerCore.data;
                info.user = d.user || 'غير محدد';
                info.visitorId = d.visitorId || '-';
                info.country = (d.geo && d.geo.country) ? d.geo.country : '-';
                info.city = (d.geo && d.geo.city) ? d.geo.city : '-';
                info.device = (d.dev && d.dev.type) ? d.dev.type : '-';
                info.browser = (d.dev && d.dev.browser) ? d.dev.browser : '-';
                info.source = (d.source && d.source.name) ? d.source.name : '-';
            }
        } catch (e) {
            log('⚠️ لم يتم الوصول لبيانات التراكر (طبيعي إن لم يكن محمّلاً)');
        }

        return info;
    }

    // ============================================================
    // 📤 إرسال Web3Forms
    // ============================================================

    async function sendToWeb3Forms(data, accessKey) {
        try {
            log('إرسال إلى Web3Forms...', data);

            var formData = new FormData();
            formData.append('access_key', accessKey);

            var keys = Object.keys(data);
            for (var i = 0; i < keys.length; i++) {
                formData.append(keys[i], data[keys[i]]);
            }

            var response = await fetch(CONFIG.web3forms.endpoint, {
                method: 'POST',
                body: formData,
                headers: { 'Accept': 'application/json' }
            });

            var result = await response.json();

            if (response.ok && result.success) {
                log('✅ Web3Forms: تم الإرسال بنجاح');
                return true;
            } else {
                log('❌ Web3Forms: فشل الإرسال', result);
                return false;
            }
        } catch (error) {
            log('❌ Web3Forms: خطأ في الاتصال', error);
            return false;
        }
    }

    // ============================================================
    // 📤 إرسال Telegram (بصيغة HTML — متوافق مع التراكر)
    // ============================================================

    async function sendToTelegram(message) {
        if (!CONFIG.telegram.enabled) return true;
        if (!message || !String(message).trim()) return false;
        try {
            var response = await fetch(CONFIG.telegram.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: 'form', message: String(message).substring(0, 3900) }),
                keepalive: true
            });
            return response.ok;
        } catch (error) {
            log('❌ Telegram relay: خطأ في الاتصال', error);
            return false;
        }
    }

    // ============================================================
    // 📋 بناء رسائل Telegram (بصيغة HTML)
    // ============================================================

    function buildContactTelegramMessage(data) {
        var visitor = getVisitorInfo();

        var m = '📩 <b>طلب استشارة جديد</b>\n';
        m += '━━━━━━━━━━━━━━━━━━━━━\n\n';

        m += '👤 <b>الاسم:</b> ' + escHTML(data.name) + '\n';
        m += '📧 <b>البريد:</b> ' + escHTML(data.email) + '\n';
        m += '📱 <b>الجوال:</b> ' + escHTML(data.phone) + '\n\n';

        m += '━━━━━━━━━━━━━━━━━━━━━\n';
        m += '💬 <b>تفاصيل المشروع:</b>\n';
        m += escHTML(data.message) + '\n\n';

        m += '━━━━━━━━━━━━━━━━━━━━━\n';
        m += '📄 <b>من صفحة:</b> ' + escHTML(data.source_page) + '\n';
        m += '🕐 <b>التاريخ:</b> ' + escHTML(data.submitted_at) + '\n';

        // إثراء بمعلومات التراكر (إن وُجدت)
        if (visitor.user !== 'غير محدد' && visitor.user !== 'مجهول') {
            m += '\n🔍 <b>معلومات إضافية من التراكر:</b>\n';
            m += '🆔 زائر: <code>' + escHTML(visitor.visitorId) + '</code>\n';
            m += '🌍 الموقع: ' + escHTML(visitor.country);
            if (visitor.city && visitor.city !== '-') m += '، ' + escHTML(visitor.city);
            m += '\n';
            m += '📱 الجهاز: ' + escHTML(visitor.device) + ' | ' + escHTML(visitor.browser) + '\n';
            m += '🔎 المصدر: ' + escHTML(visitor.source) + '\n';
        }

        m += '━━━━━━━━━━━━━━━━━━━━━';

        return m;
    }

    function buildNewsletterTelegramMessage(email) {
        var visitor = getVisitorInfo();

        var m = '📬 <b>اشتراك جديد في النشرة البريدية</b>\n';
        m += '━━━━━━━━━━━━━━━━━━━━━\n\n';

        m += '📧 <b>البريد:</b> ' + escHTML(email) + '\n';
        m += '📄 <b>من صفحة:</b> ' + escHTML(getCurrentPageName()) + '\n';
        m += '🕐 <b>التاريخ:</b> ' + escHTML(getSaudiDateTime()) + '\n';

        // إثراء بمعلومات التراكر
        if (visitor.country && visitor.country !== '-') {
            m += '🌍 ' + escHTML(visitor.country) + '\n';
        }

        m += '━━━━━━━━━━━━━━━━━━━━━';

        return m;
    }

    // ============================================================
    // 📝 معالج فورم التواصل الرئيسي
    // ============================================================

    function initContactForm() {
        var form = document.getElementById('contact-form');
        // Some pages use #contact-form as a SECTION wrapper and own a separate form handler.
        // Only bind here when the ID belongs to an actual FORM element.
        if (form && form.tagName !== 'FORM') form = null;
        if (!form) {
            log('ℹ️ لا يوجد فورم تواصل في هذه الصفحة');
            return;
        }

        log('✅ تم العثور على فورم التواصل');

        // إزالة action و method القديمة
        form.removeAttribute('action');
        form.removeAttribute('method');

        // إزالة الحقول المخفية القديمة
        var hiddenSelectors = [
            'input[name="access_key"]',
            'input[name="subject"]',
            'input[name="from_name"]',
            'input[name="redirect"]'
        ];
        for (var h = 0; h < hiddenSelectors.length; h++) {
            var hiddenFields = form.querySelectorAll(hiddenSelectors[h]);
            for (var hf = 0; hf < hiddenFields.length; hf++) {
                hiddenFields[hf].remove();
            }
        }

        var submitBtn = form.querySelector('button[type="submit"]')
                     || form.querySelector('#submit-btn');
        var successDiv = document.getElementById('form-success');

        var originalBtnHTML = submitBtn ? submitBtn.innerHTML : '';

        // منع إضافة listener مزدوج
        if (form.dataset.gfInit === 'true') return;
        form.dataset.gfInit = 'true';

        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            // ======= جمع البيانات =======
            var nameField = form.querySelector('[name="name"]');
            var emailField = form.querySelector('[name="email"]');
            var phoneField = form.querySelector('[name="phone"]');
            var messageField = form.querySelector('[name="message"]');

            var name = (nameField ? nameField.value : '').trim();
            var email = (emailField ? emailField.value : '').trim();
            var phone = (phoneField ? phoneField.value : '').trim();
            var message = (messageField ? messageField.value : '').trim();

            // ======= التحقق =======
            if (!name) {
                showFieldError(nameField, CONFIG.messages.validationName);
                return;
            }
            if (!email || !isValidEmail(email)) {
                showFieldError(emailField, CONFIG.messages.validationEmail);
                return;
            }
            if (!message) {
                showFieldError(messageField, CONFIG.messages.validationMessage);
                return;
            }

            // ======= حالة التحميل =======
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<svg class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">'
                    + '<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>'
                    + '<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>'
                    + '</svg>'
                    + '<span>' + CONFIG.messages.sending + '</span>';
            }

            // ======= تجهيز البيانات =======
            var formDataObj = {
                name: name,
                email: email,
                phone: phone || 'غير محدد',
                message: message,
                subject: 'طلب استشارة جديد من الموقع',
                from_name: 'موقع عبدالله نبيل',
                source_page: getCurrentPageName(),
                submitted_at: getSaudiDateTime()
            };

            // ======= الإرسال المتوازي =======
            try {
                var results = await Promise.allSettled([
                    sendToWeb3Forms(formDataObj, CONFIG.web3forms.contactAccessKey),
                    sendToTelegram(buildContactTelegramMessage(formDataObj))
                ]);

                var web3OK = results[0].status === 'fulfilled' && results[0].value === true;
                var tgOK = results[1].status === 'fulfilled' && results[1].value === true;

                log('النتائج — Web3Forms: ' + web3OK + ', Telegram: ' + tgOK);

                if (web3OK || tgOK) {
                    // ======= نجاح =======
                    form.reset();
                    form.style.display = 'none';

                    if (successDiv) {
                        successDiv.classList.remove('hidden');
                        successDiv.innerHTML = ''
                            + '<svg class="w-12 h-12 text-green-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">'
                            + '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>'
                            + '</svg>'
                            + '<p class="text-green-800 font-bold text-lg">' + CONFIG.messages.contactSuccess + '</p>'
                            + '<p class="text-green-600 text-sm mt-2">' + CONFIG.messages.contactSuccessSub + '</p>';
                    }

                    log('✅ تم إرسال فورم التواصل بنجاح');
                } else {
                    throw new Error('فشل الإرسال لكلا الخدمتين');
                }
            } catch (error) {
                log('❌ خطأ في إرسال فورم التواصل', error);
                showFormError(CONFIG.messages.contactError);
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnHTML;
                }
            }
        });

        log('✅ تم تهيئة فورم التواصل');
    }

    // ============================================================
    // 📧 معالج فورم النشرة البريدية
    // ============================================================

    function initNewsletterForm() {
        var forms = document.querySelectorAll(
            '#newsletter-form, [data-form="newsletter"], form[data-newsletter]'
        );

        if (forms.length === 0) {
            log('ℹ️ لا يوجد فورم نشرة بريدية');
            return;
        }

        for (var fi = 0; fi < forms.length; fi++) {
            setupSingleNewsletter(forms[fi], fi);
        }

        log('✅ تم تهيئة ' + forms.length + ' فورم نشرة بريدية');
    }

    function setupSingleNewsletter(form, index) {
        log('✅ فورم نشرة بريدية #' + (index + 1));

        // إزالة action و method
        form.removeAttribute('action');
        form.removeAttribute('method');

        // إزالة الحقول المخفية القديمة
        var hiddenSelectors = [
            'input[name="access_key"]',
            'input[name="subject"]',
            'input[name="from_name"]',
            'input[name="redirect"]'
        ];
        for (var h = 0; h < hiddenSelectors.length; h++) {
            var fields = form.querySelectorAll(hiddenSelectors[h]);
            for (var f = 0; f < fields.length; f++) {
                fields[f].remove();
            }
        }

        var btn = form.querySelector('button[type="submit"]');
        var emailInput = form.querySelector('input[name="email"]')
                      || form.querySelector('input[type="email"]');
        var originalText = btn ? btn.textContent : 'اشترك';

        // منع التكرار
        if (form.dataset.gfInit === 'true') return;
        form.dataset.gfInit = 'true';

        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            var email = (emailInput ? emailInput.value : '').trim();

            if (!email || !isValidEmail(email)) {
                if (emailInput) {
                    emailInput.classList.add('border-red-500');
                    emailInput.focus();
                    setTimeout(function () {
                        emailInput.classList.remove('border-red-500');
                    }, 3000);
                }
                return;
            }

            // حالة التحميل
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'جاري...';
            }

            var formDataObj = {
                name: 'مشترك نشرة بريدية',
                email: email,
                subject: 'اشتراك جديد في النشرة البريدية',
                from_name: 'النشرة البريدية - موقع عبدالله نبيل',
                message: 'اشتراك جديد في النشرة البريدية من: ' + email,
                source_page: getCurrentPageName(),
                submitted_at: getSaudiDateTime()
            };

            try {
                var results = await Promise.allSettled([
                    sendToWeb3Forms(formDataObj, CONFIG.web3forms.newsletterAccessKey),
                    sendToTelegram(buildNewsletterTelegramMessage(email))
                ]);

                var web3OK = results[0].status === 'fulfilled' && results[0].value === true;
                var tgOK = results[1].status === 'fulfilled' && results[1].value === true;

                if (web3OK || tgOK) {
                    if (btn) {
                        btn.textContent = CONFIG.messages.newsletterSuccess;
                        btn.classList.remove('bg-saudi');
                        btn.classList.add('bg-green-600');
                    }
                    if (emailInput) emailInput.value = '';

                    log('✅ تم إرسال اشتراك النشرة البريدية');

                    setTimeout(function () {
                        if (btn) {
                            btn.textContent = originalText;
                            btn.classList.remove('bg-green-600');
                            btn.classList.add('bg-saudi');
                            btn.disabled = false;
                        }
                    }, CONFIG.successResetDelay);
                } else {
                    throw new Error('فشل');
                }
            } catch (error) {
                log('❌ خطأ في النشرة البريدية', error);

                if (btn) {
                    btn.textContent = CONFIG.messages.newsletterError;
                    btn.classList.remove('bg-saudi');
                    btn.classList.add('bg-red-500');
                }

                setTimeout(function () {
                    if (btn) {
                        btn.textContent = originalText;
                        btn.classList.remove('bg-red-500');
                        btn.classList.add('bg-saudi');
                        btn.disabled = false;
                    }
                }, CONFIG.successResetDelay);
            }
        });
    }

    // ============================================================
    // 🎨 واجهة المستخدم
    // ============================================================

    function showFieldError(field, message) {
        if (!field) return;

        field.classList.add('border-red-500', 'ring-2', 'ring-red-200');
        field.focus();

        var parent = field.parentElement;
        var errorEl = parent ? parent.querySelector('.gf-error-msg') : null;

        if (!errorEl && parent) {
            errorEl = document.createElement('p');
            errorEl.className = 'gf-error-msg text-red-500 text-xs mt-1 font-medium';
            parent.appendChild(errorEl);
        }

        if (errorEl) errorEl.textContent = message;

        function removeError() {
            field.classList.remove('border-red-500', 'ring-2', 'ring-red-200');
            if (errorEl && errorEl.parentNode) errorEl.parentNode.removeChild(errorEl);
            field.removeEventListener('input', removeError);
        }

        field.addEventListener('input', removeError);
        setTimeout(removeError, 5000);
    }

    function showFormError(message) {
        alert(message);
    }

    // ============================================================
    // 🚀 التهيئة
    // ============================================================

    function init() {
        log('🚀 بدء تهيئة نظام الفورمات v2.1');
        log('📄 الصفحة: ' + getCurrentPageName());

        initContactForm();
        initNewsletterForm();

        log('✅ اكتمل تهيئة نظام الفورمات');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // API عام (لا يتعارض مع TrackerCore)
    window.GlobalForms = {
        config: CONFIG,
        version: '2.1'
    };

})();