import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AuthGuard } from '@/components/layout/auth-guard';
import HomePage from '@/pages/home';
import LoginPage from '@/pages/login';
import RegisterPage from '@/pages/register';
import StudioPage from '@/pages/studio';
import GalleryPage from '@/pages/gallery';
import BillingPage from '@/pages/billing';
import AccountPage from '@/pages/account';
import NotFound from '@/pages/not-found';
import { useEffect } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/studio">
        <AuthGuard>
          <StudioPage />
        </AuthGuard>
      </Route>
      <Route path="/gallery">
        <AuthGuard>
          <GalleryPage />
        </AuthGuard>
      </Route>
      <Route path="/billing">
        <AuthGuard>
          <BillingPage />
        </AuthGuard>
      </Route>
      <Route path="/account">
        <AuthGuard>
          <AccountPage />
        </AuthGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    // White gallery theme — ensure dark class is not applied
    document.documentElement.classList.remove('dark');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
