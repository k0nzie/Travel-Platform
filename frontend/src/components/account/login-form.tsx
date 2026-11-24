'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Field, Input, PasswordInput } from '@/components/ui';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { User } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/auth-context';
import { safeReturnTo } from '@/lib/auth/roles';
import { useSubmit } from '@/lib/hooks/use-submit';

interface LoginResponse {
  user: User;
  mustChangePassword: boolean;
  redirectTo: string;
}

/** ACC-04 / ACC-05: generic message on failure, separate messages for locked and suspended accounts. */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [blocked, setBlocked] = useState<{ title: string; message: string } | null>(null);

  const { submit, pending, fieldErrors, formError } = useSubmit(async () => {
    setBlocked(null);
    try {
      const res = await api.post<LoginResponse>('/auth/login', { email, password });
      setUser(res.user);
      const next = res.mustChangePassword ? '/change-password' : safeReturnTo(params.get('returnTo'), res.redirectTo);
      router.replace(next);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ACCOUNT_SUSPENDED') {
        setBlocked({
          title: 'Account suspended',
          message: 'An administrator suspended this account. You cannot log in.',
        });
        return;
      }
      if (error instanceof ApiError && error.code === 'ACCOUNT_LOCKED') {
        setBlocked({ title: 'Account locked', message: error.message });
        return;
      }
      throw error;
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
      {blocked && (
        <Alert tone={blocked.title === 'Account locked' ? 'signal' : 'danger'} title={blocked.title}>
          {blocked.message}
        </Alert>
      )}
      {formError && !blocked && <Alert tone="danger">{formError}</Alert>}

      <Field label="Email" error={fieldErrors.email}>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>
      <Field label="Password" error={fieldErrors.password}>
        <PasswordInput
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      <Button type="submit" size="lg" block loading={pending}>
        Log in
      </Button>
    </form>
  );
}
