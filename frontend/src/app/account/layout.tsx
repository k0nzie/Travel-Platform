import type { ReactNode } from 'react';
import { RequireAuth } from '@/lib/auth/require-auth';

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
