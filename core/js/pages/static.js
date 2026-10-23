// Pages sans logique propre (contenu éditorial, erreurs, hors ligne)
import { initSearchBox } from '../ui/search-box.js';
import { initShell } from '../ui/shell.js';

initShell();
document.querySelectorAll('[data-search-form]').forEach((form) => initSearchBox(form));
