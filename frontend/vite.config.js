import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // In production builds, VITE_API_URL is baked in at build time.
  // In dev, Vite proxies /api → backend so the browser never sees CORS.
  const backendUrl = env.VITE_API_URL
    ? new URL(env.VITE_API_URL).origin   // strip /api suffix for the proxy target
    : 'http://localhost:5000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          // Optionally uncomment to debug proxy requests:
          // configure: (proxy) => { proxy.on('error', (err) => console.error('proxy err', err)); },
        },
      },
    },
    build: {
      // Sourcemaps in prod help with debugging — remove if you prefer smaller bundles
      sourcemap: false,
      rollupOptions: {
        output: {
          // Split vendor chunk so app code caches independently
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            state:  ['zustand'],
            http:   ['axios'],
          },
        },
      },
    },
  };
});
