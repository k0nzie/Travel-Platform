'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Checkbox, Dialog, Field, PasswordInput } from '@/components/ui';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-context';
import { useSubmit } from '@/lib/hooks/use-submit';

/**
 * ACC-12: a traveller deactivates their own account after re-entering the password and confirming.
 * The backend refuses while there are upcoming confirmed bookings.
 */
export function DeactivateAccount() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState(false);

  const { submit, pending, fieldErrors, formError, setFormError, reset } = useSubmit(async () => {
    try {
      await api.delete('/users/me', { password, confirm });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'HAS_UPCOMING_BOOKINGS') {
        setFormError('You have upcoming confirmed bookings. Cancel them or wait until after the trip.');
        return;
      }
      throw error;
    }
    setUser(null);
    router.replace('/');
    router.refresh();
  });

  const close = () => {
    setOpen(false);
    setPassword('');
    setConfirm(false);
    reset();
  };

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Deactivate account
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="Deactivate your account?"
        description="You will be logged out and cannot log in again. Your posts and public trips are hidden, and your comments and reviews show as “Deleted user”."
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Keep my account
            </Button>
            <Button variant="danger" loading={pending} disabled={!confirm || !password} onClick={() => void submit()}>
              Deactivate account
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Field label="Your password" error={fieldErrors.password}>
            <PasswordInput
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Checkbox
            label="I understand that this cannot be undone from my side"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
          />
        </div>
      </Dialog>
    </>
  );
}
