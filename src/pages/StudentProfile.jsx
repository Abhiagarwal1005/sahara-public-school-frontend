import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    useStudentLedger, useMarkLeft, useUpdateStudent, useVoidReceipt, useClasses, useEntityHistory,
    useStudents, useLinkSibling, useUnlinkSibling, useRefundCredit,
} from '../hooks/queries';
import { money, date, time, monthLabel, toInputDate } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Select, Field, Textarea, Async, PageTitle, Pill, statusPill,
    Modal, ReasonModal, EmptyState, Loading, cx,
} from '../components/ui';
import { ReceiptModal } from '../components/Receipt';
import { HistoryCard } from '../components/History';
import { VerifyMark } from '../components/VerifyMark';
import { PaymentEdit, SealedNote } from '../components/PaymentEdit';
import { IdCardPill, IdCardAction } from '../components/IdCard';
import { TcPill, TcAction } from '../components/TransferCertificate';
import { Can } from '../components/Can';
import { CollectFeePanel, CollectStockDuesPanel } from './Fees';
import { CollectChargePanel } from './OtherFees';

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
            motherName: student.motherName || '',
            dob: student.dob ? toInputDate(student.dob) : '',
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
        if (form.motherName.trim() !== (student.motherName || '')) body.motherName = form.motherName.trim();
        // Only when it actually has a value. Sending '' would fail the date
        // coercion, and there is no sensible way to UNSET a date of birth
        // through a form that has always been optional.
        if (form.dob && form.dob !== (student.dob ? toInputDate(student.dob) : '')) body.dob = form.dob;
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
                <Field label="Father / guardian"><Input value={form.guardianName} onChange={set('guardianName')} /></Field>
                <Field label="Mother's name"><Input value={form.motherName} onChange={set('motherName')} /></Field>
                {/* The field the receiving school checks first on a transfer
                    certificate. Easiest to fill in now; impossible to chase on
                    the day the family has already gone. */}
                <Field label="Date of birth" hint="Printed on the transfer certificate">
                    <Input type="date" value={form.dob} onChange={set('dob')} />
                </Field>
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

// ---------------------------------------------------------------------------
// Linking a brother or a sister.
//
// The search opens ON THE GUARDIAN'S PHONE NUMBER, because that is what
// siblings actually share — in most families the list the office needs is
// already on screen before they have typed anything. They can still search by
// name for the cases where it is not (two households, a different guardian).
//
// Whoever is already in this family is filtered out of the results, so the only
// thing offered is a link that would do something.
// ---------------------------------------------------------------------------
function AddSibling({ student, siblings, open, onClose }) {
    const [search, setSearch] = useState('');
    const link = useLinkSibling(onClose);

    // Re-seed on every open: a cancelled search should not carry into the next
    // student, and the phone is the right starting point every time.
    useEffect(() => {
        if (open) setSearch(student.phone || '');
    }, [open, student.phone]);

    const results = useStudents({ search, limit: 8 });

    if (!open) return null;

    // Already family, or the student themselves — neither is a link worth
    // offering.
    const known = new Set([String(student._id), ...siblings.map((s) => String(s._id))]);
    const candidates = (results.data?.items || []).filter((s) => !known.has(String(s._id)));

    const searchingByPhone = search === student.phone && Boolean(student.phone);

    return (
        <Modal open onClose={onClose} title={`Link a sibling for ${student.name}`} wide
               footer={<Button onClick={onClose}>Done</Button>}>
            <div className="flex flex-col gap-3">
                <Field
                    label="Find the brother or sister"
                    hint={searchingByPhone
                        ? "Started from this student's guardian phone — most siblings share it"
                        : 'Search by name, or by the guardian phone number'}
                >
                    <Input value={search} autoFocus placeholder="Name or phone…"
                           onChange={(e) => setSearch(e.target.value)} />
                </Field>

                {results.isPending ? (
                    <Loading rows={3} />
                ) : !candidates.length ? (
                    <EmptyState>
                        {search.trim()
                            ? 'Nobody else matches — try the other parent\'s number, or the surname'
                            : 'Type a name or a phone number to search'}
                    </EmptyState>
                ) : (
                    <Table head={['Name', 'Class', 'Phone', { label: 'Outstanding', align: 'right' }, '']}
                           minWidth={520} isEmpty={false}>
                        {candidates.map((s) => {
                            const due = (s.feeOutstanding || 0) + (s.stockOutstanding || 0) + (s.chargeOutstanding || 0);
                            return (
                                <Tr key={s._id}>
                                    <Td className="font-semibold whitespace-nowrap">
                                        {s.name}
                                        <span className="block text-[11.5px] font-normal font-mono text-ink-3">
                                            {s.admissionNo}
                                        </span>
                                    </Td>
                                    <Td className="whitespace-nowrap">{s.className}</Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3">{s.phone}</Td>
                                    <Td align="right" className={due > 0 ? 'text-crit font-semibold' : ''}>{money(due)}</Td>
                                    <Td>
                                        <Button size="sm" variant="primary" loading={link.isPending}
                                                onClick={() => link.mutate({ id: student._id, siblingId: s._id })}>
                                            Link
                                        </Button>
                                    </Td>
                                </Tr>
                            );
                        })}
                    </Table>
                )}

                <p className="text-[11.5px] text-ink-3">
                    Linking works both ways at once, and it carries: link a child to somebody who
                    already has a brother or sister here and the whole family joins up, so nobody has
                    to record the same relationship twice.
                </p>
            </div>
        </Modal>
    );
}

// The family, on the student's own page. Only rendered when there IS one —
// a "Siblings: none" card on every student in the school is noise.
function Siblings({ student, siblings, onAdd }) {
    const unlink = useUnlinkSibling();
    const [removing, setRemoving] = useState(null);

    if (!siblings.length) return null;

    // One number for the parent standing at the counter, who is paying for all
    // of them and does not think of it as three separate bills.
    const familyDue = [student, ...siblings].reduce(
        (sum, s) => sum + (s.feeOutstanding || 0) + (s.stockOutstanding || 0) + (s.chargeOutstanding || 0),
        0
    );

    return (
        <>
            <Card
                title="Brothers & sisters"
                hint={`${siblings.length + 1} children in this family`}
                actions={
                    <Can perm="student.edit">
                        <Button size="sm" onClick={onAdd}>+ Link another</Button>
                    </Can>
                }
            >
                <Table head={['Name', 'Class', 'Status', { label: 'Outstanding', align: 'right' }, '']}
                       minWidth={560} isEmpty={false}>
                    {siblings.map((s) => {
                        const due = (s.feeOutstanding || 0) + (s.stockOutstanding || 0) + (s.chargeOutstanding || 0);
                        return (
                            <Tr key={s._id}>
                                <Td className="font-semibold whitespace-nowrap">
                                    <Link to={`/students/${s._id}`} className="hover:text-brand hover:underline underline-offset-2">
                                        {s.name}
                                    </Link>
                                    <span className="block text-[11.5px] font-normal font-mono text-ink-3">
                                        {s.admissionNo}
                                    </span>
                                </Td>
                                <Td className="whitespace-nowrap">{s.className}</Td>
                                <Td>{statusPill(s.status)}</Td>
                                <Td align="right" className={due > 0 ? 'text-crit font-semibold' : ''}>{money(due)}</Td>
                                <Td>
                                    <span className="inline-flex gap-1.5">
                                        <Link to={`/students/${s._id}`}><Button size="sm">Open</Button></Link>
                                        <Can perm="student.edit">
                                            <Button size="sm" variant="danger" onClick={() => setRemoving(s)}>Unlink</Button>
                                        </Can>
                                    </span>
                                </Td>
                            </Tr>
                        );
                    })}
                </Table>

                {familyDue > 0 && (
                    <div className="px-4 py-2.5 bg-paper-2 border-t border-line flex items-center justify-between">
                        <span className="text-[12.5px] text-ink-2">
                            Together, across all {siblings.length + 1} children
                        </span>
                        <b className="tnum text-[14px] text-crit">{money(familyDue)}</b>
                    </div>
                )}
            </Card>

            <Modal
                open={Boolean(removing)} onClose={() => setRemoving(null)} title="Unlink this sibling?"
                footer={<>
                    <Button onClick={() => setRemoving(null)}>Cancel</Button>
                    <Button variant="danger" loading={unlink.isPending}
                            onClick={async () => {
                                await unlink.mutateAsync({ id: student._id, siblingId: removing._id });
                                setRemoving(null);
                            }}>
                        Unlink
                    </Button>
                </>}
            >
                <p className="text-[13px] text-ink-2">
                    <b>{removing?.name}</b> will no longer be shown as a sibling of <b>{student.name}</b>.
                </p>
                <p className="mt-3 text-[12.5px] text-ink-3">
                    Nothing else changes — no record is deleted, no fee or receipt moves. Both children
                    stay exactly as they are, just not linked.
                </p>
            </Modal>
        </>
    );
}

export default function StudentProfile() {
    const { id } = useParams();
    const ledger = useStudentLedger(id);
    const markLeft = useMarkLeft();
    const voidReceipt = useVoidReceipt();
    const [leaving, setLeaving] = useState(false);
    // Why they went. Optional, because the office does not always know on the
    // day — but it is what the transfer certificate prints, and asking later
    // means asking nobody.
    const [leavingReason, setLeavingReason] = useState('');
    const [editing, setEditing] = useState(false);
    const [collecting, setCollecting] = useState(false);
    const [collectingDues, setCollectingDues] = useState(false);
    const [collectingCharges, setCollectingCharges] = useState(false);
    // The receipt being voided. null = the dialog is closed.
    const [voiding, setVoiding] = useState(null);
    const [refunding, setRefunding] = useState(false);
    // The receipt being reprinted, for a parent who lost theirs.
    const [reprinting, setReprinting] = useState(null);
    const [linking, setLinking] = useState(false);

    return (
        <Async query={ledger}>
            {({ student, demands, charges = [], sales, payments, summary, siblings = [] }) => (
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
                        {/* Its own permission — the counter can be allowed to take a
                            monthly fee without being allowed to take an exam fee. */}
                        <Can perm="charge.collect">
                            {summary.chargeOutstanding > 0 && (
                                <Button onClick={() => setCollectingCharges(true)}>Collect other fees</Button>
                            )}
                        </Can>
                        <Can perm="student.edit">
                            {student.status === 'Active' && (
                                <Button onClick={() => setEditing(true)}>Edit</Button>
                            )}
                            {/* Only offered when there is no family yet — once there is,
                                the button lives on the Siblings card itself, next to the
                                people it would be adding to. */}
                            {!siblings.length && (
                                <Button onClick={() => setLinking(true)}>+ Add sibling</Button>
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
                            <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">Other fees due</span>
                            <div className={`text-[22px] font-semibold tnum ${summary.chargeOutstanding > 0 ? 'text-crit' : ''}`}>
                                {money(summary.chargeOutstanding || 0)}
                            </div>
                            <div className="text-[11.5px] text-ink-3 mt-1">admission, exams, trips</div>
                        </div>
                        {/* Only when there is any. A tile reading ₹0 on every
                            student in the school would train everybody to stop
                            reading the row, and this is the one number on it
                            that points the other way — money the school owes,
                            not money it is owed. */}
                        {summary.creditBalance > 0 && (
                            <div className="bg-white border border-brand rounded-lg px-4 py-3.5">
                                <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">Advance held</span>
                                <div className="text-[22px] font-semibold tnum text-brand">
                                    {money(summary.creditBalance)}
                                </div>
                                <div className="text-[11.5px] text-ink-3 mt-1 flex items-center gap-2 flex-wrap">
                                    <span>settles each month as it is raised</span>
                                    <Can perm="fee.refund">
                                        <Button size="sm" onClick={() => setRefunding(true)}>Return</Button>
                                    </Can>
                                </div>
                            </div>
                        )}
                        <div className="bg-white border border-line rounded-lg px-4 py-3.5">
                            <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">Monthly fee</span>
                            <div className="text-[22px] font-semibold tnum">{money(student.monthlyFee)}</div>
                        </div>
                        <div className="bg-white border border-line rounded-lg px-4 py-3.5">
                            <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">Status</span>
                            <div className="mt-1.5">{statusPill(student.status)}</div>
                            <div className="text-[11.5px] text-ink-3 mt-1">Admitted {date(student.admissionDate)}</div>
                        </div>
                        <div className="bg-white border border-line rounded-lg px-4 py-3.5">
                            <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">ID card</span>
                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                <IdCardPill idCard={student.idCard} />
                                <IdCardAction student={student} />
                            </div>
                            <div className="text-[11.5px] text-ink-3 mt-1">
                                {student.idCard?.issued
                                    ? `${date(student.idCard.issuedAt)}${student.idCard.amount > 0 ? ` · ${money(student.idCard.amount)}` : ' · free'}`
                                    : 'Not taken yet'}
                            </div>
                        </div>
                        {/* Issuing the certificate ALSO marks the student as Left —
                            one act, one request. So the button lives here rather
                            than beside "Mark as Left" in the header, where the two
                            would read as alternatives. */}
                        <div className="bg-white border border-line rounded-lg px-4 py-3.5">
                            <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">Transfer certificate</span>
                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                <TcPill tc={student.tc} status={student.status} />
                                <TcAction student={student} />
                            </div>
                            <div className="text-[11.5px] text-ink-3 mt-1">
                                {student.tc?.given
                                    ? `${date(student.tc.issuedAt)}${student.tc.reason ? ` · ${student.tc.reason}` : ''}`
                                    : student.status === 'Left'
                                        ? 'Left without a certificate'
                                        : 'Not issued'}
                            </div>
                        </div>
                    </div>

                    {/* Parents, numbers, address.
                        
                        All of this was being collected at admission and displayed on
                        no screen at all — the office could type a mother's name in
                        and then never see it again, and a second phone number was
                        only visible by opening the edit dialog. The one place
                        somebody stands looking for "who do I ring about this child"
                        is this page. */}
                    <Card title="Family & contact">
                        <div className="grid gap-x-8 gap-y-3 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-3">
                            {[
                                ['Father / guardian', student.guardianName],
                                ["Mother's name", student.motherName],
                                ['Phone', student.phone],
                                ['Alternate phone', student.altPhone],
                                ['Address', student.address],
                            ].map(([label, value]) => (
                                <div key={label} className={label === 'Address' ? 'sm:col-span-2 lg:col-span-1' : undefined}>
                                    <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-0.5">
                                        {label}
                                    </span>
                                    <span className={cx(
                                        'block text-[13.5px]',
                                        value ? 'text-ink font-medium' : 'text-ink-3',
                                        label.includes('hone') && value && 'font-mono'
                                    )}>
                                        {value || 'not recorded'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Right under that: who else in this school is this child's
                        family. Clicking a name opens their profile. */}
                    <Siblings student={student} siblings={siblings} onAdd={() => setLinking(true)} />

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

                        {/* This is where a bounced cheque gets undone, and where a parent
                            who lost their receipt gets another one.

                            Voided rows stay listed, struck through, with their reversal
                            beside them — the same way the day book shows them. They used
                            to be filtered out, so a voided receipt vanished from the one
                            screen the parent would be standing in front of. */}
                        <Card title="Receipts & payments" hint={`${payments.length} entries`}>
                            <Table
                                head={['Date', 'Type', { label: 'Amount', align: 'right' }, 'Mode', 'Receipt',
                                       'Verified', '']}
                                isEmpty={!payments.length} empty="No payments yet" minWidth={660}
                            >
                                {payments.map((p) => (
                                    <Tr key={p._id} className={p.voided ? 'opacity-50' : undefined}>
                                        <Td className="font-mono text-[11.5px] text-ink-3 whitespace-nowrap">{date(p.txnDate)}</Td>
                                        <Td className="whitespace-nowrap">
                                            {p.type === 'FEE' ? 'Fee' : p.type === 'STOCK_SALE' ? 'Stock'
                                                : p.type === 'ID_CARD' ? 'ID card'
                                                : p.type === 'CHARGE' ? 'Other fee'
                                                : p.type === 'FEE_REFUND' ? 'Advance returned'
                                                : p.type === 'REVERSAL' ? 'Reversal' : p.type}
                                            {p.voided && <Pill tone="crit" className="ml-1.5">Void</Pill>}
                                        </Td>
                                        <Td align="right" className={p.direction === 'IN' ? 'text-good font-semibold' : 'text-crit'}>
                                            {money(p.amount)}
                                        </Td>
                                        <Td>{p.mode}</Td>
                                        <Td className="font-mono text-[11.5px]">{p.receiptNo || '—'}</Td>
                                        {/* Read-only. A parent asking "has my payment been
                                            confirmed?" is answered here; signing it off happens
                                            on the verification screen, against the cash box. */}
                                        <Td><VerifyMark payment={p} /></Td>
                                        <Td>
                                            <span className="inline-flex gap-1.5">
                                                {/* A duplicate for a parent who lost theirs. A voided
                                                    receipt reprints too — with VOID across its face. */}
                                                {p.receiptNo && p.type === 'FEE' && (
                                                    <Button size="sm" onClick={() => setReprinting(p._id)}>Receipt</Button>
                                                )}
                                                {/* "I paid ₹5,000, not ₹500" is said standing right
                                                    here, with the slip in hand. Correctable until the
                                                    entry is checked off against the cash box, and
                                                    never after. */}
                                                <PaymentEdit payment={p} />
                                                {/* Only a fee receipt can be voided from here — a stock
                                                    receipt belongs to its bill, and a reversal row is
                                                    already the undoing of something. A verified receipt
                                                    is sealed, so it is not offered either. */}
                                                <Can perm="fee.void">
                                                    {p.type === 'FEE' && !p.voided && !p.verified && (
                                                        <Button size="sm" variant="danger" onClick={() => setVoiding(p)}>Void</Button>
                                                    )}
                                                </Can>
                                                <SealedNote payment={p} className="self-center" />
                                            </span>
                                        </Td>
                                    </Tr>
                                ))}
                            </Table>
                        </Card>
                    </div>

                    {/* Only when there are any — a "no other fees" card on every
                        student is noise. */}
                    {charges.length > 0 && (
                        <Card title="Admission, exam & other fees" hint={`${charges.length} entries`}>
                            <Table
                                head={['What for', { label: 'Amount', align: 'right' }, { label: 'Waived', align: 'right' },
                                       { label: 'Paid', align: 'right' }, { label: 'Due', align: 'right' }, 'Status']}
                                isEmpty={false} minWidth={620}
                            >
                                {charges.map((c) => {
                                    const due = Math.max(0, c.amount - c.discount - c.paidAmount);
                                    return (
                                        <Tr key={c._id}>
                                            <Td className="font-semibold whitespace-nowrap">
                                                {c.headName}
                                                <span className="block text-[11.5px] font-normal text-ink-3">
                                                    {c.title}{c.dueDate ? ` · due ${date(c.dueDate)}` : ''}
                                                </span>
                                            </Td>
                                            <Td align="right">{money(c.amount)}</Td>
                                            <Td align="right">{c.discount ? money(c.discount) : '—'}</Td>
                                            <Td align="right">{money(c.paidAmount)}</Td>
                                            <Td align="right" className={due > 0 ? 'text-crit font-semibold' : ''}>{money(due)}</Td>
                                            <Td>{statusPill(c.status)}</Td>
                                        </Tr>
                                    );
                                })}
                            </Table>
                        </Card>
                    )}

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

                    <AddSibling student={student} siblings={siblings}
                                open={linking} onClose={() => setLinking(false)} />

                    <ReceiptModal transactionId={reprinting} onClose={() => setReprinting(null)} />

                    <ReturnAdvance
                        student={student}
                        held={summary.creditBalance || 0}
                        open={refunding}
                        onClose={() => setRefunding(false)}
                    />

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
                                        onClick={async () => {
                                            await markLeft.mutateAsync({ id, reason: leavingReason.trim() || undefined });
                                            setLeavingReason('');
                                            setLeaving(false);
                                            // Deliberately STAYS on the profile rather than
                                            // returning to the roster. The next thing the
                                            // office does is hand over the transfer
                                            // certificate, and that button is on this screen.
                                        }}>
                                    Yes, mark as Left
                                </Button>
                            </>
                        }
                    >
                        <p className="text-[13px] text-ink-2">
                            <b>{student.name}</b> will be removed from rosters and excluded from next month's fee run.
                            The full history is kept.
                        </p>
                        {/* The other half of leaving, said here so nobody has to
                            already know it: the certificate does this step itself.
                            Marking left first is for a child who has gone without
                            asking for one — and the TC can still be issued later. */}
                        {!student.tc?.given && (
                            <p className="mt-3 text-[12.5px] text-ink-3">
                                If they have asked for a <b className="text-ink-2">transfer certificate</b>, issue that
                                instead — it marks them as Left in the same step, and numbers the certificate.
                            </p>
                        )}
                        <div className="mt-3">
                            <Field label="Reason for leaving" hint="Optional — but this is what the transfer certificate prints">
                                <Textarea value={leavingReason} placeholder="Family moved to Jaipur"
                                          onChange={(e) => setLeavingReason(e.target.value)} />
                            </Field>
                        </div>
                        {/* The other direction, and easier to forget: the school
                            owes THEM. A child who leaves with an advance still on
                            their head and nobody noticing is money quietly kept. */}
                        {summary.creditBalance > 0 && (
                            <p className="mt-3 text-[12.5px] text-brand bg-paper-2 border border-brand rounded-md px-3 py-2">
                                {money(summary.creditBalance)} is being held in advance for this student — return it
                                before they go, or it stays on their head.
                            </p>
                        )}
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

                    <Modal open={collectingCharges} onClose={() => setCollectingCharges(false)}
                           title="Collect admission, exam & other fees" wide>
                        <CollectChargePanel studentId={id} onDone={() => setCollectingCharges(false)} />
                    </Modal>
                </>
            )}
        </Async>
    );
}

// ---------------------------------------------------------------------------
// RETURNING AN ADVANCE
//
// A child leaves in November with three months of fee still on their head. The
// school owes that money back, and without this the credit would sit on a
// student who has gone — counted as a liability for ever. A balance with no way
// out is not a balance, it is a trap.
//
// Money going out of the drawer, so it asks for a reason the way a void does,
// and it is its own permission — the people who take money in are not
// automatically the people who should hand it back.
// ---------------------------------------------------------------------------
function ReturnAdvance({ student, held, open, onClose }) {
    const refund = useRefundCredit();
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState('Cash');
    const [reason, setReason] = useState('');

    useEffect(() => {
        if (open) { setAmount(String(held)); setMode('Cash'); setReason(''); }
    }, [open, held]);

    if (!open) return null;

    const value = Number(String(amount).replace(/,/g, '')) || 0;
    const tooMuch = value > held;
    const valid = value > 0 && !tooMuch && reason.trim().length >= 3;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Return the advance?"
            footer={
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button variant="danger" loading={refund.isPending} disabled={!valid}
                            onClick={async () => {
                                await refund.mutateAsync({
                                    studentId: student._id, amount: value, mode, reason: reason.trim(),
                                });
                                onClose();
                            }}>
                        Return {money(value)}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <p className="text-[13px] font-semibold">
                    {student.name} — {money(held)} held
                </p>

                <Field
                    label="Amount to return"
                    hint="Part of it can be returned — the rest stays and settles the coming months"
                    error={tooMuch ? `Only ${money(held)} is being held` : undefined}
                >
                    <Input inputMode="numeric" value={amount} autoFocus error={tooMuch}
                           onChange={(e) => setAmount(e.target.value)} />
                </Field>

                <Field label="Paid out by">
                    <Select value={mode} onChange={(e) => setMode(e.target.value)}>
                        {['Cash', 'UPI', 'Bank', 'Cheque'].map((m) => <option key={m}>{m}</option>)}
                    </Select>
                </Field>

                <Field label="Reason" required
                       hint="This is recorded against your name and cannot be edited afterwards">
                    <Input value={reason} maxLength={300} placeholder="Why is this being returned?"
                           onChange={(e) => setReason(e.target.value)} />
                </Field>

                <div className="bg-warn-bg border border-warn text-warn rounded-md px-3 py-2.5 text-[12.5px]">
                    The money leaves the drawer and shows in the day book as an entry out. The month&rsquo;s fee
                    collection comes down with it — a rupee that was returned was never collected.
                </div>
            </div>
        </Modal>
    );
}
