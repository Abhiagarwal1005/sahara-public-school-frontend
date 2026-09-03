import { useState } from 'react';
import { useTeachers, useCreateTeacher } from '../hooks/queries';
import { money, date, toInputDate } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Field, Toolbar, Spacer, Modal,
    Async, PageTitle, statusPill,
} from '../components/ui';
import { Can } from '../components/Can';

// ---------------------------------------------------------------------------
// The staff register.
//
// This used to live inside the Salary screen, which meant it sat behind
// `salary.view` — so an Accountant holding `teacher.view` had no screen to
// use it on, and adding a teacher was two levels deep inside payroll. It is
// its own page now, matching the permission that governs it. Salary still
// renders the same list in a tab, so payroll has it to hand.
// ---------------------------------------------------------------------------

function AddTeacher({ open, onClose }) {
    const create = useCreateTeacher();
    const [form, setForm] = useState({ name: '', phone: '', designation: '', monthlySalary: '', joiningDate: toInputDate(new Date()) });

    return (
        <Modal open={open} onClose={onClose} title="New teacher"
               footer={<>
                   <Button onClick={onClose}>Cancel</Button>
                   <Button variant="primary" loading={create.isPending}
                           disabled={!form.name.trim() || !Number(form.monthlySalary)}
                           onClick={async () => {
                               await create.mutateAsync({
                                   name: form.name.trim(),
                                   phone: form.phone || undefined,
                                   designation: form.designation || undefined,
                                   monthlySalary: Number(form.monthlySalary),
                                   joiningDate: form.joiningDate,
                               });
                               setForm({ name: '', phone: '', designation: '', monthlySalary: '', joiningDate: toInputDate(new Date()) });
                               onClose();
                           }}>Save</Button>
               </>}>
            <div className="flex flex-col gap-3">
                <Field label="Name" required><Input value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Designation" hint="PRT · TGT · PGT · Sports"><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></Field>
                <Field label="Phone"><Input inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                <Field label="Monthly salary" required><Input inputMode="numeric" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} /></Field>
                <Field label="Joining date" required><Input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} /></Field>
                <p className="text-[11.5px] text-ink-3">
                    Teachers do not sign in — this is only a record. Changing the salary never rewrites slips already paid.
                </p>
            </div>
        </Modal>
    );
}

export function TeachersList() {
    const list = useTeachers();
    const [adding, setAdding] = useState(false);

    return (
        <>
            <Toolbar>
                <Spacer />
                <Can perm="teacher.manage"><Button variant="primary" onClick={() => setAdding(true)}>+ Teacher</Button></Can>
            </Toolbar>

            <Card title="Teachers" hint="no login — record only">
                <Async query={list}>
                    {(d) => (
                        <Table head={['Code', 'Name', 'Designation', 'Phone', { label: 'Monthly salary', align: 'right' }, 'Joined', 'Status']}
                               isEmpty={!d.length} empty="No teachers yet" minWidth={700}>
                            {d.map((t) => (
                                <Tr key={t._id}>
                                    <Td className="font-mono text-[11.5px] text-ink-3">{t.employeeCode}</Td>
                                    <Td className="font-semibold whitespace-nowrap">{t.name}</Td>
                                    <Td>{t.designation || '—'}</Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3">{t.phone || '—'}</Td>
                                    <Td align="right">{money(t.monthlySalary)}</Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3 whitespace-nowrap">{date(t.joiningDate)}</Td>
                                    <Td>{statusPill(t.status)}</Td>
                                </Tr>
                            ))}
                        </Table>
                    )}
                </Async>
            </Card>

            <AddTeacher open={adding} onClose={() => setAdding(false)} />
        </>
    );
}

export default function Teachers() {
    return (
        <>
            <PageTitle title="Teachers" sub="staff records — no login" />
            <TeachersList />
        </>
    );
}
