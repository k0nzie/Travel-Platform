import type { Metadata } from 'next';
import { AuthPanel } from '@/components/account/auth-panel';
import { ChangePasswordForm } from '@/components/account/change-password-form';
import { RequireAuth } from '@/lib/auth/require-auth';

export const metadata: Metadata = { title: 'Set a new password' };

/** Where accounts with a temporary password land after login (the backend's redirectTo). */
export default function ChangePasswordPage() {
  return (
    <RequireAuth allowPendingPasswordChange>
      <AuthPanel
        title="Set a new password"
        description="An administrator gave you a temporary password. Choose your own before you continue."
      >
        <ChangePasswordForm forced />
      </AuthPanel>
    </RequireAuth>
  );
}
