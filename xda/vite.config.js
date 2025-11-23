import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  root: './renderer',
  build: {
    outDir: '../dist/renderer',
    emptyOutDir: true
  },
  server: {
    port: 5173
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './renderer')
    }
  }
});


