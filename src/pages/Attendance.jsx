import { useEffect, useState } from 'react';
import {
    useTeacherSheet, useMarkTeachers, useTeacherGrid,
    useClassSheet, useMarkClasses, useClassMonthly, useActiveSession,
} from '../hooks/queries';
import { date, toInputDate, monthLabel, currentMonthKey, monthOptions, percent } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Select, Toolbar, Spacer, Meter,
    Async, PageTitle, Tabs, EmptyState, cx,
} from '../components/ui';
import { Can } from '../components/Can';
import { useAuth } from '../store/auth';

const STATUSES = [
    { key: 'Present', short: 'P', tone: 'bg-brand text-white border-brand' },
    { key: 'Absent', short: 'A', tone: 'bg-crit text-white border-crit' },
    { key: 'HalfDay', short: 'H', tone: 'bg-warn text-white border-warn' },
    { key: 'Leave', short: 'L', tone: 'bg-ink-3 text-white border-ink-3' },
];

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
                    Present <b>{counts.Present || 0}</b> · Absent <b>{counts.Absent || 0}</b> ·
                    Half <b>{counts.HalfDay || 0}</b> · Leave <b>{counts.Leave || 0}</b>
                </span>
                <Can perm="attendance.teacher.mark">
                    <Button variant="primary" loading={mark.isPending} disabled={sheet.data?.isSunday}
                            onClick={() => mark.mutate({
                                date: day,
                                entries: Object.entries(marks).map(([teacher, status]) => ({ teacher, status })),
                            })}>
                        Save sheet
                    </Button>
                </Can>
            </Toolbar>

            <Card title={`Teacher attendance — ${date(day)}`}
                  hint={sheet.data?.isSunday
                      ? 'Sunday — weekly off, paid automatically'
                      : 'everyone defaults to Present · change only the exceptions'}>
                <Async query={sheet}>
                    {(d) => (
                        <Table head={['Teacher', 'Designation', { label: 'Code', align: 'right' }, 'Mark']}
                               isEmpty={!d.rows.length} empty="No active teachers" minWidth={560}>
                            {d.rows.map((r) => (
                                // A Sunday is greyed and locked. There is nothing to decide —
                                // it is paid either way — and leaving it clickable only invites
                                // somebody to mark the staff Present on their day off.
                                <Tr key={r.teacher} className={d.isSunday ? 'opacity-50' : undefined}>
                                    <Td className="font-semibold whitespace-nowrap">{r.name}</Td>
                                    <Td className="font-mono text-[11.5px] text-ink-3">{r.designation || '—'}</Td>
                                    <Td align="right" className="text-ink-3">{r.employeeCode}</Td>
                                    <Td>
                                        {d.isSunday ? (
                                            <span className="text-[11.5px] font-mono font-semibold text-ink-3">
                                                Weekly off — paid
                                            </span>
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
    const cellTone = { Present: 'bg-good-bg text-good', Absent: 'bg-crit-bg text-crit', HalfDay: 'bg-warn-bg text-warn' };

    return (
        <Card title={`${monthLabel(month)} — monthly grid`} hint="P present · A absent · H half · grey = Sunday">
            <Async query={grid}>
                {(g) => (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-[12px]" style={{ minWidth: 820 }}>
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
                                                    <span className={cx('inline-block w-[19px] h-[19px] leading-[19px] rounded font-mono text-[10px] font-semibold',
                                                                        // Sunday reads as a weekly off whatever the row says
                                                                        sunday ? 'bg-line text-ink-3/70'
                                                                               : (s ? cellTone[s] || 'bg-paper-2 text-ink-3' : 'bg-paper-2 text-ink-3'))}
                                                          title={sunday ? 'Sunday — weekly off, paid' : s || 'not marked'}>
                                                        {sunday ? 'S' : (s ? s[0] : '·')}
                                                    </span>
                                                </td>
                                            );
                                        })}
                                        <td className="px-2 py-1.5 text-right tnum font-semibold">{r.present}</td>
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
        if (sheet.data) {
            setPresent(Object.fromEntries(sheet.data.rows.map((r) => [r.class, r.present ?? r.totalStudents])));
        }
    }, [sheet.data]);

    const rows = sheet.data?.rows || [];
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
                </span>
                <Can perm="attendance.class.mark">
                    <Button variant="primary" loading={mark.isPending}
                            onClick={() => mark.mutate({
                                date: day,
                                entries: rows.map((r) => ({ class: r.class, present: Number(present[r.class]) || 0 })),
                            })}>
                        Save
                    </Button>
                </Can>
            </Toolbar>

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
                                    <Tr key={r.class}>
                                        <Td className="font-semibold whitespace-nowrap">{r.className}</Td>
                                        <Td align="right">{r.totalStudents}</Td>
                                        <Td align="right">
                                            <Input className="w-20 py-1 text-right text-[12px]" inputMode="numeric"
                                                   error={over} value={present[r.class] ?? ''}
                                                   onChange={(e) => setPresent({ ...present, [r.class]: e.target.value })} />
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

    const months = monthOptions(session.data?.feeMonths?.length ? session.data.feeMonths : [currentMonthKey()]);

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
