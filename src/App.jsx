import { Toaster } from "@/components/ui/toaster"
import ToastProvider from "@/components/ui/toast-provider"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config.js'
import { useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ErrorBoundary from '@/components/ErrorBoundary';
import { debugLog } from '@/lib/debug';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { enableTapTargetAudit } from '@/lib/tapTargetAudit';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey && Pages[mainPageKey] ? Pages[mainPageKey] : () => null;
const PUBLIC_ROUTE_PATHS = ['/Auth', '/Onboarding'];

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthSplash = () => (
  <div className="min-h-full bg-[#0B0B0F] text-white flex items-center justify-center px-6">
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-8 shadow-2xl shadow-black/40">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">X-FACTOR</h1>
        <p className="text-sm text-gray-300 mt-2">Loading authentication…</p>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-red-500/80" />
      </div>
    </div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();
  const isPublicRoute = PUBLIC_ROUTE_PATHS.includes(location.pathname);

  useEffect(() => {
    if (authError?.type === 'auth_required' && !isPublicRoute) {
      navigateToLogin();
    }
  }, [authError, isPublicRoute, navigateToLogin]);

  // Show loading splash while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return <AuthSplash />;
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required' && !isPublicRoute) {
      return null;
    }
  }

  // Render the main app (including public routes like /Auth)
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

const AppLifecycleTracker = () => {
  const location = useLocation();

  useEffect(() => {
    debugLog('app-root-mounted');
    return () => {
      debugLog('app-root-unmounted');
    };
  }, []);

  useEffect(() => {
    debugLog('route-change', {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash
    });
  }, [location.pathname, location.search, location.hash]);

  return null;
};


function App() {
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    return enableTapTargetAudit();
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <ToastProvider>
            <Router>
              <AppLifecycleTracker />
              <NavigationTracker />
              <AuthenticatedApp />
            </Router>
            <Toaster />
            <SpeedInsights />
          </ToastProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
