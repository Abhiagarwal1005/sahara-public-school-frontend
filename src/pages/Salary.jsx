import { useState } from 'react';
import {
    useSlips, useSlip, useGenerateSalary, useApproveSlip, usePaySlip, useUpdateSlip, useDiscardSlip,
    useAddAdjustment, useRemoveAdjustment,
    useActiveSession,
} from '../hooks/queries';
import { money, moneyExact, num, monthLabel, currentMonthKey, monthOptions, date, amountInWords } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Select, Field, Toolbar, Spacer, Modal,
    Async, PageTitle, Tabs, statusPill, EmptyState, cx,
} from '../components/ui';
import { Can } from '../components/Can';
import { TeachersList } from './Teachers';

// ---------------------------------------------------------------------------
// Slip detail. The full calculation is shown, because every teacher checks
// it personally and "why is this number what it is" should be answered on
// the screen, not over the phone.
// ---------------------------------------------------------------------------
function SlipDetail({ slip: row, onClose }) {
    // The row opens the dialog instantly; the fetch keeps it honest afterwards.
    const live = useSlip(row._id);
    const slip = live.data || row;

    const approve = useApproveSlip();
    const pay = usePaySlip();
    const update = useUpdateSlip();
    const discard = useDiscardSlip();
    const addAdj = useAddAdjustment();
    const removeAdj = useRemoveAdjustment();
    const [advance, setAdvance] = useState(String(row.advance || ''));
    const [mode, setMode] = useState('Bank');
    const [adj, setAdj] = useState({ kind: 'Add', label: '', amount: '' });

    const remaining = slip.netPayable - slip.paidAmount;
    const isDraft = slip.status === 'Draft';

    const monthDays = slip.monthDays ?? slip.workingDays;
    const sundayDays = slip.sundayDays ?? 0;
    const unmarked = slip.unmarkedDays ?? 0;

    // Late arrivals. Slips generated before this rule existed have none of
    // these fields, so they all fall back to 0 and the slip renders exactly as
    // it did before.
    const lateDays = slip.lateDays ?? 0;
    const lateAllowed = slip.lateAllowed ?? 0;
    const lateChargeable = slip.lateChargeable ?? 0;
    const lateCut = slip.lateDeductionDays ?? 0;

    // The same sum the server did, written out in words. A slip that shows
    // ₹1,666 against a ₹10,000 salary has to say WHY on its face, or the
    // first thing that happens is a phone call.
    const paidParts = [
        slip.presentDays && `${slip.presentDays} present`,
        lateDays && `${lateDays} late`,
        slip.halfDays && `${slip.halfDays} half (${slip.halfDays * 0.5})`,
        slip.leaveDays && `${slip.leaveDays} leave`,
        sundayDays && `${sundayDays} Sunday${sundayDays > 1 ? 's' : ''}`,
        slip.holidayDays && `${slip.holidayDays} holiday${slip.holidayDays > 1 ? 's' : ''}`,
    ].filter(Boolean);

    // The additive days joined with '+', then the late cut appended with its own
    // minus. Folding the cut into the '+' list rendered it as "+ − 1 for late".
    const paidFormula = [
        paidParts.join(' + '),
        lateCut ? `− ${lateCut} for late` : '',
    ].filter(Boolean).join(' ');

    const rows = [
        ['Monthly salary (snapshot)', money(slip.grossSalary)],
        // The divisor is the calendar month, so the slip says so plainly —
        // this is the first thing a teacher checks.
        ['Days in month (divisor)', monthDays],
        ['Per-day rate', `${money(slip.grossSalary)} ÷ ${monthDays} = ${money(slip.perDayRate)}`],
        ['Present', slip.presentDays],
        // A late day is paid in full; only the count above the allowance costs
        // anything, and that shows as its own line below.
        ['Late (paid in full)', `${lateDays}${lateAllowed ? ` · ${lateAllowed} allowed` : ''}`],
        ['Half days (½ rate)', slip.halfDays],
        ['Leave (paid)', slip.leaveDays],
        ['Sundays (paid)', sundayDays],
        ['School holidays (paid)', slip.holidayDays],
        ['Absent (not paid)', slip.absentDays],
        ['Not marked (not paid)', unmarked],
        // Only shown when it actually cost something — a teacher who stayed
        // inside their allowance should not see a deduction line reading zero.
        ...(lateCut > 0
            ? [['Late deduction', `${lateChargeable} late ÷ 4 = −${lateCut} day${lateCut > 1 ? 's' : ''}`]]
            : []),
    ];

    return (
        <Modal open onClose={onClose} title={`${slip.teacherName} — ${monthLabel(slip.month)}`} wide
               footer={
                   <>
                       <Button onClick={onClose}>Close</Button>
                       <Can perm="salary.generate">
                           {/* A draft holds the numbers it was built from. If the
                               attendance behind it has since changed, this is the
                               way to rebuild it. */}
                           {isDraft && (
                               <Button variant="danger" loading={discard.isPending}
                                       onClick={async () => { await discard.mutateAsync(slip._id); onClose(); }}>
                                   Discard draft
                               </Button>
                           )}
                       </Can>
                       <Can perm="salary.approve">
                           {isDraft && (
                               <Button loading={approve.isPending}
                                       onClick={async () => { await approve.mutateAsync(slip._id); onClose(); }}>
                                   Approve
                               </Button>
                           )}
                       </Can>
                       <Can perm="salary.pay">
                           {!isDraft && remaining > 0 && (
                               <Button variant="primary" loading={pay.isPending}
                                       onClick={async () => { await pay.mutateAsync({ id: slip._id, mode }); onClose(); }}>
                                   {money(remaining)} Pay
                               </Button>
                           )}
                       </Can>
                   </>
               }>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="border border-line rounded-md divide-y divide-line">
                    {rows.map(([k, v]) => (
                        <div key={k} className="flex justify-between px-3 py-2 text-[13px]">
                            <span className="text-ink-2">{k}</span><span className="tnum font-medium">{v}</span>
                        </div>
                    ))}
                    <div className="px-3 py-2.5 bg-paper-2 border-t border-line">
                        <div className="flex justify-between text-[13px]">
                            <b>Days paid</b><b className="tnum">{slip.payableDays}</b>
                        </div>
                        {paidFormula && (
                            <p className="text-[11.5px] text-ink-3 mt-0.5">{paidFormula}</p>
                        )}
                    </div>
                    <div className="flex justify-between px-3 py-2 bg-paper-2 text-[13px]">
                        <b>Earned</b>
                        <span className="text-right">
                            <b className="tnum block">{money(slip.earned)}</b>
                            <span className="text-[11.5px] text-ink-3 tnum">
                                {slip.payableDays} × {money(slip.perDayRate)}
                            </span>
                        </span>
                    </div>
                    {unmarked > 0 && (
                        <div className="px-3 py-2 text-[11.5px] text-warn bg-warn-bg">
                            {unmarked} day{unmarked > 1 ? 's are' : ' is'} not marked in attendance, so
                            {unmarked > 1 ? ' they are' : ' it is'} not paid. Mark
                            {unmarked > 1 ? ' those days' : ' that day'} and regenerate if that is wrong.
                        </div>
                    )}
                    {/* The slip has to answer "why is a day missing" on its own face,
                        or the first thing that happens is a phone call. */}
                    {lateCut > 0 && (
                        <div className="px-3 py-2 text-[11.5px] text-warn bg-warn-bg">
                            {lateDays} late arrival{lateDays > 1 ? 's' : ''} this month
                            {lateAllowed > 0
                                ? ` — ${lateAllowed} allowed, so ${lateChargeable} counted.`
                                : ' — none are forgiven for this teacher.'}
                            {' '}Every 4 counted lates cost one day, so that is −{lateCut} day
                            {lateCut > 1 ? 's' : ''} ({money(lateCut * slip.perDayRate)}).
                        </div>
                    )}
                    {(slip.adjustments || []).map((a) => (
                        <div key={a._id} className="flex justify-between items-start gap-2 px-3 py-2 text-[13px]">
                            <span className="text-ink-2 min-w-0">
                                {a.label}
                                {a.byName && <span className="block text-[11px] text-ink-3">{a.byName}</span>}
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0">
                                <span className={cx('tnum font-medium', a.kind === 'Add' ? 'text-good' : 'text-crit')}>
                                    {a.kind === 'Add' ? '+' : '−'}{money(a.amount)}
                                </span>
                                {isDraft && (
                                    <Can perm="salary.generate">
                                        <button
                                            aria-label={`Remove ${a.label}`}
                                            className="text-ink-3 hover:text-crit leading-none px-1 text-[15px]"
                                            onClick={() => removeAdj.mutate({ id: slip._id, adjustmentId: a._id })}
                                        >
                                            ×
                                        </button>
                                    </Can>
                                )}
                            </span>
                        </div>
                    ))}
                    {/* Pre-adjustments slips only — nothing writes here now */}
                    {slip.deductions?.map((d, i) => (
                        <div key={i} className="flex justify-between px-3 py-2 text-[13px]">
                            <span className="text-ink-2">{d.label}</span><span className="tnum text-crit">−{money(d.amount)}</span>
                        </div>
                    ))}
                    <div className="flex justify-between px-3 py-2 text-[13px]">
                        <span className="text-ink-2">Advance adjusted</span><span className="tnum">{money(slip.advance)}</span>
                    </div>
                    <div className="flex justify-between px-3 py-2 bg-paper-2 text-[15px]">
                        <b>Net payable</b><b className="tnum text-good">{money(slip.netPayable)}</b>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-[12px] text-ink-2">Status</span>{statusPill(slip.status)}
                    </div>

                    {isDraft ? (
                        <>
                            <Field label="Adjust advance" hint="Draft slips only">
                                <Input inputMode="numeric" value={advance} placeholder="0"
                                       onChange={(e) => setAdvance(e.target.value)} />
                            </Field>
                            <Button size="sm" className="w-max" loading={update.isPending}
                                    onClick={() => update.mutate({ id: slip._id, advance: Number(advance) || 0 })}>
                                Save advance
                            </Button>

                            {/* Bonus, arrear, fine — anything that moves the net for
                                a reason the attendance sheet cannot express. */}
                            <div className="border-t border-line pt-3 flex flex-col gap-2.5">
                                <div className="flex border border-line-2 rounded-md overflow-hidden w-max">
                                    {[['Add', '+ Add'], ['Deduct', '− Deduct']].map(([k, label]) => (
                                        <button key={k} type="button"
                                                onClick={() => setAdj((a) => ({ ...a, kind: k }))}
                                                className={cx(
                                                    'px-3 py-1.5 text-[12.5px] font-semibold border-r border-line-2 last:border-r-0',
                                                    adj.kind === k
                                                        ? (k === 'Add' ? 'bg-good text-white' : 'bg-crit text-white')
                                                        : 'bg-paper-2 text-ink-2 hover:bg-white'
                                                )}>
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                <Field label="Reason" required hint="Shown on the slip and on the printout">
                                    <Input value={adj.label} maxLength={60}
                                           placeholder={adj.kind === 'Add' ? 'Diwali bonus' : 'Breakage recovery'}
                                           onChange={(e) => setAdj((a) => ({ ...a, label: e.target.value }))} />
                                </Field>

                                <Field label="Amount" required>
                                    <Input inputMode="numeric" value={adj.amount} placeholder="0"
                                           onChange={(e) => setAdj((a) => ({ ...a, amount: e.target.value }))} />
                                </Field>

                                {adj.kind === 'Deduct' && Number(adj.amount) > slip.netPayable && (
                                    <p className="text-[12px] text-crit">
                                        Only {money(slip.netPayable)} is payable — a bigger deduction would
                                        take the net below zero.
                                    </p>
                                )}

                                <Button size="sm" className="w-max" loading={addAdj.isPending}
                                        disabled={adj.label.trim().length < 2 || !(Number(adj.amount) > 0)}
                                        onClick={async () => {
                                            await addAdj.mutateAsync({
                                                id: slip._id,
                                                kind: adj.kind,
                                                label: adj.label.trim(),
                                                amount: Number(adj.amount),
                                            });
                                            setAdj({ kind: adj.kind, label: '', amount: '' });
                                        }}>
                                    {adj.kind === 'Add' ? 'Add to salary' : 'Deduct from salary'}
                                </Button>
                            </div>

                            <div className="bg-warn-bg border border-warn text-warn rounded-md px-3 py-2.5 text-[12.5px] mt-1">
                                Approving <b>freezes</b> this slip. Later changes to attendance or
                                salary will not affect it.
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="border border-line rounded-md divide-y divide-line text-[13px]">
                                <div className="flex justify-between px-3 py-2"><span className="text-ink-2">Paid</span><span className="tnum">{money(slip.paidAmount)}</span></div>
                                <div className="flex justify-between px-3 py-2"><span className="text-ink-2">Remaining</span><span className="tnum font-semibold">{money(remaining)}</span></div>
                            </div>

                            {remaining > 0 && (
                                <Field label="Payment mode">
                                    <Select value={mode} onChange={(e) => setMode(e.target.value)}>
                                        {['Bank', 'Cash', 'UPI', 'Cheque'].map((m) => <option key={m}>{m}</option>)}
                                    </Select>
                                </Field>
                            )}

                            <p className="text-[12px] text-ink-3">
                                This slip is frozen — the salary figure and day counts were copied at generation time.
                            </p>
                        </>
                    )}

                    <Button size="sm" className="w-max mt-auto" onClick={() => window.print()}>Print slip</Button>
                </div>
            </div>

            {/* ---------------------------------------------------------------
                The printed slip. Nothing above this is printed — the on-screen
                panel is a working view with buttons and an advance field, and
                putting that on paper is what produced a "salary slip" with a
                Discard button and a localhost URL on it.
                --------------------------------------------------------------- */}
            <div className="print-only" style={{ color: '#000', fontSize: '12px', lineHeight: 1.45 }}>
                <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 14 }}>
                    <div style={{ fontSize: '19px', fontWeight: 700, letterSpacing: '0.02em' }}>Sahara Public School</div>
                    <div style={{ fontSize: '12px', marginTop: 3 }}>
                        Salary Slip &middot; {monthLabel(slip.month)}
                    </div>
                </div>

                <table style={{ width: '100%', marginBottom: 14, borderCollapse: 'collapse' }}>
                    <tbody>
                        <tr>
                            <td style={{ padding: '2px 0', width: '15%', color: '#444' }}>Teacher</td>
                            <td style={{ padding: '2px 0', width: '35%', fontWeight: 700 }}>{slip.teacherName}</td>
                            <td style={{ padding: '2px 0', width: '20%', color: '#444' }}>Designation</td>
                            <td style={{ padding: '2px 0', fontWeight: 700 }}>{slip.designation || '\u2014'}</td>
                        </tr>
                        <tr>
                            <td style={{ padding: '2px 0', color: '#444' }}>Month</td>
                            <td style={{ padding: '2px 0', fontWeight: 700 }}>{monthLabel(slip.month)}</td>
                            <td style={{ padding: '2px 0', color: '#444' }}>Session</td>
                            <td style={{ padding: '2px 0', fontWeight: 700 }}>{slip.session}</td>
                        </tr>
                    </tbody>
                </table>

                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <table style={{ width: '50%', borderCollapse: 'collapse', border: '1px solid #999' }}>
                        <thead>
                            <tr>
                                <th colSpan={2} style={{ textAlign: 'left', padding: '5px 8px', background: '#f0efec', borderBottom: '1px solid #999', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Attendance
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                ['Days in month', monthDays],
                                ['Present', slip.presentDays],
                                ['Late (paid in full)', `${lateDays}${lateAllowed ? ` · ${lateAllowed} allowed` : ''}`],
                                ['Half days (\u00bd)', slip.halfDays],
                                ['Leave (paid)', slip.leaveDays],
                                ['Sundays (paid)', sundayDays],
                                ['School holidays (paid)', slip.holidayDays],
                                ['Absent (not paid)', slip.absentDays],
                                ['Not marked (not paid)', unmarked],
                                // On paper too: this is the slip the teacher signs, so the
                                // deduction has to be explained where they can see it.
                                ...(lateCut > 0
                                    ? [['Late deduction', `${lateChargeable} \u00f7 4 = \u2212${lateCut} day${lateCut > 1 ? 's' : ''}`]]
                                    : []),
                            ].map(([k, v]) => (
                                <tr key={k}>
                                    <td style={{ padding: '3px 8px', color: '#333' }}>{k}</td>
                                    <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 600 }}>{v}</td>
                                </tr>
                            ))}
                            <tr>
                                <td style={{ padding: '5px 8px', borderTop: '1px solid #999', fontWeight: 700 }}>Days paid</td>
                                <td style={{ padding: '5px 8px', borderTop: '1px solid #999', textAlign: 'right', fontWeight: 700 }}>
                                    {slip.payableDays}
                                </td>
                            </tr>
                            {paidFormula && (
                                <tr>
                                    <td colSpan={2} style={{ padding: '0 8px 6px', fontSize: '10.5px', color: '#555' }}>
                                        {paidFormula}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    <table style={{ width: '50%', borderCollapse: 'collapse', border: '1px solid #999' }}>
                        <thead>
                            <tr>
                                <th colSpan={2} style={{ textAlign: 'left', padding: '5px 8px', background: '#f0efec', borderBottom: '1px solid #999', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Payment
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ padding: '3px 8px', color: '#333' }}>Monthly salary</td>
                                <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 600 }}>{money(slip.grossSalary)}</td>
                            </tr>
                            <tr>
                                <td style={{ padding: '3px 8px', color: '#333' }}>Per-day rate</td>
                                <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 600 }}>{moneyExact(slip.perDayRate)}</td>
                            </tr>
                            <tr>
                                <td style={{ padding: '3px 8px', color: '#333' }}>
                                    Earned ({slip.payableDays} &times; {moneyExact(slip.perDayRate)})
                                </td>
                                <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 600 }}>{moneyExact(slip.earned)}</td>
                            </tr>
                            {(slip.adjustments || []).map((a) => (
                                <tr key={a._id}>
                                    <td style={{ padding: '3px 8px', color: '#333' }}>{a.label}</td>
                                    <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 600 }}>
                                        {a.kind === 'Add' ? '+' : '\u2212'}{money(a.amount)}
                                    </td>
                                </tr>
                            ))}
                            {(slip.deductions || []).map((d, i) => (
                                <tr key={i}>
                                    <td style={{ padding: '3px 8px', color: '#333' }}>{d.label}</td>
                                    <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 600 }}>&minus;{money(d.amount)}</td>
                                </tr>
                            ))}
                            <tr>
                                <td style={{ padding: '3px 8px', color: '#333' }}>Advance adjusted</td>
                                <td style={{ padding: '3px 8px', textAlign: 'right', fontWeight: 600 }}>&minus;{money(slip.advance || 0)}</td>
                            </tr>
                            <tr>
                                <td style={{ padding: '6px 8px', borderTop: '2px solid #000', fontWeight: 700, fontSize: '13px' }}>Net payable</td>
                                <td style={{ padding: '6px 8px', borderTop: '2px solid #000', textAlign: 'right', fontWeight: 700, fontSize: '13px' }}>
                                    {moneyExact(slip.netPayable)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <p style={{ marginTop: 10, padding: '6px 8px', border: '1px solid #999', fontSize: '11.5px' }}>
                    <span style={{ color: '#444' }}>In words: </span>
                    <b>{amountInWords(slip.netPayable)}</b>
                </p>

                {slip.status === 'Paid' ? (
                    <p style={{ marginTop: 8, fontSize: '11px' }}>
                        Paid {money(slip.paidAmount)} on {date(slip.paidAt)}.
                    </p>
                ) : (
                    <p style={{ marginTop: 8, fontSize: '11px', fontStyle: 'italic' }}>
                        Status: {slip.status} &mdash; not yet paid.
                    </p>
                )}

                {unmarked > 0 && (
                    <p style={{ marginTop: 4, fontSize: '10.5px' }}>
                        Note: {unmarked} day{unmarked > 1 ? 's' : ''} of this month {unmarked > 1 ? 'were' : 'was'} not
                        marked in the attendance register and {unmarked > 1 ? 'are' : 'is'} therefore not paid.
                    </p>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 40, marginTop: 54, fontSize: '11px' }}>
                    <span style={{ borderTop: '1px solid #000', paddingTop: 4, width: '38%' }}>
                        Received by: {slip.teacherName}
                    </span>
                    <span style={{ borderTop: '1px solid #000', paddingTop: 4, width: '38%', textAlign: 'right' }}>
                        Authorised signature
                    </span>
                </div>
            </div>
        </Modal>
    );
}

function Slips({ month }) {
    const slips = useSlips({ month });
    const generate = useGenerateSalary();
    const [open, setOpen] = useState(null);

    return (
        <>
            <Toolbar>
                <Spacer />
                <Can perm="salary.generate">
                    <Button variant="primary" loading={generate.isPending} onClick={() => generate.mutate({ month })}>
                        {monthLabel(month)} — generate slips
                    </Button>
                </Can>
            </Toolbar>

            <Async query={slips}>
                {(d) => (
                    <>
                        {d.slips.length > 0 && (
                            <div className="grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(178px,1fr))]">
                                {[['Total gross', money(d.totals.gross)], ['Deductions', money(d.totals.deductions)],
                                  ['Net payable', money(d.totals.net)], ['Paid', money(d.totals.paid)],
                                  ['Pending', money(d.totals.pending)]].map(([k, v], i) => (
                                    <div key={k} className="bg-white border border-line rounded-lg px-4 py-3">
                                        <span className="block font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 mb-1">{k}</span>
                                        <div className={`text-[19px] font-semibold tnum ${i === 3 ? 'text-good' : i === 4 ? 'text-warn' : ''}`}>{v}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <Card title={`Salary slips — ${monthLabel(month)}`} hint="built from attendance">
                            <Table head={['Teacher', { label: 'Present', align: 'right' }, { label: 'Late', align: 'right' },
                                          { label: 'Half', align: 'right' },
                                          { label: 'Absent', align: 'right' }, { label: 'Gross', align: 'right' },
                                          { label: 'Net', align: 'right' }, 'Status', '']}
                                   isEmpty={!d.slips.length}
                                   empty="No slips generated for this month yet — use the button above"
                                   minWidth={820}>
                                {d.slips.map((s) => (
                                    <Tr key={s._id}>
                                        <Td className="font-semibold whitespace-nowrap">{s.teacherName}</Td>
                                        <Td align="right">{s.presentDays}</Td>
                                        {/* Amber only when the lates actually cost something — a
                                            teacher inside their allowance is not a problem to flag. */}
                                        <Td align="right" className={s.lateDeductionDays ? 'text-warn font-semibold' : ''}>
                                            {s.lateDays || 0}
                                        </Td>
                                        <Td align="right">{s.halfDays}</Td>
                                        <Td align="right" className={s.absentDays ? 'text-crit' : ''}>{s.absentDays}</Td>
                                        <Td align="right">{num(s.grossSalary)}</Td>
                                        <Td align="right" className="font-semibold">{num(s.netPayable)}</Td>
                                        <Td>{statusPill(s.status)}</Td>
                                        <Td><Button size="sm" onClick={() => setOpen(s)}>Open</Button></Td>
                                    </Tr>
                                ))}
                            </Table>
                        </Card>
                    </>
                )}
            </Async>

            {open && <SlipDetail slip={open} onClose={() => setOpen(null)} />}
        </>
    );
}

export default function Salary() {
    const session = useActiveSession();
    const [tab, setTab] = useState('slips');
    const [month, setMonth] = useState(currentMonthKey());
    const months = monthOptions(session.data?.feeMonths?.length ? session.data.feeMonths : [currentMonthKey()]);

    return (
        <>
            <PageTitle title="Salary" sub={monthLabel(month)}>
                {tab === 'slips' && (
                    <Select className="w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
                        {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </Select>
                )}
            </PageTitle>

            <Tabs tabs={[{ value: 'slips', label: 'Monthly slips' }, { value: 'teachers', label: 'Teachers' }]}
                  value={tab} onChange={setTab} />

            {tab === 'slips' && <Slips month={month} />}
            {tab === 'teachers' && <TeachersList />}
        </>
    );
}
