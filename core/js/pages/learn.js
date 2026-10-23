import { html } from '../lib/html.js';
import { $, setHtml } from '../ui/dom.js';
import { initShell } from '../ui/shell.js';

initShell();

const data = JSON.parse($('#learn-data')?.textContent || '{}');
const checker = data.checker || [];
const quiz = data.quiz || [];
const LABEL = { haram: 'Non conforme', doubtful: 'À vérifier', halal: 'Généralement halal', unknown: 'Inconnu' };
const fold = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Correspondance par mot entier (avant : « vin » trouvé dans « vinaigre »). */
export function lookupIngredient(input) {
    const query = fold(input).replace(/\s+/g, ' ');
    if (!query) return null;
    const exact = checker.find((entry) => fold(entry.term) === query);
    if (exact) return exact;
    const severity = { haram: 0, doubtful: 1, halal: 2 };
    return checker
        .filter((entry) => new RegExp(`(^|[^a-z0-9])${fold(entry.term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(query))
        .sort((a, b) => severity[a.status] - severity[b.status])[0] || null;
}

const form = $('[data-checker]');
form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = form.elements.term.value;
    const result = lookupIngredient(value);
    const box = $('[data-checker-result]');
    setHtml(box, result
        ? html`<p class="checker-result checker-result--${result.status}"><strong>${LABEL[result.status]} — ${/^e\d/.test(result.term) ? result.term.toUpperCase() : result.term}</strong><br>${result.text}</p>`
        : html`<p class="checker-result checker-result--unknown">« ${value} » n'est pas dans notre liste. Cela ne signifie pas qu'il est halal : consultez l'organisme certificateur.</p>`);
});

let index = 0;
let score = 0;
function renderQuiz() {
    const box = $('[data-quiz]');
    if (!box || !quiz.length) return;
    if (index >= quiz.length) {
        setHtml(box, html`<h3>Résultat : ${score} / ${quiz.length}</h3><p>${score === quiz.length ? 'Parfait, vous maîtrisez les bases !' : 'Relisez les repères ci-dessus puis réessayez.'}</p><button class="btn btn--primary" type="button" data-restart style="margin-top:1rem">Recommencer</button>`);
        $('[data-restart]', box).addEventListener('click', () => { index = 0; score = 0; renderQuiz(); });
        return;
    }
    const question = quiz[index];
    setHtml(box, html`<p class="mono muted">Question ${index + 1} / ${quiz.length}</p>
        <h3 style="margin-block:.5rem 1rem">${question.q}</h3>
        <div class="stack" style="gap:.5rem">${question.choices.map((choice, i) => html`<button class="quiz-option" type="button" data-choice="${i}">${choice}</button>`)}</div>
        <p data-explain aria-live="polite" style="margin-top:1rem"></p>`);
    box.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => {
        const chosen = Number(button.dataset.choice);
        const correct = chosen === question.correct;
        if (correct) score += 1;
        box.querySelectorAll('[data-choice]').forEach((option) => {
            option.disabled = true;
            if (Number(option.dataset.choice) === question.correct) option.classList.add('is-correct');
        });
        if (!correct) button.classList.add('is-wrong');
        const explain = $('[data-explain]', box);
        explain.textContent = `${correct ? 'Bonne réponse.' : 'Pas tout à fait.'} ${question.explain || ''}`;
        const next = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn--primary', textContent: index + 1 < quiz.length ? 'Question suivante' : 'Voir le résultat' });
        next.style.marginTop = '1rem';
        next.addEventListener('click', () => { index += 1; renderQuiz(); });
        explain.after(next);
        next.focus();
    }));
}
renderQuiz();
