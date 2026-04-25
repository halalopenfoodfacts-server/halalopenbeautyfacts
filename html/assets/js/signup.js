'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('signup-form');
    const submitButton = document.getElementById('signup-submit');
    const statusBox = document.getElementById('signup-status');
    const proToggle = document.getElementById('pro-toggle');
    const proFields = document.getElementById('pro-fields');
    const teamField = document.getElementById('team_1');
    const passwordInput = document.getElementById('password');
    const confirmInput = document.getElementById('confirm_password');
    const passwordHint = document.getElementById('password-hint');
    const userIdInput = document.getElementById('userid');
    const authBridge = window.HalalAuthBridge || null;

    const toggleProFields = () => {
        if (!proFields) return;
        proFields.hidden = !proToggle?.checked;
    };

    const validatePasswords = () => {
        if (!passwordInput || !confirmInput || !passwordHint) return;
        const mismatch = confirmInput.value.length > 0 && passwordInput.value !== confirmInput.value;
        if (mismatch) {
            passwordHint.textContent = 'Les mots de passe ne correspondent pas.';
            confirmInput.setCustomValidity('Passwords do not match');
        } else {
            passwordHint.textContent = '';
            confirmInput.setCustomValidity('');
        }
    };

    const handleTeamField = () => {
        if (!teamField) return;
        const defaultTeam = teamField.dataset.defaultTeam || '';
        teamField.addEventListener('blur', () => {
            if (!teamField.value.trim() && defaultTeam) {
                teamField.value = defaultTeam;
            }
        });
    };

    if (proToggle) {
        proToggle.addEventListener('change', toggleProFields);
        toggleProFields();
    }

    if (passwordInput && confirmInput) {
        passwordInput.addEventListener('input', validatePasswords);
        confirmInput.addEventListener('input', validatePasswords);
    }

    handleTeamField();

    if (form) {
        if (authBridge && typeof authBridge.ensureRedirectField === 'function') {
            authBridge.ensureRedirectField(form);
        }
        if (authBridge && typeof authBridge.ensureBridgeTarget === 'function') {
            const hasBridge = authBridge.ensureBridgeTarget();
            if (hasBridge && typeof authBridge.bridgeTarget === 'string') {
                form.target = authBridge.bridgeTarget;
            } else {
                form.removeAttribute('target');
            }
        }
        form.addEventListener('submit', (event) => {
            if (!form.checkValidity()) {
                event.preventDefault();
                form.reportValidity();
                return;
            }

            if (authBridge && typeof authBridge.persistIntent === 'function') {
                authBridge.persistIntent(userIdInput?.value || '', 'signup');
            }
            if (authBridge && typeof authBridge.redirectHomeAfterSubmit === 'function') {
                authBridge.redirectHomeAfterSubmit();
            }

            const originalLabel = submitButton?.textContent || '';
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Transmission en cours...';
            }
            if (statusBox) {
                statusBox.textContent = 'Votre demande s\'ouvre sur openbeautyfacts.org dans un nouvel onglet.';
            }

            setTimeout(() => {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = originalLabel || 'Créer mon compte';
                }
                if (statusBox) {
                    statusBox.textContent = 'Si rien ne s\'ouvre, verifiez votre bloqueur de pop-up.';
                }
            }, 4500);
        });
    }
});
