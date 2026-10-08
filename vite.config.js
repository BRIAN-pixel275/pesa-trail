import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const packageVersion = process.env.npm_package_version || '0.0.0';
const commitSha = process.env.VERCEL_GIT_COMMIT_SHA;
const appVersion = `${packageVersion}${commitSha ? `+${commitSha.slice(0, 7)}` : ''}`;

export default defineConfig({
  define: {
    'import.meta.env.APP_VERSION': JSON.stringify(appVersion),
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Pesa Trail',
        short_name: 'Pesa Trail',
        description: 'A private, on-device tracker for your M-PESA money trail.',
        theme_color: '#17734f',
        background_color: '#f6f7f4',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/pesa-trail.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
});
