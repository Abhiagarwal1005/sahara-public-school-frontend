import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePayments } from '../hooks/queries';
import { money, date, time, toInputDateIST } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Select, Toolbar, Spacer,
    Async, PageTitle, Pagination, cx,
} from '../components/ui';
import { VerifyMark, VerifyToggle } from '../components/VerifyMark';

// ---------------------------------------------------------------------------
// VERIFY PAYMENTS
//
// The second pair of eyes on money collected from students. Somebody sits down
// with the cash box, the UPI app and the bank statement, picks a date, and
// ticks off each entry as genuinely received.
//
// Ticking changes ONLY the tick. No balance moves, no receipt is reissued, no
// ledger row is written — see payment.service.js. That is what makes it safe to
// untick a mistake, and it is why this screen can never be used to correct the
// cash book. A wrong entry is voided from the Fees module, which writes a
// reversal; the correction then shows up here as its own row.
// ---------------------------------------------------------------------------
const PAYMENT_STATUSES = [
    { value: 'all', label: 'All payments' },
    { value: 'pending', label: 'Still to check' },
    { value: 'verified', label: 'Verified' },
];

const PAYMENT_TYPE = { FEE: 'Fee', STOCK_SALE: 'Uniform & books', ID_CARD: 'ID card' };

export default function VerifyPayments() {
    // Seeded from the IST day, not the UTC one — otherwise opening this before
    // 05:30 in the morning would show yesterday's collections.
    const [day, setDay] = useState(toInputDateIST(new Date()));
    const [status, setStatus] = useState('all');
    const [page, setPage] = useState(1);

    // Any filter change goes back to page 1, or a narrower filter can land on a
    // page that no longer exists and the screen looks empty.
    const goTo = (value) => { setDay(value); setPage(1); };

    const list = usePayments({ date: day, status, page, limit: 20 });

    return (
        <>
            <PageTitle title="Verify payments" sub="money collected from students, checked off against the cash box" />

            <Toolbar>
                <Input type="date" className="w-auto" value={day} onChange={(e) => goTo(e.target.value)} />
                <Select className="w-auto" value={status}
                        onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                    {PAYMENT_STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
                <Spacer />
                <Button onClick={() => window.print()}>Print</Button>
            </Toolbar>

            <Async query={list}>
                {(d) => (
                    <>
                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(178px,1fr))]">
                            {[['Collected', money(d.summary.amount), `${d.summary.count} payments`, 'text-ink'],
                              ['Verified', money(d.summary.verifiedAmount), `${d.summary.verifiedCount} checked off`, 'text-good'],
                              ['Still to check', money(d.summary.pendingAmount), `${d.summary.pendingCount} payments`,
                               d.summary.pendingCount ? 'text-warn' : 'text-ink-3']].map(([k, v, sub, tone]) => (
                                <div key={k} className="bg-white border border-line rounded-lg px-4 py-3">
                                    <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1">{k}</span>
                                    <div className={cx('text-[20px] font-semibold tnum', tone)}>{v}</div>
                                    <div className="text-[11.5px] text-ink-3 mt-0.5 tnum">{sub}</div>
                                </div>
                            ))}
                        </div>

                        {/* Without this the screen can only answer "is THIS date done?",
                            and finding the days that are not done would mean clicking
                            back through the calendar one at a time. */}
                        {d.pendingAll?.count > 0 && d.pendingAll.oldestDate && (
                            <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-warn-bg border border-warn
                                            text-warn rounded-md px-4 py-2.5 text-[12.5px]">
                                <span>
                                    <b>{d.pendingAll.count}</b> payment{d.pendingAll.count > 1 ? 's' : ''} in this session
                                    {d.pendingAll.count > 1 ? ' are' : ' is'} still unchecked — the oldest is
                                    from <b>{date(d.pendingAll.oldestDate)}</b>.
                                </span>
                                {toInputDateIST(d.pendingAll.oldestDate) !== day && (
                                    <Button size="sm" onClick={() => goTo(toInputDateIST(d.pendingAll.oldestDate))}>
                                        Go to that day
                                    </Button>
                                )}
                            </div>
                        )}

                        <Card
                            title={`Collected on ${date(d.date)}`}
                            hint="fees, uniform & books, ID cards — everything a student paid"
                        >
                            <Table
                                head={['Time', { label: 'Student', primary: true }, 'Class', 'Type', 'Receipt', 'Mode',
                                       { label: 'Amount', align: 'right' }, 'Verified', '']}
                                isEmpty={!d.items.length}
                                empty={
                                    status === 'pending' ? 'Nothing left to check on this date'
                                        : status === 'verified' ? 'Nothing has been verified on this date yet'
                                        : 'No money was collected from students on this date'
                                }
                                minWidth={880}
                            >
                                {d.items.map((p) => (
                                    <Tr key={p._id}>
                                        <Td className="font-mono text-[11.5px] text-ink-3">{time(p.txnDate)}</Td>
                                        <Td className="font-semibold whitespace-nowrap">
                                            {/* A walk-in stock sale has no student behind it, so there
                                                is nothing to link to. */}
                                            {p.party?.ref ? (
                                                <Link to={`/students/${p.party.ref}`}
                                                      className="hover:text-brand hover:underline underline-offset-2">
                                                    {p.party?.name || '—'}
                                                </Link>
                                            ) : (p.party?.name || '—')}
                                        </Td>
                                        <Td className="whitespace-nowrap">{p.className || '—'}</Td>
                                        <Td className="text-[12px] whitespace-nowrap">{PAYMENT_TYPE[p.type] || p.type}</Td>
                                        <Td className="font-mono text-[11.5px]">{p.receiptNo || '—'}</Td>
                                        <Td className="font-mono text-[11.5px] text-ink-3">{p.mode}</Td>
                                        <Td align="right" className="font-semibold">{money(p.amount)}</Td>
                                        <Td>
                                            <span className="inline-flex items-center gap-2">
                                                <VerifyMark payment={p} />
                                                {p.verified && p.verifiedByName && (
                                                    <span className="text-[11px] text-ink-3 hidden sm:inline">
                                                        {p.verifiedByName}
                                                    </span>
                                                )}
                                            </span>
                                        </Td>
                                        <Td><VerifyToggle payment={p} /></Td>
                                    </Tr>
                                ))}
                            </Table>

                            <div className="px-4 border-t border-line">
                                <Pagination pagination={d.pagination} onChange={setPage} />
                            </div>
                        </Card>
                    </>
                )}
            </Async>
        </>
    );
}
