import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import api from '../lib/api';
import { Button, Input, Field } from '../components/ui';
import { toast } from '../components/Toast';

export default function Login() {
    const { status, user, login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [form, setForm] = useState({ username: '', password: '' });
    const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // ---------------------------------------------------------------------
    // This flag comes from the STORE, not local state — and it is the most
    // important detail on this screen.
    //
    // It used to come from a local `mustChange` state, which created a race:
    // login() sets status='authed' in the store, Login re-renders immediately,
    // and on that render the local flag was still false — so the <Navigate>
    // below fired and the user landed on the dashboard, where every API call
    // returned 403 (MUST_CHANGE_PASSWORD). Reading from the store removes the
    // race entirely.
    // ---------------------------------------------------------------------
    const mustChange = status === 'authed' && Boolean(user?.mustChangePassword);

    if (status === 'authed' && !mustChange) {
        return <Navigate to={location.state?.from?.pathname || '/'} replace />;
    }

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setError('');
        try {
            const u = await login(form.username.trim(), form.password);
            if (u.mustChangePassword) {
                // Carry the temporary password into the next form,
                // so the user does not have to type it again.
                setPw((p) => ({ ...p, current: form.password }));
            } else {
                navigate(location.state?.from?.pathname || '/', { replace: true });
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const changePassword = async (e) => {
        e.preventDefault();
        if (!pw.current) return setError('Enter your current (temporary) password');
        if (pw.next !== pw.confirm) return setError('The two new passwords do not match');
        if (pw.next.length < 8) return setError('Password must be at least 8 characters');
        if (pw.next === pw.current) return setError('The new password must be different from the current one');

        setBusy(true); setError('');
        try {
            await api.post('/auth/change-password', {
                currentPassword: pw.current,
                newPassword: pw.next,
            });

            // The backend revokes every refresh token on a password change
            // (if somebody changed their password out of suspicion, leaving old
            // sessions alive defeats the point). So sign in again with the new one.
            //
            // login() calls applySession() itself — user, permissions and token are
            // all set. There used to be a second applySession({ permissions: [] })
            // call here, which emptied the permissions and made the whole menu
            // disappear.
            await login(user?.username || form.username.trim(), pw.next);

            toast.ok('Password changed');
            navigate('/', { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen grid place-items-center bg-paper px-4 py-8">
            <div className="w-full max-w-[370px] bg-white border border-line rounded-xl shadow-card p-7">
                <div className="w-11 h-11 rounded-xl bg-brand text-white grid place-items-center font-bold font-mono mb-4">
                    SPS
                </div>

                {!mustChange ? (
                    <>
                        <h1 className="text-[19px] font-semibold">Sahara Public School</h1>
                        <p className="text-[13px] text-ink-3 mt-1 mb-5">Sign in to continue</p>

                        <form onSubmit={submit} className="flex flex-col gap-3">
                            <Field label="Username">
                                <Input value={form.username} autoFocus autoComplete="username"
                                       onChange={(e) => setForm({ ...form, username: e.target.value })} />
                            </Field>
                            <Field label="Password">
                                <Input type="password" value={form.password} autoComplete="current-password"
                                       onChange={(e) => setForm({ ...form, password: e.target.value })} />
                            </Field>

                            {error && <p className="text-[12px] text-crit">{error}</p>}

                            <Button variant="primary" type="submit" loading={busy} className="w-full mt-1">
                                Sign in
                            </Button>
                        </form>

                        <p className="text-[11.5px] text-ink-3 mt-4 text-center">
                            If this is your first sign-in you will be asked to change your password.
                        </p>
                    </>
                ) : (
                    <>
                        <h1 className="text-[19px] font-semibold">Set a new password</h1>
                        <p className="text-[13px] text-ink-3 mt-1 mb-5">
                            {user?.name} — the temporary password only works once.
                        </p>

                        <form onSubmit={changePassword} className="flex flex-col gap-3">
                            {/* A page refresh loses the temporary password from memory, so this
                                field is always present — pre-filled when known, empty when not.
                                */}
                            <Field label="Temporary password">
                                <Input type="password" value={pw.current} autoComplete="current-password"
                                       onChange={(e) => setPw({ ...pw, current: e.target.value })} />
                            </Field>
                            <Field label="New password" hint="At least 8 characters">
                                <Input type="password" value={pw.next} autoFocus autoComplete="new-password"
                                       onChange={(e) => setPw({ ...pw, next: e.target.value })} />
                            </Field>
                            <Field label="Confirm password">
                                <Input type="password" value={pw.confirm} autoComplete="new-password"
                                       onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
                            </Field>

                            {error && <p className="text-[12px] text-crit">{error}</p>}

                            <Button variant="primary" type="submit" loading={busy} className="w-full mt-1">
                                Change password and continue
                            </Button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}
