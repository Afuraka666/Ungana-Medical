import React from 'react';
import ReactDOM from 'react-dom/client';
// FIX: Changed to a named import to match the export in App.tsx.
import { App } from './App';
import { AnalyticsProvider } from './contexts/analytics';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AnalyticsProvider>
      <App />
    </AnalyticsProvider>
  </React.StrictMode>
);