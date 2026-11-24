import type { Metadata } from 'next';
import { NotificationList } from '@/components/account/notification-list';
import { Container, PageSection } from '@/components/layout/container';

export const metadata: Metadata = { title: 'Notifications' };

export default function NotificationsPage() {
  return (
    <Container narrow>
      <PageSection>
        <NotificationList />
      </PageSection>
    </Container>
  );
}
