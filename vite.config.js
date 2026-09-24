import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Keeps the test-only demo page (riff-demo.html) alongside the real game.
      input: {
        main: 'index.html',
        riffDemo: 'riff-demo.html',
        learn: 'learn.html',
      },
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    host: true,
    allowedHosts: true,
  },
});
