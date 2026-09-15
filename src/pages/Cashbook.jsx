import { useState } from 'react';
import { useCashbook, useSessions, useActiveSession } from '../hooks/queries';
import { money, num, monthLabel } from '../lib/format';
import {
    Card, Table, Tr, Td, Select, Toolbar, Async, PageTitle, Pill, cx,
} from '../components/ui';

// ---------------------------------------------------------------------------
// THE CASH BOOK — what the school actually has in hand.
//
//   opening balance  +  everything collected  −  everything paid out
//
// Per mode, because that is how it is counted: the cash box by hand, UPI on a
// phone, the bank on a statement, cheques in a book. Four reconciliations, and
// one combined figure matches none of them — which is why the mode row is the
// top of this screen and the grand total is only the last column of it.
//
// Everything here comes from a dozen rollup documents. No screen in this app
// scans the ledger, and this one least of all: it is the screen somebody opens
// at the end of every day.
// ---------------------------------------------------------------------------

// Cash first — it is the one somebody physically counts, and the one that is
// wrong most often.
const MODE_HINT = {
    Cash: 'counted in the drawer',
    UPI: 'checked against the app',
    Bank: 'checked against the statement',
    Cheque: 'not money until it clears',
};

function Tile({ label, value, sub, tone, strong }) {
    return (
        <div className={cx(
            'rounded-lg px-4 py-3.5 border',
            strong ? 'bg-white border-brand' : 'bg-white border-line'
        )}>
            <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">{label}</span>
            <div className={cx('text-[22px] font-semibold tnum leading-tight', tone)}>{value}</div>
            {sub && <div className="text-[11.5px] text-ink-3 mt-1">{sub}</div>}
        </div>
    );
}

// A two-column "head → amount" list, with the total pinned to the bottom. Used
// for both sides of the book so money in and money out read identically.
function Heads({ rows, total, totalLabel, tone }) {
    return (
        <div className="px-4 py-1">
            {rows.map(([label, value, hint]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 py-[7px] border-b border-line last:border-0">
                    <span className="text-[13px] text-ink-2">
                        {label}
                        {hint && <span className="block text-[11px] text-ink-3">{hint}</span>}
                    </span>
                    <b className={cx('tnum text-[13.5px] shrink-0', !value && 'text-ink-3 font-normal')}>
                        {value ? money(value) : '—'}
                    </b>
                </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 pt-2.5 mt-1 border-t-2 border-line">
                <span className="text-[13px] font-semibold">{totalLabel}</span>
                <b className={cx('tnum text-[15px]', tone)}>{money(total)}</b>
            </div>
        </div>
    );
}

export default function Cashbook() {
    const active = useActiveSession();
    const sessions = useSessions();
    // '' = whichever session is active. Named explicitly, the book opens that
    // year — a question the school asks every April.
    const [session, setSession] = useState('');
    const query = useCashbook(session);

    return (
        <>
            <PageTitle
                title="Cash Book"
                sub="opening balance, everything collected, everything paid out — and what is left"
            />

            {/* A school with one session does not need a picker. It appears the
                moment there is a second one to choose. */}
            {(sessions.data?.length || 0) > 1 && (
                <Toolbar>
                    <Select className="w-auto" value={session} onChange={(e) => setSession(e.target.value)}>
                        <option value="">
                            {active.data?.name ? `${active.data.name} (current)` : 'Current session'}
                        </option>
                        {sessions.data
                            ?.filter((s) => !s.isActive)
                            .map((s) => <option key={s._id} value={s.name}>{s.name}</option>)}
                    </Select>
                </Toolbar>
            )}

            <Async query={query}>
                {(d) => (
                    <>
                        {/* ---- what is in each drawer, right now ---- */}
                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(178px,1fr))]">
                            {d.byMode.map((m) => (
                                <Tile
                                    key={m.mode}
                                    label={m.mode}
                                    value={money(m.balance)}
                                    sub={MODE_HINT[m.mode]}
                                    tone={m.balance < 0 ? 'text-crit' : ''}
                                />
                            ))}
                            <Tile
                                strong
                                label="In hand"
                                value={money(d.totals.inHand)}
                                sub={`${d.session}${d.isActive ? '' : ' · closed'}`}
                                tone={d.totals.inHand < 0 ? 'text-crit' : 'text-brand'}
                            />
                        </div>

                        {/* A negative drawer is not a rounding error — it means
                            something was recorded as paid out of a box that did
                            not have it. Said plainly rather than left as a red
                            number somebody might read past. */}
                        {d.byMode.some((m) => m.balance < 0) && (
                            <div className="bg-crit-bg border border-crit text-crit rounded-md px-3 py-2.5 text-[12.5px]">
                                One of these is below zero — more has been recorded as paid out of it than ever went in.
                                Usually a payment entered against the wrong mode: find it in the day book and correct the
                                mode on the entry rather than adding a balancing one.
                            </div>
                        )}

                        {/* ---- the arithmetic, mode by mode ---- */}
                        <Card
                            title="Mode by mode"
                            hint="opening + in − out"
                        >
                            <Table
                                head={['Mode', { label: 'Opening', align: 'right' },
                                       { label: 'Collected', align: 'right' }, { label: 'Paid out', align: 'right' },
                                       { label: 'In hand', align: 'right' }]}
                                isEmpty={false} minWidth={640}
                            >
                                {d.byMode.map((m) => (
                                    <Tr key={m.mode}>
                                        <Td className="font-semibold whitespace-nowrap">
                                            {m.mode}
                                            <span className="block text-[11px] text-ink-3 font-normal">{MODE_HINT[m.mode]}</span>
                                        </Td>
                                        <Td align="right" className="text-ink-2">{m.opening ? money(m.opening) : '—'}</Td>
                                        <Td align="right" className={m.in ? 'text-good' : 'text-ink-3'}>{m.in ? money(m.in) : '—'}</Td>
                                        <Td align="right" className={m.out ? 'text-crit' : 'text-ink-3'}>{m.out ? money(m.out) : '—'}</Td>
                                        <Td align="right" className={cx('font-semibold', m.balance < 0 && 'text-crit')}>
                                            {money(m.balance)}
                                        </Td>
                                    </Tr>
                                ))}
                                <Tr className="bg-paper-2">
                                    <Td className="font-semibold">Total</Td>
                                    <Td align="right" className="font-semibold">{money(d.totals.opening)}</Td>
                                    <Td align="right" className="font-semibold text-good">{money(d.totals.in)}</Td>
                                    <Td align="right" className="font-semibold text-crit">{money(d.totals.out)}</Td>
                                    <Td align="right" className="font-semibold text-brand">{money(d.totals.inHand)}</Td>
                                </Tr>
                            </Table>

                            {/* Nothing writes this mode today. If anything ever
                                does, the gap between "in − out" and "in hand"
                                gets a name here instead of looking like a bug. */}
                            {(d.adjustments.in > 0 || d.adjustments.out > 0) && (
                                <p className="px-4 py-2.5 text-[11.5px] text-ink-3 border-t border-line">
                                    {money(d.adjustments.in)} in and {money(d.adjustments.out)} out are book adjustments —
                                    counted in the totals above, but not part of what is in hand, because no money moved.
                                </p>
                            )}
                        </Card>

                        {/* ---- where it came from, where it went ---- */}
                        <div className="grid gap-4 lg:grid-cols-2 items-start">
                            <Card title="Where it came from">
                                <Heads
                                    tone="text-good"
                                    totalLabel="Total collected"
                                    total={d.income.total}
                                    rows={[
                                        ['Monthly fees', d.income.fees,
                                            d.spend.refunds > 0 ? `${money(d.netFeeCollection)} after what was returned` : null],
                                        ['Admission, exams & trips', d.income.otherFees],
                                        ['Uniform & books', d.income.stock],
                                        ['ID cards', d.income.idCards],
                                        ['Other income', d.income.other],
                                    ]}
                                />
                            </Card>

                            <Card title="Where it went">
                                <Heads
                                    tone="text-crit"
                                    totalLabel="Total paid out"
                                    total={d.spend.total}
                                    rows={[
                                        ['Expenses', d.spend.expenses],
                                        ['Salaries', d.spend.salaries],
                                        ['Vendor payments', d.spend.vendorPaid],
                                        ['Advance fee returned', d.spend.refunds],
                                    ]}
                                />

                                {/* The one number people expect to see here and
                                    should not. Said on the screen rather than
                                    left for somebody to notice it missing and
                                    assume the app forgot it. */}
                                <p className="px-4 pb-3.5 pt-1 text-[11.5px] text-ink-3 leading-relaxed">
                                    {d.purchaseBills > 0 ? (
                                        <>
                                            <b className="text-ink-2">{money(d.purchaseBills)} of purchase bills</b> is
                                            deliberately not in this column. Recording a bill is not spending money — the
                                            cash leaves when the vendor is paid, and that is already counted above.
                                            Counting both would subtract the same rupee twice.
                                        </>
                                    ) : (
                                        <>A purchase bill is not counted here — the money leaves when the vendor is
                                        actually paid, which shows under vendor payments.</>
                                    )}
                                </p>
                            </Card>
                        </div>

                        {/* ---- month by month, with the balance carried forward ---- */}
                        <Card title="Month by month" hint="the balance carried forward">
                            <Table
                                head={['Month', { label: 'Collected', align: 'right' }, { label: 'Paid out', align: 'right' },
                                       { label: 'Net', align: 'right' }, { label: 'Closing balance', align: 'right' }]}
                                isEmpty={!d.months.length}
                                empty="No money has moved in this session yet"
                                minWidth={640}
                            >
                                {/* The opening sits in the table as its own row,
                                    not above it — the closing balance column only
                                    makes sense if you can see what it started from. */}
                                <Tr className="bg-paper-2">
                                    <Td className="text-ink-2 italic">Opening balance</Td>
                                    <Td align="right" className="text-ink-3">—</Td>
                                    <Td align="right" className="text-ink-3">—</Td>
                                    <Td align="right" className="text-ink-3">—</Td>
                                    <Td align="right" className="font-semibold">{money(d.totals.opening)}</Td>
                                </Tr>
                                {d.months.map((m) => (
                                    <Tr key={m.month}>
                                        <Td className="font-semibold whitespace-nowrap">{monthLabel(m.month)}</Td>
                                        <Td align="right" className={m.in ? 'text-good' : 'text-ink-3'}>{m.in ? num(m.in) : '—'}</Td>
                                        <Td align="right" className={m.out ? 'text-crit' : 'text-ink-3'}>{m.out ? num(m.out) : '—'}</Td>
                                        <Td align="right" className={cx('tnum', m.net < 0 ? 'text-crit' : m.net > 0 ? 'text-good' : 'text-ink-3')}>
                                            {m.net ? `${m.net > 0 ? '+' : '−'}${num(Math.abs(m.net))}` : '—'}
                                        </Td>
                                        <Td align="right" className={cx('font-semibold', m.closing < 0 && 'text-crit')}>
                                            {money(m.closing)}
                                        </Td>
                                    </Tr>
                                ))}
                            </Table>
                        </Card>

                        <p className="text-[11.5px] text-ink-3 leading-relaxed">
                            The opening balance is set on the session — Settings → Sessions. A cheque is shown as its own
                            column rather than folded into the bank, because a cheque written is not money gone until it
                            clears, and one held is not money arrived.
                        </p>
                    </>
                )}
            </Async>
        </>
    );
}
