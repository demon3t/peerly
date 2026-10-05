const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

// Strict CSP for the packaged app only; the dev server needs inline HMR scripts.
const productionCsp = {
  name: 'peerly-csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
  ],
};

module.exports = defineConfig({
  plugins: [react(), productionCsp],
  // Relative asset paths: the packaged app loads dist/index.html over file://.
  base: './',
  clearScreen: false,
});
