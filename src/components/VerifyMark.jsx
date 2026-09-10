import { useVerifyPayment, useUnverifyPayment } from '../hooks/queries';
import { date, time } from '../lib/format';
import { Button, cx } from './ui';

// ---------------------------------------------------------------------------
// Whether a collected payment has been checked off.
//
// One component, used on every screen a payment appears on, so the day book,
// a student's ledger and the verification queue can never show three different
// answers for the same receipt. WHICH rows can carry a mark is decided by the
// server (`verifiable`), not re-derived here.
// ---------------------------------------------------------------------------

// A row nobody is expected to sign off — an expense, a salary, a voided entry.
// It gets a dash, never a cross: a cross means "still to be checked", and
// putting one on an expense would invent work that does not exist.
const NOT_APPLICABLE = <span className="text-ink-3" title="Not a student payment — nothing to verify">—</span>;

export const verifiedTitle = (p) =>
    p?.verified
        ? `Verified${p.verifiedByName ? ` by ${p.verifiedByName}` : ''}` +
          `${p.verifiedAt ? ` · ${date(p.verifiedAt)} ${time(p.verifiedAt)}` : ''}`
        : 'Not verified yet';

export function VerifyMark({ payment, className }) {
    if (!payment?.verifiable) return NOT_APPLICABLE;

    const done = Boolean(payment.verified);

    return (
        <span
            title={verifiedTitle(payment)}
            // The tick and the cross are shapes, but a screen reader gets words —
            // and so does anyone who cannot tell the green from the amber.
            role="img"
            aria-label={done ? 'Verified' : 'Not verified'}
            className={cx(
                'inline-flex items-center justify-center w-[22px] h-[22px] rounded-full border',
                'text-[12px] font-bold leading-none select-none',
                done ? 'bg-good-bg border-good text-good' : 'bg-warn-bg border-warn text-warn',
                className
            )}
        >
            {done ? '✓' : '✕'}
        </span>
    );
}

// The same state, but clickable — for the queue, where signing off IS the job.
// Anywhere else the mark stays read-only on purpose: verifying is a deliberate
// sit-down with the cash box, not something to do by accident while scrolling
// past a day book.
export function VerifyToggle({ payment }) {
    const verify = useVerifyPayment();
    const unverify = useUnverifyPayment();

    if (!payment?.verifiable) return null;

    const done = Boolean(payment.verified);
    const busy = verify.isPending || unverify.isPending;

    return (
        <Button
            size="sm"
            loading={busy}
            variant={done ? 'default' : 'primary'}
            title={done ? 'Take this tick off' : 'Mark this payment as checked'}
            onClick={() => (done ? unverify : verify).mutate(payment._id)}
        >
            {done ? 'Undo' : 'Verify'}
        </Button>
    );
}
