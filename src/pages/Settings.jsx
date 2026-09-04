import { useEffect, useState } from 'react';
import {
    usePermissions, useUpdatePermissions, useUsers, useCreateUser, useUpdateUser,
    useResetPassword, useClasses, useCreateClass, useUpdateClass,
    useSessions, useCreateSession, useActivateSession, useActiveSession,
} from '../hooks/queries';
import { useAuth } from '../store/auth';
import { money, date, toInputDate } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Select, Field, Toolbar, Spacer, Modal,
    Async, PageTitle, Tabs, Pill, statusPill, EmptyState, cx,
} from '../components/ui';
import { toast } from '../components/Toast';

// ---------------------------------------------------------------------------
// PERMISSIONS — the centre of the whole design.
//
// Here the Admin grants or revokes anything for any role. No code changes,
// no deploy happens. Saving invalidates the backend cache and that role's
// next request sees the new grants.
//
// One switch is locked: permission.manage. A role that can widen its own
// permissions is not a permission system.
// ---------------------------------------------------------------------------
function Permissions() {
    const perms = usePermissions();
    const update = useUpdatePermissions();
    const reloadPermissions = useAuth((s) => s.reloadPermissions);

    const [role, setRole] = useState('Principal');
    const [draft, setDraft] = useState(null);

    // Reset the draft when the role changes or fresh data arrives
    useEffect(() => {
        if (perms.data) setDraft(new Set(perms.data.grants[role]?.permissions || []));
    }, [perms.data, role]);

    if (perms.isPending || !draft) return <Card><EmptyState>Loading…</EmptyState></Card>;
    if (perms.isError) return <Card><EmptyState>{perms.error.message}</EmptyState></Card>;

    const { catalogue, adminOnly, grants } = perms.data;
    const saved = new Set(grants[role]?.permissions || []);
    const dirty = draft.size !== saved.size || [...draft].some((k) => !saved.has(k));

    // Grouped by module — the same grouping as the app's menu, so the Admin
    // thinks in the same language they use the app in
    const groups = catalogue.reduce((acc, p) => {
        (acc[p.module] ||= []).push(p);
        return acc;
    }, {});

    const toggle = (key) => {
        if (adminOnly.includes(key)) return;
        const next = new Set(draft);
        next.has(key) ? next.delete(key) : next.add(key);
        setDraft(next);
    };

    const save = async () => {
        await update.mutateAsync({ role, permissions: [...draft] });
        // In case the Admin changed something affecting their own session
        await reloadPermissions().catch(() => {});
    };

    return (
        <>
            <Toolbar>
                <div className="flex border border-line-2 rounded-md overflow-hidden w-max">
                    {['Principal', 'Accountant'].map((r) => (
                        <button key={r} onClick={() => setRole(r)}
                                className={cx('px-4 py-1.5 text-[12.5px] border-r border-line-2 last:border-r-0',
                                              role === r ? 'bg-brand text-white font-semibold' : 'bg-paper-2 text-ink-2 hover:bg-white')}>
                            {r}
                        </button>
                    ))}
                </div>
                <Spacer />
                {dirty && <span className="text-[12px] text-warn">Unsaved changes</span>}
                <Button onClick={() => setDraft(new Set(saved))} disabled={!dirty}>Reset</Button>
                <Button variant="primary" loading={update.isPending} disabled={!dirty} onClick={save}>
                    Save
                </Button>
            </Toolbar>

            <Card title={`${role} — what this role can do`} hint="changes apply immediately · no deploy">
                <div className="flex flex-col">
                    {Object.entries(groups).map(([module, list]) => (
                        <div key={module}>
                            <div className="px-4 py-2 bg-paper-2 border-b border-line font-mono text-[10px] tracking-[0.11em] uppercase text-ink-3">
                                {module}
                            </div>
                            {list.map((p) => {
                                const locked = adminOnly.includes(p.key);
                                const on = draft.has(p.key);
                                return (
                                    <div key={p.key}
                                         className={cx('flex items-center justify-between gap-4 px-4 py-2.5 border-b border-line',
                                                       locked && 'opacity-60')}>
                                        <div className="min-w-0">
                                            <b className="block text-[13px] font-semibold">{p.label}</b>
                                            <span className="block text-[11.5px] text-ink-3 font-mono">
                                                {p.key}{locked && ' · Admin only, hamesha'}
                                            </span>
                                        </div>
                                        <button
                                            role="switch"
                                            aria-checked={locked ? false : on}
                                            aria-label={p.label}
                                            disabled={locked}
                                            onClick={() => toggle(p.key)}
                                            className={cx(
                                                'relative w-9 h-5 rounded-full border shrink-0 transition-colors',
                                                locked ? 'border-dashed border-line-2 bg-line cursor-not-allowed'
                                                       : on ? 'bg-brand border-brand' : 'bg-line border-line-2'
                                            )}
                                        >
                                            <span className={cx('absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all',
                                                                on && !locked ? 'left-[18px] bg-white' : 'left-0.5 bg-ink-3')} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </Card>
        </>
    );
}

// ---- users ----
function Users() {
    const users = useUsers();
    const create = useCreateUser((d) => setTempPassword(d));
    const update = useUpdateUser();
    const reset = useResetPassword((d) => setTempPassword({ user: { name: 'Reset' }, tempPassword: d.tempPassword }));
    const [adding, setAdding] = useState(false);
    const [tempPassword, setTempPassword] = useState(null);
    const [form, setForm] = useState({ name: '', username: '', phone: '', role: 'Accountant' });
    const me = useAuth((s) => s.user);

    return (
        <>
            <Toolbar>
                <Spacer />
                <Button variant="primary" onClick={() => setAdding(true)}>+ New user</Button>
            </Toolbar>

            <Card title="Users" hint="only these people can sign in">
                <Async query={users}>
                    {(list) => (
                        <Table head={['Name', 'Username', 'Role', 'Phone', 'Last login', 'Status', '']}
                               isEmpty={!list.length} empty="No users" minWidth={720}>
                            {list.map((u) => (
                                <Tr key={u._id}>
                                    <Td className="font-semibold whitespace-nowrap">
                                        {u.name}{u._id === me?.id && <span className="text-ink-3 font-normal"> (you)</span>}
                                    </Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3">{u.username}</Td>
                                    <Td><Pill tone={u.role === 'Admin' ? 'ok' : 'neutral'}>{u.role}</Pill></Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3">{u.phone || '—'}</Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3 whitespace-nowrap">
                                        {u.lastLoginAt ? date(u.lastLoginAt) : 'never'}
                                    </Td>
                                    <Td>{statusPill(u.isActive ? 'Active' : 'Left')}</Td>
                                    <Td>
                                        <div className="flex gap-1.5">
                                            <Button size="sm" onClick={() => reset.mutate(u._id)}>Password reset</Button>
                                            {u._id !== me?.id && (
                                                <Button size="sm" variant={u.isActive ? 'danger' : 'default'}
                                                        onClick={() => update.mutate({ id: u._id, isActive: !u.isActive })}>
                                                    {u.isActive ? 'Deactivate' : 'Activate'}
                                                </Button>
                                            )}
                                        </div>
                                    </Td>
                                </Tr>
                            ))}
                        </Table>
                    )}
                </Async>
            </Card>

            <Modal open={adding} onClose={() => setAdding(false)} title="New user"
                   footer={<>
                       <Button onClick={() => setAdding(false)}>Cancel</Button>
                       <Button variant="primary" loading={create.isPending}
                               disabled={!form.name.trim() || form.username.trim().length < 3}
                               onClick={async () => {
                                   await create.mutateAsync({
                                       name: form.name.trim(),
                                       username: form.username.trim().toLowerCase(),
                                       phone: form.phone || undefined,
                                       role: form.role,
                                   });
                                   setForm({ name: '', username: '', phone: '', role: 'Accountant' });
                                   setAdding(false);
                               }}>Create</Button>
                   </>}>
                <div className="flex flex-col gap-3">
                    <Field label="Name" required><Input value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                    <Field label="Username" required hint="Letters, numbers, . _ and - only">
                        <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} />
                    </Field>
                    <Field label="Phone"><Input inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                    <Field label="Role" required>
                        <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                            <option>Accountant</option><option>Principal</option><option>Admin</option>
                        </Select>
                    </Field>
                    <p className="text-[11.5px] text-ink-3">
                        A temporary password will be generated and shown once. The user must change it on first sign-in.
                    </p>
                </div>
            </Modal>

            <Modal open={Boolean(tempPassword)} onClose={() => setTempPassword(null)} title="Temporary password"
                   footer={<Button variant="primary" onClick={() => setTempPassword(null)}>Noted</Button>}>
                <p className="text-[13px] text-ink-2 mb-3">
                    This password is visible <b>only now</b> — only its hash is stored in the database.
                    Hand it to the user now.
                </p>
                <div className="bg-paper-2 border border-line-2 rounded-md px-4 py-3 text-center">
                    <code className="font-mono text-[18px] font-semibold tracking-wider select-all">
                        {tempPassword?.tempPassword}
                    </code>
                </div>
                <Button size="sm" className="mt-3"
                        onClick={() => { navigator.clipboard?.writeText(tempPassword.tempPassword); toast.ok('Copied'); }}>
                    Copy
                </Button>
            </Modal>
        </>
    );
}

// ---- classes ----
function Classes() {
    const classes = useClasses();
    const create = useCreateClass();
    const update = useUpdateClass();
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState({ name: '', section: 'A', monthlyFee: '' });

    return (
        <>
            <Toolbar>
                <Spacer />
                <Button variant="primary" onClick={() => setAdding(true)}>+ Class</Button>
            </Toolbar>

            <Card title="Classes" hint="the default monthly fee comes from here">
                <Async query={classes}>
                    {(list) => (
                        <Table head={['Class', 'Section', { label: 'Students', align: 'right' },
                                      { label: 'Monthly fee', align: 'right' }, '']}
                               isEmpty={!list.length} empty="No classes yet — create one first" minWidth={480}>
                            {list.map((c) => (
                                <Tr key={c._id}>
                                    <Td className="font-semibold whitespace-nowrap">{c.name}</Td>
                                    <Td>{c.section}</Td>
                                    <Td align="right">{c.studentCount}</Td>
                                    <Td align="right">
                                        <Input className="w-24 py-1 text-right text-[12px]" inputMode="numeric"
                                               defaultValue={c.monthlyFee}
                                               onBlur={(e) => {
                                                   const v = Number(e.target.value);
                                                   if (v && v !== c.monthlyFee) update.mutate({ id: c._id, monthlyFee: v });
                                               }} />
                                    </Td>
                                    <Td className="text-[11.5px] text-ink-3">applies to future fees only</Td>
                                </Tr>
                            ))}
                        </Table>
                    )}
                </Async>
            </Card>

            <Modal open={adding} onClose={() => setAdding(false)} title="New class"
                   footer={<>
                       <Button onClick={() => setAdding(false)}>Cancel</Button>
                       <Button variant="primary" loading={create.isPending}
                               disabled={!form.name.trim() || !Number(form.monthlyFee)}
                               onClick={async () => {
                                   await create.mutateAsync({
                                       name: form.name.trim(),
                                       section: form.section.trim().toUpperCase(),
                                       monthlyFee: Number(form.monthlyFee),
                                   });
                                   setForm({ name: '', section: 'A', monthlyFee: '' });
                                   setAdding(false);
                               }}>Create</Button>
                   </>}>
                <div className="flex flex-col gap-3">
                    <Field label="Class name" required hint="For example: Class 5, Nursery, UKG">
                        <Input value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </Field>
                    <Field label="Section" required><Input maxLength={4} value={form.section}
                                                           onChange={(e) => setForm({ ...form, section: e.target.value.toUpperCase() })} /></Field>
                    <Field label="Monthly fee" required><Input inputMode="numeric" value={form.monthlyFee}
                                                               onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })} /></Field>
                </div>
            </Modal>
        </>
    );
}

// ---- session ----
function SessionTab() {
    const sessions = useSessions();
    const active = useActiveSession();
    const activate = useActivateSession();

    return (
        <>
            <Card title="Academic session" hint="the partition key for the whole app">
                <Async query={sessions}>
                    {(list) => (
                        <Table head={['Session', 'Starts', 'Ends', { label: 'Fee months', align: 'right' }, 'Status', '']}
                               isEmpty={!list.length} empty="No sessions" minWidth={560}>
                            {list.map((s) => (
                                <Tr key={s._id}>
                                    <Td className="font-semibold">{s.name}</Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3">{date(s.startDate)}</Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3">{date(s.endDate)}</Td>
                                    <Td align="right">{s.feeMonths?.length || 0}</Td>
                                    <Td>{s.isActive ? <Pill tone="ok">Active</Pill> : <Pill>Closed</Pill>}</Td>
                                    <Td>
                                        {!s.isActive && (
                                            <Button size="sm" loading={activate.isPending} onClick={() => activate.mutate(s._id)}>
                                                Activate
                                            </Button>
                                        )}
                                    </Td>
                                </Tr>
                            ))}
                        </Table>
                    )}
                </Async>
            </Card>

            <Card title="Session rollover" hint="at year end">
                <div className="p-4 text-[12.5px] text-ink-2 flex flex-col gap-2.5">
                    <p>The Admin runs this manually — it never happens automatically:</p>
                    <ol className="list-decimal pl-5 space-y-1">
                        <li>Create the new session and activate it</li>
                        <li>Create the new classes (or copy the old ones)</li>
                        <li>Promote students to the next class</li>
                        <li>Carry forward any outstanding balances</li>
                    </ol>
                    <div className="bg-warn-bg border border-warn text-warn rounded-md px-3 py-2.5 mt-1">
                        The previous session's data stays exactly as it was — readable, never editable.
                    </div>
                </div>
            </Card>
        </>
    );
}

export default function Settings() {
    const [tab, setTab] = useState('perms');
    const role = useAuth((s) => s.user?.role);

    if (role !== 'Admin') {
        return (
            <Card className="max-w-lg mx-auto mt-10">
                <div className="px-6 py-10 text-center">
                    <p className="text-[14px] font-semibold mb-1.5">Settings is Admin-only</p>
                    <p className="text-[12.5px] text-ink-3">
                        User management and permissions sit outside the permission system, deliberately.
                        A role that can widen its own permissions is not a permission system.
                    </p>
                </div>
            </Card>
        );
    }

    return (
        <>
            <PageTitle title="Settings" sub="Admin only" />
            <Tabs
                tabs={[
                    { value: 'perms', label: 'Roles & permissions' },
                    { value: 'users', label: 'Users' },
                    { value: 'classes', label: 'Classes' },
                    { value: 'session', label: 'Session' },
                ]}
                value={tab} onChange={setTab}
            />

            {tab === 'perms' && <Permissions />}
            {tab === 'users' && <Users />}
            {tab === 'classes' && <Classes />}
            {tab === 'session' && <SessionTab />}
        </>
    );
}
