import { useState } from 'react';
import { useDaybook, useOutstanding, useIncomeExpense, useVoidReceipt, useVoidChargeReceipt, useActiveSession } from '../hooks/queries';
import { money, num, date, dateShort, time, toInputDate, monthLabel } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Toolbar, Spacer, Pill, ReasonModal,
    Async, PageTitle, Tabs, EmptyState, cx,
} from '../components/ui';
// Read-only here. Verifying is a job of its own and has a screen of its own.
import { VerifyMark } from '../components/VerifyMark';
import { ReceiptModal } from '../components/Receipt';
import { PaymentEdit, SealedNote } from '../components/PaymentEdit';
import { Can } from '../components/Can';
import { useAuth } from '../store/auth';

// ---------------------------------------------------------------------------
// Day book — the office reconciles the cash box with this. Voids and
// reversals both show: that is correct, not clutter. A cash book that can
// be silently edited is not a cash book.
// ---------------------------------------------------------------------------
// "Six days back" and "the first of this month", as the yyyy-mm-dd a date input
// wants. Built off toInputDate so they land on the same IST day the rest of the
// app does, rather than the browser's own idea of today.
const daysAgo = (n) => toInputDate(new Date(Date.now() - n * 86400000));
const monthStart = () => `${toInputDate(new Date()).slice(0, 8)}01`;

function Daybook() {
    // The last SEVEN DAYS, not today. A single day answers "did this morning
    // tally"; a week answers "where did the money go", which is the question
    // somebody actually opens this screen with. Today is still one click away.
    const [range, setRange] = useState({ from: daysAgo(6), to: toInputDate(new Date()) });
    // The entry being voided. null = the dialog is closed.
    const [voiding, setVoiding] = useState(null);
    // The receipt being reprinted — the counter is the other place somebody asks.
    const [reprinting, setReprinting] = useState(null);
    const book = useDaybook(range);

    const setPreset = (from, to) => setRange({ from, to });
    const today = toInputDate(new Date());
    // Which preset the current dates happen to match, so the button reads as
    // selected instead of being a thing you press and get no feedback from.
    const preset =
        range.to !== today ? null
            : range.from === today ? 'today'
            : range.from === daysAgo(6) ? 'week'
            : range.from === monthStart() ? 'month'
            : null;
    const voidReceipt = useVoidReceipt();
    // A charge receipt is voided through its own module — it has to unwind
    // ChargeDemands and its own rollup head, which the fee void knows nothing
    // about. Which one to call is decided from the row's type.
    const voidCharge = useVoidChargeReceipt();
    const voidingCharge = voiding?.type === 'CHARGE';
    const voidPending = voidReceipt.isPending || voidCharge.isPending;

    return (
        <>
            <Toolbar>
                {/* The pair is ONE toolbar child, so on a phone it takes a row of
                    its own and the two inputs split it — as two separate children
                    they landed in different grid cells with the word "to" stranded
                    between them.

                    `max` and `min` cross-bind them, so an end date before its
                    start cannot be picked at all. The server refuses it too —
                    that is the rule's real home — but being refused after the
                    fact is a worse way to learn it. */}
                <div className="flex items-center gap-2">
                    <Input type="date" className="flex-1 min-w-0 sm:flex-none sm:w-auto" value={range.from} max={range.to}
                           onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
                    <span className="text-[12.5px] text-ink-3 shrink-0">to</span>
                    <Input type="date" className="flex-1 min-w-0 sm:flex-none sm:w-auto" value={range.to} min={range.from}
                           onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
                </div>

                {/* tb-wide: a row of its own on a phone. In half a 375px screen
                    the third preset was cut clean off. */}
                <div className="tb-wide flex border border-line-2 rounded-md overflow-hidden w-max">
                    {[['today', 'Today', today, today],
                      ['week', '7 days', daysAgo(6), today],
                      ['month', 'This month', monthStart(), today]].map(([key, label, from, to]) => (
                        <button key={key} onClick={() => setPreset(from, to)}
                                className={cx(
                                    'px-3 py-1.5 text-[12.5px] border-r border-line-2 last:border-r-0',
                                    preset === key ? 'bg-brand text-white font-semibold' : 'bg-paper-2 text-ink-2 hover:bg-white'
                                )}>
                            {label}
                        </button>
                    ))}
                </div>

                <Spacer />
                <Button onClick={() => window.print()}>Print</Button>
            </Toolbar>

            <Async query={book}>
                {(d) => (
                    <>
                        {/* The whole range, one number each way. */}
                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(178px,1fr))]">
                            {[['Money in', money(d.totals.in), 'text-good'],
                              ['Money out', money(d.totals.out), 'text-crit'],
                              ['Net', money(d.totals.net), d.totals.net >= 0 ? 'text-good' : 'text-crit']].map(([k, v, tone]) => (
                                <div key={k} className="bg-white border border-line rounded-lg px-4 py-3">
                                    <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1">{k}</span>
                                    <div className={cx('text-[20px] font-semibold tnum', tone)}>{v}</div>
                                </div>
                            ))}
                        </div>

                        {/* -----------------------------------------------------------
                            Then the same money, mode by mode.
                            
                            Closing a day is four separate jobs, not one: the cash box is
                            counted, the UPI app is opened, the bank statement is checked,
                            the cheque book is flipped through. A single "cash net" tile
                            answered only the first of those, and the other three had to be
                            worked out by reading down the table.
                            
                            Cash, UPI, Bank and Cheque are always here, even at zero, so the
                            row keeps the same shape every day and the eye knows where to
                            land. Anything else that moved money is appended by the server,
                            so these always add back up to Money in / Money out.
                            ----------------------------------------------------------- */}
                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(178px,1fr))]">
                            {(d.byMode || []).map((m) => (
                                <div key={m.mode} className="bg-white border border-line rounded-lg px-4 py-3">
                                    <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1">
                                        {m.mode}
                                    </span>
                                    <div className={cx(
                                        'text-[20px] font-semibold tnum',
                                        m.net > 0 ? 'text-good' : m.net < 0 ? 'text-crit' : 'text-ink-3'
                                    )}>
                                        {money(m.net)}
                                    </div>
                                    {/* Both directions, always. A net of zero can mean nothing
                                        happened, or that ₹50,000 came in and went straight back
                                        out — and those are not the same day to reconcile. */}
                                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] tnum">
                                        <span className={m.in ? 'text-good' : 'text-ink-3'}>in {money(m.in)}</span>
                                        <span className={m.out ? 'text-crit' : 'text-ink-3'}>out {money(m.out)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Day by day, but only when there is more than one day to
                            break down. Seven tiles of entries is a list; seven
                            SUBTOTALS is what somebody actually checks the cash box
                            against, one evening at a time. */}
                        {d.byDay.length > 0 && (
                            <Card title="Day by day" hint={`${d.span} days`}>
                                <Table
                                    head={['Date', { label: 'In', align: 'right' }, { label: 'Out', align: 'right' },
                                           { label: 'Net', align: 'right' }]}
                                    isEmpty={false} minWidth={420}
                                >
                                    {d.byDay.map((x) => (
                                        <Tr key={x.date}>
                                            <Td className="font-semibold whitespace-nowrap">{date(x.date)}</Td>
                                            <Td align="right" className={x.in ? 'text-good' : 'text-ink-3'}>{x.in ? num(x.in) : '—'}</Td>
                                            <Td align="right" className={x.out ? 'text-crit' : 'text-ink-3'}>{x.out ? num(x.out) : '—'}</Td>
                                            <Td align="right" className={cx('font-semibold', x.net < 0 ? 'text-crit' : x.net > 0 ? 'text-good' : 'text-ink-3')}>
                                                {x.net ? `${x.net > 0 ? '+' : '−'}${num(Math.abs(x.net))}` : '—'}
                                            </Td>
                                        </Tr>
                                    ))}
                                </Table>
                            </Card>
                        )}

                        <Card
                            title={d.span > 1 ? `Day book — ${date(d.from)} to ${date(d.to)}` : `Day book — ${date(d.from)}`}
                            hint="for reconciling against the cash box"
                        >
                            {/* The Date column only exists on a multi-day range. On a
                                single day it would repeat the same value down every
                                row, which is noise rather than information. */}
                            <Table head={[...(d.span > 1 ? ['Date'] : []),
                                          'Time', { label: 'Particulars', primary: true }, 'Type', 'Mode', { label: 'In', align: 'right' },
                                          { label: 'Out', align: 'right' }, 'Verified', '']}
                                   isEmpty={!d.rows.length}
                                   empty={d.span > 1 ? 'No entries in this range' : 'No entries on this date'}
                                   minWidth={d.span > 1 ? 880 : 800}>
                                {d.rows.map((t) => (
                                    <Tr key={t._id} className={t.voided ? 'opacity-50' : ''}>
                                        {d.span > 1 && (
                                            <Td className="font-mono text-[11.5px] text-ink-3 whitespace-nowrap">{dateShort(t.txnDate)}</Td>
                                        )}
                                        <Td className="font-mono text-[11.5px] text-ink-3">{time(t.txnDate)}</Td>
                                        <Td>
                                            <span className="font-semibold">
                                                {t.receiptNo ? `${t.receiptNo} · ` : ''}{t.party?.name || t.note || '—'}
                                            </span>
                                            {t.voided && <Pill tone="crit" className="ml-2">Void</Pill>}
                                            {t.reversalOf && <Pill tone="warn" className="ml-2">Reversal</Pill>}
                                            {t.className && <span className="block text-[11.5px] text-ink-3">{t.className}</span>}
                                        </Td>
                                        <Td className="text-[12px] whitespace-nowrap">{t.type.toLowerCase().replace('_', ' ')}</Td>
                                        <Td className="font-mono text-[11.5px] text-ink-3">{t.mode}</Td>
                                        <Td align="right" className={t.direction === 'IN' ? 'text-good' : ''}>
                                            {t.direction === 'IN' ? num(t.amount) : '—'}
                                        </Td>
                                        <Td align="right" className={t.direction === 'OUT' ? 'text-crit' : ''}>
                                            {t.direction === 'OUT' ? num(t.amount) : '—'}
                                        </Td>
                                        {/* Read-only here. The day book is where a wrong entry gets
                                            SPOTTED; signing one off is a deliberate sit-down with the
                                            cash box, and it has a screen of its own. */}
                                        <Td><VerifyMark payment={t} /></Td>
                                        <Td>
                                            {/* Reconciling against the cash box is where a wrong entry
                                                gets spotted, so this is the second place a receipt can
                                                be voided from — until it is verified, after which the
                                                row is sealed against both editing and voiding. A
                                                REVERSAL row is itself the undoing of something, so it
                                                is never offered. */}
                                            <span className="inline-flex gap-1.5">
                                                {t.receiptNo && t.type === 'FEE' && (
                                                    <Button size="sm" onClick={() => setReprinting(t._id)}>Receipt</Button>
                                                )}
                                                {/* A wrong mode or a mistyped figure is spotted here
                                                    more often than anywhere else — this IS the screen
                                                    the cash box is counted against. It hides itself
                                                    once the row is verified. */}
                                                <PaymentEdit payment={t} />
                                                <Can perm="fee.void">
                                                    {t.type === 'FEE' && !t.voided && !t.verified && (
                                                        <Button size="sm" variant="danger" onClick={() => setVoiding(t)}>Void</Button>
                                                    )}
                                                </Can>
                                                <Can perm="charge.collect">
                                                    {t.type === 'CHARGE' && !t.voided && !t.verified && (
                                                        <Button size="sm" variant="danger" onClick={() => setVoiding(t)}>Void</Button>
                                                    )}
                                                </Can>
                                                {/* Verified rows keep neither button. Without a word
                                                    in their place the office reads that as broken. */}
                                                <SealedNote payment={t} className="self-center" />
                                            </span>
                                        </Td>
                                    </Tr>
                                ))}
                            </Table>
                        </Card>
                    </>
                )}
            </Async>

            <ReceiptModal transactionId={reprinting} onClose={() => setReprinting(null)} />

            <ReasonModal
                open={Boolean(voiding)}
                onClose={() => setVoiding(null)}
                loading={voidPending}
                title="Void this receipt?"
                what={voiding ? `${voiding.receiptNo || 'Receipt'} — ${voiding.party?.name || ''}, ${money(voiding.amount)}` : ''}
                consequence={
                    'The entry stays in the day book, marked void, with an opposing line beside it. '
                    + (voidingCharge
                        ? 'The exact charges this receipt paid go back to outstanding.'
                        : 'The exact months this receipt paid go back to outstanding.')
                }
                confirmLabel="Void receipt"
                onConfirm={async (reason) => {
                    const mutate = voidingCharge ? voidCharge : voidReceipt;
                    await mutate.mutateAsync({ id: voiding._id, reason });
                    setVoiding(null);
                }}
            />
        </>
    );
}

function Outstanding() {
    const data = useOutstanding();
    return (
        <Async query={data}>
            {(d) => (
                <>
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(178px,1fr))]">
                        {[['Receivable', money(d.receivable.total), 'text-good'],
                          ['Payable', money(d.payable.total), 'text-crit'],
                          ['Net position', money(d.net), d.net >= 0 ? 'text-good' : 'text-crit'],
                          ['60+ days old', money(d.payable.totals.bucket60plus), 'text-crit']].map(([k, v, tone]) => (
                            <div key={k} className="bg-white border border-line rounded-lg px-4 py-3.5">
                                <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">{k}</span>
                                <div className={cx('text-[21px] font-semibold tnum', tone)}>{v}</div>
                            </div>
                        ))}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2 items-start">
                        <Card title="Student outstanding — by class">
                            <Table head={['Class', { label: 'Students', align: 'right' }, { label: 'Fee', align: 'right' },
                                          { label: 'Stock', align: 'right' }, { label: 'Other', align: 'right' },
                                          { label: 'Total', align: 'right' }]}
                                   isEmpty={!d.receivable.byClass.length} empty="Nothing outstanding" minWidth={560}>
                                {d.receivable.byClass.map((c) => (
                                    <Tr key={c.classId}>
                                        <Td className="font-semibold whitespace-nowrap">{c.className}</Td>
                                        <Td align="right">{c.students}</Td>
                                        <Td align="right">{num(c.fee)}</Td>
                                        <Td align="right">{num(c.stock)}</Td>
                                        <Td align="right">{num(c.charges || 0)}</Td>
                                        <Td align="right" className="font-semibold text-crit">{num(c.total)}</Td>
                                    </Tr>
                                ))}
                            </Table>
                        </Card>

                        <Card title="Vendor ageing">
                            <Table head={['Vendor', { label: '0–30', align: 'right' }, { label: '31–60', align: 'right' },
                                          { label: '60+', align: 'right' }, { label: 'Total', align: 'right' }]}
                                   isEmpty={!d.payable.vendors.length} empty="Nothing payable" minWidth={480}>
                                {d.payable.vendors.map((v) => (
                                    <Tr key={v.vendorId}>
                                        <Td className="font-semibold whitespace-nowrap">{v.vendorName}</Td>
                                        <Td align="right">{num(v.bucket0_30)}</Td>
                                        <Td align="right" className={v.bucket31_60 ? 'text-warn' : ''}>{num(v.bucket31_60)}</Td>
                                        <Td align="right" className={v.bucket60plus ? 'text-crit font-semibold' : ''}>{num(v.bucket60plus)}</Td>
                                        <Td align="right" className="font-semibold">{num(v.total)}</Td>
                                    </Tr>
                                ))}
                            </Table>
                        </Card>
                    </div>
                </>
            )}
        </Async>
    );
}

function IncomeExpense() {
    const data = useIncomeExpense();
    return (
        <Async query={data}>
            {(d) => (
                <Card title="Income vs expense" hint={`${d.session} · straight from rollups`}>
                    <Table head={['Month', { label: 'Fees', align: 'right' }, { label: 'Stock', align: 'right' },
                                  { label: 'ID cards', align: 'right' }, { label: 'Other fees', align: 'right' },
                                  { label: 'Total in', align: 'right' }, { label: 'Expenses', align: 'right' },
                                  { label: 'Salary', align: 'right' }, { label: 'Vendors', align: 'right' },
                                  { label: 'Total out', align: 'right' }, { label: 'Net', align: 'right' }]}
                           isEmpty={!d.months.length} empty="No data yet" minWidth={960}>
                        {d.months.map((m) => (
                            <Tr key={m.month}>
                                <Td className="font-semibold whitespace-nowrap">{monthLabel(m.month)}</Td>
                                <Td align="right">{num(m.feeCollected)}</Td>
                                <Td align="right">{num(m.stockSales)}</Td>
                                <Td align="right">{m.idCards ? num(m.idCards) : '—'}</Td>
                                <Td align="right">{m.otherFees ? num(m.otherFees) : '—'}</Td>
                                <Td align="right" className="font-semibold">{num(m.totalIn)}</Td>
                                <Td align="right">{num(m.expenses)}</Td>
                                <Td align="right">{num(m.salaries)}</Td>
                                <Td align="right">{num(m.vendorPaid)}</Td>
                                <Td align="right" className="font-semibold">{num(m.totalOut)}</Td>
                                <Td align="right" className={cx('font-semibold', m.net >= 0 ? 'text-good' : 'text-crit')}>
                                    {m.net >= 0 ? '+' : '−'}{num(Math.abs(m.net))}
                                </Td>
                            </Tr>
                        ))}
                        {d.months.length > 0 && (
                            /* One cell per column, in order, with the column named beside
                               it. The row used to be written as bare runs of dashes and
                               was one cell short of the header — so every total rendered
                               one column to the left of the figure it belonged to. */
                            <Tr className="bg-paper-2">
                                <Td className="font-semibold">Session total</Td>
                                <Td align="right">—</Td>{/* Fees */}
                                <Td align="right">—</Td>{/* Stock */}
                                <Td align="right">—</Td>{/* ID cards */}
                                <Td align="right">—</Td>{/* Other fees */}
                                <Td align="right" className="font-semibold">{num(d.totals.totalIn)}</Td>
                                <Td align="right">—</Td>{/* Expenses */}
                                <Td align="right">—</Td>{/* Salary */}
                                <Td align="right">—</Td>{/* Vendors */}
                                <Td align="right" className="font-semibold">{num(d.totals.totalOut)}</Td>
                                <Td align="right" className={cx('font-bold', d.totals.net >= 0 ? 'text-good' : 'text-crit')}>
                                    {num(d.totals.net)}
                                </Td>
                            </Tr>
                        )}
                    </Table>
                </Card>
            )}
        </Async>
    );
}


export default function Reports() {
    const [tab, setTab] = useState(null);
    const can = useAuth((s) => s.can);
    // The session name is read, never written into the page. Hardcoding it
    // meant every screen still said 2026-27 the year after the rollover.
    const session = useActiveSession();

    // Every tab is gated, INCLUDING the day book. `report.outstanding` and
    // `report.dashboard` are grantable on their own, so somebody can hold one
    // of those and not the day book — and used to land on a day book that
    // answered 403.
    const tabs = [
        ...(can('report.daybook') ? [{ value: 'daybook', label: 'Day book' }] : []),
        ...(can('report.outstanding') ? [{ value: 'outstanding', label: 'Outstanding' }] : []),
        ...(can('report.dashboard') ? [{ value: 'income', label: 'Income vs expense' }] : []),
    ];

    // Never trust the stored tab on its own: it can name a tab this user cannot
    // open (permissions changed under them, or it was simply the default). Fall
    // back to the first tab they actually have.
    const active = tabs.some((t) => t.value === tab) ? tab : tabs[0]?.value;

    return (
        <>
            <PageTitle title="Reports" sub={session.data?.name ? `Session ${session.data.name}` : ''} />
            <Tabs tabs={tabs} value={active} onChange={setTab} />

            {active === 'daybook' && <Daybook />}
            {active === 'outstanding' && <Outstanding />}
            {active === 'income' && <IncomeExpense />}
        </>
    );
}
