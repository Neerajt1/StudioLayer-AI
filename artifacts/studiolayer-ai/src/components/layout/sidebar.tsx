import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';

interface SidebarProps {
  className?: string;
}

const navItems = [
  { href: '/studio', label: '🎨 Studio Workspace' },
  { href: '/gallery', label: '📦 Asset Gallery' },
  { href: '/billing', label: '💳 Subscription & Billing' },
];

export function Sidebar({ className }: SidebarProps) {
  const [location] = useLocation();

  return (
    <aside
      className={cn(
        'w-64 border-r border-border bg-sidebar flex flex-col',
        className
      )}
    >
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          StudioLayer AI
        </h1>
        <p className="text-xs text-muted-foreground mt-1 font-mono">
          Editorial Render Engine
        </p>
      </div>

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
      </nav>

      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground font-mono">
          Professional Studio v1.0
        </div>
      </div>
    </aside>
  );
}
