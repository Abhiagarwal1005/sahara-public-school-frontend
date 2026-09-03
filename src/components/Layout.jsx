import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { cx } from './ui';

const Icon = ({ d, children }) => (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children || <path d={d} />}
    </svg>
);

// ---------------------------------------------------------------------------
// The menu is permission-driven, not role-driven.
//
// This is what ties the whole design together: when the Admin flips a
// switch in Settings this menu changes by itself — there is no hardcoded
// list of roles anywhere. Each item asks for the same capability the
// backend route asks for.
// ---------------------------------------------------------------------------
const NAV = [
    { to: '/', label: 'Dashboard', perm: 'report.dashboard', end: true,
      icon: <><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" /><rect x="9" y="1.5" width="5.5" height="5.5" rx="1" /><rect x="1.5" y="9" width="5.5" height="5.5" rx="1" /><rect x="9" y="9" width="5.5" height="5.5" rx="1" /></> },
    { to: '/students', label: 'Students', perm: 'student.view',
      icon: <><circle cx="6" cy="5" r="2.6" /><path d="M1.6 14c0-2.6 2-4.2 4.4-4.2S10.4 11.4 10.4 14" /><path d="M11 3.2a2.5 2.5 0 010 4.6M12.2 13.4c0-2 .9-3 2.2-3.4" /></> },
    { to: '/fees', label: 'Fees', perm: 'fee.view',
      icon: <path d="M4 2.8h8M4 5.6h8M9.6 2.8c1.7 0 2.6 1 2.6 2.4S11.3 8 9.6 8H4l6 5.2" /> },
    { to: '/stock', label: 'Stock & Sales', perm: 'stock.view',
      icon: <><path d="M2 5.2L8 2.2l6 3v5.6l-6 3-6-3z" /><path d="M2 5.2l6 3 6-3M8 8.2v5.6" /></> },
    { to: '/purchases', label: 'Purchases', perm: 'purchase.view',
      icon: <><path d="M1.6 3.4h8.2v7.2H1.6z" /><path d="M9.8 6.2h2.6l2 2.2v2.2H9.8z" /><circle cx="4.4" cy="12.4" r="1.5" /><circle cx="11.6" cy="12.4" r="1.5" /></> },
    { to: '/attendance', label: 'Attendance', perm: 'attendance.teacher.view',
      icon: <><rect x="1.8" y="2.8" width="12.4" height="11.4" rx="1.4" /><path d="M1.8 6.4h12.4M5 1.6v2.4M11 1.6v2.4M5.6 10l1.6 1.6 3-3.2" /></> },
    { to: '/teachers', label: 'Teachers', perm: 'teacher.view',
      icon: <><circle cx="8" cy="4.6" r="2.6" /><path d="M2.6 14c0-3 2.4-4.8 5.4-4.8s5.4 1.8 5.4 4.8" /></> },
    { to: '/salary', label: 'Salary', perm: 'salary.view',
      icon: <><rect x="1.6" y="4" width="12.8" height="8.6" rx="1.4" /><circle cx="8" cy="8.3" r="2" /></> },
    { to: '/expenses', label: 'Expenses', perm: 'expense.view',
      icon: <><path d="M3.2 1.8h9.6v12.4l-2-1.2-1.6 1.2-1.6-1.2-1.6 1.2-1.6-1.2-1.2.9z" /><path d="M5.6 5.2h4.8M5.6 8h4.8" /></> },
    { to: '/reports', label: 'Reports', perm: 'report.daybook',
      icon: <><path d="M2 13.4h12" /><rect x="3" y="7.6" width="2.6" height="4" /><rect x="6.8" y="4.4" width="2.6" height="7.2" /><rect x="10.6" y="2.2" width="2.6" height="9.4" /></> },
    { to: '/settings', label: 'Settings', adminOnly: true,
      icon: <><circle cx="8" cy="8" r="2.2" /><path d="M8 1.4v1.8M8 12.8v1.8M14.6 8h-1.8M3.2 8H1.4M12.7 3.3l-1.3 1.3M4.6 11.4l-1.3 1.3M12.7 12.7l-1.3-1.3M4.6 4.6L3.3 3.3" /></> },
];

export function Layout() {
    const { user, can, logout } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    const items = NAV.filter((n) => (n.adminOnly ? user?.role === 'Admin' : can(n.perm)));

    const doLogout = async () => { await logout(); navigate('/login', { replace: true }); };

    return (
        <div className="min-h-screen lg:grid lg:grid-cols-[214px_minmax(0,1fr)]">
            {/* ---- sidebar ---- */}
            {/* Backdrop — tap outside the drawer to close it on a phone */}
            {open && (
                <button
                    aria-label="Close menu"
                    onClick={() => setOpen(false)}
                    className="fixed inset-0 z-30 bg-black/40 lg:hidden"
                />
            )}

            <aside
                className={cx(
                    'bg-sidebar flex flex-col gap-1 py-4 no-print',
                    // On a phone this slides OVER the content rather than
                    // pushing it down — otherwise opening the menu made the page
                    // two screens tall and you had to scroll back up to close it.
                    'fixed inset-y-0 left-0 z-40 w-[264px] max-w-[82vw] overflow-y-auto',
                    'transition-transform duration-200 ease-out',
                    open ? 'translate-x-0' : '-translate-x-full',
                    'lg:static lg:translate-x-0 lg:w-auto lg:max-w-none',
                    'lg:sticky lg:top-0 lg:h-screen lg:z-auto'
                )}
            >
                <div className="flex items-center gap-2.5 px-4 pb-4">
                    <div className="w-8 h-8 rounded-lg bg-brand-2 text-sidebar grid place-items-center font-bold text-[13px] font-mono shrink-0">
                        SPS
                    </div>
                    <div className="min-w-0">
                        <b className="block text-[13px] font-semibold text-[#EAF2ED] leading-tight truncate">Sahara Public School</b>
                        <span className="block text-[11px] font-mono text-sidebar-ink2">{user?.role}</span>
                    </div>
                </div>

                <div className="px-4 pb-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-sidebar-ink2">Menu</div>

                <nav className="flex flex-col gap-px px-2">
                    {items.map((n) => (
                        <NavLink
                            key={n.to}
                            to={n.to}
                            end={n.end}
                            onClick={() => setOpen(false)}
                            className={({ isActive }) => cx(
                                'flex items-center gap-2.5 px-2.5 py-2.5 lg:py-2 rounded-md text-[14px] lg:text-[13.5px] transition-colors',
                                isActive
                                    ? 'bg-sidebar-sel text-[#EAF2ED] font-semibold'
                                    : 'text-sidebar-ink hover:bg-white/5 hover:text-[#EAF2ED]'
                            )}
                        >
                            <Icon>{n.icon}</Icon>
                            {n.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="mt-auto mx-2 pt-3.5 px-2 border-t border-white/10">
                    <p className="text-[11px] font-mono text-sidebar-ink2 leading-relaxed">
                        {user?.name}<br />{user?.username}
                    </p>
                    <button onClick={doLogout} className="mt-2 text-[12px] text-sidebar-ink hover:text-[#EAF2ED] underline underline-offset-2">
                        Logout
                    </button>
                </div>
            </aside>

            {/* ---- content ---- */}
            <div className="min-w-0 flex flex-col">
                <header className="lg:hidden sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-line no-print">
                    <button onClick={() => setOpen((o) => !o)} className="-ml-2 px-2 py-1.5 text-[14px] font-medium" aria-expanded={open}>
                        {open ? '✕ Close' : '☰ Menu'}
                    </button>
                    <span className="text-[12px] text-ink-3 font-mono">{user?.role}</span>
                </header>

                <main className="flex-1 p-4 sm:p-5 lg:p-6 flex flex-col gap-4 min-w-0">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
