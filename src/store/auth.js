import { create } from 'zustand';
import api, { setAccessToken, setAuthLostHandler, refreshSession } from '../lib/api';

// Auth and permissions. TanStack Query owns server state — this holds only
// what the whole app needs and what does not arrive with a request.
export const useAuth = create((set, get) => ({
    user: null,
    permissions: new Set(),
    // What this deployment supports. Image upload is optional — without
    // Cloudinary credentials the server reports uploads: false and the UI
    // leaves the upload box out rather than offering a button that fails.
    features: { uploads: false },
    // 'loading' -> a silent refresh is in flight (after a page reload).
    // Without it the app flashes the login screen for a moment.
    status: 'loading',

    can: (key) => {
        const { user, permissions } = get();
        if (!user) return false;
        // Admin is outside every check — exactly as on the backend
        if (user.role === 'Admin') return true;
        return permissions.has(key);
    },

    applySession: ({ user, permissions, accessToken, features }) => {
        if (accessToken) setAccessToken(accessToken);
        set({
            user,
            permissions: new Set(permissions || []),
            features: { uploads: false, ...(features || {}) },
            status: 'authed',
        });
    },

    login: async (username, password) => {
        const res = await api.post('/auth/login', { username, password });
        get().applySession(res.data.data);
        return res.data.data.user;
    },

    logout: async () => {
        try { await api.post('/auth/logout'); } catch { /* clear the local session even if the server is down */ }
        setAccessToken(null);
        set({ user: null, permissions: new Set(), features: { uploads: false }, status: 'anon' });
    },

    // On page load: try to restore the session from the refresh cookie
    bootstrap: async () => {
        try {
            await refreshSession();
            const me = await api.get('/auth/me');
            get().applySession(me.data.data);
        } catch {
            set({ user: null, permissions: new Set(), features: { uploads: false }, status: 'anon' });
        }
    },

    // When permissions change (an Admin flipped a switch) — without re-login
    reloadPermissions: async () => {
        const me = await api.get('/auth/me');
        set({
            permissions: new Set(me.data.data.permissions || []),
            features: { uploads: false, ...(me.data.data.features || {}) },
        });
    },
}));

// Drop the app into the anon state on a 401 — api.js injects the handler
// to avoid a circular import.
setAuthLostHandler(() => {
    setAccessToken(null);
    useAuth.setState({
        user: null,
        permissions: new Set(),
        features: { uploads: false },
        status: 'anon',
    });
});
