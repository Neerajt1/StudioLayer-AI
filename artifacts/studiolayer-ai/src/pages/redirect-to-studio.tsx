import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { buildV1StudioPathFromLocation } from '@/lib/v1-create-product';

/**
 * V1 safety redirect — deactivated Editorial/Campaign routes land on Create.
 * Route files remain for possible V3 recovery.
 */
export default function RedirectToStudioPage() {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    const pathname = location.split('?')[0] ?? '/studio';
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const target = buildV1StudioPathFromLocation(pathname, search);
    if (target !== `${pathname}${search}`) {
      setLocation(target);
    }
  }, [location, setLocation]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Loading Studio…</p>
    </div>
  );
}
