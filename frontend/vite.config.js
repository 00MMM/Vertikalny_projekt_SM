import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    // Prefer TS/TSX and JSX source files over legacy .js duplicates.
    extensions: ['.mjs', '.mts', '.tsx', '.ts', '.jsx', '.js', '.json'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
});
