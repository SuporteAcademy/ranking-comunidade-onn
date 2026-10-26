import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // a biblioteca de planilhas (SheetJS) sozinha tem ~700 kB
  build: { chunkSizeWarningLimit: 1200 },
});
