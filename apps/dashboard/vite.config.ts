import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/leads': 'http://127.0.0.1:51900', '/jobs': 'http://127.0.0.1:51900' } },
  build: { outDir: 'dist' },
});
