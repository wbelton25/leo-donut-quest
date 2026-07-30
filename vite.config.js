import { defineConfig } from 'vite';
import { resolve } from 'path';

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
    rollupOptions: {
      // Multi-page build: the desktop adventure at index.html and the standalone
      // mobile arcade prototype (Donut Rain) at arcade.html. Both ship to the
      // same deploy; the arcade lives at /arcade.html and shares the repo's assets
      // without touching the adventure's code paths.
      input: {
        main: resolve(__dirname, 'index.html'),
        arcade: resolve(__dirname, 'arcade.html'),
      },
    },
  },
});
