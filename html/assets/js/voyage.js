// Mode Voyage — Beauty
document.querySelectorAll('.voyage-country').forEach(btn => {
    btn.addEventListener('click', () => {
        const country = btn.dataset.country;
        const sel = document.getElementById('country-select');
        if (sel) {
            sel.value = country;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const catalogue = document.getElementById('catalogue');
        if (catalogue) catalogue.scrollIntoView({ behavior: 'smooth' });
    });
});
