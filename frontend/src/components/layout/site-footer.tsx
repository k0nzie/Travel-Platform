import Link from 'next/link';
import { MAIN_NAV, SITE_NAME, SITE_TAGLINE } from '@/lib/site';
import { Container } from './container';
import { Logo } from './logo';

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <Container className="flex flex-col gap-8 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <Logo tone="dark" />
          <p className="mt-3 text-sm text-ink-soft">{SITE_TAGLINE}</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
          {MAIN_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-ink-soft hover:text-brand">
              {item.label}
            </Link>
          ))}
          <Link href="/account" className="text-ink-soft hover:text-brand">
            Your account
          </Link>
          <Link href="/notifications" className="text-ink-soft hover:text-brand">
            Notifications
          </Link>
        </nav>
      </Container>
      <Container className="border-t border-line py-5 text-sm text-ink-faint">
        © {new Date().getFullYear()} {SITE_NAME}. Prices are shown in the platform currency.
      </Container>
    </footer>
  );
}
