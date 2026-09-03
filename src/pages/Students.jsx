import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStudents, useClasses, useCreateStudent } from '../hooks/queries';
import { money, toInputDate } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Select, Field, Toolbar, Spacer, Modal,
    Async, PageTitle, Pill, statusPill,
} from '../components/ui';
import { Can } from '../components/Can';

function AddStudent({ open, onClose }) {
    const classes = useClasses();
    const create = useCreateStudent();
    const [form, setForm] = useState({
        name: '', guardianName: '', phone: '', class: '', monthlyFee: '', address: '',
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
                phone: form.phone,
                address: form.address || undefined,
                class: form.class,
                monthlyFee: form.monthlyFee ? Number(form.monthlyFee) : undefined,
                admissionDate: form.admissionDate,
            });
            setForm({ name: '', guardianName: '', phone: '', class: '', monthlyFee: '', address: '',
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
                <Field label="Guardian name">
                    <Input value={form.guardianName} onChange={(e) => set({ guardianName: e.target.value })} />
                </Field>
                <Field label="Guardian phone" required error={errors.phone}>
                    <Input inputMode="numeric" maxLength={10} value={form.phone} error={errors.phone}
                           onChange={(e) => set({ phone: e.target.value.replace(/\D/g, '') })} />
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

export default function Students() {
    const [filters, setFilters] = useState({ search: '', class: '', status: 'Active', page: 1 });
    const [adding, setAdding] = useState(false);
    const classes = useClasses();
    const students = useStudents(filters);

    const set = (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

    return (
        <>
            <PageTitle title="Students" sub="Session 2026-27">
                <Can perm="student.create">
                    <Button variant="primary" onClick={() => setAdding(true)}>+ Add student</Button>
                </Can>
            </PageTitle>

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
            </Toolbar>

            <Card>
                <Async query={students}>
                    {(data) => (
                        <>
                            <Table
                                head={['Adm. no', { label: 'Name', primary: true }, 'Class', 'Guardian phone',
                                       { label: 'Monthly fee', align: 'right' }, { label: 'Outstanding', align: 'right' }, 'Status', '']}
                                isEmpty={!data.items.length}
                                empty="No students found"
                                minWidth={780}
                            >
                                {data.items.map((s) => {
                                    const due = (s.feeOutstanding || 0) + (s.stockOutstanding || 0);
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
                                            <Td>{due === 0 ? <Pill tone="ok">Clear</Pill> : statusPill(s.status)}</Td>
                                            <Td><Link to={`/students/${s._id}`}><Button size="sm">Open</Button></Link></Td>
                                        </Tr>
                                    );
                                })}
                            </Table>

                            {(data.pagination.hasNextPage || data.pagination.hasPrevPage) && (
                                <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line">
                                    <span className="text-[12px] text-ink-3">Page {data.pagination.currentPage}</span>
                                    <div className="flex gap-2">
                                        <Button size="sm" disabled={!data.pagination.hasPrevPage}
                                                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Previous</Button>
                                        <Button size="sm" disabled={!data.pagination.hasNextPage}
                                                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next</Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </Async>
            </Card>

            <AddStudent open={adding} onClose={() => setAdding(false)} />
        </>
    );
}
