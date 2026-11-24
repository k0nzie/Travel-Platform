import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthPanel } from '@/components/account/auth-panel';
import { RegisterForm } from '@/components/account/register-form';

export const metadata: Metadata = { title: 'Create an account' };

export default function RegisterPage() {
  return (
    <AuthPanel
      title="Create an account"
      description="Book flights and hotels, plan trips day by day, and write about them."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <Suspense>
        <RegisterForm />
      </Suspense>
    </AuthPanel>
  );
}
