import { useEffect, useState } from 'react';
import { useIssueIdCard, useCancelIdCard, useActiveSession } from '../hooks/queries';
import { money, date } from '../lib/format';
import { Button, Input, Select, Field, Modal, ReasonModal, Pill } from './ui';
import { Can } from './Can';

// ---------------------------------------------------------------------------
// Student ID cards.
//
// Handing a card over and taking the money is ONE act at the counter, so it is
// one dialog and one request. The amount defaults to the fee set on the session
// (Settings → Session), so the normal case is: open, press Issue, done.
//
// A free card is ₹0 — the flag is set and no ledger row is written, because no
// cash moved. That is the same rule a fee discount follows.
// ---------------------------------------------------------------------------

// The badge used in every list. Text, never colour alone — this gets printed
// and photocopied.
export function IdCardPill({ idCard }) {
    return idCard?.issued
        ? <Pill tone="ok">Taken</Pill>
        : <Pill tone="warn">Not taken</Pill>;
}

export function IssueIdCard({ student, open, onClose }) {
    const session = useActiveSession();
    const issue = useIssueIdCard(onClose);
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState('Cash');
    const [note, setNote] = useState('');

    const fee = session.data?.idCardFee ?? 0;

    // Re-seed on every open so a cancelled dialog does not carry its typed
    // amount into the next student.
    useEffect(() => {
        if (!open) return;
        setAmount(String(fee));
        setMode('Cash');
        setNote('');
    }, [open, fee]);

    if (!open || !student) return null;

    const value = Number(String(amount).replace(/,/g, '')) || 0;
    const valid = value >= 0 && amount !== '';

    return (
        <Modal open onClose={onClose} title={`ID card — ${student.name}`}
               footer={<>
                   <Button onClick={onClose}>Cancel</Button>
                   <Button variant="primary" loading={issue.isPending} disabled={!valid}
                           onClick={() => issue.mutate({
                               id: student._id,
                               amount: value,
                               mode,
                               note: note.trim() || undefined,
                           })}>
                       {value > 0 ? `Issue & collect ${money(value)}` : 'Issue free of charge'}
                   </Button>
               </>}>
            <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between pb-3 border-b border-line">
                    <span className="text-[12px] text-ink-3">{student.admissionNo} · {student.className}</span>
                    <IdCardPill idCard={student.idCard} />
                </div>

                <Field label="Amount"
                       hint={fee > 0
                           ? `The school's fee this year is ${money(fee)} — change it only for this student`
                           : 'No school-wide fee is set (Settings → Session). Enter the amount, or 0 for free.'}>
                    <Input inputMode="numeric" value={amount} autoFocus
                           onChange={(e) => setAmount(e.target.value)} />
                </Field>

                {value > 0 ? (
                    <Field label="Payment mode">
                        <Select value={mode} onChange={(e) => setMode(e.target.value)}>
                            {['Cash', 'UPI', 'Bank', 'Cheque'].map((m) => <option key={m}>{m}</option>)}
                        </Select>
                    </Field>
                ) : (
                    <div className="bg-paper-2 border border-line rounded-md px-3 py-2.5 text-[12.5px] text-ink-2">
                        At ₹0 the card is marked as taken and <b className="text-ink">nothing enters the cash book</b>,
                        because no money changed hands. Use this for a staff child or a card the school is covering.
                    </div>
                )}

                <Field label="Note" hint="optional — shows on the edit history">
                    <Input value={note} placeholder="Replacement, staff child…" onChange={(e) => setNote(e.target.value)} />
                </Field>

                {value > 0 && (
                    <p className="text-[11.5px] text-ink-3">
                        {money(value)} goes into today's collection under its own head, so it shows separately
                        from fees on the day book and the dashboard.
                    </p>
                )}
            </div>
        </Modal>
    );
}

// The button + both dialogs, so a list row or a profile header is one line.
export function IdCardAction({ student, size = 'sm' }) {
    const [issuing, setIssuing] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const cancel = useCancelIdCard();

    return (
        <Can perm="student.idcard">
            {student.idCard?.issued ? (
                <Button size={size} variant="danger" onClick={() => setCancelling(true)}>Undo</Button>
            ) : (
                <Button size={size} variant="primary" onClick={() => setIssuing(true)}>Issue card</Button>
            )}

            <IssueIdCard student={student} open={issuing} onClose={() => setIssuing(false)} />

            <ReasonModal
                open={cancelling}
                onClose={() => setCancelling(false)}
                loading={cancel.isPending}
                title="Cancel this ID card?"
                what={`${student.name} — issued ${date(student.idCard?.issuedAt)}`
                    + (student.idCard?.amount > 0 ? ` for ${money(student.idCard.amount)}` : ' free of charge')}
                consequence={
                    student.idCard?.amount > 0
                        ? 'The student goes back to "not taken". The money is not deleted — an opposing entry '
                          + 'is written into the day book, and the collection figure comes back down.'
                        : 'The student goes back to "not taken". Nothing was collected, so the cash book is untouched.'
                }
                confirmLabel="Cancel card"
                onConfirm={async (reason) => {
                    await cancel.mutateAsync({ id: student._id, reason });
                    setCancelling(false);
                }}
            />
        </Can>
    );
}
