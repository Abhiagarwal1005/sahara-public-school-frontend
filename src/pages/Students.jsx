import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStudents, useClasses, useCreateStudent, useIdCardSummary, useActiveSession } from '../hooks/queries';
import { money, toInputDate, num, percent } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Select, Field, Toolbar, Spacer, Modal,
    Async, PageTitle, Pill, statusPill, Tabs, Meter, Pagination, cx,
} from '../components/ui';
import { Can } from '../components/Can';
import { IdCardPill, IdCardAction } from '../components/IdCard';
import { TcPill, TcAction } from '../components/TransferCertificate';

function AddStudent({ open, onClose }) {
    const classes = useClasses();
    const create = useCreateStudent();
    const [form, setForm] = useState({
        name: '', guardianName: '', motherName: '', dob: '', phone: '', altPhone: '',
        class: '', monthlyFee: '', address: '',
        admissionDate: toInputDate(new Date()),
    });
    const [errors, setErrors] = useState({});

    const set = (patch) => setForm((f) => ({ ...f, ...patch }));

    // Client-side validation exists only for instant feedback — the real rule
    // is the backend's zod schema, whose field errors surface here too.
    const validate = () => {
        const e = {};
        if (form.name.trim().length < 2) e.name = 'Enter a name';
        if (!/^[6-9]\d{9}$/.test(form.phone)) e.phone = 'Enter a valid 10-digit mobile number';
        if (!form.class) e.class = 'Choose a class';
        setErrors(e);
        return !Object.keys(e).length;
    };

    const submit = async () => {
        if (!validate()) return;
        try {
            await create.mutateAsync({
                name: form.name.trim(),
                guardianName: form.guardianName || undefined,
                motherName: form.motherName || undefined,
                dob: form.dob || undefined,
                phone: form.phone,
                altPhone: form.altPhone || undefined,
                address: form.address || undefined,
                class: form.class,
                monthlyFee: form.monthlyFee ? Number(form.monthlyFee) : undefined,
                admissionDate: form.admissionDate,
            });
            setForm({ name: '', guardianName: '', motherName: '', dob: '', phone: '', altPhone: '',
                      class: '', monthlyFee: '', address: '',
                      admissionDate: toInputDate(new Date()) });
            setErrors({});
            onClose();
        } catch (err) {
            // Backend field-level errors go straight onto the form
            if (Object.keys(err.fields || {}).length) setErrors(err.fields);
        }
    };

    const selected = classes.data?.find((c) => c._id === form.class);

    return (
        <Modal
            open={open} onClose={onClose} title="New student" wide
            footer={
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button variant="primary" onClick={submit} loading={create.isPending}>Save student</Button>
                </>
            }
        >
            <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label="Student name" required error={errors.name}>
                    <Input value={form.name} autoFocus error={errors.name}
                           onChange={(e) => set({ name: e.target.value })} />
                </Field>
                {/* Both parents, named separately. An admission form asks for both
                    and a transfer certificate prints both — folding the mother into
                    "guardian" means the school does not have her name when it is
                    asked for. `guardianName` keeps its name in the database because
                    the guardian is not always a parent. */}
                <Field label="Father / guardian name">
                    <Input value={form.guardianName} onChange={(e) => set({ guardianName: e.target.value })} />
                </Field>
                <Field label="Mother's name">
                    <Input value={form.motherName} onChange={(e) => set({ motherName: e.target.value })} />
                </Field>
                {/* Not required, because the office often does not have the
                    certificate on admission day and refusing over it would be
                    absurd. But a transfer certificate prints it, and a TC
                    without a date of birth is the one the receiving school
                    hands straight back — so it is asked for now, not chased
                    on the day the child leaves. */}
                <Field label="Date of birth" hint="Printed on the transfer certificate">
                    <Input type="date" value={form.dob} onChange={(e) => set({ dob: e.target.value })} />
                </Field>
                <Field label="Phone" required error={errors.phone} hint="The number the office rings first">
                    <Input inputMode="numeric" maxLength={10} value={form.phone} error={errors.phone}
                           onChange={(e) => set({ phone: e.target.value.replace(/\D/g, '') })} />
                </Field>
                <Field label="Alternate phone" error={errors.altPhone}
                       hint="Optional — the other parent, or a neighbour">
                    <Input inputMode="numeric" maxLength={10} value={form.altPhone} error={errors.altPhone}
                           onChange={(e) => set({ altPhone: e.target.value.replace(/\D/g, '') })} />
                </Field>
                <Field label="Class" required error={errors.class}>
                    <Select value={form.class} error={errors.class}
                            onChange={(e) => {
                                const c = classes.data?.find((x) => x._id === e.target.value);
                                set({ class: e.target.value, monthlyFee: c ? String(c.monthlyFee) : '' });
                            }}>
                        <option value="">Choose a class…</option>
                        {classes.data?.map((c) => <option key={c._id} value={c._id}>{c.name} – {c.section}</option>)}
                    </Select>
                </Field>
                <Field label="Admission date" required>
                    <Input type="date" value={form.admissionDate} onChange={(e) => set({ admissionDate: e.target.value })} />
                </Field>
                <Field label="Monthly fee"
                       hint={selected ? `Class default is ${money(selected.monthlyFee)} — you can change it` : 'Fills in automatically when a class is chosen'}>
                    <Input inputMode="numeric" value={form.monthlyFee} onChange={(e) => set({ monthlyFee: e.target.value })} />
                </Field>
                <Field label="Address" className="sm:col-span-2">
                    <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
                </Field>
            </div>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// Class-wise ID cards — how many have taken theirs, how many have not, and
// what came in.
//
// Straight off one aggregation over the students (a few hundred documents with
// the flag on an index), not a scan of the ledger. Every class shows, including
// one where nobody has taken theirs — a class missing from the list would read
// as "done", which is the opposite of the truth.
// ---------------------------------------------------------------------------
function IdCards({ onOpenClass }) {
    const summary = useIdCardSummary();

    return (
        <Async query={summary}>
            {(d) => (
                <>
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(178px,1fr))]">
                        {[['Students', num(d.school.total)],
                          ['Taken', num(d.school.issued)],
                          ['Not taken', num(d.school.pending)],
                          ['Collected', money(d.school.collected)]].map(([k, v], i) => (
                            <div key={k} className="bg-white border border-line rounded-lg px-4 py-3.5">
                                <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">{k}</span>
                                <div className={cx('text-[22px] font-semibold tnum', i === 2 && d.school.pending > 0 && 'text-warn')}>{v}</div>
                            </div>
                        ))}
                    </div>

                    <Card title="Class-wise" hint={`${percent(d.school.percent)} of the school`}>
                        <Table
                            head={['Class', { label: 'Students', align: 'right' }, { label: 'Taken', align: 'right' },
                                   { label: 'Not taken', align: 'right' }, { label: 'Collected', align: 'right' },
                                   { label: 'Done', align: 'right' }, '']}
                            isEmpty={!d.classes.length} empty="No classes yet" minWidth={720}
                        >
                            {d.classes.map((c) => (
                                <Tr key={c.classId}>
                                    <Td className="font-semibold whitespace-nowrap">{c.className}</Td>
                                    <Td align="right">{c.total}</Td>
                                    <Td align="right" className="text-good font-semibold">{c.issued}</Td>
                                    <Td align="right" className={c.pending > 0 ? 'text-warn font-semibold' : 'text-ink-3'}>
                                        {c.pending || '—'}
                                    </Td>
                                    <Td align="right">{c.collected ? money(c.collected) : '—'}</Td>
                                    <Td align="right">
                                        <span className="inline-flex items-center gap-2 justify-end">
                                            <span className="tnum text-[12px] text-ink-2 w-9 text-right">{percent(c.percent)}</span>
                                            <Meter value={c.percent} tone={c.percent < 50 ? 'crit' : c.percent < 100 ? 'warn' : 'brand'} />
                                        </span>
                                    </Td>
                                    <Td>
                                        {/* Straight to the working list: this class, not taken. */}
                                        {c.pending > 0 && (
                                            <Button size="sm" onClick={() => onOpenClass(c.classId)}>
                                                Show the {c.pending} pending
                                            </Button>
                                        )}
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

export default function Students() {
    const [tab, setTab] = useState('roster');
    const [filters, setFilters] = useState({ search: '', class: '', status: 'Active', page: 1 });
    const [adding, setAdding] = useState(false);
    const classes = useClasses();
    const students = useStudents(filters);
    // undefined until the first page lands, so the header does not flash a 0.
    const total = students.data?.pagination?.totalItems;
    // Read, never hardcoded — the roster belongs to whichever session is active.
    const session = useActiveSession();

    const set = (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

    return (
        <>
            {/* The count sits BESIDE the heading, and it is the one the FILTERS
                are showing rather than the school's total — it comes from the
                same paginated response the table is built from, so
                "Pre Nursery – A · Active" reads 12, not 547. That is what
                somebody looking at a filtered list wants to know, and the
                filters right below say what it is counting. */}
            <PageTitle
                title={
                    <span className="inline-flex items-baseline gap-2">
                        Students
                        {total !== undefined && (
                            <span className="text-[13px] font-semibold tnum text-ink-3">{num(total)}</span>
                        )}
                    </span>
                }
                sub={session.data?.name ? `Session ${session.data.name}` : ''}
            >
                <Can perm="student.create">
                    <Button variant="primary" onClick={() => setAdding(true)}>+ Add student</Button>
                </Can>
            </PageTitle>

            <Tabs
                tabs={[{ value: 'roster', label: 'Roster' }, { value: 'idcards', label: 'ID cards' }]}
                value={tab} onChange={setTab}
            />

            {tab === 'idcards' && (
                <IdCards onOpenClass={(classId) => {
                    // Jump into the roster already filtered — the report answers
                    // "which class", the roster answers "which children".
                    setFilters({ search: '', class: classId, status: 'Active', idCard: 'pending', page: 1 });
                    setTab('roster');
                }} />
            )}

            {tab === 'roster' && (
            <>
            <Toolbar>
                <Input
                    className="flex-1 min-w-[180px] max-w-[300px]"
                    placeholder="Search by name or phone…"
                    value={filters.search}
                    onChange={(e) => set({ search: e.target.value })}
                />
                <Select className="w-auto" value={filters.class} onChange={(e) => set({ class: e.target.value })}>
                    <option value="">All classes</option>
                    {classes.data?.map((c) => <option key={c._id} value={c._id}>{c.name} – {c.section}</option>)}
                </Select>
                <Select className="w-auto" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
                    <option value="Active">Active</option>
                    <option value="Left">Left</option>
                </Select>
                <Select className="w-auto" value={filters.hasDues || ''} onChange={(e) => set({ hasDues: e.target.value || undefined })}>
                    <option value="">All</option>
                    <option value="true">Only with dues</option>
                </Select>
                {/* Combines with the class filter, so "Class 5-B, not taken" is the
                    working list the office prints and walks down. */}
                <Select className="w-auto" value={filters.idCard || ''} onChange={(e) => set({ idCard: e.target.value || undefined })}>
                    <option value="">ID card: all</option>
                    <option value="pending">ID card: not taken</option>
                    <option value="issued">ID card: taken</option>
                </Select>
                {/* With Status = Left this IS the office's TC working list —
                    who has gone and has not been given their certificate. Both
                    filters are indexed equalities, so the list and its count
                    come off one index with no aggregation. */}
                <Select className="w-auto" value={filters.tc || ''} onChange={(e) => set({ tc: e.target.value || undefined })}>
                    <option value="">TC: all</option>
                    <option value="pending">TC: not issued</option>
                    <option value="given">TC: issued</option>
                </Select>
            </Toolbar>

            <Card>
                <Async query={students}>
                    {(data) => (
                        <>
                            <Table
                                head={['Adm. no', { label: 'Name', primary: true }, 'Class', 'Phone',
                                       { label: 'Monthly fee', align: 'right' }, { label: 'Outstanding', align: 'right' },
                                       'Status', 'ID card', '']}
                                isEmpty={!data.items.length}
                                empty="No students found"
                                minWidth={920}
                            >
                                {data.items.map((s) => {
                                    const due = (s.feeOutstanding || 0) + (s.stockOutstanding || 0) + (s.chargeOutstanding || 0);
                                    return (
                                        <Tr key={s._id}>
                                            <Td className="font-mono text-[11.5px] text-ink-3">{s.admissionNo}</Td>
                                            <Td className="font-semibold whitespace-nowrap">
                                                <Link to={`/students/${s._id}`} className="hover:text-brand hover:underline underline-offset-2">
                                                    {s.name}
                                                </Link>
                                            </Td>
                                            <Td className="whitespace-nowrap">{s.className}</Td>
                                            <Td className="font-mono text-[11.5px] text-ink-3">{s.phone}</Td>
                                            <Td align="right">{money(s.monthlyFee)}</Td>
                                            <Td align="right" className={due > 0 ? 'text-crit font-semibold' : ''}>{money(due)}</Td>
                                            {/* The student's STATUS, always. This used to show a green
                                                "Clear" whenever the dues were zero — so filtering the
                                                roster to Left listed people the column then labelled
                                                Clear, and the one thing the column was there to say
                                                was the one thing it hid. Dues have their own column
                                                immediately to the left. */}
                                            {/* Once a student has LEFT, "what is their
                                                status" and "have they been given their
                                                TC" are the same question — so the
                                                certificate lives in this cell rather than
                                                costing the roster a tenth column that
                                                would be blank on every active student. */}
                                            <Td>
                                                {s.status === 'Left' ? (
                                                    <span className="inline-flex flex-col items-start gap-1.5">
                                                        <span className="inline-flex items-center gap-1.5">
                                                            {statusPill(s.status)}
                                                            <TcPill tc={s.tc} status={s.status} />
                                                        </span>
                                                        <TcAction student={s} />
                                                    </span>
                                                ) : (
                                                    statusPill(s.status)
                                                )}
                                            </Td>
                                            <Td>
                                                <span className="inline-flex items-center gap-2">
                                                    <IdCardPill idCard={s.idCard} />
                                                    <IdCardAction student={s} />
                                                </span>
                                            </Td>
                                            <Td><Link to={`/students/${s._id}`}><Button size="sm">Open</Button></Link></Td>
                                        </Tr>
                                    );
                                })}
                            </Table>

                            <div className="px-4 border-t border-line">
                                <Pagination
                                    pagination={data.pagination}
                                    onChange={(page) => setFilters((f) => ({ ...f, page }))}
                                />
                            </div>
                        </>
                    )}
                </Async>
            </Card>
            </>
            )}

            <AddStudent open={adding} onClose={() => setAdding(false)} />
        </>
    );
}
