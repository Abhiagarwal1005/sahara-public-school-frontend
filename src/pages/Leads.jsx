import { useEffect, useState } from 'react';
import {
    useLeads, useLead, useLeadSummary, useCreateLead, useLogFollowUp, useDeleteLead, useClasses,
    useUpdateLead,
} from '../hooks/queries';
import { date, dateShort, toInputDate } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Select, Textarea, Field, Toolbar, Spacer, Modal,
    Async, PageTitle, Tabs, Pill, EmptyState, cx,
} from '../components/ui';
import { Can } from '../components/Can';

// ---------------------------------------------------------------------------
// ENQUIRIES (leads)
//
// A parent walks in and asks about admission. We take the same details the
// admission form takes, and then we chase them.
//
// This module is deliberately an island: no fee, no class roster, no balance,
// no ledger. A lead has not joined the school, so it appears in no report and
// counts towards nothing. When one does join, the office admits them through
// the Students screen and marks the lead Admitted — by hand, on purpose.
// ---------------------------------------------------------------------------

const STATUSES = ['New', 'Contacted', 'Visited', 'Interested', 'Admitted', 'Lost'];
const OPEN = ['New', 'Contacted', 'Visited', 'Interested'];
const SOURCES = ['Walk-in', 'Phone', 'Reference', 'Online', 'Other'];

const TONE = {
    New: 'neutral',
    Contacted: 'neutral',
    Visited: 'warn',
    Interested: 'warn',
    Admitted: 'ok',
    Lost: 'crit',
};

const leadPill = (status) => <Pill tone={TONE[status] || 'neutral'}>{status}</Pill>;

// Midnight today in the browser's own zone — enough to say "this date has
// arrived", which is all the follow-up list needs.
const todayStart = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
};

// How a due date reads at a glance: late, today, or still to come.
const dueLabel = (value) => {
    if (!value) return <span className="text-ink-3">—</span>;

    const due = new Date(value);
    due.setHours(0, 0, 0, 0);
    const days = Math.round((due - todayStart()) / 86400000);

    if (days < 0) {
        return (
            <span className="text-crit font-semibold whitespace-nowrap">
                {dateShort(value)} · {Math.abs(days)}d late
            </span>
        );
    }
    if (days === 0) return <span className="text-warn font-semibold whitespace-nowrap">Today</span>;
    return <span className="whitespace-nowrap">{dateShort(value)}</span>;
};

// ---------------------------------------------------------------------------
// New enquiry. The same fields an admission would take — nothing here creates
// a student, a fee row or anything else.
// ---------------------------------------------------------------------------
function AddLead({ open, onClose }) {
    const classes = useClasses();
    const [form, setForm] = useState({
        name: '', guardianName: '', phone: '', altPhone: '', address: '',
        classInterested: '', source: 'Walk-in', note: '',
        nextFollowUp: toInputDate(new Date()),
    });
    const create = useCreateLead(() => {
        setForm({
            name: '', guardianName: '', phone: '', altPhone: '', address: '',
            classInterested: '', source: 'Walk-in', note: '',
            nextFollowUp: toInputDate(new Date()),
        });
        onClose();
    });

    const set = (patch) => setForm((f) => ({ ...f, ...patch }));
    const phoneOk = /^[6-9]\d{9}$/.test(form.phone);

    return (
        <Modal open={open} onClose={onClose} title="New enquiry" wide
               footer={<>
                   <Button onClick={onClose}>Cancel</Button>
                   <Button variant="primary" loading={create.isPending}
                           disabled={form.name.trim().length < 2 || !phoneOk}
                           onClick={() => create.mutate({
                               name: form.name.trim(),
                               guardianName: form.guardianName.trim() || undefined,
                               phone: form.phone,
                               altPhone: form.altPhone || undefined,
                               address: form.address.trim() || undefined,
                               classInterested: form.classInterested.trim() || undefined,
                               source: form.source,
                               note: form.note.trim() || undefined,
                               nextFollowUp: form.nextFollowUp || undefined,
                           })}>
                       Save enquiry
                   </Button>
               </>}>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Child's name" required>
                    <Input value={form.name} autoFocus onChange={(e) => set({ name: e.target.value })} />
                </Field>
                <Field label="Parent / guardian">
                    <Input value={form.guardianName} onChange={(e) => set({ guardianName: e.target.value })} />
                </Field>
                <Field label="Phone" required
                       error={form.phone && !phoneOk ? 'Enter a valid 10-digit number' : undefined}>
                    <Input inputMode="numeric" maxLength={10} value={form.phone}
                           error={form.phone && !phoneOk}
                           onChange={(e) => set({ phone: e.target.value.replace(/\D/g, '') })} />
                </Field>
                <Field label="Alternate phone">
                    <Input inputMode="numeric" maxLength={10} value={form.altPhone}
                           onChange={(e) => set({ altPhone: e.target.value.replace(/\D/g, '') })} />
                </Field>
                <Field label="Class interested in"
                       hint="Pick one, or type anything — it is saved as plain text">
                    <Input list="lead-classes" value={form.classInterested}
                           onChange={(e) => set({ classInterested: e.target.value })} />
                    <datalist id="lead-classes">
                        {(classes.data || []).map((c) => <option key={c._id} value={c.name} />)}
                    </datalist>
                </Field>
                <Field label="How did they reach us">
                    <Select value={form.source} onChange={(e) => set({ source: e.target.value })}>
                        {SOURCES.map((s) => <option key={s}>{s}</option>)}
                    </Select>
                </Field>
                <Field label="Address" className="sm:col-span-2">
                    <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
                </Field>
                <Field label="Follow up on" hint="Leave blank if there is nothing to chase">
                    <Input type="date" value={form.nextFollowUp}
                           onChange={(e) => set({ nextFollowUp: e.target.value })} />
                </Field>
                <Field label="Note" className="sm:col-span-2">
                    <Textarea value={form.note} onChange={(e) => set({ note: e.target.value })}
                              placeholder="What did they ask about?" />
                </Field>
            </div>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// One lead: the details, the chase history, and the form that adds to it.
// ---------------------------------------------------------------------------
// The row the table hands over carries only the columns the table shows, so
// the detail view fetches the whole lead — otherwise the note and the address
// silently render as blank, which reads as "they didn't tell us" rather than
// "we didn't ask for it".
// ---------------------------------------------------------------------------
// Correcting an enquiry's own details.
//
// This is NOT the follow-up form — that one records what was said and moves
// the lead along, and it is append-only for a reason. This is for the plain
// mistakes: a misheard name, a digit wrong in the phone number, the wrong
// class written down.
//
// `classInterested` stays free text even though the dropdown offers the
// school's classes, because a parent can ask about a class that does not
// exist yet ("Nursery next year") — see lead.model.js.
// ---------------------------------------------------------------------------
function EditLead({ lead, onClose }) {
    const classes = useClasses();
    const update = useUpdateLead();
    const [form, setForm] = useState(null);

    useEffect(() => {
        if (!lead) return setForm(null);
        setForm({
            name: lead.name || '',
            guardianName: lead.guardianName || '',
            phone: lead.phone || '',
            altPhone: lead.altPhone || '',
            address: lead.address || '',
            classInterested: lead.classInterested || '',
            source: lead.source || 'Walk-in',
            note: lead.note || '',
        });
    }, [lead]);

    if (!lead || !form) return null;

    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const valid = form.name.trim().length >= 2 && /^[6-9]\d{9}$/.test(form.phone);

    const save = async () => {
        const body = { id: lead._id };
        for (const key of ['name', 'guardianName', 'phone', 'altPhone', 'address', 'classInterested', 'source', 'note']) {
            const next = typeof form[key] === 'string' ? form[key].trim() : form[key];
            if (next !== (lead[key] || '')) body[key] = next;
        }
        if (Object.keys(body).length === 1) return onClose();
        await update.mutateAsync(body);
        onClose();
    };

    return (
        <Modal open onClose={onClose} title={`Edit ${lead.name}`} wide
               footer={<>
                   <Button onClick={onClose}>Cancel</Button>
                   <Button variant="primary" loading={update.isPending} disabled={!valid} onClick={save}>Save</Button>
               </>}>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Child's name" required><Input value={form.name} autoFocus onChange={set('name')} /></Field>
                <Field label="Parent / guardian"><Input value={form.guardianName} onChange={set('guardianName')} /></Field>
                <Field label="Phone" required error={form.phone && !/^[6-9]\d{9}$/.test(form.phone) ? 'Enter a valid 10-digit mobile number' : undefined}>
                    <Input inputMode="numeric" maxLength={10} value={form.phone} onChange={set('phone')} />
                </Field>
                <Field label="Alternate phone"><Input inputMode="numeric" maxLength={10} value={form.altPhone} onChange={set('altPhone')} /></Field>
                <Field label="Class interested in" hint="free text — a class that does not exist yet is fine">
                    <Input list="lead-classes" value={form.classInterested} onChange={set('classInterested')} />
                </Field>
                <datalist id="lead-classes">
                    {classes.data?.map((c) => <option key={c._id} value={`${c.name} – ${c.section}`} />)}
                </datalist>
                <Field label="Source">
                    <Select value={form.source} onChange={set('source')}>
                        {['Walk-in', 'Phone', 'Reference', 'Online', 'Other'].map((x) => <option key={x}>{x}</option>)}
                    </Select>
                </Field>
                <Field label="Address" className="sm:col-span-2"><Input value={form.address} onChange={set('address')} /></Field>
                <Field label="Note" className="sm:col-span-2"><Textarea value={form.note} onChange={set('note')} /></Field>
            </div>

            <p className="mt-3 text-[11.5px] text-ink-3">
                This corrects the enquiry's own details. To record a call and move the lead along,
                use the follow-up form — that history is never edited.
            </p>
        </Modal>
    );
}

function LeadDetail({ lead: row, onClose }) {
    const full = useLead(row._id);
    const lead = full.data || row;

    const [note, setNote] = useState('');
    const [outcome, setOutcome] = useState(row.status === 'New' ? 'Contacted' : row.status);
    const [next, setNext] = useState(toInputDate(new Date(Date.now() + 3 * 86400000)));
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [editing, setEditing] = useState(false);

    const log = useLogFollowUp(onClose);
    const remove = useDeleteLead(onClose);

    const closed = lead.status === 'Admitted' || lead.status === 'Lost';
    const closing = outcome === 'Admitted' || outcome === 'Lost';
    const canSave = note.trim().length >= 2 && (closing || Boolean(next));

    const rows = [
        ['Parent / guardian', lead.guardianName || '—'],
        ['Phone', lead.phone],
        ['Alternate phone', lead.altPhone || '—'],
        ['Class interested in', lead.classInterested || '—'],
        ['Source', lead.source],
        ['Address', lead.address || '—'],
        ['Enquired on', date(lead.createdAt)],
    ];

    return (
        <Modal open onClose={onClose} title={lead.name} wide
               footer={<>
                   <Button onClick={onClose}>Close</Button>
                   <Can perm="lead.manage">
                       <Button onClick={() => setEditing(true)}>Edit details</Button>
                   </Can>
                   <Can perm="lead.manage">
                       {confirmDelete ? (
                           <Button variant="danger" loading={remove.isPending}
                                   onClick={() => remove.mutate(lead._id)}>
                               Delete for good
                           </Button>
                       ) : (
                           <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>
                       )}
                   </Can>
               </>}>
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        {leadPill(lead.status)}
                        {!closed && lead.nextFollowUp && (
                            <span className="text-[12px] text-ink-2">Next: {dueLabel(lead.nextFollowUp)}</span>
                        )}
                    </div>

                    <div className="border border-line rounded-md divide-y divide-line">
                        {rows.map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-4 px-3 py-2 text-[13px]">
                                <span className="text-ink-2 shrink-0">{k}</span>
                                <span className="font-medium text-right break-words">{v}</span>
                            </div>
                        ))}
                    </div>

                    {lead.note && (
                        <p className="mt-3 text-[12.5px] text-ink-2 bg-paper-2 border border-line rounded-md px-3 py-2">
                            {lead.note}
                        </p>
                    )}
                </div>

                <div>
                    <h3 className="font-mono text-[10px] tracking-[0.09em] uppercase text-ink-3 mb-2">
                        Follow-up history
                    </h3>

                    {lead.followUps?.length ? (
                        <ol className="border-l border-line pl-3 flex flex-col gap-3 mb-4">
                            {[...lead.followUps].reverse().map((f, i) => (
                                <li key={i} className="relative">
                                    <span className="absolute -left-[17px] top-1.5 w-2 h-2 rounded-full bg-line-2" />
                                    <div className="flex items-center gap-2">
                                        {leadPill(f.outcome)}
                                        <span className="text-[11.5px] text-ink-3 font-mono">{date(f.at)}</span>
                                    </div>
                                    <p className="text-[12.5px] mt-1">{f.note}</p>
                                    {f.byName && <p className="text-[11px] text-ink-3">by {f.byName}</p>}
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <p className="text-[12.5px] text-ink-3 mb-4">
                            {full.isPending ? 'Loading…' : 'Nothing logged yet.'}
                        </p>
                    )}

                    <Can perm="lead.manage">
                        {closed ? (
                            <p className="text-[12.5px] text-ink-2 bg-paper-2 border border-line rounded-md px-3 py-2">
                                This lead is closed as <b>{lead.status}</b>. Nothing further to chase.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-3 border-t border-line pt-3">
                                <Field label="What was discussed" required>
                                    <Textarea value={note} onChange={(e) => setNote(e.target.value)}
                                              placeholder="Called, asked for a visit on Saturday" />
                                </Field>
                                <div className="grid gap-3 grid-cols-2">
                                    <Field label="Where it stands now">
                                        <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                                            {STATUSES.map((s) => <option key={s}>{s}</option>)}
                                        </Select>
                                    </Field>
                                    <Field label="Follow up again on">
                                        <Input type="date" value={closing ? '' : next} disabled={closing}
                                               onChange={(e) => setNext(e.target.value)} />
                                    </Field>
                                </div>
                                {closing && (
                                    <p className="text-[11.5px] text-ink-3">
                                        Marking a lead {outcome} closes it — it leaves the follow-up list.
                                        {outcome === 'Admitted' && ' Admit the child from the Students screen; nothing is created from here.'}
                                    </p>
                                )}
                                <Button variant="primary" className="justify-center"
                                        loading={log.isPending} disabled={!canSave}
                                        onClick={() => log.mutate({
                                            id: lead._id,
                                            note: note.trim(),
                                            outcome,
                                            nextFollowUp: closing ? undefined : next,
                                        })}>
                                    Save follow-up
                                </Button>
                            </div>
                        )}
                    </Can>
                </div>
            </div>

            {editing && <EditLead lead={lead} onClose={() => setEditing(false)} />}
        </Modal>
    );
}

function LeadTable({ params, empty }) {
    const list = useLeads(params);
    const [picked, setPicked] = useState(null);

    return (
        <>
            <Async query={list}>
                {(d) => (
                    <Table head={[
                        { label: 'Name', primary: true }, 'Guardian', 'Phone', 'Class',
                        'Source', 'Follow-up', 'Status', '',
                    ]} isEmpty={!d.items.length} empty={empty} minWidth={860}>
                        {d.items.map((l) => (
                            <Tr key={l._id}>
                                <Td className="font-semibold whitespace-nowrap">{l.name}</Td>
                                <Td>{l.guardianName || '—'}</Td>
                                <Td className="font-mono text-[11.5px] text-ink-3">{l.phone}</Td>
                                <Td>{l.classInterested || '—'}</Td>
                                <Td className="text-[12px] text-ink-2">{l.source}</Td>
                                <Td>{dueLabel(l.nextFollowUp)}</Td>
                                <Td>{leadPill(l.status)}</Td>
                                <Td align="right">
                                    <Button size="sm" onClick={() => setPicked(l)}>Open</Button>
                                </Td>
                            </Tr>
                        ))}
                    </Table>
                )}
            </Async>

            {picked && <LeadDetail lead={picked} onClose={() => setPicked(null)} />}
        </>
    );
}

export default function Leads() {
    const [tab, setTab] = useState('due');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [adding, setAdding] = useState(false);
    const summary = useLeadSummary();

    const s = summary.data;

    const tabs = [
        { value: 'due', label: s?.due ? `Follow up now (${s.due})` : 'Follow up now' },
        { value: 'open', label: s?.open ? `Open (${s.open})` : 'Open' },
        { value: 'all', label: 'All enquiries' },
    ];

    const params =
        tab === 'due' ? { due: 'true', search: search || undefined }
        : tab === 'open' ? { open: 'true', search: search || undefined }
        : { search: search || undefined, status: status || undefined };

    return (
        <>
            <PageTitle title="Enquiries" sub="admission leads & follow-ups">
                <Can perm="lead.manage">
                    <Button variant="primary" onClick={() => setAdding(true)}>+ New enquiry</Button>
                </Can>
            </PageTitle>

            <Tabs tabs={tabs} value={tab} onChange={setTab} />

            <Toolbar>
                <Input className="flex-1 min-w-[180px] max-w-[280px]"
                       placeholder="Search name or phone…"
                       value={search} onChange={(e) => setSearch(e.target.value)} />
                {tab === 'all' && (
                    <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="">All statuses</option>
                        {STATUSES.map((x) => <option key={x}>{x}</option>)}
                    </Select>
                )}
                <Spacer />
                {s && (
                    <span className="tb-wide text-[12.5px] text-ink-2">
                        {OPEN.map((x) => `${x} ${s.counts[x]}`).join(' · ')}
                    </span>
                )}
            </Toolbar>

            <Card
                title={tab === 'due' ? 'Due today & overdue' : tab === 'open' ? 'Open enquiries' : 'All enquiries'}
                hint="not linked to fees or students"
            >
                <LeadTable
                    params={params}
                    empty={tab === 'due' ? 'Nothing to follow up right now' : 'No enquiries yet'}
                />
            </Card>

            <AddLead open={adding} onClose={() => setAdding(false)} />
        </>
    );
}
