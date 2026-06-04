import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'AURA',
    permissions: ['storage', 'tabs', 'scripting'],
    host_permissions: ['https://www.linkedin.com/*', 'ws://127.0.0.1/*', 'http://127.0.0.1/*'],
  },
});
