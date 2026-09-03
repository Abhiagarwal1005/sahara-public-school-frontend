import axios from 'axios';

// ---------------------------------------------------------------------------
// One axios instance for the whole app.
//
// The access token lives in memory (NOT localStorage — XSS could steal it
// there). The refresh token is in an httpOnly cookie that JS cannot read.
// So a page reload loses the access token and the app recovers the session
// with a silent refresh.
// ---------------------------------------------------------------------------

const api = axios.create({
    baseURL: (import.meta.env.VITE_API_URL || '') + '/api/v1',
    // Required for the refresh cookie
    withCredentials: true,
    timeout: 20000,
});

let accessToken = null;
let onAuthLost = () => {};

export const setAccessToken = (token) => { accessToken = token; };
export const getAccessToken = () => accessToken;
export const setAuthLostHandler = (fn) => { onAuthLost = fn; };

api.interceptors.request.use((config) => {
    if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;

    // Khaali params bhejo hi mat. Screens filter state ko '' se initialise
    // state to '' ("all classes"), and axios turns that into `?class=`.
    // To the backend '' is a value, not a missing one — and it fails objectId
    // validation with a 400. Cleaning it here saves every list API from that
    // mistake.
    if (config.params) {
        config.params = Object.fromEntries(
            Object.entries(config.params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
        );
    }
    return config;
});

// ---------------------------------------------------------------------------
// The refresh queue — the detail most implementations get wrong.
//
// Opening the dashboard fires five requests at once. If the token has
// expired all five return 401. Without a queue all five would call refresh
// — and because the backend ROTATES the token on every refresh, the first
// would invalidate the other four. The result is random logouts that are
// impossible to debug.
//
// So the first 401 creates one refresh promise, the rest await it, and
// then each replays its own request.
// ---------------------------------------------------------------------------
let refreshPromise = null;

const refreshSession = async () => {
    if (!refreshPromise) {
        refreshPromise = api
            .post('/auth/refresh', null, { _skipRetry: true })
            .then((res) => {
                const token = res.data?.data?.accessToken;
                setAccessToken(token);
                return token;
            })
            .finally(() => {
                // The reset matters — otherwise this would keep returning the old
                // (resolved) promise and the token would never refresh again.
                refreshPromise = null;
            });
    }
    return refreshPromise;
};

api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const { config, response } = error;

        if (!response || !config) return Promise.reject(normalise(error));

        const code = response.data?.code;
        const isExpired = response.status === 401 && (code === 'TOKEN_EXPIRED' || code === 'NO_TOKEN');

        // Never refresh on the refresh call's own 401 — that is an infinite loop
        if (isExpired && !config._retried && !config._skipRetry) {
            config._retried = true;
            try {
                await refreshSession();
                return api(config);
            } catch {
                onAuthLost();
                return Promise.reject(normalise(error));
            }
        }

        // The refresh itself failed, or the session is genuinely over
        if (response.status === 401 && !config._skipRetry) onAuthLost();

        return Promise.reject(normalise(error));
    }
);

// The backend always sends { success, message, errors, code }. Normalising
// it into a predictable shape means no screen writes its own error
// error handling na likhni pade.
function normalise(error) {
    const data = error.response?.data;
    const err = new Error(data?.message || error.message || 'Something went wrong');
    err.status = error.response?.status;
    err.code = data?.code;
    // Field-level errors -> { fieldName: message } so a form can apply them directly
    err.fields = (data?.errors || []).reduce((acc, e) => ({ ...acc, [e.field]: e.message }), {});
    return err;
}

export { refreshSession };
export default api;
