import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'AURA',
    permissions: ['storage', 'tabs'],
    host_permissions: ['https://www.linkedin.com/*', 'http://127.0.0.1/*'],
  },
});
