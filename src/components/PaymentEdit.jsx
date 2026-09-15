import { useEffect, useState } from 'react';
import { useUpdatePayment } from '../hooks/queries';
import { useAuth } from '../store/auth';
import { money, date, time } from '../lib/format';
import { Button, Field, Input, Modal, Select } from './ui';
import { ReceiptModal } from './Receipt';

// ---------------------------------------------------------------------------
// CORRECTING A PAYMENT THAT HAS NOT BEEN CHECKED OFF YET
//
// The reconciliation itself is what turns these mistakes up. Somebody sits down
// with the cash box and the UPI app, and the drawer is short by ₹1,200 while
// the app is over by exactly that — a payment written down as Cash arrived by
// UPI. Or the drawer holds ₹5,000 against a slip that says ₹500. Until the row
// says what actually happened, neither side will ever tally.
//
// So the fix belongs on the screen where the mismatch is found, not two screens
// away. Three things can be corrected: the amount, the mode, and the reference.
//
// The amount is the one that moves money — the months a fee receipt paid, the
// charges it cleared, the credit half of a stock bill, the student's balance,
// the month's collection figure. The server does all of that in one
// transaction through the module that owns each record; see
// payment.service.js. What this dialog owes the user is to say plainly that it
// is about to happen, and to put a corrected receipt in their hand afterwards.
//
// Once the entry is verified this disappears entirely — the row is sealed
// against editing and voiding alike, and the way back is to take the
// verification off.
// ---------------------------------------------------------------------------
const MODES = ['Cash', 'UPI', 'Bank', 'Cheque'];

// What a corrected figure does to the rest of the books, said in the words the
// office uses rather than in the names of collections.
const KNOCK_ON = {
    FEE: 'the months this receipt paid and the student’s fee outstanding',
    CHARGE: 'the charges this receipt cleared and the student’s other-fees balance',
    STOCK_SALE: 'how much of the bill is still owed on the student’s account',
    ID_CARD: 'what the ID card is recorded as having been issued for',
};

// The one test, so the button and the lock notice can never disagree about the
// same row. `verifiable` is decided by the server and sent down — no screen
// re-derives what counts as a student payment.
export const canCorrect = (p) => Boolean(p?.verifiable) && !p.verified && !p.voided;

export function PaymentEdit({ payment, size = 'sm', label = 'Edit' }) {
    const [open, setOpen] = useState(false);
    // A fee receipt whose figure just changed: the slip in the parent's hand is
    // now wrong, so the corrected one is put straight in front of the user
    // rather than left for them to go and find.
    const [reprint, setReprint] = useState(null);
    const allowed = useAuth((s) => s.can('payment.edit'));

    if (!allowed || !canCorrect(payment)) return null;

    return (
        <>
            <Button size={size} onClick={() => setOpen(true)} title="Correct the amount, the mode or the reference">
                {label}
            </Button>
            <EditDialog
                payment={payment}
                open={open}
                onClose={() => setOpen(false)}
                onAmountChanged={() => {
                    if (payment.type === 'FEE' && payment.receiptNo) setReprint(payment._id);
                }}
            />
            <ReceiptModal transactionId={reprint} onClose={() => setReprint(null)} />
        </>
    );
}

function EditDialog({ payment, open, onClose, onAmountChanged }) {
    const save = useUpdatePayment();
    const [amount, setAmount] = useState(String(payment.amount));
    const [mode, setMode] = useState(payment.mode);
    const [note, setNote] = useState(payment.note || '');

    // Reset every time it opens, so a dialog abandoned once does not reopen
    // holding an edit nobody meant to keep.
    useEffect(() => {
        if (open) {
            setAmount(String(payment.amount));
            setMode(payment.mode);
            setNote(payment.note || '');
        }
    }, [open, payment.amount, payment.mode, payment.note]);

    if (!open) return null;

    const value = Number(amount);
    const validAmount = Number.isFinite(value) && value > 0;
    const amountMoved = validAmount && value !== payment.amount;
    const changed = amountMoved || mode !== payment.mode || note.trim() !== (payment.note || '');

    // A blank or nonsense figure is a typo in progress, not a request to
    // collect nothing — so it blocks the save rather than being sent.
    const amountBroken = amount.trim() !== '' && !validAmount;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Correct this payment"
            footer={
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button
                        variant={amountMoved ? 'danger' : 'primary'}
                        loading={save.isPending}
                        disabled={!changed || amountBroken || !validAmount}
                        onClick={async () => {
                            const res = await save.mutateAsync({
                                id: payment._id,
                                amount: value,
                                mode,
                                note: note.trim(),
                            });
                            onClose();
                            if (res?.amountChanged) onAmountChanged?.();
                        }}
                    >
                        {amountMoved ? 'Correct the amount' : 'Save correction'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                {/* Who and which slip — the two things this dialog cannot
                    change, shown so it is obvious they are not in question. */}
                <div className="bg-paper-2 border border-line rounded-md px-3 py-2.5 text-[12.5px]">
                    <b className="font-semibold">{payment.party?.name || 'Student'}</b>
                    {payment.receiptNo ? ` · ${payment.receiptNo}` : ''}
                    <span className="block text-ink-3 mt-0.5">
                        Collected {date(payment.txnDate)} at {time(payment.txnDate)} · recorded as{' '}
                        {money(payment.amount)}
                    </span>
                </div>

                <Field
                    label="Amount"
                    hint="What was actually taken at the counter"
                    error={amountBroken ? 'Enter an amount greater than zero' : undefined}
                >
                    <Input
                        inputMode="numeric"
                        value={amount}
                        error={amountBroken}
                        onChange={(e) => setAmount(e.target.value)}
                    />
                </Field>

                {amountMoved && (
                    <div className="bg-warn-bg border border-warn text-warn rounded-md px-3 py-2.5 text-[12.5px]">
                        <b>{money(payment.amount)} → {money(value)}.</b>{' '}
                        This moves {KNOCK_ON[payment.type] || 'the records behind this payment'}, and the
                        day&rsquo;s collection figure. The slip already handed over will be wrong —
                        {payment.type === 'FEE' && payment.receiptNo
                            ? ' a corrected one opens for printing as soon as this is saved.'
                            : ' print a corrected one before the parent leaves.'}
                    </div>
                )}

                <Field
                    label="Payment mode"
                    hint="What the money actually arrived as — this is the figure the cash box and the UPI app are counted against"
                >
                    <Select value={mode} onChange={(e) => setMode(e.target.value)}>
                        {MODES.map((m) => <option key={m}>{m}</option>)}
                    </Select>
                </Field>

                <Field label="Reference / note" hint="Cheque number, UPI reference, who handed the money over">
                    <Input value={note} maxLength={200} placeholder="Optional"
                           onChange={(e) => setNote(e.target.value)} />
                </Field>

                <p className="text-[11.5px] text-ink-3">
                    Who paid and what it was for cannot be changed here, and neither can the receipt
                    number. A receipt against the wrong student, or a bill with the wrong items on it, is
                    not a mistyped figure — void it and enter the right one. All of this is possible only
                    until the payment is verified.
                </p>
            </div>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// The other half: why the Void button is not there.
//
// A row that simply loses its button reads as a bug, and the office is left
// guessing. This says the rule and names who signed it off, so the next
// question ("who do I ask?") is already answered.
// ---------------------------------------------------------------------------
export function SealedNote({ payment, className }) {
    if (!payment?.verified) return null;

    return (
        <span
            className={className}
            title={
                `Verified${payment.verifiedByName ? ` by ${payment.verifiedByName}` : ''}` +
                `${payment.verifiedAt ? ` on ${date(payment.verifiedAt)}` : ''}` +
                ' — take the verification off to edit or void this'
            }
        >
            <span className="text-[11px] text-ink-3 whitespace-nowrap">Locked</span>
        </span>
    );
}
