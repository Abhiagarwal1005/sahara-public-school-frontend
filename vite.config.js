import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The API's location lives in ONE file — see deploy.config.js. No URL is
// written here, so this file never needs touching when the API moves.
import { API_DEV } from './deploy.config.js';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        // Bind on the LAN too, so the app can be opened on a real phone on the
        // same wifi (http://<your-mac-ip>:5173). Testing touch targets and the
        // iOS keyboard in a desktop browser's device mode only gets you so far.
        host: true,
        // In development the API is proxied onto the same origin. That gives the
        // same behaviour as production (frontend + API in one Vercel project) —
        // the cookie stays first-party and there is no CORS preflight before
        // every request.
        proxy: {
            // Goes to the LOCAL backend, so `npm run dev` tests the code in
            // this working tree. This used to point at the deployed API, which
            // meant local development silently read and WROTE the live school's
            // database — and a local backend change could never be tested at all.
            //
            // To aim a dev session at a deployed API on purpose (checking a UI
            // change against real data, say), override it for that run rather
            // than editing anything:
            //   VITE_PROXY_TARGET=https://your-api.vercel.app npm run dev
            '/api': {
                target: process.env.VITE_PROXY_TARGET || API_DEV,
                changeOrigin: true,
            },
        },
    },
    build: {
        // Route-level code splitting comes from the Router itself; this keeps the
        // large vendor chunks separate so changing app code does not invalidate
        // invalidate the cached React/Query bundle.
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ['react', 'react-dom', 'react-router-dom'],
                    query: ['@tanstack/react-query', 'axios'],
                },
            },
        },
    },
});
