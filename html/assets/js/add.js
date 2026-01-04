document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('add-product-form');
    const feedback = document.getElementById('form-feedback');

    if (!form || !feedback) {
        return;
    }

    const API_BASE = 'https://world.openbeautyfacts.org/api/v0/product';

    function showFeedback(type, message) {
        feedback.className = `form-feedback ${type}`;
        feedback.textContent = message;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(form);
        const code = formData.get('code');
        const userId = formData.get('user_id');
        const password = formData.get('password');

        if (!code || !userId || !password) {
            showFeedback('error', 'Merci de remplir tous les champs obligatoires.');
            return;
        }

        const payload = new URLSearchParams();
        formData.forEach((value, key) => {
            if (value) {
                payload.append(key, value.toString());
            }
        });
        payload.append('comment', 'Ajout via Halal Open Beauty Facts');

        showFeedback('success', '⏳ Envoi en cours vers Open Beauty Facts...');

        try {
            const response = await fetch(`${API_BASE}/${code}.json`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: payload.toString()
            });

            const data = await response.json();

            if (data.status === 1) {
                showFeedback('success', '✅ Produit enregistré ! Vous pouvez maintenant ajouter des photos via l\'application.');
                form.reset();
            } else {
                const message = data.status_verbose || "L'API a refusé l'ajout. Vérifiez les informations fournies.";
                showFeedback('error', `⚠️ ${message}`);
            }
        } catch (error) {
            console.error('Add product error', error);
            showFeedback('error', "Une erreur réseau est survenue. Merci de réessayer plus tard.");
        }
    });
});
