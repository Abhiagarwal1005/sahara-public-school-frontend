// Rupees, dates and month keys in one place, so the formatting stays
// identical everywhere.

const RUPEE = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const RUPEE_P = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ₹1,23,456 — Indian grouping (lakh/crore), not 123,456
export const money = (n) => `₹${RUPEE.format(Math.round(Number(n) || 0))}`;
export const moneyExact = (n) => `₹${RUPEE_P.format(Number(n) || 0)}`;
export const num = (n) => RUPEE.format(Number(n) || 0);

export const date = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const dateShort = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';

export const time = (d) =>
    d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

// For <input type="date">
export const toInputDate = (d) => new Date(d || Date.now()).toISOString().slice(0, 10);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-08" -> "August 2026"
export const monthLabel = (key) => {
    if (!key) return '—';
    const [y, m] = key.split('-').map(Number);
    return `${['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1]} ${y}`;
};

// "2026-08" -> "Aug"
export const monthShort = (key) => (key ? MONTHS[Number(key.split('-')[1]) - 1] : '');

// Today's month key in IST. The browser will be in India anyway, but it
// must match the keys coming from the server.
export const currentMonthKey = () => {
    const d = new Date(Date.now() + 5.5 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

// A session's month keys, newest first (for dropdowns)
export const monthOptions = (feeMonths = []) =>
    [...feeMonths].sort().reverse().map((m) => ({ value: m, label: monthLabel(m) }));

// ---------------------------------------------------------------------------
// Academic session helpers.
//
// A session is named "2026-27" and runs April to March — India's standard
// academic year. Everything else about it follows from the name, so the
// Settings form derives it rather than asking four questions.
//
// These match scripts/seedSession.js exactly, on purpose: a session created
// from the UI must be indistinguishable from a seeded one.
// ---------------------------------------------------------------------------

// The starting calendar year of "2026-27" -> 2026
const sessionStartYear = (name) => {
    const year = Number(String(name || '').slice(0, 4));
    return Number.isInteger(year) && year > 1900 ? year : null;
};

// "2026-27" -> the 12 billable months, April 2026 through March 2027.
export const sessionMonths = (name) => {
    const startYear = sessionStartYear(name);
    if (!startYear) return [];

    const out = [];
    for (let i = 0; i < 12; i += 1) {
        // April (4) through December (12), then January (1) through March (3)
        const monthNo = ((3 + i) % 12) + 1;
        const year = 3 + i < 12 ? startYear : startYear + 1;
        out.push(`${year}-${String(monthNo).padStart(2, '0')}`);
    }
    return out;
};

// "2026-27" -> 1 Apr 2026 to 31 Mar 2027, as <input type="date"> strings.
// Built as strings rather than through Date + toISOString(), which shifts a
// day backwards for every IST date.
export const sessionDates = (name) => {
    const startYear = sessionStartYear(name);
    if (!startYear) return { startDate: '', endDate: '' };
    return { startDate: `${startYear}-04-01`, endDate: `${startYear + 1}-03-31` };
};

// Which session today falls in. Before April the academic year still belongs
// to the previous calendar year, which is the easy thing to get wrong in
// January.
export const suggestSessionName = (from = new Date()) => {
    const d = new Date(from);
    const startYear = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
    return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
};

// Regex-valid but nonsense: "2026-30". The second half must be the next year.
export const isSaneSessionName = (name) => {
    if (!/^\d{4}-\d{2}$/.test(String(name || ''))) return false;
    const startYear = sessionStartYear(name);
    return Number(String(name).slice(5)) === (startYear + 1) % 100;
};

export const percent = (n) => `${Math.round(Number(n) || 0)}%`;

// A short label for a chart axis. Lakh formatting only when the amount is
// genuinely in lakhs — otherwise a max of ₹2,400 renders as "0.0L", which
// makes the axis useless.
export const axisLabel = (n) => {
    const v = Number(n) || 0;
    if (v >= 10000000) return `${Math.round((v / 10000000) * 10) / 10}Cr`;
    if (v >= 100000) return `${Math.round((v / 100000) * 10) / 10}L`;
    if (v >= 1000) return `${Math.round(v / 1000)}k`;
    return String(Math.round(v));
};

// ---------------------------------------------------------------------------
// "Rupees One Thousand Six Hundred Sixty Six and Sixty Seven Paise only"
//
// Every printed salary slip and receipt in India carries the amount in
// words — it is what makes the figure hard to alter after the fact, and the
// teacher signing for it expects to see it.
// ---------------------------------------------------------------------------
const ONES = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const under100 = (n) =>
    n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;

const under1000 = (n) => {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    return [hundreds ? `${ONES[hundreds]} Hundred` : '', rest ? under100(rest) : '']
        .filter(Boolean)
        .join(' ');
};

export const amountInWords = (value) => {
    // Work in paise so 1666.67 cannot become 1666.6699999
    const paiseTotal = Math.round((Number(value) || 0) * 100);
    const rupees = Math.floor(paiseTotal / 100);
    const paise = paiseTotal % 100;

    // Indian grouping: crore, lakh, thousand, then the last three digits
    const crore = Math.floor(rupees / 10000000);
    const lakh = Math.floor((rupees % 10000000) / 100000);
    const thousand = Math.floor((rupees % 100000) / 1000);
    const rest = rupees % 1000;

    const parts = [];
    if (crore) parts.push(`${crore > 99 ? under1000(crore) : under100(crore)} Crore`);
    if (lakh) parts.push(`${under100(lakh)} Lakh`);
    if (thousand) parts.push(`${under100(thousand)} Thousand`);
    if (rest) parts.push(under1000(rest));

    const rupeeWords = parts.length ? parts.join(' ') : 'Zero';
    const paiseWords = paise ? ` and ${under100(paise)} Paise` : '';
    return `Rupees ${rupeeWords}${paiseWords} only`;
};
