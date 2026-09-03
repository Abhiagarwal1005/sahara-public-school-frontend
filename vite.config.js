import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
            '/api': { target: 'http://localhost:8000', changeOrigin: true },
        },
    },
    build: {
        // Route-level code splitting comes from the Router itself; this keeps the
        // large vendor chunks separate so changing app code does not invalidate
        // cached React/Query bundle invalid na ho.
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
