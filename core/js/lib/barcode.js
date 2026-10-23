// Codes-barres GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) : validation et rendu SVG.

export function normalizeBarcode(value) {
    return String(value ?? '').replace(/[\s-]/g, '');
}

export function looksLikeBarcode(value) {
    return /^\d{8,14}$/.test(normalizeBarcode(value));
}

/** Clé de contrôle GS1 (modulo 10, pondération 3/1 depuis la droite). */
export function isValidGtin(value) {
    const code = normalizeBarcode(value);
    if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
    const digits = [...code].map(Number);
    const check = digits.pop();
    const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === check;
}

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** Séquence de modules (« 1 » = barre) d'un EAN-13 / UPC-A / EAN-8 ; null si non encodable. */
export function encodeEan(value) {
    let code = normalizeBarcode(value);
    if (code.length === 12) code = '0' + code;   // UPC-A → EAN-13
    if (!isValidGtin(code)) return null;
    if (code.length === 13) {
        const parity = PARITY[Number(code[0])];
        let bits = '101';
        for (let i = 1; i <= 6; i += 1) bits += (parity[i - 1] === 'L' ? L : G)[Number(code[i])];
        bits += '01010';
        for (let i = 7; i <= 12; i += 1) bits += R[Number(code[i])];
        return bits + '101';
    }
    if (code.length === 8) {
        let bits = '101';
        for (let i = 0; i < 4; i += 1) bits += L[Number(code[i])];
        bits += '01010';
        for (let i = 4; i < 8; i += 1) bits += R[Number(code[i])];
        return bits + '101';
    }
    return null;
}

/** SVG du code-barres (barres en currentColor) ; chaîne vide si non encodable. */
export function barcodeSvg(value, { height = 60, module = 2 } = {}) {
    const bits = encodeEan(value);
    if (!bits) return '';
    const rects = [];
    for (let i = 0; i < bits.length;) {
        if (bits[i] === '1') {
            let width = 1;
            while (bits[i + width] === '1') width += 1;
            rects.push(`<rect x="${i * module}" width="${width * module}" height="${height}"/>`);
            i += width;
        } else {
            i += 1;
        }
    }
    const width = bits.length * module;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Code-barres ${normalizeBarcode(value)}" fill="currentColor" shape-rendering="crispEdges">${rects.join('')}</svg>`;
}
