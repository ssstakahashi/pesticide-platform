import { dirname } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { applyHostingProjectEnv } from './scripts/hosting-env.ts';

const webRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => {
  if (command === 'build') {
    const applied = applyHostingProjectEnv(webRoot, process.env.GCLOUD_PROJECT);
    if (applied) console.info(`Firebase Hosting: ${applied} を .env より優先します`);
  }

  return {
    root: webRoot,
    envDir: webRoot,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 5173 },
  };
});
