import { Link } from 'react-router-dom';
import { useDashboard, useFeeTrend, useFeeSummary, useDaybook, useActiveSession } from '../hooks/queries';
import { money, num, monthLabel, monthShort, currentMonthKey, percent, time, axisLabel } from '../lib/format';
import {
    Card, StatTile, Table, Tr, Td, Pill, Meter, Async, PageTitle, EmptyState, cx,
} from '../components/ui';
import { Can } from '../components/Can';

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

export default function Dashboard() {
    const dash = useDashboard();
    const trend = useFeeTrend();
    // Read, never hardcoded — otherwise the header still says last year after
    // the session rollover.
    const session = useActiveSession();
    const month = currentMonthKey();
    const summary = useFeeSummary(month);
    const daybook = useDaybook(undefined);

    return (
        <>
            <PageTitle
                title="Dashboard"
                sub={`${monthLabel(month)}${session.data?.name ? ` · Session ${session.data.name}` : ''}`}
            />

            <Async query={dash}>
                {(d) => (
                    <>
                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(178px,1fr))]">
                            <StatTile
                                label={`Collected — ${monthShort(month)}`}
                                value={money(d.fees.collected)}
                                sub={`${d.fees.rate}% of ${money(d.fees.expected)} expected`}
                                meter={d.fees.rate}
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
                                label={`Expenses — ${monthShort(month)}`}
                                value={money(d.spend.expenses)}
                                sub={`purchases ${money(d.spend.purchases)}`}
                            />
                            {/* Only once there is something to show — an ID card line
                                reading ₹0 all year is a tile earning no space. */}
                            {d.idCards?.collected > 0 && (
                                <StatTile
                                    label={`ID cards — ${monthShort(month)}`}
                                    value={money(d.idCards.collected)}
                                    sub="collected this month"
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
                            <Card title={`Class-wise collection — ${monthShort(month)}`} hint="expected vs collected">
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

                            <Card title="Today" hint="day book">
                                <Async query={daybook} rows={4}>
                                    {(db) => (
                                        <div className="flex flex-col">
                                            {db.rows.slice(0, 6).map((t) => (
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
                                            {!db.rows.length && <EmptyState>No entries today</EmptyState>}
                                            {db.rows.length > 0 && (
                                                <div className="flex items-center gap-3 px-4 py-2.5 bg-paper-2">
                                                    <div className="flex-1">
                                                        <b className="block text-[13px] font-semibold">Net today</b>
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
                        </div>
                    </>
                )}
            </Async>
        </>
    );
}
