import { useEffect, useState } from 'react';
import {
    usePermissions, useUpdatePermissions, useUsers, useCreateUser, useUpdateUser,
    useResetPassword, useClasses, useCreateClass, useUpdateClass,
    useSessions, useCreateSession, useActivateSession, useActiveSession, useUpdateSession,
} from '../hooks/queries';
import { useAuth } from '../store/auth';
import {
    money, date, toInputDate, monthLabel, monthShort,
    sessionMonths, sessionDates, suggestSessionName, isSaneSessionName,
} from '../lib/format';
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
// ---------------------------------------------------------------------------
// Creating an academic session.
//
// Until this screen existed the only way to get a session was
// `npm run seed:session` on the backend — which means nobody could set the
// school up without shell access, and the app answers 409 NO_ACTIVE_SESSION
// on almost every screen until one exists.
//
// The form asks for the NAME and derives the rest. "2026-27" already implies
// April 2026 to March 2027 and its twelve billable months (the same rule as
// scripts/seedSession.js), so asking four questions instead of one would only
// create four chances to disagree with the seeder.
// ---------------------------------------------------------------------------
function NewSession({ open, onClose, hasActive, existing = [] }) {
    const activate = useActivateSession();
    // Activating is the second half of creating the FIRST session — without an
    // active session the app is unusable, so it must not be a step you can
    // forget.
    const create = useCreateSession(async (created) => {
        if (makeActive && created?._id) await activate.mutateAsync(created._id);
        onClose();
    });

    const [name, setName] = useState('');
    // Which months this session bills. Most schools bill all twelve; some bill
    // ten (April–January), which is why these are individually toggleable
    // rather than derived and hidden.
    const [months, setMonths] = useState([]);
    const [dates, setDates] = useState({ startDate: '', endDate: '' });
    // What an ID card costs this year. One number, set once — the counter then
    // issues cards without typing an amount.
    const [idCardFee, setIdCardFee] = useState('');
    const [makeActive, setMakeActive] = useState(true);
    const [touched, setTouched] = useState(false);

    // Reset every time the dialog opens, and default the name to the session
    // today falls in (or the year after the newest one on record).
    useEffect(() => {
        if (!open) return;
        const newest = [...existing].map((s) => s.name).sort().pop();
        const suggested = newest
            ? `${Number(newest.slice(0, 4)) + 1}-${String((Number(newest.slice(0, 4)) + 2) % 100).padStart(2, "0")}`
            : suggestSessionName();
        setName(suggested);
        setMonths(sessionMonths(suggested));
        setDates(sessionDates(suggested));
        setMakeActive(!hasActive);
        setIdCardFee('');
        setTouched(false);
    }, [open, hasActive, existing]);

    // Typing a new name re-derives the dates and months under it
    const rename = (value) => {
        setName(value);
        setTouched(true);
        if (isSaneSessionName(value)) {
            setMonths(sessionMonths(value));
            setDates(sessionDates(value));
        }
    };

    const allMonths = sessionMonths(name);
    const nameOk = isSaneSessionName(name);
    const duplicate = existing.some((s) => s.name === name);
    const canSave = nameOk && !duplicate && months.length > 0 && dates.startDate && dates.endDate;

    const toggleMonth = (m) =>
        setMonths((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort()));

    return (
        <Modal open={open} onClose={onClose} title="New academic session" wide
               footer={<>
                   <Button onClick={onClose}>Cancel</Button>
                   <Button variant="primary" loading={create.isPending || activate.isPending} disabled={!canSave}
                           onClick={() => create.mutate({
                               name: name.trim(),
                               startDate: dates.startDate,
                               endDate: dates.endDate,
                               feeMonths: months,
                               idCardFee: Number(idCardFee) || 0,
                           })}>
                       {makeActive ? "Create & activate" : "Create"}
                   </Button>
               </>}>
            <div className="flex flex-col gap-3.5">
                <Field label="Session" required hint="the format is 2026-27 — April to March"
                       error={touched && !nameOk ? "Use the 2026-27 format, where the second half is the next year"
                            : duplicate ? `${name} already exists` : undefined}>
                    <Input value={name} autoFocus placeholder="2026-27" onChange={(e) => rename(e.target.value)} />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Starts" required>
                        <Input type="date" value={dates.startDate}
                               onChange={(e) => setDates({ ...dates, startDate: e.target.value })} />
                    </Field>
                    <Field label="Ends" required>
                        <Input type="date" value={dates.endDate}
                               onChange={(e) => setDates({ ...dates, endDate: e.target.value })} />
                    </Field>
                </div>

                <Field label={`Fee months — ${months.length} selected`}
                       hint="the months fees are raised for · unselect any the school does not bill">
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {allMonths.map((m) => {
                            const on = months.includes(m);
                            return (
                                <button key={m} type="button" onClick={() => toggleMonth(m)}
                                        title={monthLabel(m)}
                                        className={cx(
                                            "px-2.5 py-1.5 rounded-md border text-[12px] font-mono font-semibold",
                                            on ? "bg-brand text-white border-brand"
                                               : "bg-paper-2 text-ink-3 border-line-2 hover:bg-white"
                                        )}>
                                    {monthShort(m)}
                                </button>
                            );
                        })}
                    </div>
                </Field>

                <Field label="ID card fee"
                       hint="what a student ID card costs this year · leave 0 and enter it per student instead">
                    <Input inputMode="numeric" placeholder="0" value={idCardFee}
                           onChange={(e) => setIdCardFee(e.target.value)} />
                </Field>

                <label className="flex items-start gap-2.5 text-[13px] cursor-pointer">
                    <input type="checkbox" className="mt-0.5 w-4 h-4 accent-brand shrink-0"
                           checked={makeActive} onChange={(e) => setMakeActive(e.target.checked)} />
                    <span>
                        Make this the active session
                        <span className="block text-[11.5px] text-ink-3">
                            {hasActive
                                ? "The current session is closed — its data stays readable, never editable."
                                : "Required — without an active session every other screen returns an error."}
                        </span>
                    </span>
                </label>

                <p className="text-[11.5px] text-ink-3">
                    Classes are created separately, on the Classes tab — do that next, before adding students.
                </p>
            </div>
        </Modal>
    );
}

function SessionTab() {
    const sessions = useSessions();
    const active = useActiveSession();
    const activate = useActivateSession();
    const updateSession = useUpdateSession();
    const [adding, setAdding] = useState(false);

    const list = sessions.data || [];
    // active.isError means the backend answered NO_ACTIVE_SESSION — the state
    // the app cannot work in, so it gets said plainly rather than left for the
    // user to infer from errors on every other screen.
    const hasActive = Boolean(active.data) && !active.isError;

    return (
        <>
            {!hasActive && !sessions.isLoading && (
                <div className="bg-warn-bg border border-warn text-warn rounded-md px-4 py-3 text-[12.5px]">
                    <b>There is no active academic session.</b> Every other screen — students, fees,
                    attendance, salary — will return an error until one exists.
                    {list.length > 0
                        ? ' Activate one below.'
                        : ' Create one with the button below to set the school up.'}
                </div>
            )}

            <Toolbar>
                <Spacer />
                <Button variant="primary" onClick={() => setAdding(true)}>+ Session</Button>
            </Toolbar>

            <Card title="Academic session" hint="the partition key for the whole app">
                <Async query={sessions}>
                    {() => (
                        <Table head={['Session', 'Starts', 'Ends', { label: 'Fee months', align: 'right' },
                                      { label: 'ID card fee', align: 'right' }, 'Status', '']}
                               isEmpty={!list.length}
                               empty="No sessions yet — use + Session to create the first one"
                               minWidth={560}>
                            {list.map((s) => (
                                <Tr key={s._id}>
                                    <Td className="font-semibold">{s.name}</Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3">{date(s.startDate)}</Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3">{date(s.endDate)}</Td>
                                    <Td align="right">{s.feeMonths?.length || 0}</Td>
                                    <Td align="right">
                                        {/* Edited in place, like a class's monthly fee. A new figure
                                            applies to cards issued from now on; cards already given
                                            keep the amount they were charged. */}
                                        <Input className="w-24 py-1 text-right text-[12px]" inputMode="numeric"
                                               defaultValue={s.idCardFee || 0}
                                               onBlur={(e) => {
                                                   const v = Number(e.target.value) || 0;
                                                   if (v !== (s.idCardFee || 0)) updateSession.mutate({ id: s._id, idCardFee: v });
                                               }} />
                                    </Td>
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

            <NewSession open={adding} onClose={() => setAdding(false)}
                        hasActive={hasActive} existing={list} />
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
