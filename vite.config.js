import { defineConfig } from 'vite';

export default defineConfig({
  // Served from the root of donuts.beltonglobal.com (GitHub Pages custom domain).
  // If this ever moves back to a subpath, set this to '/leo-donut-quest/'.
  base: '/',
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
