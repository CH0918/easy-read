import { defineConfig } from 'wxt';
import identity from './extension-identity.json';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  debug: false,
  manifest: {
    minimum_chrome_version: '123',
    key: identity.key,
    name: 'Margin · 页边',
    description:
      '看懂这一句，继续你的好奇。按住 Option / Alt 划词，结合网页上下文，用 AI 理解英文。',
    permissions: ['storage'],
    host_permissions: ['https://*/*', 'http://*/*'],
    icons: { 16: '/icons/16.png', 32: '/icons/32.png', 48: '/icons/48.png', 128: '/icons/128.png' },
    action: { default_title: 'Margin · 页边' },
    options_ui: { open_in_tab: true },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self';" },
  },
});
