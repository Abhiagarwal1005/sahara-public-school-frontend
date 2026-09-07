import { useState } from 'react';
import {
    useExpenses, useExpenseCategories, useCreateExpense, useDeleteExpense,
    useExpenseByCategory, useCreateCategory,
} from '../hooks/queries';
import { money, num, date, toInputDate, monthLabel, currentMonthKey } from '../lib/format';
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

function Register({ month }) {
    const [page, setPage] = useState(1);
    const list = useExpenses({ month, page, limit: 20 });
    const byCat = useExpenseByCategory(month);
    const remove = useDeleteExpense();
    const [deleting, setDeleting] = useState(null);
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
                                            <Can perm="expense.delete">
                                                <Button size="sm" variant="danger" onClick={() => { setDeleting(e); setReason(''); }}>
                                                    Delete
                                                </Button>
                                            </Can>
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

function Categories() {
    const cats = useExpenseCategories();
    const create = useCreateCategory();
    const [name, setName] = useState('');

    return (
        <Card title="Expense categories" hint="the school's own heads">
            <Async query={cats}>
                {(d) => (
                    <div className="flex flex-col">
                        {d.map((c) => (
                            <div key={c._id} className="flex items-center gap-3 px-4 py-2.5 border-b border-line">
                                <b className="flex-1 text-[13px] font-semibold">{c.name}</b>
                                <Pill tone={c.isActive ? 'ok' : 'neutral'}>{c.isActive ? 'Active' : 'Inactive'}</Pill>
                            </div>
                        ))}
                        {!d.length && <EmptyState>No categories yet — add one below</EmptyState>}
                    </div>
                )}
            </Async>

            <div className="flex gap-2 px-4 py-3 border-t border-line bg-paper-2">
                <Input className="flex-1 max-w-[240px]" placeholder="New category…" value={name}
                       onChange={(e) => setName(e.target.value)} />
                <Button variant="primary" loading={create.isPending} disabled={name.trim().length < 2}
                        onClick={async () => { await create.mutateAsync({ name: name.trim() }); setName(''); }}>
                    Add
                </Button>
            </div>
        </Card>
    );
}

export default function Expenses() {
    const [tab, setTab] = useState('register');
    const month = currentMonthKey();
    const can = useAuth((s) => s.can);

    const tabs = [
        { value: 'register', label: 'Register' },
        ...(can('expense.create') ? [{ value: 'add', label: 'New expense' }] : []),
        { value: 'cats', label: 'Categories' },
    ];

    return (
        <>
            <PageTitle title="Expenses" sub={monthLabel(month)} />
            <Tabs tabs={tabs} value={tab} onChange={setTab} />

            {tab === 'register' && <Register month={month} />}
            {tab === 'add' && <AddExpense onDone={() => setTab('register')} />}
            {tab === 'cats' && <Categories />}
        </>
    );
}
