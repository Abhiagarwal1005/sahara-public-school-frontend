import { useState } from 'react';
import { useEntityHistory } from '../hooks/queries';
import { useAuth } from '../store/auth';
import { date, time } from '../lib/format';
import { Card, EmptyState, Loading, cx } from './ui';

// ---------------------------------------------------------------------------
// One record's edit history.
//
// The same component sits on a student, a teacher and a stock item — the
// question is identical on all three ("who changed this, and to what"), so it
// should not be answered by three different-looking panels.
//
// It renders nothing at all when the viewer lacks `audit.view`. Not a "no
// access" box: on somebody else's screen this panel simply does not exist,
// and an empty placeholder would only invite them to ask about it.
// ---------------------------------------------------------------------------

// A stored value as one readable line. The raw before/after can hold arrays
// and objects (a stock item's variants, an expense's attachments) — those are
// summarised rather than dumped, because nobody reads a JSON blob in a table.
export const showValue = (value) => {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) return `${value.length} item(s)`;
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'yes' : 'no';

    const text = String(value);
    // An ISO timestamp is unreadable in a diff; a date is not.
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return date(text);
    return text;
};

// field → value → value, for one history row.
export function ChangeLines({ before, after }) {
    const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
    if (!keys.length) return null;

    return (
        <div className="flex flex-col gap-1 mt-1.5">
            {keys.map((key) => (
                <div key={key} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                    <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">{key}</span>
                    <span className="text-ink-3 line-through">{showValue(before?.[key])}</span>
                    <span className="text-ink-3">→</span>
                    <span className="font-semibold">{showValue(after?.[key])}</span>
                </div>
            ))}
        </div>
    );
}

// One entry, as it reads on a record's own page.
export function HistoryRow({ entry }) {
    const hasDiff = Boolean(entry.before || entry.after);
    const [open, setOpen] = useState(false);

    return (
        <div className="px-4 py-2.5 border-b border-line last:border-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[13px] min-w-0">
                    <b className="font-semibold">{entry.actorName || 'Unknown'}</b>
                    <span className="text-ink-3"> · {entry.actorRole}</span>
                </span>
                <span className="font-mono text-[11px] text-ink-3 whitespace-nowrap">
                    {date(entry.createdAt)} {time(entry.createdAt)}
                </span>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-2 mt-0.5">
                <span className="font-mono text-[10.5px] uppercase tracking-wider text-brand">{entry.action}</span>
                {entry.summary && <span className="text-[12.5px] text-ink-2 min-w-0 break-words">{entry.summary}</span>}
            </div>

            {hasDiff && (
                <>
                    <button onClick={() => setOpen((o) => !o)}
                            className="mt-1 text-[11.5px] text-ink-3 hover:text-brand underline underline-offset-2">
                        {open ? 'Hide details' : 'Show before / after'}
                    </button>
                    {open && <ChangeLines before={entry.before} after={entry.after} />}
                </>
            )}
        </div>
    );
}

export function HistoryCard({ entity, id, title = 'Edit history' }) {
    const can = useAuth((s) => s.can);
    // Hooks must run unconditionally, so the query is declared either way and
    // simply disabled for a viewer who cannot see the history.
    const allowed = can('audit.view');
    const history = useEntityHistory(allowed ? entity : null, allowed ? id : null);

    if (!allowed) return null;

    return (
        <Card title={title} hint={history.data ? `${history.data.length} entries` : ''}>
            {history.isPending ? (
                <Loading rows={2} />
            ) : history.isError ? (
                <EmptyState>{history.error.message}</EmptyState>
            ) : !history.data?.length ? (
                <EmptyState>Nothing has been changed since this was created</EmptyState>
            ) : (
                <div className={cx('flex flex-col', history.data.length > 6 && 'max-h-[380px] overflow-y-auto')}>
                    {history.data.map((entry) => <HistoryRow key={entry._id} entry={entry} />)}
                </div>
            )}
        </Card>
    );
}
