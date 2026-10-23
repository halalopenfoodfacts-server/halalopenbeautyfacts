// Mesure d'audience sans cookie : une page vue envoyée à notre API (/proxy/v2/hit), rien d'autre.
// Pas d'identifiant stocké ; le pays est déduit du fuseau horaire, côté serveur.
// Non envoyé si le navigateur demande à ne pas être suivi (Do Not Track, Global Privacy Control)
// ni en local (tests E2E, serveur de développement).
export function sendPageView() {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl) return;
    if (['localhost', '127.0.0.1'].includes(window.location.hostname) || !navigator.sendBeacon) return;
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* fuseau inconnu */ }
    const body = JSON.stringify({ p: window.location.pathname + window.location.search, tz });
    navigator.sendBeacon('/proxy/v2/hit', new Blob([body], { type: 'application/json' }));
}
