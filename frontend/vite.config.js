import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
// HireTrack dev server. The `/api` proxy forwards to the Django backend on
// :8000 so cookies / HTTP Basic auth work same-origin during development
// (no CORS preflight, credentials flow cleanly).
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
        strictPort: true,
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                secure: false,
            },
        },
    },
});
