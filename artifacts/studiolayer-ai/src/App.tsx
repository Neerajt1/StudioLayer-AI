import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AuthGuard } from '@/components/layout/auth-guard';
import HomePage from '@/pages/home';
import LoginPage from '@/pages/login';
import RegisterPage from '@/pages/register';
import ForgotPasswordPage from '@/pages/forgot-password';
import TermsPage from '@/pages/terms';
import PrivacyPage from '@/pages/privacy';
import CookiePolicyPage from '@/pages/cookies';
import LegalIndexPage from '@/pages/legal';
import StudioPage from '@/pages/studio';
import CastingPage from '@/pages/casting';
import GalleryPage from '@/pages/gallery';
import BillingPage from '@/pages/billing';
import AccountPage from '@/pages/account';
import NotFound from '@/pages/not-found';
import { StudioWorkflowProvider } from '@/context/studio-workflow-context';
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
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/cookies" component={CookiePolicyPage} />
      <Route path="/legal" component={LegalIndexPage} />
      <Route path="/studio">
        <AuthGuard>
          <StudioPage />
        </AuthGuard>
      </Route>
      <Route path="/casting">
        <AuthGuard>
          <CastingPage />
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
          <StudioWorkflowProvider>
            <Router />
          </StudioWorkflowProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
