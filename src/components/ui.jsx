import { Children, cloneElement, forwardRef, isValidElement, useEffect, useState } from 'react';

const cx = (...c) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
const VARIANTS = {
    primary: 'bg-brand text-white border-brand hover:bg-brand-2 hover:border-brand-2',
    default: 'bg-white text-ink border-line-2 hover:bg-paper-2',
    ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-paper-2',
    danger: 'bg-white text-crit border-crit/40 hover:bg-crit-bg',
};

export const Button = forwardRef(function Button(
    { variant = 'default', size = 'md', className, loading, disabled, children, ...props }, ref
) {
    return (
        <button
            ref={ref}
            disabled={disabled || loading}
            className={cx(
                'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap',
                'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                // min-h-9/10 on mobile — a 32px target is easy to miss with a finger.
                // Compact again from sm: upwards, where a mouse is precise.
                size === 'sm'
                    ? 'px-3 py-1.5 min-h-9 text-[12px] sm:px-2.5 sm:py-1 sm:min-h-0 sm:text-[11.5px]'
                    : 'px-3.5 py-2.5 min-h-10 text-[13px] sm:py-2 sm:min-h-0 sm:text-[12.5px]',
                VARIANTS[variant], className
            )}
            {...props}
        >
            {loading && (
                <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
            )}
            {children}
        </button>
    );
});

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------
// text-[16px] on mobile is not a style choice — iOS Safari zooms the page in
// whenever a focused input is smaller than 16px, and it does not zoom back
// out. Every filter tap would leave the layout shifted. From sm: up we go
// back to 13px, where no such behaviour exists.
// Deliberately no `w-full` here. Tailwind emits `w-auto` before `w-full`, so a
// page passing `className="w-auto"` could never win — every toolbar filter
// stretched to the full row. Width belongs to the context instead: Field makes
// its control full width, toolbars and table cells size their own.
const fieldBase =
    'px-3 py-2.5 sm:py-2 rounded-md border bg-white text-ink ' +
    'text-[16px] sm:text-[13px] placeholder:text-ink-3 ' +
    'disabled:bg-paper-2 disabled:text-ink-3';

export const Input = forwardRef(function Input({ className, error, ...props }, ref) {
    return (
        <input
            ref={ref}
            className={cx(fieldBase, error ? 'border-crit' : 'border-line-2', className)}
            {...props}
        />
    );
});

export const Select = forwardRef(function Select({ className, error, children, ...props }, ref) {
    return (
        <select ref={ref} className={cx(fieldBase, error ? 'border-crit' : 'border-line-2', className)} {...props}>
            {children}
        </select>
    );
});

export const Textarea = forwardRef(function Textarea({ className, error, ...props }, ref) {
    return (
        <textarea
            ref={ref}
            rows={3}
            className={cx(fieldBase, 'resize-y', error ? 'border-crit' : 'border-line-2', className)}
            {...props}
        />
    );
});

// Label + control + error together. The error appears BELOW the field and
// always says what to fix — never just "invalid".
export function Field({ label, error, hint, required, children, className }) {
    return (
        <div
            className={cx(
                'flex flex-col gap-1.5 min-w-0',
                '[&>input]:w-full [&>select]:w-full [&>textarea]:w-full',
                className
            )}
        >
            {label && (
                <label className="text-[12px] text-ink-2 font-medium">
                    {label} {required && <span className="text-crit">*</span>}
                </label>
            )}
            {children}
            {error && <span className="text-[11.5px] text-crit">{error}</span>}
            {hint && !error && <span className="text-[11px] text-ink-3">{hint}</span>}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({ title, hint, actions, children, className, bodyClass }) {
    return (
        <section className={cx('bg-white border border-line rounded-lg overflow-hidden', className)}>
            {(title || actions) && (
                <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
                    <div className="min-w-0">
                        {title && <h2 className="text-[13.5px] font-semibold truncate">{title}</h2>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {hint && <span className="text-[11.5px] text-ink-3 font-mono hidden sm:block">{hint}</span>}
                        {actions}
                    </div>
                </header>
            )}
            <div className={bodyClass}>{children}</div>
        </section>
    );
}

// ---------------------------------------------------------------------------
// Status pill. Every pill carries TEXT — never colour alone (colour-blind
// users, and print/photocopy).
// ---------------------------------------------------------------------------
const PILLS = {
    ok: 'bg-good-bg text-good border-good',
    warn: 'bg-warn-bg text-warn border-warn',
    crit: 'bg-crit-bg text-crit border-crit',
    neutral: 'bg-paper-2 text-ink-2 border-line-2',
};

export function Pill({ tone = 'neutral', children, className }) {
    return (
        <span className={cx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap', PILLS[tone], className)}>
            <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
            {children}
        </span>
    );
}

// Status to pill — mapped in one place so every screen shows the same thing
export const statusPill = (status) => {
    const map = { Paid: 'ok', Partial: 'warn', Unpaid: 'crit', Draft: 'neutral', Approved: 'warn', Active: 'ok', Left: 'neutral' };
    return <Pill tone={map[status] || 'neutral'}>{status}</Pill>;
};

// ---------------------------------------------------------------------------
// Table. Wide tables scroll inside their own container — the page body
// never scrolls horizontally.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// On a phone this table stops being a table.
//
// A horizontally scrolling table is the wrong answer for this app: on the
// attendance screen the P/A/H/L buttons — the entire point of the screen —
// sat three columns off the right edge. Below sm: each row becomes a card and
// each cell becomes a "Label   value" line (see .rtable in index.css).
//
// The labels come from `head`, injected here onto every <Td>, so no page has
// to pass its column names twice. Cells with a colSpan are left alone —
// those are the "+ Add line" style rows, which are not label/value pairs.
// ---------------------------------------------------------------------------
export function Table({ head, children, minWidth = 560, empty, isEmpty }) {
    if (isEmpty) return <EmptyState>{empty}</EmptyState>;

    const labels = head.map((h) => (typeof h === 'string' ? h : h?.label ?? ''));

    // Which column titles the card on mobile. A student's card should be
    // headed by the name, not the admission number — so a column can mark
    // itself `primary`. Falls back to the first column.
    const primaryIndex = Math.max(0, head.findIndex((h) => typeof h === 'object' && h?.primary));

    const rows = Children.map(children, (row) => {
        if (!isValidElement(row)) return row;
        const cells = Children.map(row.props.children, (cell, i) => {
            if (!isValidElement(cell) || cell.props.colSpan) return cell;
            return cloneElement(cell, {
                'data-label': labels[i] ?? '',
                ...(i === primaryIndex ? { 'data-primary': '' } : null),
            });
        });
        return cloneElement(row, undefined, cells);
    });

    return (
        <div className="overflow-x-auto">
            <table className="rtable w-full border-collapse text-[13px]" style={{ minWidth }}>
                <thead>
                    <tr>
                        {head.map((h, i) => (
                            <th
                                key={i}
                                className={cx(
                                    'text-left px-4 py-2.5 bg-paper-2 text-ink-3 font-semibold border-b border-line',
                                    'font-mono text-[10px] tracking-[0.09em] uppercase whitespace-nowrap',
                                    h?.align === 'right' && 'text-right'
                                )}
                            >
                                {h?.label ?? h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>{rows}</tbody>
            </table>
        </div>
    );
}

export const Tr = ({ children, className, ...p }) => (
    <tr className={cx('border-b border-line last:border-0 hover:bg-paper-2', className)} {...p}>{children}</tr>
);

export const Td = ({ children, align, className, ...p }) => (
    <td className={cx('px-4 py-2.5 align-middle', align === 'right' && 'text-right tnum whitespace-nowrap', className)} {...p}>
        {children}
    </td>
);

export function EmptyState({ children, action }) {
    return (
        <div className="px-6 py-12 text-center">
            <p className="text-[13px] text-ink-3">{children || 'Nothing here yet'}</p>
            {action && <div className="mt-3">{action}</div>}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Loading / error — every screen uses these, so they live in one place
// ---------------------------------------------------------------------------
export function Loading({ rows = 5 }) {
    return (
        <div className="p-4 space-y-2.5" aria-busy="true" aria-label="Loading">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="h-9 rounded bg-paper-2 animate-pulse" />
            ))}
        </div>
    );
}

export function ErrorState({ error, onRetry }) {
    return (
        <div className="px-6 py-10 text-center">
            <p className="text-[13px] text-crit font-medium">{error?.message || 'Something went wrong'}</p>
            {onRetry && <Button className="mt-3" onClick={onRetry}>Try again</Button>}
        </div>
    );
}

// The standard data/loading/error wrapper — the same three branches everywhere
export function Async({ query, children, rows }) {
    if (query.isPending) return <Loading rows={rows} />;
    if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
    return children(query.data);
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({ open, onClose, title, children, footer, wide }) {
    if (!open) return null;
    return (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-end sm:items-start justify-center overflow-y-auto bg-black/40 p-0 sm:p-8">
            <div
                className={cx(
                    'modal-panel w-full bg-white shadow-card',
                    // A bottom sheet on a phone — close to the thumb, and it keeps
                    // room to scroll when the keyboard opens.
                    'rounded-t-xl max-h-[92vh] overflow-y-auto',
                    'sm:rounded-lg sm:my-auto sm:max-h-none sm:overflow-visible',
                    wide ? 'sm:max-w-3xl' : 'sm:max-w-md'
                )}
                role="dialog"
                aria-modal="true"
            >
                <header className="flex items-center justify-between px-4 py-3 border-b border-line">
                    <h2 className="text-[14px] font-semibold">{title}</h2>
                    <button onClick={onClose} className="text-ink-3 hover:text-ink px-1.5 text-lg leading-none" aria-label="Close">×</button>
                </header>
                <div className="p-4">{children}</div>
                {footer && <footer className="sticky bottom-0 flex justify-end gap-2 px-4 py-3 border-t border-line bg-paper-2">{footer}</footer>}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Void / delete, with a reason.
//
// Every destructive action in this app demands a reason — the backend returns
// 400 without one, because a void that nobody has to explain is how a cash
// book stops being a cash book. Rather than each screen inventing its own
// confirm dialog, they all use this one: same wording shape, same mandatory
// field, same minimum length as the server's validator (3 characters).
//
// It is deliberately NOT a plain window.confirm — the reason has to be typed,
// and the consequence has to be stated before it is.
// ---------------------------------------------------------------------------
export function ReasonModal({ open, onClose, onConfirm, title, what, consequence, confirmLabel = 'Confirm', loading }) {
    const [reason, setReason] = useState('');

    // Clear the box each time it opens, so last time's reason is never
    // submitted against this time's record.
    useEffect(() => { if (open) setReason(''); }, [open]);

    if (!open) return null;
    const valid = reason.trim().length >= 3;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={title}
            footer={
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button variant="danger" loading={loading} disabled={!valid}
                            onClick={() => onConfirm(reason.trim())}>
                        {confirmLabel}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                {what && <p className="text-[13px] font-semibold">{what}</p>}
                {consequence && (
                    <div className="bg-warn-bg border border-warn text-warn rounded-md px-3 py-2.5 text-[12.5px]">
                        {consequence}
                    </div>
                )}
                <Field label="Reason" required hint="This is recorded against your name and cannot be edited afterwards">
                    <Textarea value={reason} autoFocus placeholder="Why is this being done?"
                              onChange={(e) => setReason(e.target.value)} />
                </Field>
                {reason.length > 0 && !valid && (
                    <span className="text-[11.5px] text-crit">Write at least a few words</span>
                )}
            </div>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------
// Filters stacked one per row ate four rows before any data was visible on a
// 375px screen. Two per row, with the first control (search or date) spanning
// the full width, fits the same filters into two rows.
export function Toolbar({ children }) {
    return (
        <div
            className={cx(
                'no-print grid grid-cols-2 gap-2',
                '[&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-auto',
                '[&>.spacer]:hidden sm:[&>.spacer]:block',
                '[&>.tb-wide]:col-span-2 sm:[&>.tb-wide]:col-auto',
                'sm:flex sm:flex-wrap sm:items-center'
            )}
        >
            {children}
        </div>
    );
}

export const Spacer = () => <div className="spacer flex-1" />;

// Ratio meter - class collection rate, salary paid vs pending
export function Meter({ value, tone = 'brand', className }) {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    const bar = { brand: 'bg-brand', warn: 'bg-warn', crit: 'bg-crit' }[tone];
    return (
        <span className={cx('inline-block h-1.5 rounded-full bg-line overflow-hidden align-middle', className || 'w-16')}>
            <span className={cx('block h-full rounded-full', bar)} style={{ width: `${pct}%` }} />
        </span>
    );
}

export function StatTile({ label, value, sub, meter, tone }) {
    return (
        <div className="bg-white border border-line rounded-lg px-3 py-3 sm:px-4 sm:py-3.5">
            <span className="block font-mono text-[9.5px] sm:text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">{label}</span>
            <div className="text-[19px] sm:text-[23px] font-semibold tracking-tight tnum leading-tight">{value}</div>
            {sub && <div className="text-[11.5px] text-ink-3 mt-1 tnum">{sub}</div>}
            {meter !== undefined && <Meter value={meter} tone={tone} className="w-full mt-2 h-[5px]" />}
        </div>
    );
}

export function PageTitle({ title, sub, children }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
                <h1 className="text-[17px] font-semibold tracking-tight">{title}</h1>
                {sub && <p className="text-[12px] text-ink-3 mt-0.5">{sub}</p>}
            </div>
            <div className="flex items-center gap-2 no-print">{children}</div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Numbered pagination.
//
// Every list in the app ends with this, so a clerk can jump to page 14 rather
// than pressing Next thirteen times.
//
// The page WINDOW is what makes it work at any size: with 25 pages we never
// render 25 buttons. First and last are always there, the current page keeps a
// neighbour on each side, and the gaps collapse into an ellipsis. So the row
// is a fixed width whether there are 3 pages or 300 — it never wraps and never
// pushes the table sideways on a phone.
//
// `total` is optional. Without it (an endpoint that does not count) the
// component degrades to Previous / Next, which is exactly what it can honestly
// offer — page numbers with no total would be a guess.
// ---------------------------------------------------------------------------

// Which page numbers to draw. `null` marks a gap.
const pageWindow = (current, totalPages, span = 1) => {
    // Small enough to show whole — no ellipsis logic needed, and jumping is
    // one tap for every page.
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

    const pages = new Set([1, totalPages]);
    for (let p = current - span; p <= current + span; p += 1) {
        if (p > 1 && p < totalPages) pages.add(p);
    }
    // Near an end the window is lopsided, so top it up to keep the row a
    // constant width instead of visibly shrinking on page 1.
    if (current <= 3) [2, 3, 4].forEach((p) => p < totalPages && pages.add(p));
    if (current >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1]
        .forEach((p) => p > 1 && pages.add(p));

    const sorted = [...pages].sort((a, b) => a - b);

    const out = [];
    for (const [i, p] of sorted.entries()) {
        if (i && p - sorted[i - 1] > 1) out.push(null);
        out.push(p);
    }
    return out;
};

export function Pagination({ pagination, onChange, className }) {
    if (!pagination) return null;

    const { currentPage = 1, pageSize = 20, totalItems, totalPages, hasNextPage, hasPrevPage } = pagination;

    // One page and nothing after it — a pager would only be noise.
    if (totalPages ? totalPages <= 1 : !hasNextPage && !hasPrevPage) return null;

    const numbered = Number.isFinite(totalPages);
    const from = (currentPage - 1) * pageSize + 1;
    const to = numbered ? Math.min(currentPage * pageSize, totalItems) : currentPage * pageSize;

    const go = (p) => {
        if (p < 1 || (numbered && p > totalPages) || p === currentPage) return;
        onChange(p);
        // A long table leaves the reader at the bottom; the next page should
        // start at its first row, not at its last.
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const numBtn =
        'min-w-9 h-9 sm:min-w-8 sm:h-8 px-2 rounded-md border text-[12.5px] sm:text-[12px] font-medium tnum ' +
        'transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

    return (
        <div className={cx('no-print flex flex-wrap items-center justify-between gap-3 py-3', className)}>
            <span className="text-[12px] text-ink-3 tnum">
                {numbered ? <>{from}–{to} of <b className="text-ink-2 font-semibold">{totalItems}</b></> : <>Page {currentPage}</>}
            </span>

            <div className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => go(currentPage - 1)}
                    disabled={!hasPrevPage && currentPage <= 1}
                    aria-label="Previous page"
                    className={cx(numBtn, 'bg-white text-ink-2 border-line-2 hover:bg-paper-2')}
                >
                    ‹
                </button>

                {numbered
                    ? pageWindow(currentPage, totalPages).map((p, i) =>
                          p === null ? (
                              // Not a button — there is no single page it could go to.
                              <span key={`gap${i}`} className="px-1 text-[12px] text-ink-3 select-none">…</span>
                          ) : (
                              <button
                                  key={p}
                                  type="button"
                                  onClick={() => go(p)}
                                  aria-label={`Page ${p}`}
                                  aria-current={p === currentPage ? 'page' : undefined}
                                  className={cx(
                                      numBtn,
                                      p === currentPage
                                          ? 'bg-brand text-white border-brand font-semibold'
                                          : 'bg-white text-ink-2 border-line-2 hover:bg-paper-2'
                                  )}
                              >
                                  {p}
                              </button>
                          )
                      )
                    : null}

                <button
                    type="button"
                    onClick={() => go(currentPage + 1)}
                    disabled={!hasNextPage}
                    aria-label="Next page"
                    className={cx(numBtn, 'bg-white text-ink-2 border-line-2 hover:bg-paper-2')}
                >
                    ›
                </button>
            </div>
        </div>
    );
}

// Sub-tabs — moving between screens inside a module
export function Tabs({ tabs, value, onChange }) {
    return (
        <div className="flex gap-0.5 border-b border-line overflow-x-auto no-print -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map((t) => (
                <button
                    key={t.value}
                    onClick={() => onChange(t.value)}
                    className={cx(
                        'px-3.5 py-2.5 sm:py-2 text-[13px] border-b-2 whitespace-nowrap transition-colors',
                        value === t.value
                            ? 'text-brand border-brand font-semibold'
                            : 'text-ink-2 border-transparent hover:text-ink'
                    )}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
}

export { cx };
