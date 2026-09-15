import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDashboard, useFeeTrend, useFeeSummary, useDaybook, useActiveSession } from '../hooks/queries';
import { money, num, monthLabel, monthShort, currentMonthKey, percent, time, toInputDate, axisLabel } from '../lib/format';
import {
    Card, StatTile, Table, Tr, Td, Pill, Meter, Async, PageTitle, EmptyState, cx,
} from '../components/ui';
import { Can } from '../components/Can';
import { useAuth } from '../store/auth';

// ---------------------------------------------------------------------------
// Fee collection chart.
//
// One measure (collected) plus a target (expected). Not two competing
// series — expected is a light track with collected filled inside it. That
// shows what was due against what arrived at a glance, with no need to
// tell two colours apart.
// ---------------------------------------------------------------------------
function FeeTrend({ data }) {
    if (!data?.length) return <EmptyState>No fees raised yet</EmptyState>;

    const max = Math.max(...data.map((d) => Math.max(d.expected, d.collected)), 1);
    const current = currentMonthKey();

    return (
        <div className="p-4">
            <div className="flex gap-4 items-center mb-3.5 text-[11.5px] text-ink-2">
                <span className="flex items-center gap-1.5">
                    <i className="w-2.5 h-2.5 rounded-sm bg-brand inline-block" /> Collected
                </span>
                <span className="flex items-center gap-1.5">
                    <i className="w-2.5 h-2.5 rounded-sm bg-line border border-line-2 inline-block" /> Expected
                </span>
            </div>

            <div className="relative flex items-end gap-1.5 h-[190px] pl-11">
                {/* y-axis */}
                <div className="absolute left-0 top-0 bottom-6 w-10 text-[10.5px] text-ink-3 font-mono tnum">
                    <span className="absolute right-1.5 top-0 -translate-y-1/2">{axisLabel(max)}</span>
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2">{axisLabel(max / 2)}</span>
                    <span className="absolute right-1.5 top-full -translate-y-1/2">0</span>
                </div>
                {/* grid */}
                <div className="absolute left-11 right-0 top-0 bottom-6 pointer-events-none">
                    {[0, 50, 100].map((t) => (
                        <i key={t} className="absolute left-0 right-0 h-px bg-line" style={{ top: `${t}%` }} />
                    ))}
                </div>

                {data.map((d) => {
                    const net = Math.max(d.expected - d.discount, 1);
                    const rate = Math.round((d.collected / net) * 100);
                    return (
                        <div key={d.month} className="relative flex-1 h-full flex flex-col justify-end items-center pb-6 group">
                            <div className="relative w-full max-w-[56px] h-full flex items-end justify-center">
                                <div className="absolute bottom-0 left-1.5 right-1.5 rounded-t bg-line"
                                     style={{ height: `${(d.expected / max) * 100}%` }} />
                                <div className={cx('absolute bottom-0 left-1.5 right-1.5 rounded-t',
                                                   d.month === current ? 'bg-brand-2' : 'bg-brand')}
                                     style={{ height: `${(d.collected / max) * 100}%` }} />
                            </div>
                            <span className="absolute bottom-0 text-[11px] text-ink-2 font-mono">{monthShort(d.month)}</span>

                            {/* hover tooltip */}
                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100
                                            transition-opacity pointer-events-none z-10 bg-sidebar text-[#EAF2ED]
                                            rounded-md px-2.5 py-2 text-[11.5px] whitespace-nowrap shadow-card">
                                <b className="block font-mono text-[10px] uppercase tracking-wider text-sidebar-ink2 mb-1">
                                    {monthLabel(d.month)}
                                </b>
                                <div className="flex justify-between gap-4 tnum"><span>Expected</span><span className="font-semibold">{money(d.expected)}</span></div>
                                <div className="flex justify-between gap-4 tnum"><span>Collected</span><span className="font-semibold">{money(d.collected)}</span></div>
                                <div className="flex justify-between gap-4 tnum"><span>Rate</span><span className="font-semibold">{rate}%</span></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// What each period is called, in one place. The server sends the DATES and the
// period's name; naming it is the screen's job, because the frontend already
// owns month naming and a second list of month names on the server would be a
// second place for it to be wrong.
const PERIODS = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: '7 days' },
    { value: 'month', label: 'This month' },
];

export default function Dashboard() {
    const can = useAuth((s) => s.can);
    // The month, as it always was. Today and the last seven days are the two
    // questions somebody actually walks in with — "did this morning go well",
    // "how was the week" — and neither could be asked from this screen before.
    const [period, setPeriod] = useState('month');
    const dash = useDashboard(period);
    const trend = useFeeTrend();
    // Read, never hardcoded — otherwise the header still says last year after
    // the session rollover.
    const session = useActiveSession();
    const month = currentMonthKey();

    // -----------------------------------------------------------------------
    // The page is gated on `report.dashboard`, but these two panels are not the
    // dashboard — they are the class-wise fee report and the day book, each with
    // a permission of its own.
    //
    // They used to fire regardless. The Accountant ships WITHOUT `report.fee`,
    // so every Accountant opened the dashboard to a card containing a 403 —
    // every single day, on the first screen of the app.
    // -----------------------------------------------------------------------
    const canFeeReport = can('report.fee');
    const canDaybook = can('report.daybook');

    const summary = useFeeSummary(canFeeReport ? month : null);
    // Follows the period too — it is a day book, and "what came in this week"
    // is the same question the tiles above it are answering.
    const daybook = useDaybook(
        dash.data ? { from: toInputDate(dash.data.from), to: toInputDate(dash.data.to) } : undefined,
        { enabled: canDaybook && Boolean(dash.data) }
    );

    // Long and short, because the tiles are tight and the header is not.
    const periodName = period === 'month' ? monthLabel(month) : PERIODS.find((p) => p.value === period).label;
    const periodShort = period === 'month' ? monthShort(month) : period === 'today' ? 'today' : '7 days';

    return (
        <>
            <PageTitle
                title="Dashboard"
                sub={`${periodName}${session.data?.name ? ` · Session ${session.data.name}` : ''}`}
            >
                {/* Only the MONEY tiles follow this. The outstanding, vendor and
                    advance figures below are balances — what is owed is owed
                    whatever period is showing — which is why those tiles carry no
                    period in their label and these ones do. */}
                <div className="flex border border-line-2 rounded-md overflow-hidden w-max">
                    {PERIODS.map((p) => (
                        <button key={p.value} onClick={() => setPeriod(p.value)}
                                className={cx(
                                    'px-3 py-1.5 text-[12.5px] border-r border-line-2 last:border-r-0',
                                    period === p.value ? 'bg-brand text-white font-semibold' : 'bg-paper-2 text-ink-2 hover:bg-white'
                                )}>
                            {p.label}
                        </button>
                    ))}
                </div>
            </PageTitle>

            <Async query={dash}>
                {(d) => (
                    <>
                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(178px,1fr))]">
                            {/* The meter and the "% of expected" line only exist
                                for a month. A fee demand is raised per month, so
                                there is no such thing as "expected today" — and a
                                collection rate against an invented denominator
                                would read as a fact. Outside a month the tile says
                                what came in and stops. */}
                            <StatTile
                                label={`Collected — ${periodShort}`}
                                value={money(d.fees.collected)}
                                sub={d.fees.rate === null
                                    ? (d.otherFees?.collected > 0 ? `plus ${money(d.otherFees.collected)} other fees` : 'monthly fees')
                                    : `${d.fees.rate}% of ${money(d.fees.expected)} expected`}
                                meter={d.fees.rate === null ? undefined : d.fees.rate}
                                tone={d.fees.rate < 70 ? 'crit' : d.fees.rate < 85 ? 'warn' : 'brand'}
                            />
                            <StatTile
                                label="Fee outstanding"
                                value={money(d.outstanding.fee)}
                                sub={`${d.outstanding.studentsWithDues} of ${d.outstanding.activeStudents} students`}
                            />
                            <StatTile
                                label="Owed to vendors"
                                value={money(d.vendors.outstanding)}
                                sub={`${d.vendors.count} vendors`}
                            />
                            <StatTile
                                label={`Expenses — ${periodShort}`}
                                value={money(d.spend.expenses)}
                                sub={`purchases ${money(d.spend.purchases)}`}
                            />
                            {/* Fee collected for months that have not been billed
                                yet. It points the other way from every other tile
                                here — money in the bank that is not income — and
                                the question "how much of this is really ours" is
                                asked at the end of every term. Only shown once
                                somebody has actually paid ahead. */}
                            {d.advanceHeld > 0 && (
                                <StatTile
                                    label="Advance held"
                                    value={money(d.advanceHeld)}
                                    sub="paid for months not yet raised"
                                />
                            )}
                            {/* Only once there is something to show — an ID card line
                                reading ₹0 all year is a tile earning no space. */}
                            {d.idCards?.collected > 0 && (
                                <StatTile
                                    label={`ID cards — ${periodShort}`}
                                    value={money(d.idCards.collected)}
                                    sub={`collected ${period === 'month' ? 'this month' : period === 'today' ? 'today' : 'in 7 days'}`}
                                />
                            )}
                        </div>

                        <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr] items-stretch">
                            <Card title="Fee collection by month" hint="this session" className="flex flex-col">
                                <Async query={trend}>{(t) => <FeeTrend data={t} />}</Async>
                            </Card>

                            <Card title="Needs attention" hint="live">
                                <div className="flex flex-col">
                                    {d.alerts.lowStock.map((l) => (
                                        <div key={`${l.itemId}-${l.variantId || ''}`} className="flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-0">
                                            <div className="flex-1 min-w-0">
                                                <b className="block text-[13px] font-semibold truncate">
                                                    {l.name}{l.variantLabel && ` — ${l.variantLabel}`}
                                                </b>
                                                <span className="block text-[11.5px] text-ink-3 font-mono">
                                                    {l.currentStock} left · reorder at {l.lowStockAt}
                                                </span>
                                            </div>
                                            <Pill tone={l.currentStock === 0 ? 'crit' : 'warn'}>
                                                {l.currentStock === 0 ? 'Out' : 'Low'}
                                            </Pill>
                                        </div>
                                    ))}

                                    {d.alerts.unpaidSalarySlips > 0 && (
                                        <Can perm="salary.view">
                                            <Link to="/salary" className="flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-0 hover:bg-paper-2">
                                                <div className="flex-1">
                                                    <b className="block text-[13px] font-semibold">{d.alerts.unpaidSalarySlips} salary slips pending</b>
                                                    <span className="block text-[11.5px] text-ink-3 font-mono">{monthShort(month)} · not released yet</span>
                                                </div>
                                                <Pill tone="warn">Pending</Pill>
                                            </Link>
                                        </Can>
                                    )}

                                    {!d.alerts.lowStock.length && !d.alerts.unpaidSalarySlips && (
                                        <EmptyState>All clear — nothing pending</EmptyState>
                                    )}
                                </div>
                            </Card>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr] items-start">
                            {/* Always the MONTH, whatever the toggle says — this is
                                an expected-vs-collected report and a demand is
                                raised per month. The hint says so out loud when the
                                rest of the screen is showing something shorter,
                                rather than leaving it looking like a filter that
                                failed to apply. */}
                            {canFeeReport && (
                            <Card title={`Class-wise collection — ${monthShort(month)}`}
                                  hint={period === 'month' ? 'expected vs collected' : 'expected vs collected · always this month'}>
                                <Async query={summary} rows={4}>
                                    {(s) => (
                                        <Table
                                            head={['Class', { label: 'Expected', align: 'right' }, { label: 'Collected', align: 'right' },
                                                   { label: 'Discount', align: 'right' }, { label: 'Outstanding', align: 'right' },
                                                   { label: 'Rate', align: 'right' }]}
                                            isEmpty={!s.classes.length}
                                            empty="Fees for this month have not been raised yet"
                                        >
                                            {s.classes.map((c) => (
                                                <Tr key={c.classId}>
                                                    <Td className="font-semibold whitespace-nowrap">{c.className}</Td>
                                                    <Td align="right">{num(c.expected)}</Td>
                                                    <Td align="right">{num(c.collected)}</Td>
                                                    <Td align="right">{c.discount ? num(c.discount) : '—'}</Td>
                                                    <Td align="right">{num(c.outstanding)}</Td>
                                                    <Td align="right">
                                                        <span className="inline-flex items-center gap-2 justify-end">
                                                            <span className="tnum text-[12px] text-ink-2 w-9 text-right">{percent(c.rate)}</span>
                                                            <Meter value={c.rate} tone={c.rate < 70 ? 'crit' : c.rate < 85 ? 'warn' : 'brand'} />
                                                        </span>
                                                    </Td>
                                                </Tr>
                                            ))}
                                        </Table>
                                    )}
                                </Async>
                            </Card>
                            )}

                            {canDaybook && (
                            <Card title={periodName} hint="day book">
                                <Async query={daybook} rows={4}>
                                    {(db) => (
                                        <div className="flex flex-col">
                                            {/* The six most recent, newest first. The day
                                                book comes back oldest-first (it is a
                                                register), so taking the first six of a
                                                month showed the 1st and nothing since. */}
                                            {db.rows.slice(-6).reverse().map((t) => (
                                                <div key={t._id} className="flex items-center gap-3 px-4 py-2.5 border-b border-line">
                                                    <div className="flex-1 min-w-0">
                                                        <b className="block text-[13px] font-semibold truncate">
                                                            {t.receiptNo ? `${t.receiptNo} · ` : ''}{t.party?.name || t.note}
                                                        </b>
                                                        <span className="block text-[11.5px] text-ink-3 font-mono">
                                                            {time(t.txnDate)} · {t.type.toLowerCase().replace('_', ' ')} · {t.mode}
                                                        </span>
                                                    </div>
                                                    <span className={cx('tnum font-semibold text-[13.5px] whitespace-nowrap',
                                                                        t.direction === 'IN' ? 'text-good' : 'text-crit')}>
                                                        {t.direction === 'IN' ? '+' : '−'}{money(t.amount)}
                                                    </span>
                                                </div>
                                            ))}
                                            {!db.rows.length && <EmptyState>{period === 'today' ? 'No entries today' : 'No entries in this period'}</EmptyState>}
                                            {db.rows.length > 0 && (
                                                <div className="flex items-center gap-3 px-4 py-2.5 bg-paper-2">
                                                    <div className="flex-1">
                                                        <b className="block text-[13px] font-semibold">Net · {periodName}</b>
                                                        <span className="block text-[11.5px] text-ink-3 font-mono">
                                                            cash {money(db.totals.netCash)}
                                                        </span>
                                                    </div>
                                                    <span className={cx('tnum font-semibold', db.totals.net >= 0 ? 'text-good' : 'text-crit')}>
                                                        {db.totals.net >= 0 ? '+' : '−'}{money(Math.abs(db.totals.net))}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </Async>
                            </Card>
                            )}
                        </div>
                    </>
                )}
            </Async>
        </>
    );
}
