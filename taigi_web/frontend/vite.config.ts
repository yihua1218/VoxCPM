import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://127.0.0.1:8876',
      '/api': 'http://127.0.0.1:8876',
      '/admin': 'http://127.0.0.1:8876',
      '/external': 'http://127.0.0.1:8876',
      '/jobs': 'http://127.0.0.1:8876',
      '/llm': 'http://127.0.0.1:8876',
      '/maintenance': 'http://127.0.0.1:8876',
      '/snapshots': 'http://127.0.0.1:8876',
      '/sources': 'http://127.0.0.1:8876',
      '/static-data': 'http://127.0.0.1:8876',
      '/stats': 'http://127.0.0.1:8876',
      '/words': 'http://127.0.0.1:8876',
    },
  },
});
