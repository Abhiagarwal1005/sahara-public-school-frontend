import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    useStudents, usePendingFees, useCollectFee, useGenerateFees, useFeeDemands,
    useFeeSummary, useDefaulters, useClasses, useActiveSession, useDiscount,
    useStockDues, useCollectStockDues,
} from '../hooks/queries';
import { money, num, monthLabel, currentMonthKey, monthOptions, percent, dateShort } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Select, Field, Textarea, Toolbar, Spacer, Modal, Meter,
    Async, PageTitle, Tabs, Pill, statusPill, EmptyState, Loading, Pagination, cx,
} from '../components/ui';
import { Can } from '../components/Can';
import { useAuth } from '../store/auth';

// ---------------------------------------------------------------------------
// Collect panel — StudentProfile uses this in a modal too, hence the
// export. One collection UI across the whole app.
// ---------------------------------------------------------------------------
export function CollectFeePanel({ studentId, onDone }) {
    const pending = usePendingFees(studentId);
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState('Cash');
    const [receipt, setReceipt] = useState(null);
    const collect = useCollectFee((data) => { setReceipt(data); setAmount(''); });

    if (pending.isPending) return <Loading rows={3} />;

    const demands = pending.data || [];
    const totalDue = demands.reduce((s, d) => s + Math.max(0, d.amount - d.discount - d.paidAmount), 0);
    const value = Number(String(amount).replace(/,/g, '')) || 0;

    if (receipt) {
        return (
            <div className="text-center py-2">
                <div className="w-11 h-11 rounded-full bg-good-bg text-good grid place-items-center mx-auto mb-3 text-xl">✓</div>
                <p className="text-[15px] font-semibold">{money(receipt.amount)} collected</p>
                <p className="text-[12.5px] text-ink-3 mt-1">
                    Receipt <b className="font-mono">{receipt.receiptNo}</b> · {receipt.mode}
                </p>
                <p className="text-[12.5px] text-ink-2 mt-2">
                    {receipt.covered.map((c) => monthLabel(c.month)).join(', ')} covered.
                    {receipt.balanceAfter > 0 && <> {money(receipt.balanceAfter)} still outstanding.</>}
                </p>
                <div className="flex gap-2 justify-center mt-4">
                    <Button onClick={() => window.print()}>Print receipt</Button>
                    <Button variant="primary" onClick={() => { setReceipt(null); onDone?.(); }}>Done</Button>
                </div>

                {/* Print layout — hidden on screen, full on paper */}
                <div className="print-only text-left">
                    <div className="text-center pb-3 mb-3 border-b-2 border-ink">
                        <b className="block text-lg font-bold">Sahara Public School</b>
                        <span className="text-xs text-ink-3">Fee Receipt · Session 2026-27</span>
                    </div>
                    {[['Receipt no.', receipt.receiptNo], ['Student', receipt.student.name],
                      ['Admission no.', receipt.student.admissionNo], ['Class', receipt.student.className],
                      ['Mode', receipt.mode]].map(([k, v]) => (
                        <div key={k} className="flex justify-between py-1 text-[13px]"><span className="text-ink-2">{k}</span><b>{v}</b></div>
                    ))}
                    <div className="border-t border-line my-2" />
                    {receipt.covered.map((c) => (
                        <div key={c.month} className="flex justify-between py-1 text-[13px]">
                            <span className="text-ink-2">{monthLabel(c.month)} fee</span><b>{money(c.amount)}</b>
                        </div>
                    ))}
                    <div className="flex justify-between border-t border-line mt-2 pt-2 text-[15px]">
                        <span>Total received</span><b className="text-good">{money(receipt.amount)}</b>
                    </div>
                    <div className="flex justify-between mt-8 text-[11px] text-ink-3">
                        <span>Received by: Accounts</span><span>Authorised signature</span>
                    </div>
                </div>
            </div>
        );
    }

    if (!demands.length) return <EmptyState>This student has no fees outstanding</EmptyState>;

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <div>
                <Table head={['Month', { label: 'Due', align: 'right' }, 'Status']} minWidth={300}
                       isEmpty={false}>
                    {demands.map((d) => {
                        const due = Math.max(0, d.amount - d.discount - d.paidAmount);
                        return (
                            <Tr key={d._id}>
                                <Td className="font-semibold whitespace-nowrap">{monthLabel(d.month)}</Td>
                                <Td align="right">{money(due)}</Td>
                                <Td>{statusPill(d.status)}</Td>
                            </Tr>
                        );
                    })}
                </Table>
            </div>

            <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between pb-3 border-b border-line">
                    <span className="text-[12px] text-ink-3">Total outstanding</span>
                    <span className="text-[22px] font-semibold tnum text-crit">{money(totalDue)}</span>
                </div>

                <Field label="Amount" hint="Oldest months are settled first">
                    <Input inputMode="numeric" value={amount} autoFocus
                           placeholder={String(totalDue)}
                           onChange={(e) => setAmount(e.target.value)} />
                </Field>

                <Field label="Payment mode">
                    <div className="flex border border-line-2 rounded-md overflow-hidden w-max">
                        {['Cash', 'UPI', 'Bank', 'Cheque'].map((m) => (
                            <button key={m} type="button" onClick={() => setMode(m)}
                                    className={cx('px-3 py-1.5 text-[12.5px] border-r border-line-2 last:border-r-0',
                                                  mode === m ? 'bg-brand text-white font-semibold' : 'bg-paper-2 text-ink-2 hover:bg-white')}>
                                {m}
                            </button>
                        ))}
                    </div>
                </Field>

                {value > 0 && value <= totalDue && (
                    <div className="bg-paper-2 border border-line rounded-md px-3 py-2.5 text-[12.5px] text-ink-2">
                        {(() => {
                            let left = value;
                            const covered = [];
                            for (const d of demands) {
                                if (left <= 0) break;
                                const due = Math.max(0, d.amount - d.discount - d.paidAmount);
                                const take = Math.min(left, due);
                                if (take > 0) covered.push(`${monthLabel(d.month)} (${money(take)})`);
                                left -= take;
                            }
                            return <>This settles <b className="text-ink">{covered.join(', ')}</b>. {money(totalDue - value)} will remain outstanding.</>;
                        })()}
                    </div>
                )}

                {value > totalDue && (
                    <p className="text-[12.5px] text-crit">Only {money(totalDue)} is outstanding — you cannot collect more than that.</p>
                )}

                <Button
                    variant="primary" className="justify-center" loading={collect.isPending}
                    disabled={!(value > 0) || value > totalDue}
                    onClick={() => collect.mutate({ studentId, amount: value, mode })}
                >
                    Collect &amp; receipt
                </Button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Collecting what a student owes on uniform and books.
//
// Deliberately the same shape as CollectFeePanel above: same oldest-first
// allocation, same receipt, same print block. The person at the counter is
// doing one job — taking money — so it should not feel like two systems.
// ---------------------------------------------------------------------------
export function CollectStockDuesPanel({ studentId, onDone }) {
    const dues = useStockDues(studentId);
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState('Cash');
    const [receipt, setReceipt] = useState(null);
    const collect = useCollectStockDues((data) => { setReceipt(data); setAmount(''); });

    if (dues.isPending) return <Loading rows={3} />;

    const bills = dues.data?.bills || [];
    const totalDue = dues.data?.totalDue || 0;
    const value = Number(String(amount).replace(/,/g, '')) || 0;

    if (receipt) {
        return (
            <div className="text-center py-2">
                <div className="w-11 h-11 rounded-full bg-good-bg text-good grid place-items-center mx-auto mb-3 text-xl">✓</div>
                <p className="text-[15px] font-semibold">{money(receipt.amount)} received</p>
                <p className="text-[12.5px] text-ink-3 mt-1">
                    Receipt <b className="font-mono">{receipt.receiptNo}</b> · {receipt.mode}
                </p>
                <p className="text-[12.5px] text-ink-2 mt-2">
                    Bill {receipt.covered.map((c) => c.billNo).join(', ')} settled.
                    {receipt.balanceAfter > 0 && <> {money(receipt.balanceAfter)} still outstanding.</>}
                </p>
                <div className="flex gap-2 justify-center mt-4">
                    <Button onClick={() => window.print()}>Print receipt</Button>
                    <Button variant="primary" onClick={() => { setReceipt(null); onDone?.(); }}>Done</Button>
                </div>

                {/* Print layout — hidden on screen, full on paper */}
                <div className="print-only text-left">
                    <div className="text-center pb-3 mb-3 border-b-2 border-ink">
                        <b className="block text-lg font-bold">Sahara Public School</b>
                        <span className="text-xs text-ink-3">Uniform &amp; Books Receipt · Session 2026-27</span>
                    </div>
                    {[['Receipt no.', receipt.receiptNo], ['Student', receipt.student.name],
                      ['Admission no.', receipt.student.admissionNo], ['Class', receipt.student.className],
                      ['Mode', receipt.mode]].map(([k, v]) => (
                        <div key={k} className="flex justify-between py-1 text-[13px]"><span className="text-ink-2">{k}</span><b>{v}</b></div>
                    ))}
                    <div className="border-t border-line my-2" />
                    {receipt.covered.map((c) => (
                        <div key={c.billNo} className="flex justify-between py-1 text-[13px]">
                            <span className="text-ink-2">Bill {c.billNo}</span><b>{money(c.amount)}</b>
                        </div>
                    ))}
                    <div className="flex justify-between border-t border-line mt-2 pt-2 text-[15px]">
                        <span>Total received</span><b className="text-good">{money(receipt.amount)}</b>
                    </div>
                    <div className="flex justify-between mt-8 text-[11px] text-ink-3">
                        <span>Received by: Accounts</span><span>Authorised signature</span>
                    </div>
                </div>
            </div>
        );
    }

    if (!bills.length) return <EmptyState>Nothing is outstanding on uniform or books</EmptyState>;

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <div>
                <Table head={['Bill', 'Items', { label: 'Due', align: 'right' }]} minWidth={340} isEmpty={false}>
                    {bills.map((b) => (
                        <Tr key={b.id}>
                            <Td className="font-semibold whitespace-nowrap">
                                {b.billNo}
                                <span className="block text-[11.5px] font-normal text-ink-3">{dateShort(b.date)}</span>
                            </Td>
                            <Td className="text-[12.5px] text-ink-2">{b.items}</Td>
                            <Td align="right">{money(b.dueAmount)}</Td>
                        </Tr>
                    ))}
                </Table>
            </div>

            <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between pb-3 border-b border-line">
                    <span className="text-[12px] text-ink-3">Total outstanding</span>
                    <span className="text-[22px] font-semibold tnum text-warn">{money(totalDue)}</span>
                </div>

                <Field label="Amount" hint="Oldest bills are settled first">
                    <Input inputMode="numeric" value={amount} autoFocus
                           placeholder={String(totalDue)}
                           onChange={(e) => setAmount(e.target.value)} />
                </Field>

                <Field label="Payment mode">
                    <div className="flex border border-line-2 rounded-md overflow-hidden w-max">
                        {['Cash', 'UPI', 'Bank', 'Cheque'].map((m) => (
                            <button key={m} type="button" onClick={() => setMode(m)}
                                    className={cx('px-3 py-1.5 text-[12.5px] border-r border-line-2 last:border-r-0',
                                                  mode === m ? 'bg-brand text-white font-semibold' : 'bg-paper-2 text-ink-2 hover:bg-white')}>
                                {m}
                            </button>
                        ))}
                    </div>
                </Field>

                {value > 0 && value <= totalDue && (
                    <div className="bg-paper-2 border border-line rounded-md px-3 py-2.5 text-[12.5px] text-ink-2">
                        {(() => {
                            let left = value;
                            const covered = [];
                            for (const b of bills) {
                                if (left <= 0) break;
                                const take = Math.min(left, b.dueAmount);
                                if (take > 0) covered.push(`${b.billNo} (${money(take)})`);
                                left -= take;
                            }
                            return <>This settles <b className="text-ink">{covered.join(', ')}</b>. {money(totalDue - value)} will remain outstanding.</>;
                        })()}
                    </div>
                )}

                {value > totalDue && (
                    <p className="text-[12.5px] text-crit">Only {money(totalDue)} is outstanding — you cannot collect more than that.</p>
                )}

                <Button
                    variant="primary" className="justify-center" loading={collect.isPending}
                    disabled={!(value > 0) || value > totalDue}
                    onClick={() => collect.mutate({ studentId, amount: value, mode })}
                >
                    Receive &amp; receipt
                </Button>
            </div>
        </div>
    );
}

// A card that simply is not there when the student owes nothing — the fee
// counter should not grow an empty section for every student.
function StockDuesCard({ studentId, onDone }) {
    const dues = useStockDues(studentId);
    if (!dues.data || dues.data.totalDue <= 0) return null;

    return (
        <Card
            title="Uniform & books dues"
            hint={money(dues.data.totalDue)}
            bodyClass="p-4"
            className="mt-4"
        >
            <CollectStockDuesPanel studentId={studentId} onDone={onDone} />
        </Card>
    );
}

// ---- student picker for the collect tab ----
function StudentPicker({ onPick, picked }) {
    const [search, setSearch] = useState('');
    const list = useStudents({ search, status: 'Active', limit: 8 });

    if (picked) return null;

    return (
        <Card title="Choose a student" hint="name or phone">
            <div className="p-4 pb-2">
                <Input className="w-full" placeholder="Search by name or phone…" value={search} autoFocus
                       onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Async query={list} rows={3}>
                {(d) => (
                    <Table head={['Name', 'Class', { label: 'Outstanding', align: 'right' }, '']}
                           isEmpty={!d.items.length} empty="No students found" minWidth={420}>
                        {d.items.map((s) => {
                            const due = (s.feeOutstanding || 0) + (s.stockOutstanding || 0);
                            return (
                                <Tr key={s._id}>
                                    <Td className="font-semibold whitespace-nowrap">{s.name}</Td>
                                    <Td className="whitespace-nowrap">{s.className}</Td>
                                    <Td align="right" className={due > 0 ? 'text-crit font-semibold' : ''}>{money(due)}</Td>
                                    <Td><Button size="sm" variant="primary" onClick={() => onPick(s)}>Select</Button></Td>
                                </Tr>
                            );
                        })}
                    </Table>
                )}
            </Async>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Giving a discount or a waiver.
//
// `fee.discount` has been in the permission catalogue from the start, and the
// Settings screen has always shown a switch for it — but nothing in the app
// could actually give one, so the switch controlled nothing.
//
// A discount is NOT a payment: no cash moved, so no receipt and no ledger row.
// It lowers the student's outstanding and rises under its own head in the
// rollup, which is what keeps "expected vs collected vs waived" three separate
// numbers on the class-wise report instead of a discount hiding inside
// collections.
// ---------------------------------------------------------------------------
function DiscountModal({ demand, onClose }) {
    const discount = useDiscount();
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');

    if (!demand) return null;

    const due = Math.max(0, demand.amount - demand.discount - demand.paidAmount);
    const value = Number(String(amount).replace(/,/g, '')) || 0;
    const valid = value > 0 && value <= due && reason.trim().length >= 3;

    return (
        <Modal open onClose={onClose} title={`Discount — ${demand.studentName}`}
               footer={<>
                   <Button onClick={onClose}>Cancel</Button>
                   <Button variant="primary" loading={discount.isPending} disabled={!valid}
                           onClick={async () => {
                               await discount.mutateAsync({ id: demand._id, amount: value, reason: reason.trim() });
                               onClose();
                           }}>
                       Apply discount
                   </Button>
               </>}>
            <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between pb-3 border-b border-line">
                    <span className="text-[12px] text-ink-3">{monthLabel(demand.month)} · outstanding</span>
                    <span className="text-[20px] font-semibold tnum text-crit">{money(due)}</span>
                </div>

                <Field label="Discount amount" required
                       error={value > due ? `Only ${money(due)} is outstanding on this month` : undefined}>
                    <Input inputMode="numeric" value={amount} autoFocus placeholder={String(due)}
                           onChange={(e) => setAmount(e.target.value)} />
                </Field>

                <Button size="sm" className="w-max" onClick={() => setAmount(String(due))}>
                    Waive the whole {money(due)}
                </Button>

                <Field label="Reason" required
                       hint="Recorded against your name — this is the first thing a trust or an auditor asks about">
                    <Textarea value={reason} placeholder="Sibling concession, staff child, hardship…"
                              onChange={(e) => setReason(e.target.value)} />
                </Field>

                {value > 0 && value <= due && (
                    <div className="bg-paper-2 border border-line rounded-md px-3 py-2.5 text-[12.5px] text-ink-2">
                        No money changes hands and no receipt is issued.
                        {' '}<b className="text-ink">{money(due - value)}</b> stays outstanding for {monthLabel(demand.month)}.
                    </div>
                )}
            </div>
        </Modal>
    );
}

// ---- month view ----
function MonthView({ month }) {
    const [cls, setCls] = useState('');
    const [page, setPage] = useState(1);
    // The demand a discount is being given on. null = the dialog is closed.
    const [discounting, setDiscounting] = useState(null);
    const classes = useClasses();
    const demands = useFeeDemands({ month, class: cls || undefined, page, limit: 20 });
    const generate = useGenerateFees();

    return (
        <>
            <Toolbar>
                <Select className="w-auto" value={cls} onChange={(e) => { setCls(e.target.value); setPage(1); }}>
                    <option value="">All classes</option>
                    {classes.data?.map((c) => <option key={c._id} value={c._id}>{c.name} – {c.section}</option>)}
                </Select>
                <Spacer />
                <Can perm="fee.generate">
                    <Button variant="primary" loading={generate.isPending}
                            onClick={() => generate.mutate({ month, classId: cls || undefined })}>
                        {monthLabel(month)} — raise fees
                    </Button>
                </Can>
            </Toolbar>

            <Card title={`${monthLabel(month)} — fee demands`} hint="safe to press twice">
                <Async query={demands}>
                    {(d) => (
                        <>
                        <Table
                            head={['Student', 'Class', { label: 'Fee', align: 'right' }, { label: 'Discount', align: 'right' },
                                   { label: 'Paid', align: 'right' }, { label: 'Due', align: 'right' }, 'Status', '']}
                            isEmpty={!d.items.length}
                            empty="Fees for this month have not been raised yet — use the button above"
                            minWidth={800}
                        >
                            {d.items.map((f) => {
                                const due = Math.max(0, f.amount - f.discount - f.paidAmount);
                                return (
                                    <Tr key={f._id}>
                                        <Td className="font-semibold whitespace-nowrap">
                                            <Link to={`/students/${f.student}`} className="hover:text-brand hover:underline underline-offset-2">
                                                {f.studentName}
                                            </Link>
                                        </Td>
                                        <Td className="whitespace-nowrap">{f.className}</Td>
                                        <Td align="right">{money(f.amount)}</Td>
                                        <Td align="right">{f.discount ? money(f.discount) : '—'}</Td>
                                        <Td align="right">{money(f.paidAmount)}</Td>
                                        <Td align="right" className={due > 0 ? 'text-crit font-semibold' : ''}>{money(due)}</Td>
                                        <Td>{statusPill(f.status)}</Td>
                                        <Td>
                                            <Can perm="fee.discount">
                                                {due > 0 && (
                                                    <Button size="sm" onClick={() => setDiscounting(f)}>Discount</Button>
                                                )}
                                            </Can>
                                        </Td>
                                    </Tr>
                                );
                            })}
                        </Table>
                        <div className="px-4 border-t border-line">
                            <Pagination pagination={d.pagination} onChange={setPage} />
                        </div>
                        </>
                    )}
                </Async>
            </Card>

            <DiscountModal demand={discounting} onClose={() => setDiscounting(null)} />
        </>
    );
}

// ---- defaulters ----
function Defaulters() {
    const [cls, setCls] = useState('');
    const [page, setPage] = useState(1);
    const classes = useClasses();
    const list = useDefaulters({ class: cls || undefined, page, limit: 20 });

    return (
        <>
            <Toolbar>
                <Select className="w-auto" value={cls} onChange={(e) => { setCls(e.target.value); setPage(1); }}>
                    <option value="">All classes</option>
                    {classes.data?.map((c) => <option key={c._id} value={c._id}>{c.name} – {c.section}</option>)}
                </Select>
                <Spacer />
                <Button onClick={() => window.print()}>Print</Button>
            </Toolbar>

            <Card title="Outstanding — largest first" hint="with phone numbers, so the office can work down the list">
                <Async query={list}>
                    {(d) => (
                        <>
                        <Table
                            head={['Student', 'Class', 'Guardian phone', { label: 'Fee due', align: 'right' },
                                   { label: 'Stock due', align: 'right' }, { label: 'Total', align: 'right' }]}
                            isEmpty={!d.items.length} empty="Nothing outstanding — all clear" minWidth={640}
                        >
                            {d.items.map((s) => (
                                <Tr key={s._id}>
                                    <Td className="font-semibold whitespace-nowrap">
                                        <Link to={`/students/${s._id}`} className="hover:text-brand hover:underline underline-offset-2">{s.name}</Link>
                                    </Td>
                                    <Td className="whitespace-nowrap">{s.className}</Td>
                                    <Td className="font-mono text-[12px]">{s.phone}</Td>
                                    <Td align="right">{money(s.feeOutstanding)}</Td>
                                    <Td align="right">{money(s.stockOutstanding)}</Td>
                                    <Td align="right" className="text-crit font-semibold">
                                        {money(s.feeOutstanding + s.stockOutstanding)}
                                    </Td>
                                </Tr>
                            ))}
                        </Table>
                        <div className="px-4 border-t border-line">
                            <Pagination pagination={d.pagination} onChange={setPage} />
                        </div>
                        </>
                    )}
                </Async>
            </Card>
        </>
    );
}

// ---- class-wise report ----
function ClassReport({ month }) {
    const summary = useFeeSummary(month);
    return (
        <Async query={summary}>
            {(s) => (
                <>
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(178px,1fr))]">
                        {[['Expected', money(s.school.expected)], ['Collected', money(s.school.collected)],
                          ['Discount', money(s.school.discount)], ['Outstanding', money(s.school.outstanding)]].map(([k, v]) => (
                            <div key={k} className="bg-white border border-line rounded-lg px-4 py-3.5">
                                <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">{k}</span>
                                <div className="text-[22px] font-semibold tnum">{v}</div>
                            </div>
                        ))}
                    </div>

                    <Card title={`Class-wise — ${monthLabel(month)}`} hint={`school rate ${percent(s.school.rate)}`}>
                        <Table
                            head={['Class', { label: 'Expected', align: 'right' }, { label: 'Collected', align: 'right' },
                                   { label: 'Discount', align: 'right' }, { label: 'Outstanding', align: 'right' }, { label: 'Rate', align: 'right' }]}
                            isEmpty={!s.classes.length} empty="Fees for this month have not been raised yet" minWidth={700}
                        >
                            {s.classes.map((c) => (
                                <Tr key={c.classId}>
                                    <Td className="font-semibold whitespace-nowrap">{c.className}</Td>
                                    <Td align="right">{num(c.expected)}</Td>
                                    <Td align="right">{num(c.collected)}</Td>
                                    <Td align="right">{c.discount ? num(c.discount) : '—'}</Td>
                                    <Td align="right" className={c.outstanding > 0 ? 'text-crit' : ''}>{num(c.outstanding)}</Td>
                                    <Td align="right">
                                        <span className="inline-flex items-center gap-2 justify-end">
                                            <span className="tnum text-[12px] text-ink-2 w-9 text-right">{percent(c.rate)}</span>
                                            <Meter value={c.rate} tone={c.rate < 70 ? 'crit' : c.rate < 85 ? 'warn' : 'brand'} />
                                        </span>
                                    </Td>
                                </Tr>
                            ))}
                        </Table>
                    </Card>
                </>
            )}
        </Async>
    );
}

export default function Fees() {
    const session = useActiveSession();
    const [tab, setTab] = useState('collect');
    const [month, setMonth] = useState(currentMonthKey());
    const [picked, setPicked] = useState(null);
    const can = useAuth((s) => s.can);

    const months = monthOptions(session.data?.feeMonths?.length ? session.data.feeMonths : [currentMonthKey()]);

    const tabs = [
        { value: 'collect', label: 'Collect fee' },
        { value: 'month', label: 'Month view' },
        { value: 'defaulters', label: 'Defaulters' },
        ...(can('report.fee') ? [{ value: 'report', label: 'Class-wise report' }] : []),
    ];

    return (
        <>
            <PageTitle title="Fees" sub={monthLabel(month)}>
                {tab !== 'collect' && tab !== 'defaulters' && (
                    <Select className="w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
                        {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </Select>
                )}
            </PageTitle>

            <Tabs tabs={tabs} value={tab} onChange={(t) => { setTab(t); setPicked(null); }} />

            {tab === 'collect' && (
                <>
                    <StudentPicker picked={picked} onPick={setPicked} />
                    {picked && (
                        <Card
                            title={`${picked.name} · ${picked.className}`}
                            hint={picked.admissionNo}
                            actions={<Button size="sm" onClick={() => setPicked(null)}>Different student</Button>}
                            bodyClass="p-4"
                        >
                            <CollectFeePanel studentId={picked._id} onDone={() => setPicked(null)} />
                        </Card>
                    )}
                    {picked && <StockDuesCard studentId={picked._id} onDone={() => setPicked(null)} />}
                </>
            )}

            {tab === 'month' && <MonthView month={month} />}
            {tab === 'defaulters' && <Defaulters />}
            {tab === 'report' && <ClassReport month={month} />}
        </>
    );
}
