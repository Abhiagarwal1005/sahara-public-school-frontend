import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useStudentLedger, useMarkLeft } from '../hooks/queries';
import { money, date, monthLabel } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Async, PageTitle, Pill, statusPill, Modal, EmptyState,
} from '../components/ui';
import { Can } from '../components/Can';
import { CollectFeePanel, CollectStockDuesPanel } from './Fees';

export default function StudentProfile() {
    const { id } = useParams();
    const navigate = useNavigate();
    const ledger = useStudentLedger(id);
    const markLeft = useMarkLeft();
    const [leaving, setLeaving] = useState(false);
    const [collecting, setCollecting] = useState(false);
    const [collectingDues, setCollectingDues] = useState(false);

    return (
        <Async query={ledger}>
            {({ student, demands, sales, payments, summary }) => (
                <>
                    <PageTitle
                        title={student.name}
                        sub={`${student.admissionNo} · ${student.className} · ${student.phone}`}
                    >
                        <Link to="/students"><Button>← Students</Button></Link>
                        <Can perm="fee.collect">
                            {summary.feeOutstanding > 0 && (
                                <Button variant="primary" onClick={() => setCollecting(true)}>Collect fee</Button>
                            )}
                            {summary.stockOutstanding > 0 && (
                                <Button onClick={() => setCollectingDues(true)}>Collect stock dues</Button>
                            )}
                        </Can>
                        <Can perm="student.delete">
                            {student.status === 'Active' && (
                                <Button variant="danger" onClick={() => setLeaving(true)}>Mark as Left</Button>
                            )}
                        </Can>
                    </PageTitle>

                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(178px,1fr))]">
                        <div className="bg-white border border-line rounded-lg px-4 py-3.5">
                            <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">Fee outstanding</span>
                            <div className={`text-[22px] font-semibold tnum ${summary.feeOutstanding > 0 ? 'text-crit' : ''}`}>
                                {money(summary.feeOutstanding)}
                            </div>
                        </div>
                        <div className="bg-white border border-line rounded-lg px-4 py-3.5">
                            <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">Stock outstanding</span>
                            <div className={`text-[22px] font-semibold tnum ${summary.stockOutstanding > 0 ? 'text-warn' : ''}`}>
                                {money(summary.stockOutstanding)}
                            </div>
                        </div>
                        <div className="bg-white border border-line rounded-lg px-4 py-3.5">
                            <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">Monthly fee</span>
                            <div className="text-[22px] font-semibold tnum">{money(student.monthlyFee)}</div>
                        </div>
                        <div className="bg-white border border-line rounded-lg px-4 py-3.5">
                            <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1.5">Status</span>
                            <div className="mt-1.5">{statusPill(student.status)}</div>
                            <div className="text-[11.5px] text-ink-3 mt-1">Admitted {date(student.admissionDate)}</div>
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2 items-start">
                        <Card title="Fee months" hint={`${demands.length} months`}>
                            <Table
                                head={['Month', { label: 'Fee', align: 'right' }, { label: 'Discount', align: 'right' },
                                       { label: 'Paid', align: 'right' }, { label: 'Due', align: 'right' }, 'Status']}
                                isEmpty={!demands.length} empty="No fees raised" minWidth={520}
                            >
                                {demands.map((d) => {
                                    const due = Math.max(0, d.amount - d.discount - d.paidAmount);
                                    return (
                                        <Tr key={d._id}>
                                            <Td className="font-semibold whitespace-nowrap">{monthLabel(d.month)}</Td>
                                            <Td align="right">{money(d.amount)}</Td>
                                            <Td align="right">{d.discount ? money(d.discount) : '—'}</Td>
                                            <Td align="right">{money(d.paidAmount)}</Td>
                                            <Td align="right" className={due > 0 ? 'text-crit font-semibold' : ''}>{money(due)}</Td>
                                            <Td>{statusPill(d.status)}</Td>
                                        </Tr>
                                    );
                                })}
                            </Table>
                        </Card>

                        <Card title="Receipts & payments" hint={`${payments.length} entries`}>
                            <Table
                                head={['Date', 'Type', { label: 'Amount', align: 'right' }, 'Mode', 'Receipt']}
                                isEmpty={!payments.length} empty="No payments yet" minWidth={460}
                            >
                                {payments.map((p) => (
                                    <Tr key={p._id}>
                                        <Td className="font-mono text-[11.5px] text-ink-3 whitespace-nowrap">{date(p.txnDate)}</Td>
                                        <Td className="whitespace-nowrap">{p.type === 'FEE' ? 'Fee' : p.type === 'STOCK_SALE' ? 'Stock' : p.type}</Td>
                                        <Td align="right" className={p.direction === 'IN' ? 'text-good font-semibold' : 'text-crit'}>
                                            {money(p.amount)}
                                        </Td>
                                        <Td>{p.mode}</Td>
                                        <Td className="font-mono text-[11.5px]">{p.receiptNo || '—'}</Td>
                                    </Tr>
                                ))}
                            </Table>
                        </Card>
                    </div>

                    <Card title="Uniform & books purchased" hint={`${sales.length} bills`}>
                        <Table
                            head={['Bill', 'Date', 'Items', { label: 'Total', align: 'right' },
                                   { label: 'Paid', align: 'right' }, { label: 'Due', align: 'right' }]}
                            isEmpty={!sales.length} empty="Nothing purchased yet" minWidth={620}
                        >
                            {sales.map((s) => (
                                <Tr key={s._id}>
                                    <Td className="font-mono text-[11.5px]">{s.billNo}</Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3 whitespace-nowrap">{date(s.date)}</Td>
                                    <Td className="text-[12.5px]">
                                        {s.lines.map((l) => `${l.itemName}${l.variantLabel ? ` (${l.variantLabel})` : ''} ×${l.qty}`).join(', ')}
                                    </Td>
                                    <Td align="right">{money(s.total)}</Td>
                                    <Td align="right">{money(s.paidAmount)}</Td>
                                    <Td align="right" className={s.dueAmount > 0 ? 'text-warn font-semibold' : ''}>{money(s.dueAmount)}</Td>
                                </Tr>
                            ))}
                        </Table>
                    </Card>

                    <Modal
                        open={leaving} onClose={() => setLeaving(false)} title="Mark as left?"
                        footer={
                            <>
                                <Button onClick={() => setLeaving(false)}>Cancel</Button>
                                <Button variant="danger" loading={markLeft.isPending}
                                        onClick={async () => { await markLeft.mutateAsync(id); setLeaving(false); navigate('/students'); }}>
                                    Yes, mark as Left
                                </Button>
                            </>
                        }
                    >
                        <p className="text-[13px] text-ink-2">
                            <b>{student.name}</b> will be removed from rosters and excluded from next month's fee run.
                            The full history is kept.
                        </p>
                        {summary.totalOutstanding > 0 && (
                            <p className="mt-3 text-[12.5px] text-warn bg-warn-bg border border-warn rounded-md px-3 py-2">
                                {money(summary.totalOutstanding)} is still outstanding — it will keep showing on the outstanding report
                                — leaving the school does not clear dues.
                            </p>
                        )}
                    </Modal>

                    <Modal open={collecting} onClose={() => setCollecting(false)} title="Collect fee" wide>
                        <CollectFeePanel studentId={id} onDone={() => setCollecting(false)} />
                    </Modal>

                    <Modal open={collectingDues} onClose={() => setCollectingDues(false)} title="Collect uniform & books dues" wide>
                        <CollectStockDuesPanel studentId={id} onDone={() => setCollectingDues(false)} />
                    </Modal>
                </>
            )}
        </Async>
    );
}
