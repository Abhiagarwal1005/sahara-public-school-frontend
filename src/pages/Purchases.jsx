import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    usePurchases, useVendors, useCreatePurchase, useCreateVendor, usePayVendor,
    useVendorStatement, useAgeing, useStockItems,
} from '../hooks/queries';
import { money, num, date, toInputDate } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Select, Field, Toolbar, Spacer, Modal,
    Async, PageTitle, Tabs, Pill, statusPill, EmptyState, cx,
} from '../components/ui';
import { ImageUpload } from '../components/ImageUpload';
import { Can } from '../components/Can';
import { useAuth } from '../store/auth';

// ---- bills list ----
function Bills() {
    const [status, setStatus] = useState('');
    const list = usePurchases({ status: status || undefined, limit: 100 });

    return (
        <>
            <Toolbar>
                <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="">All bills</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partial">Partial</option>
                    <option value="Paid">Paid</option>
                </Select>
            </Toolbar>

            <Card title="Purchase bills" hint="with bill photos">
                <Async query={list}>
                    {(d) => (
                        <Table head={['Bill', { label: 'Vendor', primary: true }, 'Date', { label: 'Total', align: 'right' },
                                      { label: 'Paid', align: 'right' }, { label: 'Due', align: 'right' }, 'Status', 'Bill']}
                               isEmpty={!d.items.length} empty="No purchases recorded yet" minWidth={760}>
                            {d.items.map((p) => (
                                <Tr key={p._id}>
                                    <Td className="font-mono text-[11.5px]">{p.billNo}</Td>
                                    <Td className="font-semibold whitespace-nowrap">{p.vendorName}</Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3 whitespace-nowrap">{date(p.billDate)}</Td>
                                    <Td align="right">{num(p.total)}</Td>
                                    <Td align="right">{num(p.paidAmount)}</Td>
                                    <Td align="right" className={p.dueAmount > 0 ? 'text-crit font-semibold' : ''}>{num(p.dueAmount)}</Td>
                                    <Td>{statusPill(p.status)}</Td>
                                    <Td>{p.billImage?.publicId ? <Pill tone="ok">Photo</Pill> : <Pill>None</Pill>}</Td>
                                </Tr>
                            ))}
                        </Table>
                    )}
                </Async>
            </Card>
        </>
    );
}

// ---- new purchase ----
function NewPurchase({ onDone }) {
    const vendors = useVendors();
    const items = useStockItems({ limit: 100 });
    const create = useCreatePurchase(() => onDone?.());

    const [form, setForm] = useState({
        vendorId: '', billNo: '', billDate: toInputDate(new Date()),
        tax: '', otherCharges: '', paidAmount: '', mode: 'Bank', note: '',
    });
    const [lines, setLines] = useState([]);
    const [images, setImages] = useState([]);

    const itemMap = new Map((items.data?.items || []).map((i) => [i._id, i]));
    const resolved = lines.map((l) => {
        const item = itemMap.get(l.item);
        return { ...l, item, amount: (Number(l.rate) || 0) * l.qty };
    });

    const catalogueEmpty = !items.isPending && !(items.data?.items || []).length;

    // A greyed-out button with no reason is a dead end. Name what is missing.
    const missing = [
        !form.vendorId && 'a vendor',
        !form.billNo.trim() && 'a bill number',
        !lines.length && 'at least one item',
    ].filter(Boolean);

    const subtotal = resolved.reduce((s, l) => s + l.amount, 0);
    const total = subtotal + (Number(form.tax) || 0) + (Number(form.otherCharges) || 0);
    const paid = Number(form.paidAmount) || 0;
    const due = Math.max(0, total - paid);

    return (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] items-start">
            <Card title="New purchase bill" hint="stock will be added">
                <div className="p-4 grid gap-3.5 sm:grid-cols-3">
                    <Field label="Vendor" required>
                        <Select value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
                            <option value="">Choose a vendor…</option>
                            {vendors.data?.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
                        </Select>
                    </Field>
                    <Field label="Bill number" required hint="The same bill cannot be entered twice">
                        <Input value={form.billNo} onChange={(e) => setForm({ ...form, billNo: e.target.value })} />
                    </Field>
                    <Field label="Bill date" required>
                        <Input type="date" value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value })} />
                    </Field>
                </div>

                <Table head={['Item', 'Size', { label: 'Qty', align: 'right' }, { label: 'Rate', align: 'right' },
                              { label: 'Amount', align: 'right' }, '']} minWidth={560}
                       isEmpty={!lines.length} empty="Add a line below">
                    {resolved.map((l, i) => (
                        <Tr key={i}>
                            <Td className="font-semibold">{l.item?.name}</Td>
                            <Td>
                                {l.item?.hasVariants ? (
                                    <Select className="py-1 text-[12px] w-auto" value={l.variantId || ''}
                                            onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, variantId: e.target.value } : x))}>
                                        {l.item.variants.map((v) => <option key={v._id} value={v._id}>{v.label}</option>)}
                                    </Select>
                                ) : '—'}
                            </Td>
                            <Td align="right">
                                <Input className="w-16 py-1 text-right text-[12px]" inputMode="numeric" value={l.qty}
                                       onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x))} />
                            </Td>
                            <Td align="right">
                                <Input className="w-20 py-1 text-right text-[12px]" inputMode="numeric" value={l.rate}
                                       onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} />
                            </Td>
                            <Td align="right">{money(l.amount)}</Td>
                            <Td><Button size="sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</Button></Td>
                        </Tr>
                    ))}
                </Table>

                <div className="px-4 py-3 border-t border-line">
                    {/* An empty catalogue used to leave a dropdown with nothing in
                        it and a permanently disabled Save button, with no clue why.
                        Say what is missing and where to fix it. */}
                    {catalogueEmpty ? (
                        <p className="text-[12.5px] text-ink-2 bg-warn-bg border border-warn rounded-md px-3 py-2.5">
                            No items in the catalogue yet. A purchase records what came <b>into</b> stock,
                            so add the item first in{' '}
                            <Link to="/stock" className="text-brand font-semibold underline underline-offset-2">
                                Stock &amp; Sales
                            </Link>
                            , then come back here.
                        </p>
                    ) : (
                        <Select className="w-auto" value=""
                                onChange={(e) => {
                                    const item = itemMap.get(e.target.value);
                                    if (!item) return;
                                    setLines([...lines, {
                                        item: item._id,
                                        variantId: item.hasVariants ? item.variants[0]?._id : null,
                                        qty: 1,
                                        rate: item.hasVariants ? item.variants[0]?.costPrice || '' : item.costPrice || '',
                                    }]);
                                }}>
                            <option value="">+ Add line…</option>
                            {(items.data?.items || []).map((i) => <option key={i._id} value={i._id}>{i.name}</option>)}
                        </Select>
                    )}
                </div>
            </Card>

            <Card title="Payment">
                <div className="p-4 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Tax"><Input inputMode="numeric" value={form.tax} placeholder="0"
                                                  onChange={(e) => setForm({ ...form, tax: e.target.value })} /></Field>
                        <Field label="Other charges"><Input inputMode="numeric" value={form.otherCharges} placeholder="0"
                                                            onChange={(e) => setForm({ ...form, otherCharges: e.target.value })} /></Field>
                    </div>

                    <div className="flex justify-between py-2.5 border-y border-line">
                        <b>Bill total</b><b className="tnum text-[17px]">{money(total)}</b>
                    </div>

                    <Field label="Paid now" hint="Leave as 0 if nothing was paid">
                        <Input inputMode="numeric" value={form.paidAmount} placeholder="0"
                               onChange={(e) => setForm({ ...form, paidAmount: e.target.value })} />
                    </Field>

                    <Field label="Mode">
                        <Select className="w-auto" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                            {['Cash', 'Bank', 'UPI', 'Cheque'].map((m) => <option key={m}>{m}</option>)}
                        </Select>
                    </Field>

                    {due > 0 && (
                        <div className="bg-warn-bg border border-warn text-warn rounded-md px-3 py-2.5 text-[12.5px]">
                            {money(due)} will be added to this vendor's outstanding.
                        </div>
                    )}

                    {/* Attachment sits after the payment fields, not above them: the
                        bill is recorded whether or not anyone photographs it, and
                        putting the drop zone first made it look compulsory. */}
                    <ImageUpload label="Bill photo" value={images} onChange={setImages} folder="bills" max={3} />

                    <Button variant="primary" className="justify-center" loading={create.isPending}
                            disabled={!form.vendorId || !form.billNo.trim() || !lines.length}
                            onClick={() => create.mutate({
                                vendorId: form.vendorId,
                                billNo: form.billNo.trim(),
                                billDate: form.billDate,
                                lines: lines.map((l) => ({ item: l.item, variantId: l.variantId || undefined, qty: l.qty, rate: Number(l.rate) || 0 })),
                                tax: Number(form.tax) || 0,
                                otherCharges: Number(form.otherCharges) || 0,
                                paidAmount: paid,
                                mode: form.mode,
                                billImage: images[0],
                                note: form.note,
                            })}>
                        Save purchase
                    </Button>

                    {missing.length > 0 && (
                        <p className="text-[11.5px] text-ink-3 text-center -mt-1">
                            Add {missing.length > 1
                                ? `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
                                : missing[0]} to save.
                        </p>
                    )}
                </div>
            </Card>
        </div>
    );
}

// ---- vendors + pay ----
function AddVendor({ open, onClose }) {
    const create = useCreateVendor();
    const [form, setForm] = useState({ name: '', phone: '', gstin: '', address: '' });

    return (
        <Modal open={open} onClose={onClose} title="New vendor"
               footer={<>
                   <Button onClick={onClose}>Cancel</Button>
                   <Button variant="primary" loading={create.isPending} disabled={!form.name.trim()}
                           onClick={async () => {
                               await create.mutateAsync({
                                   name: form.name.trim(),
                                   phone: form.phone || undefined,
                                   gstin: form.gstin || undefined,
                                   address: form.address || undefined,
                               });
                               setForm({ name: '', phone: '', gstin: '', address: '' });
                               onClose();
                           }}>Save</Button>
               </>}>
            <div className="flex flex-col gap-3">
                <Field label="Vendor name" required>
                    <Input value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="Phone"><Input inputMode="numeric" maxLength={10} value={form.phone}
                                            onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                <Field label="GSTIN" hint="Optional"><Input value={form.gstin}
                                                            onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} /></Field>
                <Field label="Address"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            </div>
        </Modal>
    );
}

function PayModal({ vendor, onClose }) {
    const purchases = usePurchases({ vendor: vendor?._id, status: 'Unpaid', limit: 50 });
    const partial = usePurchases({ vendor: vendor?._id, status: 'Partial', limit: 50 });
    const pay = usePayVendor(() => onClose());
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState('Bank');
    const [refNo, setRefNo] = useState('');

    if (!vendor) return null;

    const open = [...(purchases.data?.items || []), ...(partial.data?.items || [])]
        .sort((a, b) => new Date(a.billDate) - new Date(b.billDate));

    const value = Number(amount) || 0;
    // Preview: oldest-first allocation, exactly as the backend does it
    let left = value;
    const alloc = open.map((b) => {
        const take = Math.min(left, b.dueAmount);
        left -= take;
        return { bill: b, take };
    }).filter((a) => a.take > 0);

    return (
        <Modal open onClose={onClose} title={`${vendor.name} — payment`} wide
               footer={<>
                   <Button onClick={onClose}>Cancel</Button>
                   <Button variant="primary" loading={pay.isPending}
                           disabled={!(value > 0) || value > vendor.outstanding}
                           onClick={() => pay.mutate({ vendorId: vendor._id, amount: value, mode, refNo: refNo || undefined })}>
                       Save payment
                   </Button>
               </>}>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between pb-3 border-b border-line">
                        <span className="text-[12px] text-ink-3">Total outstanding</span>
                        <span className="text-[22px] font-semibold tnum text-crit">{money(vendor.outstanding)}</span>
                    </div>
                    <Field label="Amount" error={value > vendor.outstanding ? `Only ${money(vendor.outstanding)} outstanding` : undefined}>
                        <Input inputMode="numeric" autoFocus value={amount} placeholder={String(vendor.outstanding)}
                               onChange={(e) => setAmount(e.target.value)} />
                    </Field>
                    <Field label="Mode">
                        <Select value={mode} onChange={(e) => setMode(e.target.value)}>
                            {['Bank', 'Cash', 'UPI', 'Cheque'].map((m) => <option key={m}>{m}</option>)}
                        </Select>
                    </Field>
                    <Field label="Reference no." hint="UTR / cheque number">
                        <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} />
                    </Field>
                </div>

                <div>
                    <p className="text-[12px] text-ink-2 font-medium mb-2">Which bills this covers</p>
                    {alloc.length ? (
                        <div className="border border-line rounded-md divide-y divide-line">
                            {alloc.map(({ bill, take }) => (
                                <div key={bill._id} className="flex items-center justify-between px-3 py-2">
                                    <div>
                                        <b className="text-[12.5px]">{bill.billNo}</b>
                                        <span className="block text-[11px] text-ink-3 font-mono">{date(bill.billDate)} · due {money(bill.dueAmount)}</span>
                                    </div>
                                    <span className="tnum font-semibold text-[13px]">{money(take)}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-[12.5px] text-ink-3">Enter an amount to see how it will be allocated across bills.</p>
                    )}
                    <p className="text-[11.5px] text-ink-3 mt-2">
                        Oldest bills first. The allocation is recorded, so no floating credit is left unexplained.
                    </p>
                </div>
            </div>
        </Modal>
    );
}

function Vendors() {
    const vendors = useVendors();
    const ageing = useAgeing();
    const [adding, setAdding] = useState(false);
    const [paying, setPaying] = useState(null);

    return (
        <>
            <Toolbar>
                <Spacer />
                <Can perm="vendor.manage"><Button onClick={() => setAdding(true)}>+ Vendor</Button></Can>
            </Toolbar>

            <Card title="Vendors" hint="largest outstanding first">
                <Async query={vendors}>
                    {(list) => (
                        <Table head={['Vendor', 'Phone', { label: 'Purchased', align: 'right' }, { label: 'Paid', align: 'right' },
                                      { label: 'Outstanding', align: 'right' }, '']}
                               isEmpty={!list.length} empty="No vendors yet" minWidth={640}>
                            {list.map((v) => (
                                <Tr key={v._id}>
                                    <Td className="font-semibold whitespace-nowrap">{v.name}</Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3">{v.phone || '—'}</Td>
                                    <Td align="right">{num(v.totalPurchased)}</Td>
                                    <Td align="right">{num(v.totalPaid)}</Td>
                                    <Td align="right" className={v.outstanding > 0 ? 'text-crit font-semibold' : ''}>{num(v.outstanding)}</Td>
                                    <Td>
                                        <Can perm="vendor.pay">
                                            {v.outstanding > 0 && <Button size="sm" variant="primary" onClick={() => setPaying(v)}>Pay</Button>}
                                        </Can>
                                    </Td>
                                </Tr>
                            ))}
                        </Table>
                    )}
                </Async>
            </Card>

            <Card title="Ageing" hint="how old the outstanding is">
                <Async query={ageing} rows={3}>
                    {(a) => (
                        <>
                            <div className="px-4 py-3 flex flex-wrap gap-6 text-[13px] border-b border-line">
                                <span className="text-ink-2">0–30 days <b className="text-ink tnum">{money(a.totals.bucket0_30)}</b></span>
                                <span className="text-ink-2">31–60 days <b className="text-warn tnum">{money(a.totals.bucket31_60)}</b></span>
                                <span className="text-ink-2">60+ days <b className="text-crit tnum">{money(a.totals.bucket60plus)}</b></span>
                                <span className="text-ink-2">Total <b className="text-ink tnum">{money(a.totals.total)}</b></span>
                            </div>
                            <Table head={['Vendor', { label: '0–30', align: 'right' }, { label: '31–60', align: 'right' },
                                          { label: '60+', align: 'right' }, { label: 'Total', align: 'right' }, { label: 'Oldest', align: 'right' }]}
                                   isEmpty={!a.vendors.length} empty="Nothing outstanding" minWidth={560}>
                                {a.vendors.map((v) => (
                                    <Tr key={v.vendorId}>
                                        <Td className="font-semibold whitespace-nowrap">{v.vendorName}</Td>
                                        <Td align="right">{num(v.bucket0_30)}</Td>
                                        <Td align="right" className={v.bucket31_60 ? 'text-warn' : ''}>{num(v.bucket31_60)}</Td>
                                        <Td align="right" className={v.bucket60plus ? 'text-crit font-semibold' : ''}>{num(v.bucket60plus)}</Td>
                                        <Td align="right" className="font-semibold">{num(v.total)}</Td>
                                        <Td align="right">{v.oldestDays}d</Td>
                                    </Tr>
                                ))}
                            </Table>
                        </>
                    )}
                </Async>
            </Card>

            <AddVendor open={adding} onClose={() => setAdding(false)} />
            {paying && <PayModal vendor={paying} onClose={() => setPaying(null)} />}
        </>
    );
}

// ---- statement ----
function Statement() {
    const vendors = useVendors();
    const [id, setId] = useState('');
    const st = useVendorStatement(id);

    return (
        <>
            <Toolbar>
                <Select className="w-auto min-w-[200px]" value={id} onChange={(e) => setId(e.target.value)}>
                    <option value="">Choose a vendor…</option>
                    {vendors.data?.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
                </Select>
                <Spacer />
                {id && <Button onClick={() => window.print()}>Print</Button>}
            </Toolbar>

            {!id ? (
                <Card><EmptyState>Choose a vendor above</EmptyState></Card>
            ) : (
                <Async query={st}>
                    {(s) => (
                        <Card title={`${s.vendor.name} — statement`} hint={`closing ${money(s.closingBalance)}`}>
                            <Table head={['Date', 'Particulars', { label: 'Bill', align: 'right' },
                                          { label: 'Payment', align: 'right' }, { label: 'Balance', align: 'right' }]}
                                   isEmpty={!s.rows.length} empty="No entries" minWidth={560}>
                                {s.rows.map((r, i) => (
                                    <Tr key={i}>
                                        <Td className="font-mono text-[11.5px] text-ink-3 whitespace-nowrap">{date(r.date)}</Td>
                                        <Td className="font-semibold">{r.particulars}</Td>
                                        <Td align="right">{r.bill ? num(r.bill) : '—'}</Td>
                                        <Td align="right" className={r.payment ? 'text-good' : ''}>{r.payment ? num(r.payment) : '—'}</Td>
                                        <Td align="right" className="font-semibold">{num(r.balance)}</Td>
                                    </Tr>
                                ))}
                            </Table>
                        </Card>
                    )}
                </Async>
            )}
        </>
    );
}

export default function Purchases() {
    const [tab, setTab] = useState('bills');
    const can = useAuth((s) => s.can);

    const tabs = [
        { value: 'bills', label: 'Purchase bills' },
        ...(can('purchase.create') ? [{ value: 'new', label: 'New purchase' }] : []),
        { value: 'vendors', label: 'Vendors' },
        { value: 'statement', label: 'Statement' },
    ];

    return (
        <>
            <PageTitle title="Purchases & Vendors" sub="Bills, outstanding, payments" />
            <Tabs tabs={tabs} value={tab} onChange={setTab} />

            {tab === 'bills' && <Bills />}
            {tab === 'new' && <NewPurchase onDone={() => setTab('bills')} />}
            {tab === 'vendors' && <Vendors />}
            {tab === 'statement' && <Statement />}
        </>
    );
}
