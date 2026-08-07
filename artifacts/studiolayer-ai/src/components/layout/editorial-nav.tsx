import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { useGetMe, useLogout } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { destroyStoredStudioWorkflow } from '@/lib/studio-workflow';
import { requestStudioIntroOnLogout } from '@/lib/studio-intro';
import { prefetchGalleryQueries } from '@/lib/gallery-queries';

const navItems = [
  { href: '/studio', label: 'Studio Workspace' },
  { href: '/casting', label: 'Studio Talent' },
  { href: '/gallery', label: 'Studio Gallery' },
  { href: '/account', label: 'Studio Profile' },
  { href: '/billing', label: 'Studio Membership' },
] as const;

function navDisplayFirstName(name: string | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) {
    return 'Studio';
  }

  return trimmed.split(/\s+/)[0] ?? 'Studio';
}

export function EditorialNav() {
  const [location] = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { data: user } = useGetMe();
  const logoutMutation = useLogout();

  const displayName = navDisplayFirstName(user?.name);

  useEffect(() => {
    if (!userMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    setUserMenuOpen(false);
  }, [location]);

  const handleLogout = () => {
    setUserMenuOpen(false);
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        destroyStoredStudioWorkflow(user?.id ?? null);
        queryClient.clear();
        requestStudioIntroOnLogout();
        // TODO(dev-workaround): Remove full page reload once SelectedTalentProvider
        // synchronizes selectedTalentId correctly across logout/login without remount.
        const appBase = import.meta.env.BASE_URL.replace(/\/$/, '');
        window.location.assign(`${appBase}/login`);
      },
    });
  };

  return (
    <nav className="sl-editorial-nav-bar" aria-label="Main navigation">
      {navItems.map((item) => {
        const isActive = location === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn('sl-editorial-nav-link', isActive && 'is-active')}
            data-testid={`nav-${item.href.replace('/', '')}`}
            onPointerDown={
              item.href === '/gallery'
                ? () => prefetchGalleryQueries(queryClient)
                : undefined
            }
            onMouseEnter={
              item.href === '/gallery'
                ? () => prefetchGalleryQueries(queryClient)
                : undefined
            }
            onFocus={
              item.href === '/gallery'
                ? () => prefetchGalleryQueries(queryClient)
                : undefined
            }
          >
            {item.label}
          </Link>
        );
      })}

      <div className="relative" ref={userMenuRef}>
        <button
          type="button"
          onClick={() => setUserMenuOpen((open) => !open)}
          aria-expanded={userMenuOpen}
          aria-haspopup="menu"
          className={cn('sl-editorial-nav-link', userMenuOpen && 'is-active')}
          data-testid="nav-user-menu"
        >
          {displayName} ▾
        </button>

        {userMenuOpen && (
          <div className="sl-editorial-user-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              className="sl-editorial-user-menu-item disabled:opacity-50"
              data-testid="nav-logout"
            >
              Log Out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
