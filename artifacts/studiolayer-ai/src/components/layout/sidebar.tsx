import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { SupportModal } from '@/components/ui/support-modal';
import { useLogout } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

interface SidebarProps {
  className?: string;
}

const navItems = [
  { href: '/studio', label: '🎨 Studio Workspace' },
  { href: '/gallery', label: '📦 Asset Gallery' },
  { href: '/account', label: '👤 Account Profile' },
  { href: '/billing', label: '💳 Subscription & Billing' },
];

export function Sidebar({ className }: SidebarProps) {
  const [location, setLocation] = useLocation();
  const [supportOpen, setSupportOpen] = useState(false);
  const queryClient = useQueryClient();
  const logoutMutation = useLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation('/login');
      },
    });
  };

  return (
    <>
      <aside
        className={cn(
          'w-64 border-r border-border bg-sidebar flex flex-col',
          className
        )}
      >
        {/* Logo block */}
        <div className="p-6 border-b border-border">
          <h1
            className="text-foreground"
            style={{
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: '24px',
              letterSpacing: '0.15em',
              fontWeight: 500,
              lineHeight: 1.2,
            }}
          >
            StudioLayer AI
          </h1>
          <p className="text-muted-foreground mt-1" style={{ fontSize: '11px', fontFamily: "'Inter', sans-serif", letterSpacing: '0.02em' }}>
            Professional Editorial Render Engine
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center px-3 py-2.5 text-sm font-medium rounded transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-primary'
                )}
                data-testid={`nav-${item.href.replace('/', '')}`}
              >
                {item.label}
              </Link>
            );
          })}

          {/* Logout — directly below nav links */}
          <button
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
            className="flex items-center w-full px-3 py-2.5 text-sm font-medium rounded transition-colors text-sidebar-foreground hover:bg-sidebar-primary disabled:opacity-50"
            data-testid="nav-logout"
          >
            🚪 Log Out
          </button>
        </nav>

        {/* Bottom */}
        <div className="p-4 border-t border-border space-y-3">
          <button
            onClick={() => setSupportOpen(true)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left"
            style={{ fontSize: '14px' }}
          >
            ✉ Contact Studio Support
          </button>
          <p className="text-xs text-muted-foreground font-mono">
            © 2026 StudioLayer AI
          </p>
        </div>
      </aside>

      <SupportModal open={supportOpen} onOpenChange={setSupportOpen} />
    </>
  );
}
