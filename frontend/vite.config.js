import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    // Prefer JSX source files in this JavaScript project.
    extensions: ['.mjs', '.jsx', '.js', '.json'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/devices': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
});
