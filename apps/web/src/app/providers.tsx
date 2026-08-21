import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../features/auth/useAuth.tsx';
import { I18nProvider } from '../features/i18n/I18nProvider.tsx';
import { ThemeProvider } from '../features/theme/ThemeProvider.tsx';
import { setScopeStaleListener } from '../shared/api/client.ts';
import { ToastProvider } from '../shared/components/Toast.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

// Kapsam değişimi bir "yeniden oturum"dur: token yenilendikten sonra önbellekte kalan eski
// kayıtlar kapsam dışına düşmüş olabilir, tamamı atılır.
setScopeStaleListener(() => queryClient.clear());

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <I18nProvider>
            <ToastProvider>
              <AuthProvider>{children}</AuthProvider>
            </ToastProvider>
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
