import { useEffect, useState } from 'react';
import {
    useExpenses, useExpenseCategories, useCreateExpense, useDeleteExpense, useUpdateExpense,
    useExpenseByCategory, useCreateCategory, useUpdateCategory, useActiveSession,
} from '../hooks/queries';
import {
    money, num, date, toInputDate, monthLabel, currentMonthKey, monthOptions, sessionMonths,
} from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Select, Field, Toolbar, Spacer, Modal,
    Async, PageTitle, Tabs, Pill, EmptyState, Pagination,
} from '../components/ui';
import { ImageUpload } from '../components/ImageUpload';
import { BillView } from '../components/BillView';
import { Can } from '../components/Can';
import { useAuth } from '../store/auth';

function AddExpense({ onDone }) {
    const uploadsOn = useAuth((s) => s.features.uploads);
    const cats = useExpenseCategories();
    const create = useCreateExpense(() => onDone?.());
    const [form, setForm] = useState({
        categoryId: '', title: '', amount: '', date: toInputDate(new Date()),
        mode: 'Cash', paidTo: '', note: '',
    });
    const [images, setImages] = useState([]);

    const reset = () => { setForm({ ...form, title: '', amount: '', paidTo: '', note: '' }); setImages([]); };

    return (
        <Card title="New expense" hint={uploadsOn ? 'photo optional' : undefined}>
            <div className="p-4 grid gap-3.5 sm:grid-cols-2">
                <Field label="Category" required>
                    <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                        <option value="">Choose a category…</option>
                        {cats.data?.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                    </Select>
                </Field>
                <Field label="What the expense is for" required>
                    <Input value={form.title} placeholder="MSEB bill — August"
                           onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </Field>
                <Field label="Amount" required>
                    <Input inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </Field>
                <Field label="Date" required>
                    <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </Field>
                <Field label="Mode" required>
                    <Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                        {['Cash', 'UPI', 'Bank', 'Cheque'].map((m) => <option key={m}>{m}</option>)}
                    </Select>
                </Field>
                <Field label="Paid to">
                    <Input value={form.paidTo} placeholder="Shop or vendor name"
                           onChange={(e) => setForm({ ...form, paidTo: e.target.value })} />
                </Field>
                {/* `note` has been in this form's state from the start with no input
                    behind it, so every expense was saved with an empty one. */}
                <Field label="Note" className="sm:col-span-2" hint="optional — anything the title does not cover">
                    <Input value={form.note} placeholder="Meter reading 4412, paid at the counter…"
                           onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </Field>
                <div className="sm:col-span-2">
                    <ImageUpload label="Bill / invoice" value={images} onChange={setImages} folder="expenses" max={3} />
                </div>
            </div>

            <div className="flex justify-end gap-2 px-4 py-3 border-t border-line bg-paper-2">
                <Button onClick={reset}>Clear</Button>
                <Button variant="primary" loading={create.isPending}
                        disabled={!form.categoryId || !form.title.trim() || !Number(form.amount)}
                        onClick={async () => {
                            await create.mutateAsync({
                                categoryId: form.categoryId,
                                title: form.title.trim(),
                                amount: Number(form.amount),
                                date: form.date,
                                mode: form.mode,
                                paidTo: form.paidTo || undefined,
                                attachments: images,
                                note: form.note || undefined,
                            });
                            reset();
                        }}>
                    Save expense
                </Button>
            </div>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Editing an expense.
//
// The amount, the date and the category are FROZEN — the server refuses them,
// because a ledger row was written against those three and changing one here
// would make the cash book lie. A wrong amount is deleted (which writes a
// reversal) and entered again.
//
// What IS editable is everything that only describes the entry: the title, who
// it was paid to, the note, the photo. `expense.edit` has been a switch in
// Settings from day one with nothing behind it.
// ---------------------------------------------------------------------------
function EditExpense({ expense, onClose }) {
    const update = useUpdateExpense();
    const [form, setForm] = useState(null);
    const [images, setImages] = useState([]);

    useEffect(() => {
        if (!expense) return setForm(null);
        setForm({
            title: expense.title || '',
            paidTo: expense.paidTo || '',
            note: expense.note || '',
        });
        setImages(expense.attachments || []);
    }, [expense]);

    if (!expense || !form) return null;

    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const sameImages =
        images.length === (expense.attachments || []).length
        && images.every((img, i) => img.publicId === expense.attachments?.[i]?.publicId);

    const save = async () => {
        // Only what actually moved, so a save that changed nothing writes no
        // history row.
        const body = { id: expense._id };
        if (form.title.trim() !== expense.title) body.title = form.title.trim();
        if (form.paidTo.trim() !== (expense.paidTo || '')) body.paidTo = form.paidTo.trim();
        if (form.note.trim() !== (expense.note || '')) body.note = form.note.trim();
        if (!sameImages) body.attachments = images;

        if (Object.keys(body).length === 1) return onClose();
        await update.mutateAsync(body);
        onClose();
    };

    return (
        <Modal open onClose={onClose} title={`Edit — ${expense.title}`} wide
               footer={<>
                   <Button onClick={onClose}>Cancel</Button>
                   <Button variant="primary" loading={update.isPending}
                           disabled={form.title.trim().length < 2} onClick={save}>Save</Button>
               </>}>
            <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between pb-3 border-b border-line">
                    <span className="text-[12px] text-ink-3">
                        {expense.categoryName} · {date(expense.date)} · {expense.mode}
                    </span>
                    <span className="text-[20px] font-semibold tnum">{money(expense.amount)}</span>
                </div>

                <Field label="What the expense is for" required>
                    <Input value={form.title} autoFocus onChange={set('title')} />
                </Field>
                <Field label="Paid to"><Input value={form.paidTo} onChange={set('paidTo')} /></Field>
                <Field label="Note"><Input value={form.note} onChange={set('note')} /></Field>

                <ImageUpload label="Bill / invoice" value={images} onChange={setImages} folder="expenses" max={3} />

                <div className="bg-paper-2 border border-line rounded-md px-3 py-2.5 text-[12.5px] text-ink-2">
                    The amount, the date and the category cannot be changed here — a ledger row was
                    written against them. For a wrong amount, delete this entry (which writes a
                    reversal into the cash book) and enter it again.
                </div>
            </div>
        </Modal>
    );
}

function Register({ month }) {
    const [page, setPage] = useState(1);
    const list = useExpenses({ month, page, limit: 20 });
    const byCat = useExpenseByCategory(month);
    const remove = useDeleteExpense();
    const [deleting, setDeleting] = useState(null);
    const [editing, setEditing] = useState(null);
    const [reason, setReason] = useState('');

    return (
        <>
            <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] items-start">
                <Card title={`Expense register — ${monthLabel(month)}`} hint="with bill photos">
                    <Async query={list}>
                        {(d) => (
                            <>
                            <Table head={['Date', 'Category', { label: 'Detail', primary: true }, 'Mode', { label: 'Amount', align: 'right' }, 'Bill', '']}
                                   isEmpty={!d.items.length} empty="No expenses this month" minWidth={700}>
                                {d.items.map((e) => (
                                    <Tr key={e._id}>
                                        <Td className="font-mono text-[11.5px] text-ink-3 whitespace-nowrap">{date(e.date)}</Td>
                                        <Td className="whitespace-nowrap">{e.categoryName}</Td>
                                        <Td className="font-semibold">{e.title}</Td>
                                        <Td className="font-mono text-[11.5px] text-ink-3">{e.mode}</Td>
                                        <Td align="right">{num(e.amount)}</Td>
                                        <Td>
                                            <BillView images={e.attachments} title={e.title} />
                                        </Td>
                                        <Td>
                                            <span className="inline-flex gap-1.5">
                                                <Can perm="expense.edit">
                                                    <Button size="sm" onClick={() => setEditing(e)}>Edit</Button>
                                                </Can>
                                                <Can perm="expense.delete">
                                                    <Button size="sm" variant="danger" onClick={() => { setDeleting(e); setReason(''); }}>
                                                        Delete
                                                    </Button>
                                                </Can>
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

                <Card title="Category-wise" hint={monthLabel(month)}>
                    <Async query={byCat} rows={4}>
                        {(d) => (
                            <div className="flex flex-col">
                                {d.categories.map((c) => (
                                    <div key={c.categoryId} className="flex items-center gap-3 px-4 py-2.5 border-b border-line">
                                        <div className="flex-1 min-w-0">
                                            <b className="block text-[13px] font-semibold">{c.categoryName}</b>
                                            <span className="block text-[11.5px] text-ink-3 font-mono">{c.count} entries</span>
                                        </div>
                                        <span className="tnum font-semibold text-[13.5px]">{money(c.total)}</span>
                                    </div>
                                ))}
                                {!d.categories.length && <EmptyState>No expenses this month</EmptyState>}
                                {d.categories.length > 0 && (
                                    <div className="flex items-center gap-3 px-4 py-2.5 bg-paper-2">
                                        <b className="flex-1 text-[13px]">Total</b>
                                        <span className="tnum font-semibold text-crit">{money(d.total)}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </Async>
                </Card>
            </div>

            <EditExpense expense={editing} onClose={() => setEditing(null)} />

            <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete this expense?"
                   footer={<>
                       <Button onClick={() => setDeleting(null)}>Cancel</Button>
                       <Button variant="danger" loading={remove.isPending} disabled={reason.trim().length < 3}
                               onClick={async () => { await remove.mutateAsync({ id: deleting._id, reason: reason.trim() }); setDeleting(null); }}>
                           Delete
                       </Button>
                   </>}>
                <p className="text-[13px] text-ink-2 mb-3">
                    <b>{deleting?.title}</b> — {money(deleting?.amount || 0)}
                </p>
                <Field label="Reason" required hint="A reversing entry will be written to the cash book — the original line stays">
                    <Input value={reason} autoFocus placeholder="Wrong amount was entered…"
                           onChange={(e) => setReason(e.target.value)} />
                </Field>
            </Modal>
        </>
    );
}

// ---------------------------------------------------------------------------
// The school's own expense heads.
//
// Renaming one rewrites nothing else: an expense stores `categoryName` as a
// copy at the moment it was recorded, so last year's register keeps the name it
// was filed under. Retiring a head keeps it off the picker for new expenses
// while every entry already under it stays exactly where it is — which is why a
// head is never deleted.
//
// The Active / Inactive pill has been on this list from the start with nothing
// able to change it, and the rename route has had `expense.edit` on it with no
// button behind it.
// ---------------------------------------------------------------------------
function Categories() {
    const cats = useExpenseCategories({ includeInactive: true });
    const create = useCreateCategory();
    const update = useUpdateCategory();
    const [name, setName] = useState('');
    // The category being renamed, and the text being typed into it.
    const [editing, setEditing] = useState(null);
    const [draft, setDraft] = useState('');

    const startEdit = (c) => { setEditing(c._id); setDraft(c.name); };
    const cancelEdit = () => { setEditing(null); setDraft(''); };

    const saveEdit = async (c) => {
        const next = draft.trim();
        if (next.length < 2 || next === c.name) return cancelEdit();
        await update.mutateAsync({ id: c._id, name: next });
        cancelEdit();
    };

    return (
        <Card title="Expense categories" hint="the school's own heads">
            <Async query={cats}>
                {(d) => (
                    <div className="flex flex-col">
                        {d.map((c) => (
                            <div key={c._id} className="flex items-center gap-3 px-4 py-2.5 border-b border-line">
                                {editing === c._id ? (
                                    <>
                                        <Input className="flex-1 max-w-[240px]" value={draft} autoFocus
                                               onChange={(e) => setDraft(e.target.value)}
                                               onKeyDown={(e) => {
                                                   if (e.key === 'Enter') saveEdit(c);
                                                   if (e.key === 'Escape') cancelEdit();
                                               }} />
                                        <Button size="sm" variant="primary" loading={update.isPending}
                                                disabled={draft.trim().length < 2}
                                                onClick={() => saveEdit(c)}>Save</Button>
                                        <Button size="sm" onClick={cancelEdit}>Cancel</Button>
                                    </>
                                ) : (
                                    <>
                                        <b className="flex-1 text-[13px] font-semibold">{c.name}</b>
                                        <Pill tone={c.isActive ? 'ok' : 'neutral'}>{c.isActive ? 'Active' : 'Inactive'}</Pill>
                                        <Can perm="expense.edit">
                                            <span className="inline-flex gap-1.5">
                                                <Button size="sm" onClick={() => startEdit(c)}>Rename</Button>
                                                <Button size="sm" loading={update.isPending}
                                                        title={c.isActive
                                                            ? 'Keep it off the picker — expenses already filed under it are untouched'
                                                            : 'Offer it on the picker again'}
                                                        onClick={() => update.mutate({ id: c._id, isActive: !c.isActive })}>
                                                    {c.isActive ? 'Retire' : 'Restore'}
                                                </Button>
                                            </span>
                                        </Can>
                                    </>
                                )}
                            </div>
                        ))}
                        {!d.length && <EmptyState>No categories yet — add one below</EmptyState>}
                    </div>
                )}
            </Async>

            <Can perm="expense.create">
                <div className="flex gap-2 px-4 py-3 border-t border-line bg-paper-2">
                    <Input className="flex-1 max-w-[240px]" placeholder="New category…" value={name}
                           onChange={(e) => setName(e.target.value)} />
                    <Button variant="primary" loading={create.isPending} disabled={name.trim().length < 2}
                            onClick={async () => { await create.mutateAsync({ name: name.trim() }); setName(''); }}>
                        Add
                    </Button>
                </div>
            </Can>
        </Card>
    );
}

export default function Expenses() {
    const session = useActiveSession();
    const [tab, setTab] = useState('register');
    // The month was pinned to today's, so last month's register could not be
    // opened at all — even though the API has always accepted ?month, and every
    // other module offers the picker.
    const [month, setMonth] = useState(currentMonthKey());
    const can = useAuth((s) => s.can);

    // All twelve months of the session, not just the billable ones: the school
    // pays the electricity bill in a month it raises no fees. Today's month and
    // whatever is selected are always in the list, so the dropdown can never
    // show a blank selection — even before the session has loaded, or when
    // looking at a month outside it.
    const months = monthOptions([
        ...new Set([...sessionMonths(session.data?.name), currentMonthKey(), month]),
    ]);

    const tabs = [
        { value: 'register', label: 'Register' },
        ...(can('expense.create') ? [{ value: 'add', label: 'New expense' }] : []),
        { value: 'cats', label: 'Categories' },
    ];

    return (
        <>
            <PageTitle title="Expenses" sub={monthLabel(month)}>
                {tab === 'register' && (
                    <Select className="w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
                        {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </Select>
                )}
            </PageTitle>
            <Tabs tabs={tabs} value={tab} onChange={setTab} />

            {/* key={month} remounts the register on a month change, which resets
                its page back to 1 — otherwise switching from page 3 of a busy
                month to a quiet one lands on a page that does not exist. */}
            {tab === 'register' && <Register key={month} month={month} />}
            {tab === 'add' && <AddExpense onDone={() => setTab('register')} />}
            {tab === 'cats' && <Categories />}
        </>
    );
}
