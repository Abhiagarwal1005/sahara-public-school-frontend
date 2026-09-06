import { useEffect, useState } from 'react';
import { useTeachers, useCreateTeacher, useUpdateTeacher } from '../hooks/queries';
import { money, date, toInputDate } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Field, Toolbar, Spacer, Modal,
    Async, PageTitle, statusPill,
} from '../components/ui';
import { Can } from '../components/Can';
import { HistoryCard } from '../components/History';

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
    const [form, setForm] = useState({ name: '', phone: '', designation: '', monthlySalary: '', lateAllowance: '', joiningDate: toInputDate(new Date()) });

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
                                   lateAllowance: Number(form.lateAllowance) || 0,
                                   joiningDate: form.joiningDate,
                               });
                               setForm({ name: '', phone: '', designation: '', monthlySalary: '', lateAllowance: '', joiningDate: toInputDate(new Date()) });
                               onClose();
                           }}>Save</Button>
               </>}>
            <div className="flex flex-col gap-3">
                <Field label="Name" required><Input value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Designation" hint="PRT · TGT · PGT · Sports"><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></Field>
                <Field label="Phone"><Input inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                <Field label="Monthly salary" required><Input inputMode="numeric" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} /></Field>
                <Field label="Late comings allowed / month"
                       hint="free lates each month · above this, every 4 lates cost one day (2 = half day) · 0 = none forgiven">
                    <Input inputMode="numeric" placeholder="0" value={form.lateAllowance}
                           onChange={(e) => setForm({ ...form, lateAllowance: e.target.value })} />
                </Field>
                <Field label="Joining date" required><Input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} /></Field>
                <p className="text-[11.5px] text-ink-3">
                    Teachers do not sign in — this is only a record. Changing the salary or the late
                    allowance never rewrites slips already generated — each slip keeps the values it was built from.
                </p>
            </div>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// Editing a teacher.
//
// The two fields that matter here both change what a FUTURE slip pays: the
// salary, and the late allowance. Neither touches a slip already generated —
// each slip snapshots both at generation time — which is exactly why they are
// safe to edit, and exactly why the change needs a name against it.
// ---------------------------------------------------------------------------
function EditTeacher({ teacher, onClose }) {
    const update = useUpdateTeacher();
    const [form, setForm] = useState(null);

    useEffect(() => {
        if (!teacher) return setForm(null);
        setForm({
            name: teacher.name || '',
            phone: teacher.phone || '',
            designation: teacher.designation || '',
            monthlySalary: String(teacher.monthlySalary ?? ''),
            lateAllowance: String(teacher.lateAllowance ?? 0),
        });
    }, [teacher]);

    if (!teacher || !form) return null;

    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const salaryChanged = Number(form.monthlySalary) !== teacher.monthlySalary;
    const valid = form.name.trim().length >= 2 && Number(form.monthlySalary) > 0;

    const save = async () => {
        const body = { id: teacher._id };
        if (form.name.trim() !== teacher.name) body.name = form.name.trim();
        if (form.phone !== (teacher.phone || '')) body.phone = form.phone;
        if (form.designation !== (teacher.designation || '')) body.designation = form.designation;
        if (salaryChanged) body.monthlySalary = Number(form.monthlySalary);
        if (Number(form.lateAllowance) !== (teacher.lateAllowance || 0)) body.lateAllowance = Number(form.lateAllowance) || 0;

        if (Object.keys(body).length === 1) return onClose();
        await update.mutateAsync(body);
        onClose();
    };

    return (
        <Modal open onClose={onClose} title={`Edit ${teacher.name}`}
               footer={<>
                   <Button onClick={onClose}>Cancel</Button>
                   <Button variant="primary" loading={update.isPending} disabled={!valid} onClick={save}>Save</Button>
               </>}>
            <div className="flex flex-col gap-3">
                <Field label="Name" required><Input value={form.name} autoFocus onChange={set('name')} /></Field>
                <Field label="Designation"><Input value={form.designation} onChange={set('designation')} /></Field>
                <Field label="Phone"><Input inputMode="numeric" maxLength={10} value={form.phone} onChange={set('phone')} /></Field>
                <Field label="Monthly salary" required><Input inputMode="numeric" value={form.monthlySalary} onChange={set('monthlySalary')} /></Field>
                <Field label="Late comings allowed / month"
                       hint="above this, every 4 lates cost one day (2 = half day)">
                    <Input inputMode="numeric" value={form.lateAllowance} onChange={set('lateAllowance')} />
                </Field>

                {salaryChanged && (
                    <div className="bg-warn-bg border border-warn text-warn rounded-md px-3 py-2.5 text-[12.5px]">
                        Slips already generated keep <b>{money(teacher.monthlySalary)}</b> — a slip is a snapshot,
                        so this applies from the next generation onward. The change is recorded against your name.
                    </div>
                )}
            </div>
        </Modal>
    );
}

export function TeachersList() {
    const list = useTeachers();
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState(null);

    return (
        <>
            <Toolbar>
                <Spacer />
                <Can perm="teacher.manage"><Button variant="primary" onClick={() => setAdding(true)}>+ Teacher</Button></Can>
            </Toolbar>

            <Card title="Teachers" hint="no login — record only">
                <Async query={list}>
                    {(d) => (
                        <Table head={['Code', 'Name', 'Designation', 'Phone', { label: 'Monthly salary', align: 'right' },
                                      { label: 'Late allowed', align: 'right' }, 'Joined', 'Status', '']}
                               isEmpty={!d.length} empty="No teachers yet" minWidth={860}>
                            {d.map((t) => (
                                <Tr key={t._id}>
                                    <Td className="font-mono text-[11.5px] text-ink-3">{t.employeeCode}</Td>
                                    <Td className="font-semibold whitespace-nowrap">{t.name}</Td>
                                    <Td>{t.designation || '—'}</Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3">{t.phone || '—'}</Td>
                                    <Td align="right">{money(t.monthlySalary)}</Td>
                                    {/* 0 reads as "none forgiven", which is a real setting — so it
                                        shows as a number, not as an em dash. */}
                                    <Td align="right" className="tnum">{t.lateAllowance || 0}</Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3 whitespace-nowrap">{date(t.joiningDate)}</Td>
                                    <Td>{statusPill(t.status)}</Td>
                                    <Td>
                                        <Can perm="teacher.manage">
                                            {t.status === 'Active' && (
                                                <Button size="sm" onClick={() => setEditing(t)}>Edit</Button>
                                            )}
                                        </Can>
                                    </Td>
                                </Tr>
                            ))}
                        </Table>
                    )}
                </Async>
            </Card>

            <AddTeacher open={adding} onClose={() => setAdding(false)} />
            <EditTeacher teacher={editing} onClose={() => setEditing(null)} />

            {/* One teacher's trail, opened from the row being edited. Salary
                changes are the reason this panel exists. */}
            {editing && <HistoryCard entity="Teacher" id={editing._id} title={`${editing.name} — history`} />}
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
