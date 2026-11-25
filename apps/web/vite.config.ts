import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  envDir: '../..',
  server: {
    port: Number(process.env.WEB_PORT || 5173),
    strictPort: true,
    proxy: {
      '/api': { target: process.env.API_PROXY || 'http://127.0.0.1:3001' },
      '/health': { target: process.env.API_PROXY || 'http://127.0.0.1:3001' },
    },
  },
});
