if (typeof globalThis !== 'undefined') {
  if (!('module' in globalThis) || !(globalThis as any).module) {
    (globalThis as any).module = { exports: {} };
  }
  if (!('exports' in globalThis) || !(globalThis as any).exports) {
    (globalThis as any).exports = (globalThis as any).module.exports;
  }
  if (!('global' in globalThis) || !(globalThis as any).global) {
    (globalThis as any).global = globalThis;
  }
  if (!('require' in globalThis) || !(globalThis as any).require) {
    const req = function(id: string) {
      return (globalThis as any).module?.exports || {};
    };
    req.resolve = (id: string) => id;
    req.cache = {};
    req.extensions = {};
    (globalThis as any).require = req;
  }
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
