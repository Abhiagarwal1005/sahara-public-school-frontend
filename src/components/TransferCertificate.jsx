import { useEffect, useState } from 'react';
import { useIssueTC, useCancelTC, useActiveSession } from '../hooks/queries';
import { money, date } from '../lib/format';
import { Button, Input, Select, Field, Textarea, Modal, ReasonModal, Pill, cx } from './ui';
import { Can } from './Can';

// ---------------------------------------------------------------------------
// TRANSFER CERTIFICATES.
//
// A child leaves and the next school will not admit them without this piece of
// paper. So issuing it is ONE act here, exactly as it is at the counter: the
// certificate is numbered and the student comes off the roster in the same
// request. The office should not have to remember the second half.
//
// The dues warning is the part worth reading twice. It does not refuse — see
// studentService.issueTC for why — it makes the decision explicit, prints the
// figure on the certificate itself, and puts a name against it in the edit
// history.
// ---------------------------------------------------------------------------

// What a student still owes and what the school still holds for them, off
// whatever shape of student record the caller happens to have. The roster row
// and the profile carry the same four fields, so one function serves both and
// the two screens cannot drift into disagreeing about the same child.
export const balancesOf = (student) => ({
    dues:
        (student?.feeOutstanding || 0)
        + (student?.stockOutstanding || 0)
        + (student?.chargeOutstanding || 0),
    credit: student?.creditBalance || 0,
});

// The badge every list uses. Text, never colour alone — this gets photocopied.
//
// The missing certificate is only a PROBLEM once the child has actually gone,
// so it reads amber there and neutral on a student still on the roll. A warning
// shown against every active student in the school is a warning nobody reads by
// the end of the first week.
export function TcPill({ tc, status }) {
    if (tc?.given) return <Pill tone="ok">TC {tc.no}</Pill>;
    return <Pill tone={status === 'Left' ? 'warn' : 'neutral'}>No TC</Pill>;
}

// ---------------------------------------------------------------------------
// The certificate itself.
//
// `print-only`, like the fee receipt — it renders nothing on screen until the
// browser is actually printing. No server-side PDF, and so no cold-start cost
// for a document printed a few dozen times a year.
//
// It is signed by the Principal, not by whoever typed it, which is how a real
// TC works — so no name is stored or printed here. The signature block is the
// signature block.
// ---------------------------------------------------------------------------
const Line = ({ label, value }) => (
    <div className="flex gap-2 py-[3px] text-[12.5px] leading-relaxed">
        <span className="text-ink-2 shrink-0 w-[190px]">{label}</span>
        <b className="flex-1 border-b border-dotted border-ink-3">{value || '—'}</b>
    </div>
);

export function TransferCertificatePrint({ student }) {
    const session = useActiveSession();

    if (!student?.tc?.given) return null;

    const tc = student.tc;

    return (
        <div className="print-only text-left">
            <div className="text-center pb-3 mb-4 border-b-2 border-ink">
                <b className="block text-lg font-bold">Sahara Public School</b>
                <span className="block text-[11px] text-ink-3">
                    {session.data?.name ? `Session ${session.data.name}` : ''}
                </span>
                <b className="block mt-2 text-[13px] tracking-[0.18em] uppercase">Transfer Certificate</b>
            </div>

            <div className="flex justify-between text-[12px] mb-3">
                <span>T.C. No.: <b>{tc.no}</b></span>
                <span>Date of issue: <b>{date(tc.issuedAt)}</b></span>
            </div>

            <Line label="Admission no." value={student.admissionNo} />
            <Line label="Name of student" value={student.name} />
            <Line label="Father's / guardian's name" value={student.guardianName} />
            <Line label="Mother's name" value={student.motherName} />
            <Line label="Date of birth" value={student.dob ? date(student.dob) : ''} />
            <Line label="Address" value={student.address} />
            <Line label="Class last attended" value={student.className} />
            <Line label="Date of admission" value={date(student.admissionDate)} />
            <Line label="Date of leaving" value={date(student.leftAt || tc.issuedAt)} />
            <Line label="Reason for leaving" value={tc.reason} />
            <Line label="Conduct" value={tc.conduct} />

            {/* Printed on the face of the certificate, not buried in a note.
                A TC handed over with fees unpaid is a fact the school will want
                back later, and the only copy that matters is the one the parent
                walks out with. */}
            {tc.duesAtIssue > 0 && (
                <p className="mt-4 text-[12px] border border-ink px-3 py-2">
                    <b>Dues outstanding at the date of issue: {money(tc.duesAtIssue)}.</b> This
                    certificate has been issued without those dues having been cleared.
                </p>
            )}

            {/* The other direction, and the one nobody chases — because nobody
                is waiting for it. */}
            {tc.creditAtIssue > 0 && (
                <p className="mt-2 text-[12px] border border-ink px-3 py-2">
                    <b>{money(tc.creditAtIssue)} was held in advance by the school at the date of issue</b>,
                    and is refundable.
                </p>
            )}

            {tc.note && <p className="mt-3 text-[12px]">Remarks: {tc.note}</p>}

            <div className="flex justify-between items-end mt-14 text-[11px] text-ink-3">
                <span>Prepared by</span>
                <span>Principal — Sahara Public School</span>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Issuing. One dialog, because it is one act.
// ---------------------------------------------------------------------------
const CONDUCT = ['Excellent', 'Good', 'Satisfactory'];

export function IssueTC({ student, open, onClose }) {
    const issue = useIssueTC(onClose);
    const [form, setForm] = useState({ reason: '', conduct: 'Good', note: '', issueAnyway: false });

    const set = (patch) => setForm((f) => ({ ...f, ...patch }));

    // Re-seed on every open, so a cancelled dialog never carries one child's
    // reason — or, far worse, their dues override — onto the next one.
    useEffect(() => {
        if (open) setForm({ reason: '', conduct: 'Good', note: '', issueAnyway: false });
    }, [open, student?._id]);

    if (!open || !student) return null;

    const { dues, credit } = balancesOf(student);
    const blocked = dues > 0 || credit > 0;
    const ready = !blocked || form.issueAnyway;
    const alreadyLeft = student.status === 'Left';

    return (
        <Modal
            open onClose={onClose} title={`Transfer certificate — ${student.name}`}
            footer={
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button variant="primary" loading={issue.isPending} disabled={!ready}
                            onClick={() => issue.mutate({
                                id: student._id,
                                reason: form.reason.trim() || undefined,
                                conduct: form.conduct,
                                note: form.note.trim() || undefined,
                                issueAnyway: form.issueAnyway || undefined,
                            })}>
                        Issue certificate
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between pb-3 border-b border-line">
                    <span className="text-[12px] text-ink-3">{student.admissionNo} · {student.className}</span>
                    <TcPill tc={student.tc} status={student.status} />
                </div>

                {/* Said before anything is typed, because it is the half of this
                    action that is easy to miss: the certificate also takes the
                    child off the roll. */}
                <div className="bg-paper-2 border border-line rounded-md px-3 py-2.5 text-[12.5px] text-ink-2">
                    {alreadyLeft ? (
                        <>This student is already marked as <b className="text-ink">Left</b>
                            {student.leftAt ? ` (${date(student.leftAt)})` : ''}. Issuing the certificate
                            leaves their status and leaving date exactly as they are.</>
                    ) : (
                        <>The certificate is numbered and <b className="text-ink">{student.name} is marked as
                            Left</b> in the same step — removed from rosters, and out of next month's fee run.
                            Nothing is deleted.</>
                    )}
                </div>

                {blocked && (
                    <div className="bg-crit-bg border border-crit rounded-md px-3 py-2.5 text-[12.5px] text-crit">
                        {dues > 0 && (
                            <p><b>{money(dues)} is still outstanding.</b> Leaving the school does not clear
                                dues — they stay on the outstanding report either way.</p>
                        )}
                        {credit > 0 && (
                            <p className={cx(dues > 0 && 'mt-1.5')}>
                                <b>{money(credit)} is being held in advance</b> — the school owes that back.
                                Return it from the profile before the certificate goes out.
                            </p>
                        )}
                        <label className="mt-2.5 flex items-start gap-2 cursor-pointer text-ink-2">
                            <input type="checkbox" className="mt-0.5" checked={form.issueAnyway}
                                   onChange={(e) => set({ issueAnyway: e.target.checked })} />
                            <span>
                                Issue it anyway. The amount is printed on the certificate and recorded
                                against my name in the edit history.
                            </span>
                        </label>
                    </div>
                )}

                <Field label="Reason for leaving" hint="Printed on the certificate — moved city, shifted school, completed Class 8">
                    <Input value={form.reason} autoFocus placeholder="Family moved to Jaipur"
                           onChange={(e) => set({ reason: e.target.value })} />
                </Field>

                <Field label="Conduct">
                    <Select value={form.conduct} onChange={(e) => set({ conduct: e.target.value })}>
                        {CONDUCT.map((c) => <option key={c}>{c}</option>)}
                    </Select>
                </Field>

                <Field label="Remarks" hint="optional — printed below the certificate's details">
                    <Textarea value={form.note} onChange={(e) => set({ note: e.target.value })} />
                </Field>

                <p className="text-[11.5px] text-ink-3">
                    The number is generated here (TC0001, TC0002…) and is never reused — not even
                    if this certificate is cancelled afterwards.
                </p>
            </div>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// The issued certificate, on screen, with a Print button. Also the reprint —
// a parent who has lost theirs asks for it on this screen.
// ---------------------------------------------------------------------------
export function ViewTC({ student, open, onClose }) {
    if (!open || !student?.tc?.given) return null;

    const tc = student.tc;

    return (
        <Modal
            open onClose={onClose} title={`Transfer certificate ${tc.no}`}
            footer={
                <>
                    <Button onClick={onClose}>Close</Button>
                    <Button variant="primary" onClick={() => window.print()}>Print</Button>
                </>
            }
        >
            <div className="flex flex-col">
                <Line label="T.C. No." value={tc.no} />
                <Line label="Date of issue" value={date(tc.issuedAt)} />
                <Line label="Student" value={`${student.name} (${student.admissionNo})`} />
                <Line label="Class last attended" value={student.className} />
                <Line label="Date of birth" value={student.dob ? date(student.dob) : ''} />
                <Line label="Date of leaving" value={date(student.leftAt || tc.issuedAt)} />
                <Line label="Reason for leaving" value={tc.reason} />
                <Line label="Conduct" value={tc.conduct} />
            </div>

            {/* The date of birth is the field the receiving school checks first,
                and a TC that goes out without one comes straight back. Said here
                rather than left as a dash on the printed page. */}
            {!student.dob && (
                <div className="mt-3 bg-warn-bg border border-warn text-warn rounded-md px-3 py-2.5 text-[12.5px]">
                    No date of birth is on this student's record, so the certificate will print a blank
                    there. Add it from Edit and print again — most schools send the TC back without it.
                </div>
            )}

            {tc.duesAtIssue > 0 && (
                <div className="mt-3 bg-crit-bg border border-crit text-crit rounded-md px-3 py-2.5 text-[12.5px]">
                    Issued over {money(tc.duesAtIssue)} still outstanding — that line is printed on the
                    face of the certificate.
                </div>
            )}
            {tc.creditAtIssue > 0 && (
                <div className="mt-3 bg-paper-2 border border-brand text-brand rounded-md px-3 py-2.5 text-[12.5px]">
                    {money(tc.creditAtIssue)} was still being held in advance when this was issued, and
                    the certificate says so. That money is still refundable.
                </div>
            )}

            <TransferCertificatePrint student={student} />
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// The button plus all three dialogs, so a roster row or a profile header is
// one line — the same shape as IdCardAction.
// ---------------------------------------------------------------------------
export function TcAction({ student, size = 'sm' }) {
    const [issuing, setIssuing] = useState(false);
    const [viewing, setViewing] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const cancel = useCancelTC();

    return (
        <Can perm="student.tc">
            {student.tc?.given ? (
                <span className="inline-flex items-center gap-1.5">
                    <Button size={size} onClick={() => setViewing(true)}>View TC</Button>
                    <Button size={size} variant="danger" onClick={() => setCancelling(true)}>Cancel</Button>
                </span>
            ) : (
                <Button size={size} variant="primary" onClick={() => setIssuing(true)}>Issue TC</Button>
            )}

            <IssueTC student={student} open={issuing} onClose={() => setIssuing(false)} />
            <ViewTC student={student} open={viewing} onClose={() => setViewing(false)} />

            <ReasonModal
                open={cancelling}
                onClose={() => setCancelling(false)}
                loading={cancel.isPending}
                title="Cancel this transfer certificate?"
                what={`${student.name} — ${student.tc?.no} issued ${date(student.tc?.issuedAt)}`}
                consequence={
                    (student.tc?.markedLeft
                        ? `${student.name} goes back onto the roster as Active and their class count comes back up — `
                          + 'this certificate is what marked them Left. '
                        : 'Their status is untouched: they were already marked Left before this certificate. ')
                    + `${student.tc?.no} is not reused — the next certificate is the next number, and what `
                    + 'this one said lives in the edit history.'
                }
                confirmLabel="Cancel certificate"
                onConfirm={async (reason) => {
                    await cancel.mutateAsync({ id: student._id, reason });
                    setCancelling(false);
                }}
            />
        </Can>
    );
}
