// Navigation functionality
const detectPortal = () => {
    const docPortal = document?.documentElement?.dataset?.portal;
    if (docPortal) {
        return docPortal.toLowerCase();
    }
    const path = (window?.location?.pathname || '').toLowerCase();
    if (path.includes('/beauty/')) {
        return 'beauty';
    }
    if (path.includes('/food/')) {
        return 'food';
    }
    const host = (window?.location?.hostname || '').toLowerCase();
    if (host.includes('beauty')) {
        return 'beauty';
    }
    if (host.includes('food')) {
        return 'food';
    }
    return 'beauty';
};

const ensurePortalDataset = () => {
    const portal = detectPortal();
    if (document?.documentElement) {
        document.documentElement.dataset.portal = portal;
    }
    if (document?.body) {
        document.body.dataset.portal = portal;
    }
    return portal;
};

const activePortal = ensurePortalDataset();

document.addEventListener('DOMContentLoaded', () => {
    // Hamburger menu toggle
    const hamburger = document.getElementById('hamburger-btn');
    const navMenu = document.getElementById('nav-menu');
    
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }

    // Close fundraiser banner
    const closeBanner = document.getElementById('close-banner');
    const banner = document.getElementById('fundraiser-banner');
    
    if (closeBanner && banner) {
        closeBanner.addEventListener('click', () => {
            banner.style.display = 'none';
        });
    }

    // Donation links
    const donationUrl = 'donate.html';
    const donationLinks = document.querySelectorAll('#donate-link, #footer-donate-link, [data-donate-link]');
    donationLinks.forEach((link) => {
        if (!link) return;
        link.setAttribute('href', donationUrl);
        link.dataset.route = 'donate';
        link.dataset.portal = activePortal;
    });
});
