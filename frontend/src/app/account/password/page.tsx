import type { Metadata } from 'next';
import { ChangePasswordForm } from '@/components/account/change-password-form';
import { Container, PageSection } from '@/components/layout/container';
import { Card, CardBody, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Change password' };

export default function PasswordPage() {
  return (
    <Container narrow>
      <PageSection>
        <PageHeader
          title="Change password"
          description="Your other devices will be logged out."
          back={{ href: '/account', label: 'Your account' }}
        />
        <Card>
          <CardBody>
            <ChangePasswordForm />
          </CardBody>
        </Card>
      </PageSection>
    </Container>
  );
}
