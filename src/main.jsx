// Renderer entry point: fonts, styles, translations and the app root.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import App from './App';
import { I18nProvider } from './i18n/I18nProvider';
import './styles/index.css';

// macOS draws its window buttons on the left of the title bar; CSS makes room for them.
if (window.torrentAPI?.platform) document.documentElement.dataset.platform = window.torrentAPI.platform;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
