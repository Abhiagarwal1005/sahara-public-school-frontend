import { useReceipt, useActiveSession } from '../hooks/queries';
import { useAuth } from '../store/auth';
import { money, date, monthLabel } from '../lib/format';
import { Button, Modal, Loading, EmptyState } from './ui';

// ---------------------------------------------------------------------------
// The printed receipt, in ONE place.
//
// This block used to be written out twice inside Fees.jsx — once for a fee
// collection and once for stock dues — and a third copy would have been needed
// for a reprint. Three copies of a receipt layout is three chances for the
// school's name, the session line or the signature block to drift apart on
// paper, which is the one place it must not.
//
// It renders nothing on screen: `print-only` keeps it out of the way until the
// browser is actually printing.
// ---------------------------------------------------------------------------

const Row = ({ label, value }) => (
    <div className="flex justify-between py-1 text-[13px]">
        <span className="text-ink-2">{label}</span>
        <b>{value}</b>
    </div>
);

export function ReceiptPrint({ receipt, heading = 'Fee Receipt' }) {
    const session = useActiveSession();
    // Who took the money. This was the literal string "Accounts" on every
    // receipt ever printed, which told the parent nothing and the school less.
    const user = useAuth((s) => s.user);

    if (!receipt) return null;

    const lines = receipt.covered || [];

    return (
        <div className="print-only text-left">
            <div className="text-center pb-3 mb-3 border-b-2 border-ink">
                <b className="block text-lg font-bold">Sahara Public School</b>
                <span className="text-xs text-ink-3">
                    {heading}
                    {session.data?.name ? ` · Session ${session.data.name}` : ''}
                </span>
            </div>

            <Row label="Receipt no." value={receipt.receiptNo} />
            <Row label="Date" value={date(receipt.date)} />
            <Row label="Student" value={receipt.student?.name} />
            <Row label="Admission no." value={receipt.student?.admissionNo} />
            <Row label="Class" value={receipt.student?.className} />
            <Row label="Mode" value={receipt.mode} />

            <div className="border-t border-line my-2" />

            {lines.map((c) => (
                <div key={c.key} className="flex justify-between py-1 text-[13px]">
                    <span className="text-ink-2">{c.label}</span>
                    <b>{money(c.amount)}</b>
                </div>
            ))}

            {/* A line of its own, above the total, because the parent's copy has
                to show what this money bought. A slip that says only "₹13,200
                received" against one month's fee is the receipt somebody brings
                back in March asking where the rest went. */}
            {receipt.advance > 0 && (
                <div className="flex justify-between py-1 text-[13px]">
                    <span className="text-ink-2">Held in advance for coming months</span>
                    <b>{money(receipt.advance)}</b>
                </div>
            )}

            <div className="flex justify-between border-t border-line mt-2 pt-2 text-[15px]">
                <span>Total received</span>
                <b className="text-good">{money(receipt.amount)}</b>
            </div>

            {receipt.voided && (
                <p className="mt-3 text-[12px] font-bold">
                    *** VOID — {receipt.voidReason || 'this receipt has been cancelled'} ***
                </p>
            )}

            <div className="flex justify-between mt-8 text-[11px] text-ink-3">
                <span>Received by: {user?.name || 'Accounts'}</span>
                <span>Authorised signature</span>
            </div>
        </div>
    );
}

// A fee collection's own response, in the shape ReceiptPrint wants.
export const fromCollection = (data) => ({
    receiptNo: data.receiptNo,
    date: data.date,
    amount: data.amount,
    mode: data.mode,
    student: data.student,
    advance: data.advance,
    covered: (data.covered || []).map((c) => ({
        key: c.month,
        label: `${monthLabel(c.month)} fee`,
        amount: c.amount,
    })),
});

// A stock-dues collection's response.
export const fromStockCollection = (data) => ({
    receiptNo: data.receiptNo,
    date: data.date,
    amount: data.amount,
    mode: data.mode,
    student: data.student,
    covered: (data.covered || []).map((c) => ({
        key: c.billNo,
        label: `Bill ${c.billNo}`,
        amount: c.amount,
    })),
});

// A stored transaction, fetched back for a reprint.
const fromTransaction = (receipt, student) => ({
    receiptNo: receipt.receiptNo,
    date: receipt.txnDate,
    amount: receipt.amount,
    mode: receipt.mode,
    advance: receipt.advance,
    voided: receipt.voided,
    voidReason: receipt.voidReason,
    student: {
        name: student?.name,
        admissionNo: student?.admissionNo,
        className: student?.className,
    },
    covered: (receipt.covered || []).map((c) => ({
        key: c.month,
        label: `${monthLabel(c.month)} fee`,
        amount: c.amount,
    })),
});

// ---------------------------------------------------------------------------
// "The parent has lost their receipt."
//
// GET /fees/receipts/:id and `fee.view` have both existed from the start; there
// was simply no way to open a receipt once the dialog that issued it had been
// closed, so a duplicate could not be given at all.
// ---------------------------------------------------------------------------
export function ReceiptModal({ transactionId, onClose }) {
    const query = useReceipt(transactionId);

    if (!transactionId) return null;

    const data = query.data;
    const receipt = data ? fromTransaction(data.receipt, data.student) : null;

    return (
        <Modal
            open
            onClose={onClose}
            title={`Receipt ${data?.receipt?.receiptNo || ''}`}
            footer={
                <>
                    <Button onClick={onClose}>Close</Button>
                    <Button variant="primary" disabled={!receipt} onClick={() => window.print()}>
                        Print
                    </Button>
                </>
            }
        >
            {query.isPending ? (
                <Loading rows={3} />
            ) : query.isError ? (
                <EmptyState>{query.error.message}</EmptyState>
            ) : (
                <>
                    <div className="flex flex-col">
                        <Row label="Receipt no." value={receipt.receiptNo} />
                        <Row label="Date" value={date(receipt.date)} />
                        <Row label="Student" value={receipt.student.name} />
                        <Row label="Admission no." value={receipt.student.admissionNo} />
                        <Row label="Class" value={receipt.student.className} />
                        <Row label="Mode" value={receipt.mode} />

                        <div className="border-t border-line my-2" />
                        {receipt.covered.map((c) => (
                            <Row key={c.key} label={c.label} value={money(c.amount)} />
                        ))}
                        {receipt.advance > 0 && (
                            <Row label="Held in advance" value={money(receipt.advance)} />
                        )}

                        <div className="flex justify-between border-t border-line mt-2 pt-2 text-[15px]">
                            <span>Total received</span>
                            <b className="text-good">{money(receipt.amount)}</b>
                        </div>
                    </div>

                    {receipt.voided && (
                        <div className="mt-3 bg-crit-bg border border-crit text-crit rounded-md px-3 py-2.5 text-[12.5px]">
                            This receipt has been voided{receipt.voidReason ? `: ${receipt.voidReason}` : ''}.
                            A reprint will carry that on its face.
                        </div>
                    )}

                    <ReceiptPrint receipt={receipt} />
                </>
            )}
        </Modal>
    );
}
