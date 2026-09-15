import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    useChargeHeads, useCreateChargeHead, useUpdateChargeHead,
    useCharges, useChargeStudents, useRaiseCharge, useTopUpCharge, useCancelCharge,
    usePendingCharges, useCollectCharge, useChargeDiscount,
    useClasses, useStudents, useActiveSession,
} from '../hooks/queries';
import { money, num, date, dateShort, toInputDate } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Select, Field, Textarea, Toolbar, Spacer, Modal,
    ReasonModal, Async, PageTitle, Tabs, Pill, statusPill, EmptyState, Loading, Pagination, cx,
} from '../components/ui';
import { ReceiptPrint } from '../components/Receipt';
import { Can } from '../components/Can';
import { useAuth } from '../store/auth';

// ---------------------------------------------------------------------------
// OTHER FEES — admission, exams twice a year, a trip, a late fee.
//
// Everything a student is charged that is not the monthly fee. Until this
// existed there was no way to take any of it: the office either folded it into
// the monthly fee (which made the fee report lie) or took cash off the books.
//
// The screen is deliberately the same shape as Fees: collect on the left, the
// raising on its own tab, the school's own list of heads on a third.
// ---------------------------------------------------------------------------

// ---- collect (exported: the student profile opens this in a modal too) ----
export function CollectChargePanel({ studentId, onDone }) {
    const pending = usePendingCharges(studentId);
    const session = useActiveSession();
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState('Cash');
    const [receipt, setReceipt] = useState(null);
    const collect = useCollectCharge((data) => { setReceipt(data); setAmount(''); });

    if (pending.isPending) return <Loading rows={3} />;

    const demands = pending.data || [];
    const totalDue = demands.reduce((s, d) => s + Math.max(0, d.amount - d.discount - d.paidAmount), 0);
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
                    {receipt.covered.map((c) => c.title).join(', ')} settled.
                    {receipt.balanceAfter > 0 && <> {money(receipt.balanceAfter)} still outstanding.</>}
                </p>
                <div className="flex gap-2 justify-center mt-4">
                    <Button onClick={() => window.print()}>Print receipt</Button>
                    <Button variant="primary" onClick={() => { setReceipt(null); onDone?.(); }}>Done</Button>
                </div>

                {/* The same print block every receipt in the app uses. */}
                <ReceiptPrint
                    heading="Fee Receipt"
                    receipt={{
                        receiptNo: receipt.receiptNo,
                        date: receipt.date,
                        amount: receipt.amount,
                        mode: receipt.mode,
                        student: receipt.student,
                        covered: receipt.covered.map((c) => ({
                            key: c.demand, label: c.title, amount: c.amount,
                        })),
                    }}
                />
            </div>
        );
    }

    if (!demands.length) return <EmptyState>Nothing outstanding beyond the monthly fee</EmptyState>;

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <div>
                <Table head={['What for', { label: 'Due', align: 'right' }, 'Status']} minWidth={340} isEmpty={false}>
                    {demands.map((d) => {
                        const due = Math.max(0, d.amount - d.discount - d.paidAmount);
                        return (
                            <Tr key={d._id}>
                                <Td className="font-semibold">
                                    {d.headName}
                                    <span className="block text-[11.5px] font-normal text-ink-3">
                                        {d.title}{d.dueDate ? ` · due ${dateShort(d.dueDate)}` : ''}
                                    </span>
                                </Td>
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

                <Field label="Amount" hint="The oldest charge is settled first">
                    <Input inputMode="numeric" value={amount} autoFocus placeholder={String(totalDue)}
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
                                if (take > 0) covered.push(`${d.headName} (${money(take)})`);
                                left -= take;
                            }
                            return <>This settles <b className="text-ink">{covered.join(', ')}</b>. {money(totalDue - value)} will remain.</>;
                        })()}
                    </div>
                )}

                {value > totalDue && (
                    <p className="text-[12.5px] text-crit">Only {money(totalDue)} is outstanding — you cannot collect more than that.</p>
                )}

                <Button variant="primary" className="justify-center" loading={collect.isPending}
                        disabled={!(value > 0) || value > totalDue}
                        onClick={() => collect.mutate({ studentId, amount: value, mode })}>
                    Receive &amp; receipt
                </Button>
            </div>
        </div>
    );
}

// A card that is simply not there when the student owes nothing on these —
// the same rule the stock dues card follows.
export function ChargeDuesCard({ studentId, onDone }) {
    const pending = usePendingCharges(studentId);
    const due = (pending.data || []).reduce(
        (s, d) => s + Math.max(0, d.amount - d.discount - d.paidAmount), 0
    );
    if (due <= 0) return null;

    return (
        <Card title="Admission, exam & other fees" hint={money(due)} bodyClass="p-4" className="mt-4">
            <CollectChargePanel studentId={studentId} onDone={onDone} />
        </Card>
    );
}

// ---------------------------------------------------------------------------
// RAISING ONE — the decision. Who is being asked for money, how much, what for.
//
// The three scopes are the three things a school actually does: the whole
// school (admission drive, annual function), some classes (a board exam fee),
// or named students (the twelve going on the trip). Naming them explicitly
// means the record says what was decided, not just who ended up on it.
// ---------------------------------------------------------------------------
function RaiseCharge({ open, onClose }) {
    const heads = useChargeHeads();
    const classes = useClasses();
    const raise = useRaiseCharge(onClose);

    const [form, setForm] = useState({
        headId: '', title: '', amount: '', dueDate: '', scope: 'SCHOOL', note: '',
    });
    const [classIds, setClassIds] = useState([]);
    const [picked, setPicked] = useState([]);
    const [search, setSearch] = useState('');

    const students = useStudents({ search, status: 'Active', limit: 8 });

    useEffect(() => {
        if (!open) return;
        setForm({ headId: '', title: '', amount: '', dueDate: '', scope: 'SCHOOL', note: '' });
        setClassIds([]); setPicked([]); setSearch('');
    }, [open]);

    if (!open) return null;

    const head = (heads.data || []).find((h) => h._id === form.headId);
    const set = (patch) => setForm((f) => ({ ...f, ...patch }));

    const toggleClass = (id) =>
        setClassIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

    const pick = (s) => {
        setPicked((p) => (p.some((x) => x._id === s._id) ? p : [...p, s]));
        setSearch('');
    };

    const value = Number(form.amount) || 0;
    const missing = [
        !form.headId && 'a head',
        !form.title.trim() && 'what it is for',
        form.scope === 'CLASS' && !classIds.length && 'at least one class',
        form.scope === 'STUDENT' && !picked.length && 'at least one student',
    ].filter(Boolean);

    const submit = () => raise.mutate({
        headId: form.headId,
        title: form.title.trim(),
        amount: value,
        dueDate: form.dueDate || undefined,
        scope: form.scope,
        classIds: form.scope === 'CLASS' ? classIds : undefined,
        studentIds: form.scope === 'STUDENT' ? picked.map((s) => s._id) : undefined,
        note: form.note.trim() || undefined,
    });

    return (
        <Modal open onClose={onClose} title="Raise an other fee" wide
               footer={<>
                   <Button onClick={onClose}>Cancel</Button>
                   <Button variant="primary" loading={raise.isPending} disabled={missing.length > 0} onClick={submit}>
                       Raise
                   </Button>
               </>}>
            <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Head" required hint="Admission, exam, trip — the school's own list">
                        <Select value={form.headId}
                                onChange={(e) => {
                                    const h = (heads.data || []).find((x) => x._id === e.target.value);
                                    set({ headId: e.target.value, amount: h?.defaultAmount ? String(h.defaultAmount) : form.amount });
                                }}>
                            <option value="">Choose a head…</option>
                            {(heads.data || []).map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
                        </Select>
                    </Field>
                    <Field label="What this one is for" required hint="Term 1 exam, Jaipur trip…">
                        <Input value={form.title} onChange={(e) => set({ title: e.target.value })} />
                    </Field>
                    <Field label="Amount per student" required
                           hint={head?.defaultAmount ? `The usual figure for ${head.name} is ${money(head.defaultAmount)}` : '0 records the roll without charging anything'}>
                        <Input inputMode="numeric" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
                    </Field>
                    <Field label="Due date">
                        <Input type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
                    </Field>
                </div>

                <Field label="Who pays this" required>
                    <div className="flex border border-line-2 rounded-md overflow-hidden w-max">
                        {[['SCHOOL', 'Whole school'], ['CLASS', 'Some classes'], ['STUDENT', 'Named students']].map(([v, label]) => (
                            <button key={v} type="button" onClick={() => set({ scope: v })}
                                    className={cx('px-3.5 py-1.5 text-[12.5px] border-r border-line-2 last:border-r-0',
                                                  form.scope === v ? 'bg-brand text-white font-semibold' : 'bg-paper-2 text-ink-2 hover:bg-white')}>
                                {label}
                            </button>
                        ))}
                    </div>
                </Field>

                {form.scope === 'CLASS' && (
                    <div className="flex flex-wrap gap-1.5">
                        {(classes.data || []).map((c) => (
                            <button key={c._id} type="button" onClick={() => toggleClass(c._id)}
                                    className={cx('px-2.5 py-1 rounded-md border text-[12px]',
                                                  classIds.includes(c._id)
                                                      ? 'bg-brand text-white border-brand font-semibold'
                                                      : 'bg-paper-2 text-ink-2 border-line-2 hover:bg-white')}>
                                {c.name} – {c.section}
                            </button>
                        ))}
                    </div>
                )}

                {form.scope === 'STUDENT' && (
                    <div className="flex flex-col gap-2">
                        <Input placeholder="Search a student by name or phone…" value={search}
                               onChange={(e) => setSearch(e.target.value)} />
                        {search && (students.data?.items || []).length > 0 && (
                            <div className="border border-line rounded-md divide-y divide-line max-h-40 overflow-y-auto">
                                {students.data.items
                                    .filter((s) => !picked.some((p) => p._id === s._id))
                                    .map((s) => (
                                        <button key={s._id} onClick={() => pick(s)}
                                                className="w-full text-left px-3 py-2 hover:bg-paper-2 text-[13px]">
                                            <b>{s.name}</b> <span className="text-ink-3">· {s.className}</span>
                                        </button>
                                    ))}
                            </div>
                        )}
                        {picked.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {picked.map((s) => (
                                    <span key={s._id}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand-soft border border-brand/25 text-[12px]">
                                        {s.name}
                                        <button onClick={() => setPicked((p) => p.filter((x) => x._id !== s._id))}
                                                className="text-ink-3 hover:text-crit" aria-label={`Remove ${s.name}`}>×</button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <Field label="Note"><Input value={form.note} onChange={(e) => set({ note: e.target.value })} /></Field>

                <div className="bg-paper-2 border border-line rounded-md px-3 py-2.5 text-[12.5px] text-ink-2">
                    {form.scope === 'SCHOOL' && <>This goes on <b className="text-ink">every active student</b> in the school.</>}
                    {form.scope === 'CLASS' && <>This goes on every active student in <b className="text-ink">{classIds.length || 'the chosen'} class{classIds.length === 1 ? '' : 'es'}</b>.</>}
                    {form.scope === 'STUDENT' && <>This goes on the <b className="text-ink">{picked.length || 'chosen'} student{picked.length === 1 ? '' : 's'}</b> above and nobody else.</>}
                    {' '}Pressing this twice is safe — nobody is charged for the same thing twice.
                </div>

                {missing.length > 0 && (
                    <p className="text-[11.5px] text-ink-3">
                        Add {missing.length > 1
                            ? `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
                            : missing[0]} to raise it.
                    </p>
                )}
            </div>
        </Modal>
    );
}

// ---- one charge's roll: who owes, who has paid ----
function ChargeStudents({ charge, onClose }) {
    const [status, setStatus] = useState('');
    const [page, setPage] = useState(1);
    const [waiving, setWaiving] = useState(null);
    const rows = useChargeStudents(charge?._id, { status: status || undefined, page, limit: 20 });
    const discount = useChargeDiscount();
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');

    if (!charge) return null;

    const due = waiving ? Math.max(0, waiving.amount - waiving.discount - waiving.paidAmount) : 0;
    const value = Number(amount) || 0;

    return (
        <>
            <Modal open onClose={onClose} wide
                   title={`${charge.headName} · ${charge.title}`}
                   footer={<Button onClick={onClose}>Close</Button>}>
                <Toolbar>
                    <Select className="w-auto" value={status}
                            onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                        <option value="">Everybody</option>
                        <option value="Unpaid">Not paid</option>
                        <option value="Partial">Part paid</option>
                        <option value="Paid">Paid</option>
                    </Select>
                    <Spacer />
                    <span className="text-[12.5px] text-ink-2">
                        {money(charge.totalCollected)} of {money(charge.totalRaised)} collected
                        {charge.totalDiscount > 0 && <> · {money(charge.totalDiscount)} waived</>}
                    </span>
                </Toolbar>

                <Async query={rows}>
                    {(d) => (
                        <>
                            <Table head={['Student', 'Class', { label: 'Amount', align: 'right' },
                                          { label: 'Waived', align: 'right' }, { label: 'Paid', align: 'right' },
                                          { label: 'Due', align: 'right' }, 'Status', '']}
                                   isEmpty={!d.items.length} empty="Nobody matches this filter" minWidth={720}>
                                {d.items.map((r) => {
                                    const rowDue = Math.max(0, r.amount - r.discount - r.paidAmount);
                                    return (
                                        <Tr key={r._id}>
                                            <Td className="font-semibold whitespace-nowrap">
                                                <Link to={`/students/${r.student}`} className="hover:text-brand hover:underline underline-offset-2">
                                                    {r.studentName}
                                                </Link>
                                            </Td>
                                            <Td className="whitespace-nowrap">{r.className}</Td>
                                            <Td align="right">{money(r.amount)}</Td>
                                            <Td align="right">{r.discount ? money(r.discount) : '—'}</Td>
                                            <Td align="right">{money(r.paidAmount)}</Td>
                                            <Td align="right" className={rowDue > 0 ? 'text-crit font-semibold' : ''}>{money(rowDue)}</Td>
                                            <Td>{statusPill(r.status)}</Td>
                                            <Td>
                                                <Can perm="charge.discount">
                                                    {rowDue > 0 && (
                                                        <Button size="sm" onClick={() => { setWaiving(r); setAmount(''); setReason(''); }}>
                                                            Waive
                                                        </Button>
                                                    )}
                                                </Can>
                                            </Td>
                                        </Tr>
                                    );
                                })}
                            </Table>
                            <Pagination pagination={d.pagination} onChange={setPage} />
                        </>
                    )}
                </Async>
            </Modal>

            <Modal open={Boolean(waiving)} onClose={() => setWaiving(null)}
                   title={`Waive — ${waiving?.studentName || ''}`}
                   footer={<>
                       <Button onClick={() => setWaiving(null)}>Cancel</Button>
                       <Button variant="primary" loading={discount.isPending}
                               disabled={!(value > 0) || value > due || reason.trim().length < 3}
                               onClick={async () => {
                                   await discount.mutateAsync({ id: waiving._id, amount: value, reason: reason.trim() });
                                   setWaiving(null);
                               }}>
                           Apply
                       </Button>
                   </>}>
                <div className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between pb-3 border-b border-line">
                        <span className="text-[12px] text-ink-3">{charge.headName} · outstanding</span>
                        <span className="text-[20px] font-semibold tnum text-crit">{money(due)}</span>
                    </div>
                    <Field label="Amount to waive" required
                           error={value > due ? `Only ${money(due)} is outstanding` : undefined}>
                        <Input inputMode="numeric" value={amount} autoFocus placeholder={String(due)}
                               onChange={(e) => setAmount(e.target.value)} />
                    </Field>
                    <Button size="sm" className="w-max" onClick={() => setAmount(String(due))}>
                        Waive the whole {money(due)}
                    </Button>
                    <Field label="Reason" required
                           hint="Recorded against your name — this is the first thing an auditor asks about">
                        <Textarea value={reason} placeholder="Staff child, hardship…"
                                  onChange={(e) => setReason(e.target.value)} />
                    </Field>
                    <div className="bg-paper-2 border border-line rounded-md px-3 py-2.5 text-[12.5px] text-ink-2">
                        No money changes hands and no receipt is issued. It comes off what this student owes,
                        and shows separately as a waiver rather than hiding inside collections.
                    </div>
                </div>
            </Modal>
        </>
    );
}

// ---- the raised charges ----
function ChargeList() {
    const [page, setPage] = useState(1);
    const [raising, setRaising] = useState(false);
    const [opened, setOpened] = useState(null);
    const [cancelling, setCancelling] = useState(null);
    const list = useCharges({ page, limit: 20 });
    const topUp = useTopUpCharge();
    const cancel = useCancelCharge();

    return (
        <>
            <Toolbar>
                <Spacer />
                <Can perm="charge.manage">
                    <Button variant="primary" onClick={() => setRaising(true)}>+ Raise a fee</Button>
                </Can>
            </Toolbar>

            <Card title="Raised this session" hint="admission, exams, trips">
                <Async query={list}>
                    {(d) => (
                        <>
                            <Table head={['What', 'Who', { label: 'Each', align: 'right' },
                                          { label: 'Students', align: 'right' }, { label: 'Raised', align: 'right' },
                                          { label: 'Collected', align: 'right' }, 'Due date', '']}
                                   isEmpty={!d.items.length}
                                   empty="Nothing raised yet — use the button above"
                                   minWidth={860}>
                                {d.items.map((c) => (
                                    <Tr key={c._id} className={c.cancelled ? 'opacity-50' : undefined}>
                                        <Td className="font-semibold whitespace-nowrap">
                                            {c.headName}
                                            <span className="block text-[11.5px] font-normal text-ink-3">{c.title}</span>
                                            {c.cancelled && <Pill tone="crit" className="mt-1">Cancelled</Pill>}
                                        </Td>
                                        <Td className="text-[12.5px]">
                                            {c.scope === 'SCHOOL' ? 'Whole school'
                                                : c.scope === 'CLASS' ? (c.classNames || []).join(', ')
                                                : 'Named students'}
                                        </Td>
                                        <Td align="right">{money(c.amount)}</Td>
                                        <Td align="right">{num(c.studentCount)}</Td>
                                        <Td align="right">{num(c.totalRaised)}</Td>
                                        <Td align="right" className={c.totalCollected ? 'text-good font-semibold' : ''}>
                                            {num(c.totalCollected)}
                                        </Td>
                                        <Td className="font-mono text-[11.5px] text-ink-3 whitespace-nowrap">
                                            {c.dueDate ? date(c.dueDate) : '—'}
                                        </Td>
                                        <Td>
                                            <span className="inline-flex gap-1.5">
                                                <Button size="sm" onClick={() => setOpened(c)}>Students</Button>
                                                {!c.cancelled && (
                                                    <Can perm="charge.manage">
                                                        {/* Picks up anybody admitted since. A named-student
                                                            charge has nothing to top up — the server says so. */}
                                                        {c.scope !== 'STUDENT' && (
                                                            <Button size="sm" loading={topUp.isPending}
                                                                    title="Add any students admitted since this went out"
                                                                    onClick={() => topUp.mutate(c._id)}>
                                                                Top up
                                                            </Button>
                                                        )}
                                                        <Button size="sm" variant="danger" onClick={() => setCancelling(c)}>
                                                            Cancel
                                                        </Button>
                                                    </Can>
                                                )}
                                            </span>
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

            <RaiseCharge open={raising} onClose={() => setRaising(false)} />
            <ChargeStudents charge={opened} onClose={() => setOpened(null)} />

            <ReasonModal
                open={Boolean(cancelling)}
                onClose={() => setCancelling(null)}
                loading={cancel.isPending}
                title="Cancel this charge?"
                what={cancelling ? `${cancelling.headName} · ${cancelling.title} — ${money(cancelling.totalRaised)} on ${cancelling.studentCount} students` : ''}
                consequence={
                    'Every student stops owing it and their balance comes down. The charge itself stays '
                    + 'on this list with your reason against it. If any money has already been collected '
                    + 'against it, this is refused — void those receipts first.'
                }
                confirmLabel="Cancel charge"
                onConfirm={async (reason) => {
                    await cancel.mutateAsync({ id: cancelling._id, reason });
                    setCancelling(null);
                }}
            />
        </>
    );
}

// ---- the school's own list of heads ----
function Heads() {
    const heads = useChargeHeads({ includeInactive: true });
    const create = useCreateChargeHead();
    const update = useUpdateChargeHead();
    const [form, setForm] = useState({ name: '', defaultAmount: '' });
    const [editing, setEditing] = useState(null);
    const [draft, setDraft] = useState({ name: '', defaultAmount: '' });

    const startEdit = (h) => {
        setEditing(h._id);
        setDraft({ name: h.name, defaultAmount: String(h.defaultAmount || '') });
    };

    return (
        <Card title="Heads" hint="what the school charges for, beyond the monthly fee">
            <Async query={heads}>
                {(list) => (
                    <Table head={['Head', { label: 'Usual amount', align: 'right' }, 'Status', '']}
                           isEmpty={!list.length} empty="No heads yet — add one below" minWidth={520}>
                        {list.map((h) => (
                            <Tr key={h._id}>
                                {editing === h._id ? (
                                    [
                                        <Td key="n"><Input value={draft.name} autoFocus
                                                           onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Td>,
                                        <Td key="a" align="right">
                                            <Input className="w-24 text-right" inputMode="numeric" value={draft.defaultAmount}
                                                   onChange={(e) => setDraft({ ...draft, defaultAmount: e.target.value })} />
                                        </Td>,
                                        <Td key="s">{h.isActive ? <Pill tone="ok">Active</Pill> : <Pill>Retired</Pill>}</Td>,
                                        <Td key="b">
                                            <span className="inline-flex gap-1.5">
                                                <Button size="sm" variant="primary" loading={update.isPending}
                                                        disabled={draft.name.trim().length < 2}
                                                        onClick={async () => {
                                                            await update.mutateAsync({
                                                                id: h._id,
                                                                name: draft.name.trim(),
                                                                defaultAmount: Number(draft.defaultAmount) || 0,
                                                            });
                                                            setEditing(null);
                                                        }}>Save</Button>
                                                <Button size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                                            </span>
                                        </Td>,
                                    ]
                                ) : (
                                    [
                                        <Td key="n" className="font-semibold">{h.name}</Td>,
                                        <Td key="a" align="right">{h.defaultAmount ? money(h.defaultAmount) : '—'}</Td>,
                                        <Td key="s">{h.isActive ? <Pill tone="ok">Active</Pill> : <Pill>Retired</Pill>}</Td>,
                                        <Td key="b">
                                            <Can perm="charge.manage">
                                                <span className="inline-flex gap-1.5">
                                                    <Button size="sm" onClick={() => startEdit(h)}>Edit</Button>
                                                    <Button size="sm" loading={update.isPending}
                                                            title={h.isActive
                                                                ? 'Keep it off the picker — charges already raised under it are untouched'
                                                                : 'Offer it on the picker again'}
                                                            onClick={() => update.mutate({ id: h._id, isActive: !h.isActive })}>
                                                        {h.isActive ? 'Retire' : 'Restore'}
                                                    </Button>
                                                </span>
                                            </Can>
                                        </Td>,
                                    ]
                                )}
                            </Tr>
                        ))}
                    </Table>
                )}
            </Async>

            <Can perm="charge.manage">
                <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-line bg-paper-2">
                    <Input className="flex-1 min-w-[160px] max-w-[240px]" placeholder="New head — Exam Fee…"
                           value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    <Input className="w-32" inputMode="numeric" placeholder="Usual amount"
                           value={form.defaultAmount}
                           onChange={(e) => setForm({ ...form, defaultAmount: e.target.value })} />
                    <Button variant="primary" loading={create.isPending} disabled={form.name.trim().length < 2}
                            onClick={async () => {
                                await create.mutateAsync({
                                    name: form.name.trim(),
                                    defaultAmount: Number(form.defaultAmount) || 0,
                                });
                                setForm({ name: '', defaultAmount: '' });
                            }}>
                        Add
                    </Button>
                </div>
            </Can>
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
                    <Table head={['Name', 'Class', { label: 'Other fees due', align: 'right' }, '']}
                           isEmpty={!d.items.length} empty="No students found" minWidth={420}>
                        {d.items.map((s) => (
                            <Tr key={s._id}>
                                <Td className="font-semibold whitespace-nowrap">{s.name}</Td>
                                <Td className="whitespace-nowrap">{s.className}</Td>
                                <Td align="right" className={s.chargeOutstanding > 0 ? 'text-crit font-semibold' : ''}>
                                    {money(s.chargeOutstanding || 0)}
                                </Td>
                                <Td><Button size="sm" variant="primary" onClick={() => onPick(s)}>Select</Button></Td>
                            </Tr>
                        ))}
                    </Table>
                )}
            </Async>
        </Card>
    );
}

export default function OtherFees() {
    const [tab, setTab] = useState(null);
    const [picked, setPicked] = useState(null);
    const can = useAuth((s) => s.can);

    const tabs = [
        ...(can('charge.collect') ? [{ value: 'collect', label: 'Collect' }] : []),
        { value: 'charges', label: 'Raised fees' },
        { value: 'heads', label: 'Heads' },
    ];

    // Never trust the stored tab on its own — it can name one this user cannot
    // open. Fall back to the first they actually have.
    const active = tabs.some((t) => t.value === tab) ? tab : tabs[0]?.value;

    return (
        <>
            <PageTitle title="Other fees" sub="Admission, exams, trips — anything beyond the monthly fee" />
            <Tabs tabs={tabs} value={active} onChange={(t) => { setTab(t); setPicked(null); }} />

            {active === 'collect' && (
                <>
                    <StudentPicker picked={picked} onPick={setPicked} />
                    {picked && (
                        <Card
                            title={`${picked.name} · ${picked.className}`}
                            hint={picked.admissionNo}
                            actions={<Button size="sm" onClick={() => setPicked(null)}>Different student</Button>}
                            bodyClass="p-4"
                        >
                            <CollectChargePanel studentId={picked._id} onDone={() => setPicked(null)} />
                        </Card>
                    )}
                </>
            )}

            {active === 'charges' && <ChargeList />}
            {active === 'heads' && <Heads />}
        </>
    );
}
