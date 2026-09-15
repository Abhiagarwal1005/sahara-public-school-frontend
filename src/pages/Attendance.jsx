import { useEffect, useState } from 'react';
import {
    useTeacherSheet, useMarkTeachers, useTeacherGrid,
    useClassSheet, useMarkClasses, useClassMonthly, useActiveSession,
} from '../hooks/queries';
import { date, toInputDate, monthLabel, currentMonthKey, monthOptions, percent, sessionMonths } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Select, Toolbar, Spacer, Meter,
    Async, PageTitle, Tabs, EmptyState, cx,
} from '../components/ui';
import { Can } from '../components/Can';
import { useAuth } from '../store/auth';

// Late sits next to Present and carries the same green family on purpose: the
// teacher DID come, so the day is paid in full. What it costs is decided on the
// salary slip, from the count above that teacher's allowance — not here.
const STATUSES = [
    { key: 'Present', short: 'P', tone: 'bg-brand text-white border-brand' },
    { key: 'Late', short: 'LT', tone: 'bg-brand-2 text-white border-brand-2' },
    { key: 'Absent', short: 'A', tone: 'bg-crit text-white border-crit' },
    { key: 'HalfDay', short: 'H', tone: 'bg-warn text-white border-warn' },
    { key: 'Leave', short: 'L', tone: 'bg-ink-3 text-white border-ink-3' },
    // A declared school holiday — Diwali, Holi, a local closure. It is a PAID
    // day in payroll, exactly like a Sunday, and the backend has always
    // accepted it. There was simply no button, so a closed day could only be
    // left unmarked — and an unmarked day is deliberately NOT paid. A week of
    // Diwali therefore came off every teacher's salary.
    { key: 'Holiday', short: 'HO', tone: 'bg-ink text-white border-ink' },
];

// One letter per status, written out rather than taken from status[0].
// 'Late' and 'Leave' both start with L, and so do 'HalfDay' and 'Holiday' with
// H — the monthly grid used to slice the first character and showed the two
// pairs identically, which is the one thing an attendance grid must not do.
const SHORT = {
    Present: 'P', Late: 'LT', Absent: 'A', HalfDay: 'H', Leave: 'L', Holiday: 'HO',
};

// ---------------------------------------------------------------------------
// ONCE MARKED, A DAY IS SEALED.
//
// The server writes attendance with $setOnInsert, so a row that exists is never
// touched again — not by a second click, not by somebody opening last Tuesday
// and pressing Save. Attendance is what payroll is built from, and a register
// that can be rewritten after a slip was made is a register nobody can rely on.
//
// The lock is per PERSON per day, not per sheet: a teacher who joined after the
// sheet was saved has no row for that day, so their day can still be marked.
// That is why these screens show a sealed row read-only next to an editable one
// rather than freezing the whole page.
// ---------------------------------------------------------------------------
const LockedMark = ({ status, at }) => (
    <span
        className="inline-flex items-center gap-1.5 text-[11.5px] font-mono font-semibold text-ink-3"
        title={at ? `Marked on ${date(at)} — attendance cannot be changed once saved` : 'Attendance cannot be changed once saved'}
    >
        <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor"
             strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3.2" y="7" width="9.6" height="6.4" rx="1.2" />
            <path d="M5.6 7V5.2a2.4 2.4 0 014.8 0V7" />
        </svg>
        {status}
    </span>
);

// ---------------------------------------------------------------------------
// Teacher sheet — everyone defaults to Present. In a school where most
// people turn up, the work is marking EXCEPTIONS, not marking everyone.
// The whole sheet saves in one call (the backend makes it one bulkWrite).
// ---------------------------------------------------------------------------
function TeacherDaily() {
    const [day, setDay] = useState(toInputDate(new Date()));
    const sheet = useTeacherSheet(day);
    const mark = useMarkTeachers();
    const [marks, setMarks] = useState({});

    // Seed local state when the server responds (and reset when the date changes)
    useEffect(() => {
        if (sheet.data) {
            setMarks(Object.fromEntries(sheet.data.rows.map((r) => [r.teacher, r.status])));
        }
    }, [sheet.data]);

    const counts = Object.values(marks).reduce((a, s) => ({ ...a, [s]: (a[s] || 0) + 1 }), {});

    const rows = sheet.data?.rows || [];
    // Rows that have not been sealed yet — the only ones this screen can still
    // change, and the only ones worth sending.
    const open = rows.filter((r) => !r.locked);
    const lockedCount = rows.length - open.length;
    const fullyLocked = rows.length > 0 && open.length === 0;

    // A school holiday closes the school for EVERYONE, so marking it one teacher
    // at a time is forty clicks for a single fact. One button sets the sheet —
    // for the rows that are still open.
    const allHoliday = open.length > 0 && open.every((r) => marks[r.teacher] === 'Holiday');
    const setEveryone = (status) =>
        setMarks({ ...marks, ...Object.fromEntries(open.map((r) => [r.teacher, status])) });

    return (
        <>
            <Toolbar>
                <Input type="date" className="w-auto" value={day} onChange={(e) => setDay(e.target.value)} />
                {sheet.data?.isSunday && (
                    <span className="text-[12px] font-semibold text-warn bg-warn-bg border border-warn rounded-md px-2.5 py-1">
                        Sunday — weekly off, salary unaffected
                    </span>
                )}
                <Spacer />
                <span className="tb-wide text-[12.5px] text-ink-2">
                    Present <b>{counts.Present || 0}</b> · Late <b>{counts.Late || 0}</b> ·
                    Absent <b>{counts.Absent || 0}</b> · Half <b>{counts.HalfDay || 0}</b> ·
                    Leave <b>{counts.Leave || 0}</b> · Holiday <b>{counts.Holiday || 0}</b>
                </span>
                <Can perm="attendance.teacher.mark">
                    {/* Hidden on a Sunday: that day is already a paid weekly off
                        and the sheet is locked, so there is nothing to declare. */}
                    {!sheet.data?.isSunday && open.length > 0 && (
                        <Button onClick={() => setEveryone(allHoliday ? 'Present' : 'Holiday')}>
                            {allHoliday ? 'Not a holiday' : 'School holiday'}
                        </Button>
                    )}
                    <Button variant="primary" loading={mark.isPending}
                            disabled={sheet.data?.isSunday || fullyLocked || !open.length}
                            title={fullyLocked ? 'This day is already marked and cannot be changed' : undefined}
                            onClick={() => mark.mutate({
                                date: day,
                                // Only the rows that are still open. Sending a sealed one
                                // is harmless — the server refuses it — but it would make
                                // the result read "38 already locked" on every save.
                                entries: open.map((r) => ({ teacher: r.teacher, status: marks[r.teacher] })),
                            })}>
                        {fullyLocked ? 'Marked' : open.length < rows.length ? `Save ${open.length} remaining` : 'Save sheet'}
                    </Button>
                </Can>
            </Toolbar>

            {/* Said once, plainly, at the top — not discovered by clicking Save. */}
            {fullyLocked && !sheet.data?.isSunday && (
                <div className="bg-paper-2 border border-line rounded-md px-4 py-2.5 text-[12.5px] text-ink-2">
                    <b className="text-ink">This day is marked and sealed.</b> Attendance cannot be changed
                    once saved — it is what salary slips are built from. A teacher who joins later can
                    still have this day marked.
                </div>
            )}
            {!fullyLocked && lockedCount > 0 && (
                <div className="bg-paper-2 border border-line rounded-md px-4 py-2.5 text-[12.5px] text-ink-2">
                    {lockedCount} of {rows.length} already marked and sealed · {open.length} still to mark.
                </div>
            )}

            <Card title={`Teacher attendance — ${date(day)}`}
                  hint={sheet.data?.isSunday
                      ? 'Sunday — weekly off, paid automatically'
                      : 'everyone defaults to Present · change only the exceptions · LT = late (paid, counted against the allowance) · HO = school holiday (paid)'}>
                <Async query={sheet}>
                    {(d) => (
                        <Table head={['Teacher', 'Designation', { label: 'Code', align: 'right' }, 'Mark']}
                               isEmpty={!d.rows.length} empty="No active teachers" minWidth={560}>
                            {d.rows.map((r) => (
                                // A Sunday is greyed and locked. There is nothing to decide —
                                // it is paid either way — and leaving it clickable only invites
                                // somebody to mark the staff Present on their day off.
                                <Tr key={r.teacher} className={d.isSunday || r.locked ? 'opacity-60' : undefined}>
                                    <Td className="font-semibold whitespace-nowrap">{r.name}</Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3">{r.designation || '—'}</Td>
                                    <Td align="right" className="text-ink-3">{r.employeeCode}</Td>
                                    <Td>
                                        {d.isSunday ? (
                                            <span className="text-[11.5px] font-mono font-semibold text-ink-3">
                                                Weekly off — paid
                                            </span>
                                        ) : r.locked ? (
                                            /* Sealed. Shown as what it IS, not as a row of dead
                                               buttons — a disabled button invites a click and then
                                               explains nothing. */
                                            <LockedMark status={r.status} at={r.markedAt} />
                                        ) : (
                                            <div className="flex border border-line-2 rounded-md overflow-hidden w-max">
                                                {STATUSES.map((s) => (
                                                    <button
                                                        key={s.key}
                                                        onClick={() => setMarks({ ...marks, [r.teacher]: s.key })}
                                                        title={s.key}
                                                        className={cx(
                                                            'px-3 py-1 text-[11.5px] font-mono font-semibold border-r border-line-2 last:border-r-0',
                                                            marks[r.teacher] === s.key ? s.tone : 'bg-paper-2 text-ink-2 hover:bg-white'
                                                        )}
                                                    >
                                                        {s.short}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </Td>
                                </Tr>
                            ))}
                        </Table>
                    )}
                </Async>
            </Card>
        </>
    );
}

function TeacherMonthly({ month }) {
    const grid = useTeacherGrid(month);
    const cellTone = {
        Present: 'bg-good-bg text-good',
        Late: 'bg-brand-soft text-brand',
        Absent: 'bg-crit-bg text-crit',
        HalfDay: 'bg-warn-bg text-warn',
        Leave: 'bg-line text-ink-2',
        Holiday: 'bg-paper-2 text-ink-3',
    };

    return (
        <Card title={`${monthLabel(month)} — monthly grid`}
              hint="P present · LT late · A absent · H half · L leave · HO holiday · grey = Sunday">
            <Async query={grid}>
                {(g) => (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-[12px]" style={{ minWidth: 900 }}>
                            <thead>
                                <tr>
                                    <th className="sticky left-0 bg-paper-2 text-left px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-ink-3 border-b border-line">Teacher</th>
                                    {Array.from({ length: g.totalDays || 31 }, (_, i) => (
                                        <th key={i}
                                            className={cx('px-1 py-2 text-center font-mono text-[10px] border-b border-line',
                                                          (g.sundays || []).includes(i + 1) ? 'bg-paper-2 text-ink-3/60' : 'text-ink-3')}>
                                            {i + 1}
                                        </th>
                                    ))}
                                    <th className="px-2 py-2 text-right font-mono text-[10px] uppercase text-ink-3 border-b border-line">P</th>
                                    <th className="px-2 py-2 text-right font-mono text-[10px] uppercase text-ink-3 border-b border-line">LT</th>
                                    <th className="px-2 py-2 text-right font-mono text-[10px] uppercase text-ink-3 border-b border-line">A</th>
                                </tr>
                            </thead>
                            <tbody>
                                {g.rows.map((r) => (
                                    <tr key={r.teacher} className="border-b border-line last:border-0">
                                        <td className="sticky left-0 bg-white px-4 py-1.5 font-semibold whitespace-nowrap">{r.name}</td>
                                        {Array.from({ length: g.totalDays || 31 }, (_, i) => {
                                            const sunday = (g.sundays || []).includes(i + 1);
                                            const s = r.days[i + 1];
                                            return (
                                                <td key={i} className={cx('px-1 py-1.5 text-center', sunday && 'bg-paper-2')}>
                                                    <span className={cx(// Wide enough for the two-character codes (LT, HO) without wrapping
                                                                        'inline-block w-[23px] h-[19px] leading-[19px] rounded font-mono text-[10px] font-semibold',
                                                                        // Sunday reads as a weekly off whatever the row says
                                                                        sunday ? 'bg-line text-ink-3/70'
                                                                               : (s ? cellTone[s] || 'bg-paper-2 text-ink-3' : 'bg-paper-2 text-ink-3'))}
                                                          title={sunday ? 'Sunday — weekly off, paid' : s || 'not marked'}>
                                                        {sunday ? 'S' : (s ? SHORT[s] || s[0] : '·')}
                                                    </span>
                                                </td>
                                            );
                                        })}
                                        <td className="px-2 py-1.5 text-right tnum font-semibold">{r.present}</td>
                                        <td className="px-2 py-1.5 text-right tnum">{r.late || 0}</td>
                                        <td className="px-2 py-1.5 text-right tnum">{r.absent}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {!g.rows.length && <EmptyState>No attendance marked this month</EmptyState>}
                    </div>
                )}
            </Async>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Class attendance — totals only. Per-student rows are deliberately absent
// (the client's requirement, and it saves 400 students x 220 days = 88,000
// rows a year, which matters directly on M0's storage).
// ---------------------------------------------------------------------------
function ClassDaily() {
    const [day, setDay] = useState(toInputDate(new Date()));
    const sheet = useClassSheet(day);
    const mark = useMarkClasses();
    const [present, setPresent] = useState({});

    useEffect(() => {
        if (!sheet.data) return;
        // A sealed class keeps the figure it was saved with. An open one opens on
        // full attendance, because in most classes on most days that is the answer
        // and the work is correcting the exceptions.
        setPresent(Object.fromEntries(
            sheet.data.rows.map((r) => [r.class, r.locked ? r.present : (r.present ?? r.totalStudents)])
        ));
    }, [sheet.data]);

    const rows = sheet.data?.rows || [];
    const open = rows.filter((r) => !r.locked);
    const lockedCount = rows.length - open.length;
    const fullyLocked = rows.length > 0 && open.length === 0;

    // What the day will read once this sheet is saved: sealed classes at their
    // stored figure, open ones at whatever is typed in them right now. (The
    // REPORT's totals count only what is actually marked — that lives on the
    // server, where an unmarked class used to be counted as fully absent.)
    const totals = rows.reduce((a, r) => ({
        roll: a.roll + r.totalStudents,
        present: a.present + (Number(present[r.class]) || 0),
    }), { roll: 0, present: 0 });

    return (
        <>
            <Toolbar>
                <Input type="date" className="w-auto" value={day} onChange={(e) => setDay(e.target.value)} />
                <Spacer />
                <span className="tb-wide text-[12.5px] text-ink-2">
                    Roll <b>{totals.roll}</b> · Present <b>{totals.present}</b> ·
                    <b> {totals.roll ? Math.round((totals.present / totals.roll) * 1000) / 10 : 0}%</b>
                    {lockedCount < rows.length && (
                        <span className="text-ink-3"> · {lockedCount} of {rows.length} classes marked</span>
                    )}
                </span>
                <Can perm="attendance.class.mark">
                    <Button variant="primary" loading={mark.isPending}
                            disabled={fullyLocked || !open.length}
                            title={fullyLocked ? 'This day is already marked and cannot be changed' : undefined}
                            onClick={() => mark.mutate({
                                date: day,
                                // Sealed classes are left out — the server refuses them
                                // anyway, and sending them would make every save report
                                // a pile of "already locked".
                                entries: open.map((r) => ({ class: r.class, present: Number(present[r.class]) || 0 })),
                            })}>
                        {fullyLocked ? 'Marked' : open.length < rows.length ? `Save ${open.length} remaining` : 'Save'}
                    </Button>
                </Can>
            </Toolbar>

            {fullyLocked && (
                <div className="bg-paper-2 border border-line rounded-md px-4 py-2.5 text-[12.5px] text-ink-2">
                    <b className="text-ink">This day is marked and sealed.</b> Class attendance cannot be
                    changed once saved — it is the figure quoted in inspections.
                </div>
            )}

            <Card title={`Class attendance — ${date(day)}`} hint="totals only, not per student">
                <Async query={sheet}>
                    {(d) => (
                        <Table head={['Class', { label: 'Roll strength', align: 'right' }, { label: 'Present', align: 'right' },
                                      { label: 'Absent', align: 'right' }, { label: '%', align: 'right' }]}
                               isEmpty={!d.rows.length} empty="No classes" minWidth={520}>
                            {d.rows.map((r) => {
                                const p = Number(present[r.class]) || 0;
                                const over = p > r.totalStudents;
                                return (
                                    <Tr key={r.class} className={r.locked ? 'opacity-60' : undefined}>
                                        <Td className="font-semibold whitespace-nowrap">{r.className}</Td>
                                        <Td align="right">{r.totalStudents}</Td>
                                        <Td align="right">
                                            {r.locked ? (
                                                <LockedMark status={`${r.present} present`} at={r.markedAt} />
                                            ) : (
                                                <Input className="w-20 py-1 text-right text-[12px]" inputMode="numeric"
                                                       error={over} value={present[r.class] ?? ''}
                                                       onChange={(e) => setPresent({ ...present, [r.class]: e.target.value })} />
                                            )}
                                        </Td>
                                        <Td align="right" className={over ? 'text-crit' : ''}>
                                            {over ? 'more than roll' : r.totalStudents - p}
                                        </Td>
                                        <Td align="right">{r.totalStudents ? percent((p / r.totalStudents) * 100) : '—'}</Td>
                                    </Tr>
                                );
                            })}
                        </Table>
                    )}
                </Async>
            </Card>
        </>
    );
}

function ClassMonthly({ month }) {
    const data = useClassMonthly(month);
    return (
        <Card title={`${monthLabel(month)} — class attendance`} hint="this is the figure asked for in inspections">
            <Async query={data}>
                {(d) => (
                    <Table head={['Class', { label: 'Days marked', align: 'right' }, { label: 'Avg present', align: 'right' },
                                  { label: 'Avg absent', align: 'right' }, { label: 'Attendance', align: 'right' }]}
                           isEmpty={!d.classes.length} empty="No attendance marked this month" minWidth={560}>
                        {d.classes.map((c) => (
                            <Tr key={c.classId}>
                                <Td className="font-semibold whitespace-nowrap">{c.className}</Td>
                                <Td align="right">{c.daysMarked}</Td>
                                <Td align="right">{c.avgPresent}</Td>
                                <Td align="right">{c.avgAbsent}</Td>
                                <Td align="right">
                                    <span className="inline-flex items-center gap-2 justify-end">
                                        <span className="tnum text-[12px] text-ink-2 w-11 text-right">{c.percent}%</span>
                                        <Meter value={c.percent} tone={c.percent < 75 ? 'crit' : c.percent < 85 ? 'warn' : 'brand'} />
                                    </span>
                                </Td>
                            </Tr>
                        ))}
                        {d.classes.length > 0 && (
                            <Tr className="bg-paper-2">
                                <Td className="font-semibold">School average</Td>
                                <Td align="right">—</Td><Td align="right">—</Td><Td align="right">—</Td>
                                <Td align="right" className="font-semibold">{d.school.percent}%</Td>
                            </Tr>
                        )}
                    </Table>
                )}
            </Async>
        </Card>
    );
}

export default function Attendance() {
    const session = useActiveSession();
    const [tab, setTab] = useState('teachers');
    const [month, setMonth] = useState(currentMonthKey());
    const can = useAuth((s) => s.can);

    // Every month of the session, not just the billable ones — school runs in
    // months no fee is raised in, and the register has to be readable for them.
    const months = monthOptions([
        ...new Set([...sessionMonths(session.data?.name), currentMonthKey(), month]),
    ]);

    const tabs = [
        { value: 'teachers', label: 'Teachers — daily' },
        { value: 'tgrid', label: 'Teachers — monthly' },
        ...(can('attendance.class.view') ? [
            { value: 'classes', label: 'Classes — daily' },
            { value: 'cmonth', label: 'Classes — monthly' },
        ] : []),
    ];

    const monthly = tab === 'tgrid' || tab === 'cmonth';

    return (
        <>
            <PageTitle title="Attendance" sub={monthly ? monthLabel(month) : date(new Date())}>
                {monthly && (
                    <Select className="w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
                        {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </Select>
                )}
            </PageTitle>

            <Tabs tabs={tabs} value={tab} onChange={setTab} />

            {tab === 'teachers' && <TeacherDaily />}
            {tab === 'tgrid' && <TeacherMonthly month={month} />}
            {tab === 'classes' && <ClassDaily />}
            {tab === 'cmonth' && <ClassMonthly month={month} />}
        </>
    );
}
