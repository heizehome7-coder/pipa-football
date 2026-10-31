import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`          -> dist/        (normal multi-file build, deploy anywhere)
// `npm run build:single`   -> dist-single/ (one self-contained index.html)
export default defineConfig(({ mode }) => ({
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  base: './',
  // in dev, the realtime server (npm run server) is reached through the same origin
  server: { proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 1500,
  },
}));
