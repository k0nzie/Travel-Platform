'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Field, PasswordInput, useToast } from '@/components/ui';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { ROLE_HOME } from '@/lib/auth/roles';
import { useSubmit } from '@/lib/hooks/use-submit';
import { PASSWORD_HINT, PASSWORD_RULE } from './register-form';

/**
 * ACC-08, and the forced change after an admin sets a temporary password (ACC-07a, ACC-13).
 * Changing the password signs out the account's other sessions.
 */
export function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { reload } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  const { submit, pending, fieldErrors, formError, setFieldErrors } = useSubmit(async () => {
    const local: Record<string, string> = {};
    if (!form.currentPassword) local.currentPassword = 'Enter your current password.';
    if (!PASSWORD_RULE.test(form.newPassword)) local.newPassword = PASSWORD_HINT;
    else if (form.newPassword === form.currentPassword) local.newPassword = 'Choose a password you have not used here.';
    if (form.confirm !== form.newPassword) local.confirm = 'The two passwords do not match.';
    if (Object.keys(local).length) {
      setFieldErrors(local);
      return;
    }
    await api.patch('/auth/change-password', {
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
    const me = await reload();
    toast.success('Password changed');
    setForm({ currentPassword: '', newPassword: '', confirm: '' });
    if (forced && me) {
      router.replace(ROLE_HOME[me.role]);
      router.refresh();
    }
  });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-5"
    >
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Field label={forced ? 'Temporary password' : 'Current password'} error={fieldErrors.currentPassword}>
        <PasswordInput
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
        />
      </Field>
      <Field label="New password" hint={PASSWORD_HINT} error={fieldErrors.newPassword}>
        <PasswordInput
          autoComplete="new-password"
          value={form.newPassword}
          onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
        />
      </Field>
      <Field label="Repeat the new password" error={fieldErrors.confirm}>
        <PasswordInput
          autoComplete="new-password"
          value={form.confirm}
          onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
        />
      </Field>
      <div>
        <Button type="submit" loading={pending} block={forced} size={forced ? 'lg' : 'md'}>
          Change password
        </Button>
      </div>
    </form>
  );
}
