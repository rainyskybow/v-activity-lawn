import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'src/popup/index.html'),
        dashboard: path.resolve(__dirname, 'src/dashboard/index.html'),
        background: path.resolve(__dirname, 'src/background/index.ts'),
        'content-yt': path.resolve(__dirname, 'src/content/content-yt.ts'),
        'content-x': path.resolve(__dirname, 'src/content/content-x.ts'),
        'injected-yt': path.resolve(__dirname, 'src/content/injected-yt.ts'),
        'injected-x': path.resolve(__dirname, 'src/content/injected-x.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return 'src/background/index.js';
          }
          if (chunkInfo.name === 'content-yt') {
            return 'src/content/content-yt.js';
          }
          if (chunkInfo.name === 'content-x') {
            return 'src/content/content-x.js';
          }
          if (chunkInfo.name === 'injected-yt') {
            return 'injected-yt.js';
          }
          if (chunkInfo.name === 'injected-x') {
            return 'injected-x.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
