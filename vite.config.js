import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          // Correct path to the worker file
          src: 'node_modules/pdfjs-dist/build/pdf.worker.mjs',
          dest: '.' // Copy to the root of the output directory (e.g., dist/)
        }
      ]
    })
  ],
  // Optional: Define base if deploying to a subdirectory
  // base: '/your-subdirectory/',
});
