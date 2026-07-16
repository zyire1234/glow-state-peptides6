import tailwindcss from '@tailwindcss/vite';

import react from '@vitejs/plugin-react';

import path from 'path';

import { defineConfig } from 'vite';

export default defineConfig({

  plugins: [react(), tailwindcss()],

  resolve: {

    alias: {

      '@': path.resolve(process.cwd(), 'src'),

    },

  },

  server: {

    proxy: {

      '/api': {

        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000',

        changeOrigin: true,

      },

    },

  },

  build: {

    outDir: 'dist',

    emptyOutDir: true,

  },

});
