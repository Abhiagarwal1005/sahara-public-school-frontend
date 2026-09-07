import { useState } from 'react';
import { useDaybook, useOutstanding, useIncomeExpense, useVoidReceipt } from '../hooks/queries';
import { money, num, date, time, toInputDate, monthLabel } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Toolbar, Spacer, Pill, ReasonModal,
    Async, PageTitle, Tabs, EmptyState, cx,
} from '../components/ui';
import { Can } from '../components/Can';
import { useAuth } from '../store/auth';

// ---------------------------------------------------------------------------
// Day book — the office reconciles the cash box with this. Voids and
// reversals both show: that is correct, not clutter. A cash book that can
// be silently edited is not a cash book.
// ---------------------------------------------------------------------------
function Daybook() {
    const [day, setDay] = useState(toInputDate(new Date()));
    // The entry being voided. null = the dialog is closed.
    const [voiding, setVoiding] = useState(null);
    const book = useDaybook(day);
    const voidReceipt = useVoidReceipt();

    return (
        <>
            <Toolbar>
                <Input type="date" className="w-auto" value={day} onChange={(e) => setDay(e.target.value)} />
                <Spacer />
                <Button onClick={() => window.print()}>Print</Button>
            </Toolbar>

            <Async query={book}>
                {(d) => (
                    <>
                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(178px,1fr))]">
                            {[['Money in', money(d.totals.in), 'text-good'],
                              ['Money out', money(d.totals.out), 'text-crit'],
                              ['Net', money(d.totals.net), d.totals.net >= 0 ? 'text-good' : 'text-crit'],
                              ['Cash net', money(d.totals.netCash), 'text-ink']].map(([k, v, tone]) => (
                                <div key={k} className="bg-white border border-line rounded-lg px-4 py-3">
                                    <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1">{k}</span>
                                    <div className={cx('text-[20px] font-semibold tnum', tone)}>{v}</div>
                                </div>
                            ))}
                        </div>

                        <Card title={`Day book — ${date(day)}`} hint="for reconciling against the cash box">
                            <Table head={['Time', { label: 'Particulars', primary: true }, 'Type', 'Mode', { label: 'In', align: 'right' },
                                          { label: 'Out', align: 'right' }, '']}
                                   isEmpty={!d.rows.length} empty="No entries on this date" minWidth={720}>
                                {d.rows.map((t) => (
                                    <Tr key={t._id} className={t.voided ? 'opacity-50' : ''}>
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
                                        <Td>
                                            {/* Reconciling against the cash box is where a wrong entry
                                                gets spotted, so this is the second place a receipt can
                                                be voided from. A REVERSAL row is itself the undoing of
                                                something, so it is never offered. */}
                                            <Can perm="fee.void">
                                                {t.type === 'FEE' && !t.voided && (
                                                    <Button size="sm" variant="danger" onClick={() => setVoiding(t)}>Void</Button>
                                                )}
                                            </Can>
                                        </Td>
                                    </Tr>
                                ))}
                            </Table>
                        </Card>
                    </>
                )}
            </Async>

            <ReasonModal
                open={Boolean(voiding)}
                onClose={() => setVoiding(null)}
                loading={voidReceipt.isPending}
                title="Void this receipt?"
                what={voiding ? `${voiding.receiptNo || 'Receipt'} — ${voiding.party?.name || ''}, ${money(voiding.amount)}` : ''}
                consequence={
                    'The entry stays in the day book, marked void, with an opposing line beside it. '
                    + 'The exact months this receipt paid go back to outstanding.'
                }
                confirmLabel="Void receipt"
                onConfirm={async (reason) => {
                    await voidReceipt.mutateAsync({ id: voiding._id, reason });
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
                                          { label: 'Stock', align: 'right' }, { label: 'Total', align: 'right' }]}
                                   isEmpty={!d.receivable.byClass.length} empty="Nothing outstanding" minWidth={480}>
                                {d.receivable.byClass.map((c) => (
                                    <Tr key={c.classId}>
                                        <Td className="font-semibold whitespace-nowrap">{c.className}</Td>
                                        <Td align="right">{c.students}</Td>
                                        <Td align="right">{num(c.fee)}</Td>
                                        <Td align="right">{num(c.stock)}</Td>
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
                                  { label: 'ID cards', align: 'right' },
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
                            <Tr className="bg-paper-2">
                                <Td className="font-semibold">Session total</Td>
                                <Td align="right">—</Td><Td align="right">—</Td>
                                <Td align="right" className="font-semibold">{num(d.totals.totalIn)}</Td>
                                <Td align="right">—</Td><Td align="right">—</Td><Td align="right">—</Td>
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
    const [tab, setTab] = useState('daybook');
    const can = useAuth((s) => s.can);

    const tabs = [
        { value: 'daybook', label: 'Day book' },
        ...(can('report.outstanding') ? [{ value: 'outstanding', label: 'Outstanding' }] : []),
        ...(can('report.dashboard') ? [{ value: 'income', label: 'Income vs expense' }] : []),
    ];

    return (
        <>
            <PageTitle title="Reports" sub="Session 2026-27" />
            <Tabs tabs={tabs} value={tab} onChange={setTab} />

            {tab === 'daybook' && <Daybook />}
            {tab === 'outstanding' && <Outstanding />}
            {tab === 'income' && <IncomeExpense />}
        </>
    );
}
