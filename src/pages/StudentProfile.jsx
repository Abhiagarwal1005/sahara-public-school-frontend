import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    useStudentLedger, useMarkLeft, useUpdateStudent, useVoidReceipt, useClasses, useEntityHistory,
} from '../hooks/queries';
import { money, date, time, monthLabel } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Select, Field, Async, PageTitle, Pill, statusPill,
    Modal, ReasonModal, EmptyState,
} from '../components/ui';
import { HistoryCard } from '../components/History';
import { Can } from '../components/Can';
import { CollectFeePanel, CollectStockDuesPanel } from './Fees';

// ---------------------------------------------------------------------------
// Editing a student.
//
// The backend has always accepted this (PATCH /students/:id, `student.edit`)
// and the permission has always been in the catalogue — there was simply no
// way to reach it. Meanwhile the three things an office actually changes —
// the class at promotion, a concession on the fee, a corrected phone number —
// could not be done at all.
//
// Changing the class is the delicate one: the service moves both class counts
// and rewrites the unpaid demands, so it is a normal edit here but a
// transaction there.
// ---------------------------------------------------------------------------
function EditStudent({ student, open, onClose }) {
    const classes = useClasses();
    const update = useUpdateStudent();
    const [form, setForm] = useState(null);

    // Re-seed from the student each time it opens, so a cancelled edit is
    // genuinely cancelled rather than lingering in state.
    useEffect(() => {
        if (!open) return;
        setForm({
            name: student.name || '',
            guardianName: student.guardianName || '',
            phone: student.phone || '',
            altPhone: student.altPhone || '',
            address: student.address || '',
            class: String(student.class?._id || student.class || ''),
            monthlyFee: String(student.monthlyFee ?? ''),
        });
    }, [open, student]);

    if (!open || !form) return null;

    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const classChanged = form.class !== String(student.class?._id || student.class || '');
    const valid = form.name.trim().length >= 2 && /^[6-9]\d{9}$/.test(form.phone) && Number(form.monthlyFee) >= 0;

    const save = async () => {
        // Only what actually changed — the history records fields that moved,
        // and sending everything would make a no-op save look like an edit.
        const body = { id: student._id };
        if (form.name.trim() !== student.name) body.name = form.name.trim();
        if (form.guardianName.trim() !== (student.guardianName || '')) body.guardianName = form.guardianName.trim();
        if (form.phone !== student.phone) body.phone = form.phone;
        if (form.altPhone !== (student.altPhone || '')) body.altPhone = form.altPhone;
        if (form.address.trim() !== (student.address || '')) body.address = form.address.trim();
        if (classChanged) body.class = form.class;
        if (Number(form.monthlyFee) !== student.monthlyFee) body.monthlyFee = Number(form.monthlyFee);

        if (Object.keys(body).length === 1) return onClose(); // nothing moved
        await update.mutateAsync(body);
        onClose();
    };

    return (
        <Modal open={open} onClose={onClose} title={`Edit ${student.name}`} wide
               footer={<>
                   <Button onClick={onClose}>Cancel</Button>
                   <Button variant="primary" loading={update.isPending} disabled={!valid} onClick={save}>Save</Button>
               </>}>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" required><Input value={form.name} onChange={set('name')} /></Field>
                <Field label="Guardian"><Input value={form.guardianName} onChange={set('guardianName')} /></Field>
                <Field label="Phone" required error={form.phone && !/^[6-9]\d{9}$/.test(form.phone) ? 'Enter a valid 10-digit mobile number' : undefined}>
                    <Input inputMode="numeric" maxLength={10} value={form.phone} onChange={set('phone')} />
                </Field>
                <Field label="Alternate phone"><Input inputMode="numeric" maxLength={10} value={form.altPhone} onChange={set('altPhone')} /></Field>
                <Field label="Class">
                    <Select value={form.class} onChange={set('class')}>
                        {classes.data?.map((c) => <option key={c._id} value={c._id}>{c.name} – {c.section}</option>)}
                    </Select>
                </Field>
                <Field label="Monthly fee" hint="Overrides the class default — sibling concessions, staff children">
                    <Input inputMode="numeric" value={form.monthlyFee} onChange={set('monthlyFee')} />
                </Field>
                <Field label="Address" className="sm:col-span-2"><Input value={form.address} onChange={set('address')} /></Field>
            </div>

            {classChanged && (
                <div className="mt-3 bg-warn-bg border border-warn text-warn rounded-md px-3 py-2.5 text-[12.5px]">
                    Moving class also moves this student's <b>unpaid</b> fee months to the new class.
                    Receipts already issued stay filed under the old one, so last month's class-wise
                    report does not change.
                </div>
            )}
        </Modal>
    );
}

export default function StudentProfile() {
    const { id } = useParams();
    const navigate = useNavigate();
    const ledger = useStudentLedger(id);
    const markLeft = useMarkLeft();
    const voidReceipt = useVoidReceipt();
    const [leaving, setLeaving] = useState(false);
    const [editing, setEditing] = useState(false);
    const [collecting, setCollecting] = useState(false);
    const [collectingDues, setCollectingDues] = useState(false);
    // The receipt being voided. null = the dialog is closed.
    const [voiding, setVoiding] = useState(null);

    return (
        <Async query={ledger}>
            {({ student, demands, sales, payments, summary }) => (
                <>
                    <PageTitle
                        title={student.name}
                        sub={`${student.admissionNo} · ${student.className} · ${student.phone}`}
                    >
                        <Link to="/students"><Button>← Students</Button></Link>
                        <Can perm="fee.collect">
                            {summary.feeOutstanding > 0 && (
                                <Button variant="primary" onClick={() => setCollecting(true)}>Collect fee</Button>
                            )}
                            {summary.stockOutstanding > 0 && (
                                <Button onClick={() => setCollectingDues(true)}>Collect stock dues</Button>
                            )}
                        </Can>
                        <Can perm="student.edit">
                            {student.status === 'Active' && (
                                <Button onClick={() => setEditing(true)}>Edit</Button>
                            )}
                        </Can>
                        <Can perm="student.delete">
                            {student.status === 'Active' && (
                                <Button variant="danger" onClick={() => setLeaving(true)}>Mark as Left</Button>
                            )}
                        </Can>
                    </PageTitle>

                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(178px,1fr))]">
                        <div className="bg-white border border-line rounded-lg px-4 py-3.5">
                            <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">Fee outstanding</span>
                            <div className={`text-[22px] font-semibold tnum ${summary.feeOutstanding > 0 ? 'text-crit' : ''}`}>
                                {money(summary.feeOutstanding)}
                            </div>
                        </div>
                        <div className="bg-white border border-line rounded-lg px-4 py-3.5">
                            <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">Stock outstanding</span>
                            <div className={`text-[22px] font-semibold tnum ${summary.stockOutstanding > 0 ? 'text-warn' : ''}`}>
                                {money(summary.stockOutstanding)}
                            </div>
                        </div>
                        <div className="bg-white border border-line rounded-lg px-4 py-3.5">
                            <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">Monthly fee</span>
                            <div className="text-[22px] font-semibold tnum">{money(student.monthlyFee)}</div>
                        </div>
                        <div className="bg-white border border-line rounded-lg px-4 py-3.5">
                            <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">Status</span>
                            <div className="mt-1.5">{statusPill(student.status)}</div>
                            <div className="text-[11.5px] text-ink-3 mt-1">Admitted {date(student.admissionDate)}</div>
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2 items-start">
                        <Card title="Fee months" hint={`${demands.length} months`}>
                            <Table
                                head={['Month', { label: 'Fee', align: 'right' }, { label: 'Discount', align: 'right' },
                                       { label: 'Paid', align: 'right' }, { label: 'Due', align: 'right' }, 'Status']}
                                isEmpty={!demands.length} empty="No fees raised" minWidth={520}
                            >
                                {demands.map((d) => {
                                    const due = Math.max(0, d.amount - d.discount - d.paidAmount);
                                    return (
                                        <Tr key={d._id}>
                                            <Td className="font-semibold whitespace-nowrap">{monthLabel(d.month)}</Td>
                                            <Td align="right">{money(d.amount)}</Td>
                                            <Td align="right">{d.discount ? money(d.discount) : '—'}</Td>
                                            <Td align="right">{money(d.paidAmount)}</Td>
                                            <Td align="right" className={due > 0 ? 'text-crit font-semibold' : ''}>{money(due)}</Td>
                                            <Td>{statusPill(d.status)}</Td>
                                        </Tr>
                                    );
                                })}
                            </Table>
                        </Card>

                        {/* This is where a bounced cheque gets undone. The backend route and
                            the `fee.void` permission both existed from the start; there was
                            simply no button, so the only way in was the API by hand. */}
                        <Card title="Receipts & payments" hint={`${payments.length} entries`}>
                            <Table
                                head={['Date', 'Type', { label: 'Amount', align: 'right' }, 'Mode', 'Receipt', '']}
                                isEmpty={!payments.length} empty="No payments yet" minWidth={520}
                            >
                                {payments.map((p) => (
                                    <Tr key={p._id}>
                                        <Td className="font-mono text-[11.5px] text-ink-3 whitespace-nowrap">{date(p.txnDate)}</Td>
                                        <Td className="whitespace-nowrap">{p.type === 'FEE' ? 'Fee' : p.type === 'STOCK_SALE' ? 'Stock' : p.type}</Td>
                                        <Td align="right" className={p.direction === 'IN' ? 'text-good font-semibold' : 'text-crit'}>
                                            {money(p.amount)}
                                        </Td>
                                        <Td>{p.mode}</Td>
                                        <Td className="font-mono text-[11.5px]">{p.receiptNo || '—'}</Td>
                                        <Td>
                                            {/* Only a fee receipt can be voided from here — a stock receipt
                                                belongs to its bill, and a reversal row is already the
                                                undoing of something. */}
                                            <Can perm="fee.void">
                                                {p.type === 'FEE' && !p.voided && (
                                                    <Button size="sm" variant="danger" onClick={() => setVoiding(p)}>Void</Button>
                                                )}
                                            </Can>
                                        </Td>
                                    </Tr>
                                ))}
                            </Table>
                        </Card>
                    </div>

                    <Card title="Uniform & books purchased" hint={`${sales.length} bills`}>
                        <Table
                            head={['Bill', 'Date', 'Items', { label: 'Total', align: 'right' },
                                   { label: 'Paid', align: 'right' }, { label: 'Due', align: 'right' }]}
                            isEmpty={!sales.length} empty="Nothing purchased yet" minWidth={620}
                        >
                            {sales.map((s) => (
                                <Tr key={s._id}>
                                    <Td className="font-mono text-[11.5px]">{s.billNo}</Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3 whitespace-nowrap">{date(s.date)}</Td>
                                    <Td className="text-[12.5px]">
                                        {s.lines.map((l) => `${l.itemName}${l.variantLabel ? ` (${l.variantLabel})` : ''} ×${l.qty}`).join(', ')}
                                    </Td>
                                    <Td align="right">{money(s.total)}</Td>
                                    <Td align="right">{money(s.paidAmount)}</Td>
                                    <Td align="right" className={s.dueAmount > 0 ? 'text-warn font-semibold' : ''}>{money(s.dueAmount)}</Td>
                                </Tr>
                            ))}
                        </Table>
                    </Card>

                    {/* Who changed this student, and to what. Renders nothing for a
                        viewer without `audit.view`. */}
                    <HistoryCard entity="Student" id={id} />

                    <EditStudent student={student} open={editing} onClose={() => setEditing(false)} />

                    <ReasonModal
                        open={Boolean(voiding)}
                        onClose={() => setVoiding(null)}
                        loading={voidReceipt.isPending}
                        title="Void this receipt?"
                        what={voiding ? `${voiding.receiptNo || 'Receipt'} — ${money(voiding.amount)} on ${date(voiding.txnDate)}` : ''}
                        consequence={
                            "The receipt is never deleted. It is marked void, an opposing entry is written into the "
                            + "day book, and the exact months this receipt paid go back to outstanding."
                        }
                        confirmLabel="Void receipt"
                        onConfirm={async (reason) => {
                            await voidReceipt.mutateAsync({ id: voiding._id, reason });
                            setVoiding(null);
                        }}
                    />

                    <Modal
                        open={leaving} onClose={() => setLeaving(false)} title="Mark as left?"
                        footer={
                            <>
                                <Button onClick={() => setLeaving(false)}>Cancel</Button>
                                <Button variant="danger" loading={markLeft.isPending}
                                        onClick={async () => { await markLeft.mutateAsync(id); setLeaving(false); navigate('/students'); }}>
                                    Yes, mark as Left
                                </Button>
                            </>
                        }
                    >
                        <p className="text-[13px] text-ink-2">
                            <b>{student.name}</b> will be removed from rosters and excluded from next month's fee run.
                            The full history is kept.
                        </p>
                        {summary.totalOutstanding > 0 && (
                            <p className="mt-3 text-[12.5px] text-warn bg-warn-bg border border-warn rounded-md px-3 py-2">
                                {money(summary.totalOutstanding)} is still outstanding — it will keep showing on the outstanding report
                                — leaving the school does not clear dues.
                            </p>
                        )}
                    </Modal>

                    <Modal open={collecting} onClose={() => setCollecting(false)} title="Collect fee" wide>
                        <CollectFeePanel studentId={id} onDone={() => setCollecting(false)} />
                    </Modal>

                    <Modal open={collectingDues} onClose={() => setCollectingDues(false)} title="Collect uniform & books dues" wide>
                        <CollectStockDuesPanel studentId={id} onDone={() => setCollectingDues(false)} />
                    </Modal>
                </>
            )}
        </Async>
    );
}
