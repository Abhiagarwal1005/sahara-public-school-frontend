import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { Card } from './ui';

// ---------------------------------------------------------------------------
// UI-level permission gate.
//
// This is NOT security — the server checks every request independently.
// It is UX: don't show buttons that would only return a 403.
// ---------------------------------------------------------------------------
export function Can({ perm, any, children, fallback = null }) {
    const can = useAuth((s) => s.can);
    const allowed = any ? any.some(can) : can(perm);
    return allowed ? children : fallback;
}

export function RequireAuth({ children }) {
    const status = useAuth((s) => s.status);
    const user = useAuth((s) => s.user);
    const location = useLocation();

    // After a page reload a silent refresh is in flight. Without this the app
    // would flash the login screen for a moment — visible on every refresh,
    // and it looks terrible.
    if (status === 'loading') {
        return (
            <div className="min-h-screen grid place-items-center">
                <div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            </div>
        );
    }

    if (status !== 'authed') return <Navigate to="/login" state={{ from: location }} replace />;

    // Until the temporary password is changed the backend returns 403
    // 403 (MUST_CHANGE_PASSWORD) on every protected route. Without this guard the user gets
    // trapped inside the app — every screen shows an error and there is no
    // way out. So send them to login, which shows the change-password form.
    if (user?.mustChangePassword) return <Navigate to="/login" replace />;

    return children;
}

// Route-level gate. A clear message rather than a blank screen — otherwise
// the user assumes the app is broken.
export function RequirePermission({ perm, any, children }) {
    const can = useAuth((s) => s.can);
    const allowed = any ? any.some(can) : can(perm);

    if (!allowed) {
        return (
            <Card className="max-w-lg mx-auto mt-10">
                <div className="px-6 py-10 text-center">
                    <p className="text-[14px] font-semibold mb-1.5">You don't have access to this screen</p>
                    <p className="text-[12.5px] text-ink-3">
                        Ask an Admin to grant your role this permission — Settings → Roles &amp; Permissions.
                    </p>
                </div>
            </Card>
        );
    }
    return children;
}
