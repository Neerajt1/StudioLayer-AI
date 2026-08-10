import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGetMe, useLogout } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { destroyStoredStudioWorkflow } from '@/lib/studio-workflow';
import { clearStudioWorkspaceSession } from '@/lib/studio-workspace-session';
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

function useCloseOnEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);
}

function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [locked]);
}

export function EditorialNav() {
  const [location] = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { data: user } = useGetMe();
  const logoutMutation = useLogout();

  const displayName = navDisplayFirstName(user?.name);

  useCloseOnEscape(userMenuOpen, () => setUserMenuOpen(false));
  useCloseOnEscape(mobileMenuOpen, () => setMobileMenuOpen(false));
  useLockBodyScroll(mobileMenuOpen);

  useEffect(() => {
    if (!userMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [userMenuOpen]);

  useEffect(() => {
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
  }, [location]);

  const handleLogout = () => {
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        destroyStoredStudioWorkflow(user?.id ?? null);
        clearStudioWorkspaceSession(user?.id ?? null);
        queryClient.clear();
        requestStudioIntroOnLogout();
        // TODO(dev-workaround): Remove full page reload once SelectedTalentProvider
        // synchronizes selectedTalentId correctly across logout/login without remount.
        const appBase = import.meta.env.BASE_URL.replace(/\/$/, '');
        window.location.assign(`${appBase}/login`);
      },
    });
  };

  const prefetchGallery = () => prefetchGalleryQueries(queryClient);

  const renderNavLink = (
    item: (typeof navItems)[number],
    className?: string,
    onNavigate?: () => void,
  ) => {
    const isActive = location === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn('sl-editorial-nav-link', isActive && 'is-active', className)}
        data-testid={`nav-${item.href.replace('/', '')}`}
        onClick={onNavigate}
        onPointerDown={item.href === '/gallery' ? prefetchGallery : undefined}
        onMouseEnter={item.href === '/gallery' ? prefetchGallery : undefined}
        onFocus={item.href === '/gallery' ? prefetchGallery : undefined}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <>
      <nav className="sl-editorial-nav-bar sl-editorial-nav-bar--desktop" aria-label="Main navigation">
        {navItems.map((item) => renderNavLink(item))}

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

      <div className="sl-editorial-nav-mobile">
        <button
          type="button"
          className="sl-editorial-nav-mobile-trigger"
          aria-expanded={mobileMenuOpen}
          aria-controls="sl-editorial-nav-mobile-panel"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          data-testid="nav-mobile-menu-trigger"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? (
            <X className="sl-editorial-nav-mobile-trigger-icon" aria-hidden />
          ) : (
            <Menu className="sl-editorial-nav-mobile-trigger-icon" aria-hidden />
          )}
          <span className="sl-editorial-nav-mobile-trigger-label">Menu</span>
        </button>

        {mobileMenuOpen && (
          <>
            <button
              type="button"
              className="sl-editorial-nav-mobile-backdrop"
              aria-label="Close menu"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div
              id="sl-editorial-nav-mobile-panel"
              className="sl-editorial-nav-mobile-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Main navigation"
            >
              <div className="sl-editorial-nav-mobile-panel-header">
                <p className="sl-editorial-nav-mobile-panel-title">Navigation</p>
                <button
                  type="button"
                  className="sl-editorial-nav-mobile-close"
                  aria-label="Close menu"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>

              <div className="sl-editorial-nav-mobile-links">
                {navItems.map((item) =>
                  renderNavLink(item, 'sl-editorial-nav-mobile-link', () => setMobileMenuOpen(false)),
                )}
              </div>

              <div className="sl-editorial-nav-mobile-account">
                <p className="sl-editorial-nav-mobile-account-name">{displayName}</p>
                <button
                  type="button"
                  className="sl-editorial-nav-mobile-logout"
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                  data-testid="nav-mobile-logout"
                >
                  Log Out
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
