import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3009,
    proxy: {
      '/api': {
        target: 'http://localhost:3008',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:3008',
        ws: true
      }
    }
  }
});

