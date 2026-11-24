import type { Metadata } from 'next';
import { DeactivateAccount } from '@/components/account/deactivate-account';
import { ProfileForm } from '@/components/account/profile-form';
import { Container, PageSection } from '@/components/layout/container';
import { ButtonLink, Card, CardBody, CardHeader, DetailList, PageHeader } from '@/components/ui';
import { getCurrentUser } from '@/lib/api/server';
import { ROLE_LABEL } from '@/lib/auth/roles';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Your account' };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <Container narrow>
      <PageSection>
        <PageHeader title="Your account" description="Your details, password and account settings." />
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Profile" />
            <CardBody>
              <ProfileForm />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Password"
              description="Changing it logs you out on your other devices."
              actions={
                <ButtonLink href="/account/password" variant="secondary" size="sm">
                  Change password
                </ButtonLink>
              }
            />
            <CardBody>
              <DetailList
                items={[
                  { label: 'Account type', value: ROLE_LABEL[user.role] },
                  { label: 'Member since', value: formatDate(user.createdAt) },
                ]}
              />
            </CardBody>
          </Card>

          {user.role === 'user' && (
            <Card>
              <CardHeader
                title="Deactivate account"
                description="Not possible while you have upcoming confirmed bookings."
              />
              <CardBody>
                <DeactivateAccount />
              </CardBody>
            </Card>
          )}
        </div>
      </PageSection>
    </Container>
  );
}
