/* ========================================================= */
/* Generated page JavaScript                                  */
/* The original script order has been preserved.             */
/* ========================================================= */


/* --------------------------------------------------------- */
/* Original script 1: legal.html */
/* --------------------------------------------------------- */


        (function () {
            'use strict';

            const form = document.getElementById('legal-contact-form');
            const toast = document.getElementById('legal-toast');
            const copyBtn = document.getElementById('legal-copy-btn');
            const CONTACT_EMAIL = 'legal@red-gekko.github.io';

            function buildMessage() {
                const name = document.getElementById('legal-name').value.trim() || '(not provided)';
                const email = document.getElementById('legal-email').value.trim();
                const subject = document.getElementById('legal-subject').value;
                const message = document.getElementById('legal-message').value.trim();

                return {
                    name, email, subject, message,
                    valid: !!(email && subject && message)
                };
            }

            function showToast(text) {
                toast.textContent = text;
                toast.classList.add('visible');
                setTimeout(function () {
                    toast.classList.remove('visible');
                }, 4000);
            }

            form.addEventListener('submit', function (e) {
                e.preventDefault();
                const data = buildMessage();

                if (!data.valid) {
                    showToast('⚠ Please complete the email, subject, and message fields.');
                    return;
                }

                const body = [
                    'Name: ' + data.name,
                    'Email: ' + data.email,
                    'Subject: ' + data.subject,
                    '',
                    'Message:',
                    data.message
                ].join('\n');

                const mailto = 'mailto:' + CONTACT_EMAIL +
                    '?subject=' + encodeURIComponent('[Bloodhound] ' + data.subject) +
                    '&body=' + encodeURIComponent(body);

                window.location.href = mailto;
            });

            copyBtn.addEventListener('click', function () {
                const data = buildMessage();

                if (!data.valid) {
                    showToast('⚠ Please complete the email, subject, and message fields.');
                    return;
                }

                const body = [
                    'To: ' + CONTACT_EMAIL,
                    'Name: ' + data.name,
                    'Email: ' + data.email,
                    'Subject: ' + data.subject,
                    '',
                    'Message:',
                    data.message
                ].join('\n');

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(body).then(
                        function () { showToast('✓ Message copied to clipboard.'); },
                        function () { fallbackCopy(body); }
                    );
                } else {
                    fallbackCopy(body);
                }
            });

            function fallbackCopy(text) {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try {
                    document.execCommand('copy');
                    showToast('✓ Message copied to clipboard.');
                } catch (err) {
                    showToast('⚠ Copy failed — please copy the text manually.');
                }
                document.body.removeChild(ta);
            }
        })();
    

;