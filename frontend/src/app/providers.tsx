'use client';

import type { ReactNode } from 'react';
import { ConfirmProvider, ToastProvider } from '@/components/ui/overlays';
import { AuthProvider } from '@/lib/auth/auth-context';

/** Everything that needs to wrap the whole app on the client. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
