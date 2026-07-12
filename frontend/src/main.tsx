import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

// --- Typography (self-hosted, no runtime CDN) ---
// Inter (variable) — the single body + heading face across the whole app.
import '@fontsource-variable/inter';
// Space Mono — retained only for small numeric/data labels (counts, IDs).
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';

import App from './App';
import { queryClient } from '@/lib/queryClient';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
