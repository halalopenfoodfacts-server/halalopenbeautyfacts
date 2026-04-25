'use strict';

(function () {
    const AUTH_WELCOME_KEY = 'halal-auth-welcome';
    const PORTAL_ID = 'beauty';
    const AUTH_TARGET_NAME = 'off-auth-bridge';
    const REDIRECT_DELAY = 600;

    const computeHomeUrl = () => {
        try {
            return new URL('index.html', window.location.href).href;
        } catch (error) {
            console.warn('Unable to resolve home URL', error);
            return 'index.html';
        }
    };

    const ensureRedirectField = (form) => {
        if (!form) return null;
        let redirectInput = form.querySelector('input[name="redirect_to"]');
        if (!redirectInput) {
            redirectInput = document.createElement('input');
            redirectInput.type = 'hidden';
            redirectInput.name = 'redirect_to';
            form.appendChild(redirectInput);
        }
        redirectInput.value = computeHomeUrl();
        return redirectInput;
    };

    const persistIntent = (username = '', type = 'signin') => {
        const safeName = (username || '').trim();
        if (!safeName) return;
        try {
            const payload = {
                portal: PORTAL_ID,
                username: safeName,
                type,
                timestamp: Date.now()
            };
            localStorage.setItem(AUTH_WELCOME_KEY, JSON.stringify(payload));
        } catch (error) {
            console.warn('Unable to persist welcome intent', error);
        }
    };

    const redirectHomeAfterSubmit = () => {
        const homeUrl = computeHomeUrl();
        setTimeout(() => {
            try {
                window.location.href = homeUrl;
            } catch (error) {
                console.warn('Unable to redirect home after auth', error);
            }
        }, REDIRECT_DELAY);
    };

    const ensureBridgeTarget = () => {
        const frame = document.querySelector(`iframe[name="${AUTH_TARGET_NAME}"]`);
        if (!frame) {
            console.warn('Auth bridge iframe missing; defaulting to top navigation');
            return false;
        }
        return true;
    };

    const hydrateLoginForm = () => {
        const loginForm = document.querySelector('form[action*="login.pl"]');
        if (!loginForm) return;
        if (ensureBridgeTarget()) {
            loginForm.target = AUTH_TARGET_NAME;
        } else {
            loginForm.removeAttribute('target');
        }
        ensureRedirectField(loginForm);
        loginForm.addEventListener('submit', () => {
            const usernameField = document.getElementById('user_id');
            persistIntent(usernameField?.value || '', 'signin');
            redirectHomeAfterSubmit();
        });
    };

    document.addEventListener('DOMContentLoaded', () => {
        hydrateLoginForm();
        window.HalalAuthBridge = Object.freeze({
            ensureRedirectField,
            persistIntent,
            computeHomeUrl,
            redirectHomeAfterSubmit,
            ensureBridgeTarget,
            bridgeTarget: AUTH_TARGET_NAME,
            storageKey: AUTH_WELCOME_KEY,
            portal: PORTAL_ID
        });
    });
})();
