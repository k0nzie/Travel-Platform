import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentUser } from '@/lib/api/server';
import type { Role } from '@/lib/api/types';
import { Forbidden } from '@/components/layout/forbidden';
import { SessionRefresher } from './session-refresher';

/**
 * Protects a page or a whole section (ACC-11). Put it in a layout:
 *
 *   // app/admin/layout.tsx
 *   export default function AdminLayout({ children }) {
 *     return <RequireAuth roles={['admin']}>{children}</RequireAuth>;
 *   }
 *
 * - not signed in: renews the session in the browser, or sends the user to login and back
 * - temporary password: sends a moderator to /change-password first
 * - wrong role: shows "You do not have access"
 *
 * This is for the user's convenience only; the backend checks every request again.
 */
export async function RequireAuth({
  roles,
  allowPendingPasswordChange = false,
  children,
}: {
  roles?: Role[];
  /** Only for the change-password page itself. */
  allowPendingPasswordChange?: boolean;
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) return <SessionRefresher />;
  if (user.mustChangePassword && !allowPendingPasswordChange) redirect('/change-password');
  if (roles && !roles.includes(user.role)) return <Forbidden />;
  return <>{children}</>;
}
