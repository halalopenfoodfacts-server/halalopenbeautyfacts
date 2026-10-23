// Pays de l'utilisateur pour les listes de l'accueil : deviné une seule fois d'après le fuseau
// horaire (sans géolocalisation), puis choisi librement et mémorisé sur l'appareil.
import { store } from './storage.js';

const KEY = 'hof-country';
const BY_TIMEZONE = {
    'Africa/Casablanca': 'morocco', 'Africa/El_Aaiun': 'morocco', 'Africa/Algiers': 'algeria', 'Africa/Tunis': 'tunisia',
    'Europe/Paris': 'france', 'Europe/Brussels': 'belgium', 'Europe/London': 'united-kingdom', 'Europe/Berlin': 'germany',
    'Europe/Istanbul': 'turkey', 'Asia/Riyadh': 'saudi-arabia', 'Asia/Dubai': 'united-arab-emirates',
    'Asia/Kuala_Lumpur': 'malaysia', 'Asia/Jakarta': 'indonesia', 'America/New_York': 'united-states',
    'America/Chicago': 'united-states', 'America/Denver': 'united-states', 'America/Los_Angeles': 'united-states',
};

export function guessCountry(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    return BY_TIMEZONE[timeZone] || '';
}

/** Pays mémorisé ; à défaut, celui du fuseau horaire s'il fait partie des choix proposés. */
export function preferredCountry(available = []) {
    const saved = store.readRaw(KEY);
    if (saved !== null) return available.includes(saved) || saved === '' ? saved : '';
    const guess = guessCountry();
    return available.includes(guess) ? guess : '';
}

export function savePreferredCountry(country) {
    store.writeRaw(KEY, country);
}
