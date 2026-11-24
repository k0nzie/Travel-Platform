'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/surfaces';
import { ChevronDownIcon, LogOutIcon, MenuIcon, SettingsIcon, UserIcon, XIcon } from '@/components/ui/icons';
import { Menu, MenuItem } from '@/components/ui/overlays';
import { Skeleton } from '@/components/ui/feedback';
import { buttonClasses } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { ROLE_HOME, ROLE_LABEL, loginHref } from '@/lib/auth/roles';
import { MAIN_NAV } from '@/lib/site';
import { cn } from '@/lib/cn';
import { Container } from './container';
import { Logo } from './logo';
import { NotificationBell } from './notification-bell';

/** Links that belong to the signed-in role, shown next to the main navigation. */
function roleLinks(role: string | undefined) {
  if (role === 'admin') return [{ href: '/admin', label: 'Admin' }];
  if (role === 'airline_moderator') return [{ href: '/moderator/airline', label: 'My airline' }];
  if (role === 'hotel_moderator') return [{ href: '/moderator/hotel', label: 'My hotel' }];
  if (role === 'user')
    return [
      { href: '/bookings', label: 'My bookings' },
      { href: '/itineraries', label: 'My trips' },
    ];
  return [];
}

export function SiteHeader() {
  const { user, status, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);

  const links = [...MAIN_NAV, ...roleLinks(user?.role)];
  // The longest matching link wins, so "My trips" (/itineraries) is not lit on /itineraries/explore.
  const activeHref = links
    .map((l) => l.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;

  return (
    <header className="sticky top-0 z-30 bg-ink text-ink-inverse">
      <Container className="flex h-16 items-center gap-6">
        <Logo />

        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={cn(
                'relative rounded-control px-3 py-2 text-sm font-medium transition-colors',
                isActive(link.href)
                  ? 'text-ink-inverse after:absolute after:inset-x-3 after:-bottom-[0.85rem] after:h-0.5 after:bg-brand'
                  : 'text-ink-inverse/70 hover:text-ink-inverse',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          {status === 'loading' && <Skeleton className="h-8 w-28 bg-white/10" />}

          {status === 'guest' && (
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                href={loginHref(pathname === '/' ? undefined : pathname)}
                className="rounded-control px-3 py-2 text-sm font-semibold text-ink-inverse/85 hover:text-ink-inverse"
              >
                Log in
              </Link>
              <Link href="/register" className={buttonClasses({ size: 'sm' })}>
                Create account
              </Link>
            </div>
          )}

          {user && (
            <>
              <NotificationBell />
              <Menu
                label="Account menu"
                trigger={
                  <>
                    <Avatar name={user.name} />
                    <ChevronDownIcon className="hidden size-4 text-ink-inverse/70 sm:block" />
                  </>
                }
              >
                {(close) => (
                  <>
                    <div className="border-b border-line px-4 pt-2 pb-3">
                      <p className="truncate font-semibold">{user.name}</p>
                      <p className="truncate text-sm text-ink-soft">{user.email}</p>
                      <p className="mt-1 text-xs font-semibold text-brand-ink">{ROLE_LABEL[user.role]}</p>
                    </div>
                    {user.role !== 'user' && (
                      <MenuItem
                        icon={<SettingsIcon className="size-4" />}
                        onSelect={() => {
                          close();
                          router.push(ROLE_HOME[user.role]);
                        }}
                      >
                        Dashboard
                      </MenuItem>
                    )}
                    <MenuItem
                      icon={<UserIcon className="size-4" />}
                      onSelect={() => {
                        close();
                        router.push('/account');
                      }}
                    >
                      Profile and security
                    </MenuItem>
                    <MenuItem
                      icon={<LogOutIcon className="size-4" />}
                      onSelect={() => {
                        close();
                        void logout();
                      }}
                    >
                      Log out
                    </MenuItem>
                  </>
                )}
              </Menu>
            </>
          )}

          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-control text-ink-inverse/85 hover:bg-white/10 lg:hidden"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
      </Container>

      {mobileOpen && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-white/10 lg:hidden">
          <Container className="flex flex-col py-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={cn(
                  'rounded-control px-3 py-2.5 font-medium',
                  isActive(link.href) ? 'bg-white/10 text-ink-inverse' : 'text-ink-inverse/80',
                )}
              >
                {link.label}
              </Link>
            ))}
            {status === 'guest' && (
              <div className="mt-3 flex gap-2 border-t border-white/10 pt-4">
                <Link href={loginHref()} className={buttonClasses({ variant: 'secondary', block: true })}>
                  Log in
                </Link>
                <Link href="/register" className={buttonClasses({ block: true })}>
                  Create account
                </Link>
              </div>
            )}
          </Container>
        </nav>
      )}
    </header>
  );
}
