import { useState } from 'react';
import {
    useStockItems, useStockItem, useCreateSale, useAdjustStock, useSales,
    useStudents, useLowStock, useMovements, useCreateItem,
} from '../hooks/queries';
import { money, num, date, toInputDate } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Select, Field, Toolbar, Spacer, Modal,
    Async, PageTitle, Tabs, Pill, EmptyState, cx,
} from '../components/ui';
import { Can } from '../components/Can';
import { useAuth } from '../store/auth';
import { toast } from '../components/Toast';

// Current stock for an item + variant. The backend's resolveStockTarget uses
// the same logic on the server — the two must stay in step.
const stockOf = (item, variantId) => {
    if (!item) return 0;
    if (!item.hasVariants) return item.currentStock;
    return item.variants.find((v) => v._id === variantId)?.currentStock ?? 0;
};
const priceOf = (item, variantId) => {
    if (!item) return 0;
    if (!item.hasVariants) return item.sellPrice;
    return item.variants.find((v) => v._id === variantId)?.sellPrice ?? 0;
};


// ---------------------------------------------------------------------------
// Add an item to the catalogue.
//
// This is the first thing a new school has to do — until one item exists, a
// purchase cannot be recorded and nothing can be sold, because both of those
// screens pick from this list.
//
// Uniform carries sizes (variants); books and notebooks usually do not. The
// backend refuses an item that says it has variants but lists none, and one
// without variants that has no sell price — so the form enforces both here
// rather than letting the user find out on submit.
// ---------------------------------------------------------------------------
const BLANK_VARIANT = { label: '', costPrice: '', sellPrice: '', currentStock: '', lowStockAt: '' };

function AddItem({ open, onClose }) {
    const create = useCreateItem();
    const [form, setForm] = useState({
        name: '', category: 'Uniform', unit: 'pcs',
        costPrice: '', sellPrice: '', currentStock: '', lowStockAt: '10',
    });
    const [hasVariants, setHasVariants] = useState(false);
    const [variants, setVariants] = useState([{ ...BLANK_VARIANT }]);
    const [err, setErr] = useState({});

    const set = (patch) => setForm((f) => ({ ...f, ...patch }));
    const setVar = (i, patch) =>
        setVariants((v) => v.map((x, j) => (j === i ? { ...x, ...patch } : x)));

    const reset = () => {
        setForm({ name: '', category: 'Uniform', unit: 'pcs', costPrice: '', sellPrice: '', currentStock: '', lowStockAt: '10' });
        setHasVariants(false); setVariants([{ ...BLANK_VARIANT }]); setErr({});
    };

    const num = (v) => (v === '' || v === null ? undefined : Number(v));

    const submit = async () => {
        const e = {};
        if (form.name.trim().length < 2) e.name = 'Enter the item name';

        const rows = variants.filter((v) => v.label.trim() || v.sellPrice !== '');
        if (hasVariants) {
            if (!rows.length) e.variants = 'Add at least one size';
            else if (rows.some((v) => !v.label.trim())) e.variants = 'Every size needs a label';
            else if (rows.some((v) => !Number(v.sellPrice))) e.variants = 'Every size needs a sell price';
        } else if (!Number(form.sellPrice)) {
            e.sellPrice = 'A sell price is required';
        }

        setErr(e);
        if (Object.keys(e).length) return;

        const body = {
            name: form.name.trim(),
            category: form.category,
            unit: form.unit.trim() || undefined,
            hasVariants,
            lowStockAt: num(form.lowStockAt) ?? 0,
            ...(hasVariants
                ? {
                      variants: rows.map((v) => ({
                          label: v.label.trim(),
                          costPrice: num(v.costPrice) ?? 0,
                          sellPrice: num(v.sellPrice),
                          currentStock: num(v.currentStock) ?? 0,
                          lowStockAt: num(v.lowStockAt) ?? num(form.lowStockAt) ?? 0,
                      })),
                  }
                : {
                      costPrice: num(form.costPrice) ?? 0,
                      sellPrice: num(form.sellPrice),
                      currentStock: num(form.currentStock) ?? 0,
                  }),
        };

        try {
            await create.mutateAsync(body);
            reset();
            onClose();
        } catch (ex) {
            if (Object.keys(ex.fields || {}).length) setErr(ex.fields);
        }
    };

    return (
        <Modal
            open={open} onClose={onClose} title="New item" wide
            footer={
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button variant="primary" onClick={submit} loading={create.isPending}>Save item</Button>
                </>
            }
        >
            <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label="Item name" required error={err.name}>
                    <Input value={form.name} autoFocus error={err.name}
                           placeholder="School Shirt"
                           onChange={(e) => set({ name: e.target.value })} />
                </Field>
                <Field label="Category" required>
                    <Select value={form.category} onChange={(e) => set({ category: e.target.value })}>
                        {['Uniform', 'Book', 'Notebook', 'Stationery', 'Other'].map((c) => <option key={c}>{c}</option>)}
                    </Select>
                </Field>
                <Field label="Unit" hint="pcs, set, pair…">
                    <Input value={form.unit} onChange={(e) => set({ unit: e.target.value })} />
                </Field>
                <Field label="Reorder at" hint="Flagged on the dashboard below this">
                    <Input inputMode="numeric" value={form.lowStockAt}
                           onChange={(e) => set({ lowStockAt: e.target.value })} />
                </Field>

                <label className="sm:col-span-2 flex items-center gap-2.5 bg-paper-2 border border-line rounded-md px-3 py-2.5 cursor-pointer">
                    <input type="checkbox" checked={hasVariants} className="w-4 h-4 accent-brand"
                           onChange={(e) => setHasVariants(e.target.checked)} />
                    <span className="text-[13px]">
                        This item has sizes
                        <span className="block text-[11.5px] text-ink-3">
                            A shirt is one item with several sizes — not several items.
                        </span>
                    </span>
                </label>

                {!hasVariants ? (
                    <>
                        <Field label="Cost price" hint="What the school pays">
                            <Input inputMode="numeric" value={form.costPrice}
                                   onChange={(e) => set({ costPrice: e.target.value })} />
                        </Field>
                        <Field label="Sell price" required error={err.sellPrice}>
                            <Input inputMode="numeric" value={form.sellPrice} error={err.sellPrice}
                                   onChange={(e) => set({ sellPrice: e.target.value })} />
                        </Field>
                        <Field label="Opening stock" hint="Recorded as an OPENING movement" className="sm:col-span-2">
                            <Input inputMode="numeric" value={form.currentStock} placeholder="0"
                                   onChange={(e) => set({ currentStock: e.target.value })} />
                        </Field>
                    </>
                ) : (
                    <div className="sm:col-span-2 flex flex-col gap-2">
                        <span className="text-[12px] text-ink-2 font-medium">Sizes</span>
                        {variants.map((v, i) => (
                            <div key={i} className="grid grid-cols-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto] gap-2 items-center">
                                <Input placeholder="Size 26" value={v.label}
                                       onChange={(e) => setVar(i, { label: e.target.value })} />
                                <Input inputMode="numeric" placeholder="Cost" value={v.costPrice}
                                       onChange={(e) => setVar(i, { costPrice: e.target.value })} />
                                <Input inputMode="numeric" placeholder="Sell" value={v.sellPrice}
                                       onChange={(e) => setVar(i, { sellPrice: e.target.value })} />
                                <Input inputMode="numeric" placeholder="Opening" value={v.currentStock}
                                       onChange={(e) => setVar(i, { currentStock: e.target.value })} />
                                <Button size="sm" onClick={() => setVariants(variants.filter((_, j) => j !== i))}
                                        disabled={variants.length === 1}>×</Button>
                            </div>
                        ))}
                        {err.variants && <span className="text-[11.5px] text-crit">{err.variants}</span>}
                        <Button size="sm" className="w-max" onClick={() => setVariants([...variants, { ...BLANK_VARIANT }])}>
                            + Add size
                        </Button>
                    </div>
                )}
            </div>
        </Modal>
    );
}

// ---- items list ----
function Items({ onSell }) {
    // Cost price is the school's margin. The Accountant still enters it when
    // adding an item — this only keeps it out of the browsable catalogue,
    // where the Principal and the counter staff spend their time.
    const isAdmin = useAuth((s) => s.user?.role) === 'Admin';
    const [q, setQ] = useState({ search: '', category: '' });
    const [adding, setAdding] = useState(false);
    const items = useStockItems(q);
    const low = useLowStock();

    return (
        <>
            <Toolbar>
                <Input className="flex-1 min-w-[180px] max-w-[280px]" placeholder="Search items…"
                       value={q.search} onChange={(e) => setQ({ ...q, search: e.target.value })} />
                <Select className="w-auto" value={q.category} onChange={(e) => setQ({ ...q, category: e.target.value })}>
                    <option value="">All categories</option>
                    {['Uniform', 'Book', 'Notebook', 'Stationery', 'Other'].map((c) => <option key={c}>{c}</option>)}
                </Select>
                <Spacer />
                <Can perm="stock.manage">
                    <Button variant="primary" onClick={() => setAdding(true)}>+ Add item</Button>
                </Can>
            </Toolbar>

            <AddItem open={adding} onClose={() => setAdding(false)} />

            {low.data?.length > 0 && (
                <Card title="Needs reordering" hint={`${low.data.length} items`}>
                    <Table head={['Item', 'Size', { label: 'In stock', align: 'right' }, { label: 'Reorder at', align: 'right' }, 'Status']}
                           minWidth={480} isEmpty={false}>
                        {low.data.map((l) => (
                            <Tr key={`${l.itemId}-${l.variantId || ''}`}>
                                <Td className="font-semibold whitespace-nowrap">{l.name}</Td>
                                <Td>{l.variantLabel || '—'}</Td>
                                <Td align="right" className="font-semibold">{l.currentStock}</Td>
                                <Td align="right">{l.lowStockAt}</Td>
                                <Td><Pill tone={l.currentStock === 0 ? 'crit' : 'warn'}>{l.currentStock === 0 ? 'Out' : 'Low'}</Pill></Td>
                            </Tr>
                        ))}
                    </Table>
                </Card>
            )}

            <Async query={items}>
                {(d) => (
                    <div className="flex flex-col gap-4">
                        {!d.items.length && <Card><EmptyState>No items found</EmptyState></Card>}
                        {d.items.map((item) => (
                            <Card
                                key={item._id}
                                title={item.name}
                                hint={`${item.category}${item.hasVariants ? ` · ${item.variants.length} sizes` : ''}`}
                                actions={<Can perm="stock.sell"><Button size="sm" variant="primary" onClick={() => onSell(item)}>Sell</Button></Can>}
                            >
                                {item.hasVariants ? (
                                    <Table head={[
                                        'Size',
                                        { label: 'Stock', align: 'right' },
                                        ...(isAdmin ? [{ label: 'Cost', align: 'right' }] : []),
                                        { label: 'Sell', align: 'right' },
                                        'Status',
                                    ]} minWidth={isAdmin ? 420 : 360} isEmpty={false}>
                                        {item.variants.map((v) => (
                                            <Tr key={v._id}>
                                                {/* Built as a filtered array, not with {isAdmin && ...} inline.
                                                    Table pairs each cell with its column heading BY INDEX for the
                                                    mobile card layout, and React.Children.map still spends an index
                                                    on a `false` child — so an inline conditional would shift every
                                                    following cell onto the wrong heading. */}
                                                {[
                                                    <Td key="label" className="font-semibold whitespace-nowrap">{v.label}</Td>,
                                                    <Td key="stock" align="right" className={v.currentStock <= v.lowStockAt ? 'text-crit font-semibold' : ''}>
                                                        {v.currentStock}
                                                    </Td>,
                                                    isAdmin ? <Td key="cost" align="right">{money(v.costPrice)}</Td> : null,
                                                    <Td key="sell" align="right">{money(v.sellPrice)}</Td>,
                                                    <Td key="status"><Pill tone={v.currentStock <= v.lowStockAt ? 'crit' : 'ok'}>
                                                        {v.currentStock <= v.lowStockAt ? 'Low' : 'OK'}</Pill></Td>,
                                                ].filter(Boolean)}
                                            </Tr>
                                        ))}
                                    </Table>
                                ) : (
                                    <div className="px-4 py-3 flex flex-wrap gap-6 text-[13px]">
                                        <span className="text-ink-2">Stock <b className="text-ink tnum">{item.currentStock}</b></span>
                                        {isAdmin && (
                                            <span className="text-ink-2">Cost <b className="text-ink tnum">{money(item.costPrice)}</b></span>
                                        )}
                                        <span className="text-ink-2">Sell <b className="text-ink tnum">{money(item.sellPrice)}</b></span>
                                        <Pill tone={item.currentStock <= item.lowStockAt ? 'crit' : 'ok'}>
                                            {item.currentStock <= item.lowStockAt ? 'Low' : 'OK'}
                                        </Pill>
                                    </div>
                                )}
                            </Card>
                        ))}
                    </div>
                )}
            </Async>
        </>
    );
}

// ---- new sale ----
function NewSale({ preselect, onDone }) {
    const [search, setSearch] = useState('');
    const [student, setStudent] = useState(null);
    const [lines, setLines] = useState(preselect ? [{ item: preselect._id, variantId: preselect.hasVariants ? preselect.variants[0]?._id : null, qty: 1 }] : []);
    const [paid, setPaid] = useState('');
    const [mode, setMode] = useState('Cash');
    const [discount, setDiscount] = useState('');

    const students = useStudents({ search, status: 'Active', limit: 6 });
    const items = useStockItems({ limit: 100 });
    const create = useCreateSale(() => { setLines([]); setPaid(''); setStudent(null); onDone?.(); });

    const itemMap = new Map((items.data?.items || []).map((i) => [i._id, i]));

    const resolved = lines.map((l) => {
        const item = itemMap.get(l.item);
        const rate = l.rate ?? priceOf(item, l.variantId);
        return { ...l, item, rate, amount: rate * l.qty, available: stockOf(item, l.variantId) };
    });

    const catalogueEmpty = !items.isPending && !(items.data?.items || []).length;

    const subtotal = resolved.reduce((s, l) => s + l.amount, 0);
    const total = Math.max(0, subtotal - (Number(discount) || 0));
    const paidValue = paid === '' ? total : Number(paid) || 0;
    const due = Math.max(0, total - paidValue);
    const oversold = resolved.find((l) => l.qty > l.available);

    const submit = () => {
        if (due > 0 && !student) return toast.warn('Choose a student to sell on credit');
        create.mutate({
            studentId: student?._id || null,
            lines: lines.map((l) => ({ item: l.item, variantId: l.variantId || undefined, qty: l.qty })),
            discount: Number(discount) || 0,
            paidAmount: paidValue,
            mode,
        });
    };

    return (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] items-start">
            <Card title="New bill" hint="student or walk-in">
                <div className="p-4 flex flex-col gap-3">
                    {student ? (
                        <div className="flex items-center justify-between bg-brand-soft border border-brand/25 rounded-md px-3 py-2">
                            <span className="text-[13px]"><b>{student.name}</b> · {student.className}</span>
                            <Button size="sm" onClick={() => setStudent(null)}>Change</Button>
                        </div>
                    ) : (
                        <>
                            <Field label="Student" hint="Leave empty for a walk-in buyer">
                                <Input placeholder="Name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
                            </Field>
                            {search && students.data?.items?.length > 0 && (
                                <div className="border border-line rounded-md divide-y divide-line max-h-44 overflow-y-auto">
                                    {students.data.items.map((s) => (
                                        <button key={s._id} onClick={() => { setStudent(s); setSearch(''); }}
                                                className="w-full text-left px-3 py-2 hover:bg-paper-2 text-[13px]">
                                            <b>{s.name}</b> <span className="text-ink-3">· {s.className}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <Table head={['Item', 'Size', { label: 'Qty', align: 'right' }, { label: 'Rate', align: 'right' },
                              { label: 'Amount', align: 'right' }, '']} minWidth={560}
                       isEmpty={!lines.length} empty="Add an item below">
                    {resolved.map((l, i) => (
                        <Tr key={i}>
                            <Td className="font-semibold">{l.item?.name || '—'}</Td>
                            <Td>
                                {l.item?.hasVariants ? (
                                    <Select className="py-1 text-[12px] w-auto" value={l.variantId || ''}
                                            onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, variantId: e.target.value } : x))}>
                                        {l.item.variants.map((v) => (
                                            <option key={v._id} value={v._id}>{v.label} ({v.currentStock})</option>
                                        ))}
                                    </Select>
                                ) : '—'}
                            </Td>
                            <Td align="right">
                                <Input className="w-16 py-1 text-right text-[12px]" inputMode="numeric" value={l.qty}
                                       error={l.qty > l.available}
                                       onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x))} />
                            </Td>
                            <Td align="right">{money(l.rate)}</Td>
                            <Td align="right">{money(l.amount)}</Td>
                            <Td><Button size="sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</Button></Td>
                        </Tr>
                    ))}
                </Table>

                <div className="px-4 py-3 border-t border-line">
                    {/* Same dead end as the purchase form: an empty catalogue left a
                        dropdown with nothing in it and a Save button that could never
                        enable, with nothing on screen explaining why. */}
                    {catalogueEmpty ? (
                        <p className="text-[12.5px] text-ink-2 bg-warn-bg border border-warn rounded-md px-3 py-2.5">
                            No items in the catalogue yet. Open the <b>Items</b> tab above and add
                            what the school sells — uniform, books, notebooks — then come back here.
                        </p>
                    ) : (
                        <Select className="w-auto" value=""
                                onChange={(e) => {
                                    const item = itemMap.get(e.target.value);
                                    if (!item) return;
                                    setLines([...lines, { item: item._id, variantId: item.hasVariants ? item.variants[0]?._id : null, qty: 1 }]);
                                }}>
                            <option value="">+ Add item…</option>
                            {(items.data?.items || []).map((i) => <option key={i._id} value={i._id}>{i.name}</option>)}
                        </Select>
                    )}
                    {oversold && (
                        <p className="text-[12.5px] text-crit mt-2">
                            {oversold.item?.name} has only {oversold.available} in stock
                        </p>
                    )}
                </div>
            </Card>

            <Card title="Payment">
                <div className="p-4 flex flex-col gap-3">
                    <div className="flex justify-between text-[13px]"><span className="text-ink-2">Subtotal</span><span className="tnum">{money(subtotal)}</span></div>
                    <Field label="Discount"><Input inputMode="numeric" value={discount} placeholder="0" onChange={(e) => setDiscount(e.target.value)} /></Field>
                    <div className="flex justify-between py-2.5 border-y border-line"><b>Total</b><b className="tnum text-[17px]">{money(total)}</b></div>
                    <Field label="Paid now" hint="Leave empty to treat it as paid in full">
                        <Input inputMode="numeric" value={paid} placeholder={String(total)} onChange={(e) => setPaid(e.target.value)} />
                    </Field>
                    <Field label="Mode">
                        <div className="flex border border-line-2 rounded-md overflow-hidden w-max">
                            {['Cash', 'UPI', 'Bank'].map((m) => (
                                <button key={m} type="button" onClick={() => setMode(m)}
                                        className={cx('px-3 py-1.5 text-[12.5px] border-r border-line-2 last:border-r-0',
                                                      mode === m ? 'bg-brand text-white font-semibold' : 'bg-paper-2 text-ink-2 hover:bg-white')}>
                                    {m}
                                </button>
                            ))}
                        </div>
                    </Field>

                    <div className={cx('border rounded-md px-3 py-2.5 text-[12.5px]',
                                       due > 0 ? 'bg-warn-bg border-warn text-warn' : 'bg-good-bg border-good text-good')}>
                        {due > 0
                            ? <>{money(due)} will be added to the student's dues and collected with the fees.</>
                            : <>Paid in full — nothing is added to the student's dues.</>}
                    </div>

                    <Button variant="primary" className="justify-center" loading={create.isPending}
                            disabled={!lines.length || Boolean(oversold)} onClick={submit}>
                        Save bill
                    </Button>

                    {!lines.length && (
                        <p className="text-[11.5px] text-ink-3 text-center -mt-1">
                            Add at least one item to save.
                        </p>
                    )}
                </div>
            </Card>
        </div>
    );
}

// ---- sales register ----
function Register() {
    const [day, setDay] = useState(toInputDate(new Date()));
    const sales = useSales({ date: day, limit: 100 });

    return (
        <>
            <Toolbar>
                <Input type="date" className="w-auto" value={day} onChange={(e) => setDay(e.target.value)} />
            </Toolbar>
            <Card title="Sales register" hint={date(day)}>
                <Async query={sales}>
                    {(d) => (
                        <Table head={['Bill', { label: 'Student', primary: true }, 'Class', 'Items', { label: 'Total', align: 'right' },
                                      { label: 'Paid', align: 'right' }, { label: 'Due', align: 'right' }]}
                               isEmpty={!d.items.length} empty="No sales on this date" minWidth={720}>
                            {d.items.map((s) => (
                                <Tr key={s._id}>
                                    <Td className="font-mono text-[11.5px]">{s.billNo}</Td>
                                    <Td className="font-semibold whitespace-nowrap">{s.studentName}</Td>
                                    <Td className="whitespace-nowrap">{s.className || '—'}</Td>
                                    <Td className="text-[12.5px]">
                                        {s.lines.map((l) => `${l.itemName}${l.variantLabel ? ` (${l.variantLabel})` : ''} ×${l.qty}`).join(', ')}
                                    </Td>
                                    <Td align="right">{money(s.total)}</Td>
                                    <Td align="right">{money(s.paidAmount)}</Td>
                                    <Td align="right" className={s.dueAmount > 0 ? 'text-warn font-semibold' : ''}>{money(s.dueAmount)}</Td>
                                </Tr>
                            ))}
                        </Table>
                    )}
                </Async>
            </Card>
        </>
    );
}

// ---- adjust ----
function Adjust() {
    const items = useStockItems({ limit: 100 });
    const adjust = useAdjustStock();
    const [form, setForm] = useState({ itemId: '', variantId: '', delta: '', reason: '' });

    const item = (items.data?.items || []).find((i) => i._id === form.itemId);
    const current = stockOf(item, form.variantId);
    const after = current + (Number(form.delta) || 0);

    return (
        <Card title="Stock adjustment" hint="a reason is required">
            <div className="p-4 grid gap-3.5 sm:grid-cols-2">
                <Field label="Item" required>
                    <Select value={form.itemId} onChange={(e) => {
                        const it = (items.data?.items || []).find((x) => x._id === e.target.value);
                        setForm({ ...form, itemId: e.target.value, variantId: it?.hasVariants ? it.variants[0]?._id : '' });
                    }}>
                        <option value="">Choose an item…</option>
                        {(items.data?.items || []).map((i) => <option key={i._id} value={i._id}>{i.name}</option>)}
                    </Select>
                </Field>

                {item?.hasVariants && (
                    <Field label="Size" required>
                        <Select value={form.variantId} onChange={(e) => setForm({ ...form, variantId: e.target.value })}>
                            {item.variants.map((v) => <option key={v._id} value={v._id}>{v.label} ({v.currentStock})</option>)}
                        </Select>
                    </Field>
                )}

                <Field label="Current stock"><div className="text-[17px] font-semibold tnum pt-1">{current}</div></Field>

                <Field label="Adjust by" required
                       hint="minus to reduce (damage, miscount), plus to add (return)"
                       error={after < 0 ? 'Stock cannot go negative' : undefined}>
                    <Input inputMode="numeric" placeholder="-2" value={form.delta}
                           onChange={(e) => setForm({ ...form, delta: e.target.value })} />
                </Field>

                <Field label="Reason" required className="sm:col-span-2">
                    <Input placeholder="Damaged in store / short on physical count / return…"
                           value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                </Field>

                {form.delta && after >= 0 && (
                    <p className="sm:col-span-2 text-[12.5px] text-ink-2 bg-paper-2 border border-line rounded-md px-3 py-2">
                        {current} → <b className="text-ink">{after}</b>. This is recorded as an ADJUST movement,
                        with your name against it — the number never changes silently.
                    </p>
                )}
            </div>

            <div className="flex justify-end gap-2 px-4 py-3 border-t border-line bg-paper-2">
                <Button variant="primary" loading={adjust.isPending}
                        disabled={!form.itemId || !Number(form.delta) || !form.reason.trim() || after < 0}
                        onClick={async () => {
                            await adjust.mutateAsync({
                                itemId: form.itemId,
                                variantId: form.variantId || undefined,
                                delta: Number(form.delta),
                                reason: form.reason.trim(),
                            });
                            setForm({ itemId: '', variantId: '', delta: '', reason: '' });
                        }}>
                    Save adjustment
                </Button>
            </div>
        </Card>
    );
}

export default function Stock() {
    const [tab, setTab] = useState('items');
    const [sellItem, setSellItem] = useState(null);
    const can = useAuth((s) => s.can);

    const tabs = [
        { value: 'items', label: 'Items' },
        ...(can('stock.sell') ? [{ value: 'sell', label: 'New bill' }] : []),
        { value: 'register', label: 'Sales register' },
        ...(can('stock.adjust') ? [{ value: 'adjust', label: 'Adjust stock' }] : []),
    ];

    return (
        <>
            <PageTitle title="Stock & Sales" sub="Uniform, books, notebooks" />
            <Tabs tabs={tabs} value={tab} onChange={setTab} />

            {tab === 'items' && <Items onSell={(item) => { setSellItem(item); setTab('sell'); }} />}
            {tab === 'sell' && <NewSale preselect={sellItem} onDone={() => { setSellItem(null); setTab('register'); }} />}
            {tab === 'register' && <Register />}
            {tab === 'adjust' && <Adjust />}
        </>
    );
}
