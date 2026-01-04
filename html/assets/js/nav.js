// Navigation functionality
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
    const donateLink = document.getElementById('donate-link');
    const footerDonateLink = document.getElementById('footer-donate-link');
    
    const donationUrl = 'donate.html';
    
    if (donateLink) {
        donateLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = donationUrl;
        });
    }
    
    if (footerDonateLink) {
        footerDonateLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = donationUrl;
        });
    }
});
