/**
 * Catalogo de medios de pago del Panel de Contabilidad.
 *
 * Debe mantenerse alineado con config/payments.js de las dos tiendas: los
 * nombres de aqui son los que se usan para agrupar los reportes, asi que si en
 * la tienda una venta sale como "Addi", aqui tiene que existir "Addi" con esa
 * misma escritura.
 */

// Medios que registra a mano el equipo desde el modulo de Ventas.
const MANUAL_METHODS = [
    'Efectivo',
    'Nequi',
    'Bancolombia',
    'Banco Caja Social',
    'Davivienda',
    'Otros',
];

// Medios que llegan solos desde las tiendas online.
const ONLINE_METHODS = ['Wompi', 'Addi', 'Sistecrédito'];

const ALL_METHODS = [...MANUAL_METHODS, ...ONLINE_METHODS];

/** Quita tildes y espacios extra para poder comparar variantes. */
const simplify = (value) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

// Variantes conocidas que deben caer en un mismo nombre canonico. Sin esto,
// "ADDI", "addi" y "Addi" saldrian como tres filas distintas en los reportes.
const ALIASES = {
    addi: 'Addi',
    sistecredito: 'Sistecrédito',
    wompi: 'Wompi',
    'wompi bancolombia': 'Wompi',
    efectivo: 'Efectivo',
    cash: 'Efectivo',
    nequi: 'Nequi',
    bancolombia: 'Bancolombia',
    davivienda: 'Davivienda',
    'banco caja social': 'Banco Caja Social',
    'pago manual': 'Otros',
    manual: 'Otros',
    online: 'Otros',
};

/**
 * Devuelve el nombre canonico de un medio de pago.
 * Si no se reconoce, se respeta tal cual llego para no perder informacion.
 */
const normalizePaymentMethod = (value) => {
    if (!value) return 'Otros';

    const key = simplify(value);
    if (ALIASES[key]) return ALIASES[key];

    const known = ALL_METHODS.find((method) => simplify(method) === key);
    if (known) return known;

    // Casos con datos pegados, como "Nequi 3146757580".
    const partial = ALL_METHODS.find((method) => key.startsWith(simplify(method)));
    if (partial) return partial;

    return String(value).trim();
};

module.exports = {
    MANUAL_METHODS,
    ONLINE_METHODS,
    ALL_METHODS,
    normalizePaymentMethod,
};
