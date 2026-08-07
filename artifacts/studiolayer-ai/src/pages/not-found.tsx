import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <h1 className="sl-display text-[2rem]">404</h1>
          <p className="sl-page-subheading">Page not found</p>
          <p className="text-sm text-muted-foreground">
            The page you are looking for does not exist or has moved.
          </p>
          <Button asChild className="mt-2">
            <Link href="/studio">Return to Studio</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
