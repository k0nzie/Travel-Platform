import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthPanel } from '@/components/account/auth-panel';
import { LoginForm } from '@/components/account/login-form';

export const metadata: Metadata = { title: 'Log in' };

export default function LoginPage() {
  return (
    <AuthPanel
      title="Log in"
      description="Pick up where you left off: bookings, trips and posts."
      footer={
        <>
          New here?{' '}
          <Link href="/register" className="font-semibold text-brand hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthPanel>
  );
}
