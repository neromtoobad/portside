import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, /api goes to a local keeper, or to the live one with PORTSIDE_API=https://portside.nerom.site.
const api = process.env.PORTSIDE_API ?? 'http://127.0.0.1:8790';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: api, changeOrigin: true } } },
  build: { target: 'es2022' },
});
