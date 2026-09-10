import { useState } from 'react';
import { useAudit, useUsers } from '../hooks/queries';
import { date, time } from '../lib/format';
import {
    Card, Table, Tr, Td, Button, Input, Select, Toolbar, Spacer, Async, PageTitle, Pagination,
} from '../components/ui';
import { ChangeLines } from '../components/History';
import { useAuth } from '../store/auth';

// ---------------------------------------------------------------------------
// ACTIVITY — who changed what.
//
// The AuditLog collection has always been written to. Nothing could read it:
// there was no route, so the trail existed and no one could see it. This is
// the other half.
//
// Every mutation in the app writes here — 51 actions across every module — and
// an edit carries the before and after of the fields that actually moved. A
// save that changed nothing writes no row, which is what keeps this screen
// worth opening.
//
// Nothing on it can edit or delete a row, and there is no API that could. A
// trail somebody can tidy up is not a trail.
// ---------------------------------------------------------------------------
const ENTITIES = [
    'Student', 'Teacher', 'SchoolClass', 'Lead', 'StockItem', 'StockSale',
    'Vendor', 'Purchase', 'VendorPayment', 'Expense', 'ExpenseCategory',
    'FeeDemand', 'Transaction', 'SalarySlip', 'TeacherAttendance',
    'ClassAttendance', 'AcademicSession', 'User', 'RolePermission',
];

// The action filter is a PREFIX on the backend, so 'fee' brings back
// fee.collect, fee.discount, fee.generate and fee.void together. That matches
// how somebody actually looks: "show me what happened to fees".
const MODULES = [
    'student', 'teacher', 'fee', 'sale', 'stock', 'purchase', 'vendor',
    'expense', 'salary', 'lead', 'class', 'session', 'attendance', 'user', 'permission',
    // payment.verify / payment.unverify — who signed collected money off, and
    // who took a tick back off again.
    'payment',
];

function ActivityRow({ entry }) {
    const [open, setOpen] = useState(false);
    const hasDiff = Boolean(entry.before || entry.after);

    return (
        <>
            <Tr className={hasDiff ? 'cursor-pointer' : ''} onClick={() => hasDiff && setOpen((o) => !o)}>
                <Td className="font-mono text-[11.5px] text-ink-3 whitespace-nowrap">
                    {date(entry.createdAt)}<span className="block">{time(entry.createdAt)}</span>
                </Td>
                <Td className="whitespace-nowrap">
                    <b className="font-semibold">{entry.actorName || 'Unknown'}</b>
                    <span className="block text-[11.5px] text-ink-3">{entry.actorRole}</span>
                </Td>
                <Td>
                    <span className="font-mono text-[11px] text-brand whitespace-nowrap">{entry.action}</span>
                    <span className="block text-[11px] text-ink-3">{entry.entity}</span>
                </Td>
                <Td className="text-[12.5px] text-ink-2 break-words">
                    {entry.summary || '—'}
                    {hasDiff && (
                        <span className="block text-[11px] text-ink-3 mt-0.5">
                            {open ? '▾ hide before / after' : '▸ show before / after'}
                        </span>
                    )}
                </Td>
            </Tr>
            {open && hasDiff && (
                <Tr>
                    <Td colSpan={4} className="bg-paper-2">
                        <ChangeLines before={entry.before} after={entry.after} />
                    </Td>
                </Tr>
            )}
        </>
    );
}

export default function Activity() {
    // `audit.view` is grantable, so a Principal can be given this screen. The
    // user list behind the "who" filter is NOT grantable — /users is adminOnly —
    // so for anyone else the query is skipped and the filter is left out
    // entirely, rather than shown permanently empty behind a 403.
    const isAdmin = useAuth((s) => s.user?.role) === 'Admin';
    const users = useUsers({ enabled: isAdmin });
    const [filters, setFilters] = useState({ entity: '', action: '', actor: '', from: '', to: '' });
    const [page, setPage] = useState(1);

    // Any filter change goes back to page 1 — otherwise a narrower filter can
    // land on a page that no longer exists and the screen looks empty.
    const set = (k) => (e) => { setFilters({ ...filters, [k]: e.target.value }); setPage(1); };

    const history = useAudit({ ...filters, page, limit: 50 });
    const clear = () => { setFilters({ entity: '', action: '', actor: '', from: '', to: '' }); setPage(1); };
    const filtered = Object.values(filters).some(Boolean);

    return (
        <>
            <PageTitle title="Activity" sub="who changed what" />

            <Toolbar>
                <Select className="w-auto" value={filters.action} onChange={set('action')}>
                    <option value="">All modules</option>
                    {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
                <Select className="w-auto" value={filters.entity} onChange={set('entity')}>
                    <option value="">All records</option>
                    {ENTITIES.map((x) => <option key={x} value={x}>{x}</option>)}
                </Select>
                {isAdmin && (
                    <Select className="w-auto" value={filters.actor} onChange={set('actor')}>
                        <option value="">Anyone</option>
                        {users.data?.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                    </Select>
                )}
                <Input type="date" className="w-auto" value={filters.from} onChange={set('from')} title="From" />
                <Input type="date" className="w-auto" value={filters.to} onChange={set('to')} title="To" />
                <Spacer />
                {filtered && <Button onClick={clear}>Clear</Button>}
            </Toolbar>

            <Card title="Activity" hint="read-only · nothing here can be edited or deleted">
                <Async query={history}>
                    {(d) => (
                        <>
                            <Table
                                head={['When', 'Who', 'What', { label: 'Details', primary: true }]}
                                isEmpty={!d.items.length}
                                empty={filtered ? 'Nothing matches these filters' : 'Nothing has been changed yet'}
                                minWidth={720}
                            >
                                {d.items.map((entry) => <ActivityRow key={entry._id} entry={entry} />)}
                            </Table>

                            <div className="px-4 border-t border-line">
                                <Pagination pagination={d.pagination} onChange={setPage} />
                            </div>
                        </>
                    )}
                </Async>
            </Card>

            <Card title="What is recorded" hint="and what is not">
                <div className="p-4 text-[12.5px] text-ink-2 flex flex-col gap-2">
                    <p>
                        Every change lands here — a new student, a fee collected, a discount, a void,
                        a salary revision, a permission switch. An edit carries the <b>before and after</b>
                        {' '}of the fields that actually moved.
                    </p>
                    <p>
                        A save that changed nothing writes no row. Passwords are never recorded — only
                        that one was changed, by whom and when.
                    </p>
                    <p className="text-ink-3">
                        Reads are not logged. The question is always "who gave this discount", never
                        "who looked at this list" — and logging every screen open would fill the
                        database for nothing.
                    </p>
                </div>
            </Card>
        </>
    );
}
