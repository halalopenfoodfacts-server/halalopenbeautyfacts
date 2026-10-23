// Moteur de gabarits minimal (sans dépendance) utilisé au build.
//
//   {{ chemin.vers.valeur }}        valeur échappée (HTML)
//   {{{ chemin }}}                  valeur brute
//   {{> nom }}                      inclusion d'un fragment (partials)
//   {{#if chemin}} … {{else}} … {{/if}}
//   {{#unless chemin}} … {{/unless}}
//   {{#each chemin}} … {{this.x}} … {{/each}}

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function lookup(context, path) {
    if (path === 'this') return context.this;
    return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), context);
}

const TOKEN = /\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*(#if|#unless|#each|\/if|\/unless|\/each|else|>)?\s*([\w.:-]*)\s*\}\}/g;

function tokenize(source) {
    const tokens = [];
    let last = 0;
    for (const match of source.matchAll(TOKEN)) {
        if (match.index > last) tokens.push({ type: 'text', value: source.slice(last, match.index) });
        if (match[1]) tokens.push({ type: 'raw', path: match[1] });
        else if (!match[2]) tokens.push({ type: 'var', path: match[3] });
        else tokens.push({ type: match[2], path: match[3] });
        last = match.index + match[0].length;
    }
    if (last < source.length) tokens.push({ type: 'text', value: source.slice(last) });
    return tokens;
}

function parse(tokens, closing = null) {
    const nodes = [];
    while (tokens.length) {
        const token = tokens.shift();
        if (token.type === closing || token.type === 'else') {
            return { nodes, end: token.type };
        }
        if (token.type === '#if' || token.type === '#unless' || token.type === '#each') {
            const close = '/' + token.type.slice(1);
            const body = parse(tokens, close);
            const node = { type: token.type, path: token.path, body: body.nodes, alt: [] };
            if (body.end === 'else') node.alt = parse(tokens, close).nodes;
            nodes.push(node);
        } else if (token.type.startsWith('/')) {
            throw new Error(`Bloc ${token.type} inattendu`);
        } else {
            nodes.push(token);
        }
    }
    if (closing) throw new Error(`Bloc non fermé : ${closing}`);
    return { nodes, end: null };
}

function truthy(value) {
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function renderNodes(nodes, context, partials, depth) {
    let out = '';
    for (const node of nodes) {
        switch (node.type) {
            case 'text': out += node.value; break;
            case 'var': out += escapeHtml(lookup(context, node.path)); break;
            case 'raw': out += String(lookup(context, node.path) ?? ''); break;
            case '>': {
                if (!(node.path in partials)) throw new Error(`Fragment introuvable : ${node.path}`);
                if (depth > 20) throw new Error('Inclusions trop profondes');
                out += render(partials[node.path], context, partials, depth + 1);
                break;
            }
            case '#if':
                out += renderNodes(truthy(lookup(context, node.path)) ? node.body : node.alt, context, partials, depth);
                break;
            case '#unless':
                out += renderNodes(truthy(lookup(context, node.path)) ? node.alt : node.body, context, partials, depth);
                break;
            case '#each': {
                const items = lookup(context, node.path) || [];
                if (!items.length) { out += renderNodes(node.alt, context, partials, depth); break; }
                items.forEach((item, index) => {
                    out += renderNodes(node.body, { ...context, this: item, index }, partials, depth);
                });
                break;
            }
            default: throw new Error(`Nœud inconnu ${node.type}`);
        }
    }
    return out;
}

export function render(source, context = {}, partials = {}, depth = 0) {
    return renderNodes(parse(tokenize(source)).nodes, context, partials, depth);
}

// En-tête JSON des pages :  ---\n{ … }\n---\n<contenu>
export function splitFrontMatter(source) {
    const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (!match) return { meta: {}, body: source };
    return { meta: JSON.parse(match[1]), body: source.slice(match[0].length) };
}
