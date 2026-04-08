import React, { createContext, useState, useContext, useEffect, useCallback } from "react";
import { supabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { createPageUrl } from "@/utils";
import { debugLog, shouldNavigateToPath } from "@/lib/debug";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // will hold supabase auth user
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);

  // keep for existing code paths
  const [appPublicSettings] = useState({ auth_mode: "local_supabase" });

  const isDevDemoMode = () => {
    try {
      return import.meta.env.DEV && localStorage.getItem("dev_demo_mode") === "1";
    } catch {
      return false;
    }
  };

  const syncLegacyLocalStorage = (sessionUser) => {
    try {
      if (sessionUser?.id) {
        localStorage.setItem("user_account_id", sessionUser.id);
      }
      if (sessionUser?.email) {
        localStorage.setItem("user_email", sessionUser.email);
      }
    } catch {
      // ignore
    }
  };

  const clearLegacyLocalStorage = () => {
    try {
      localStorage.removeItem("user_account_id");
      localStorage.removeItem("user_email");
    } catch {
      // ignore
    }
  };

  const applySession = (session) => {
    const sessionUser = session?.user || null;

    if (sessionUser) {
      setUser(sessionUser);
      setIsAuthenticated(true);
      setAuthError(null);
      syncLegacyLocalStorage(sessionUser);
    } else {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: "auth_required", message: "Authentication required" });
      clearLegacyLocalStorage();
    }
  };

  const checkAppState = useCallback(async () => {
    setAuthError(null);
    setIsLoadingAuth(true);

    if (isDevDemoMode() || !isSupabaseConfigured) {
      const demoUserId = localStorage.getItem("user_account_id") || "dev-demo-user";
      setUser({ id: demoUserId, email: localStorage.getItem("user_email") || "demo@xfactor.local" });
      setIsAuthenticated(true);
      setAuthError(null);
      setIsLoadingAuth(false);
      if (!isSupabaseConfigured) {
        debugLog("auth-fallback", { reason: "supabase-not-configured" });
      }
      return;
    }

    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: "auth_required", message: error.message || "Authentication required" });
      setIsLoadingAuth(false);
      return;
    }

    applySession(data?.session);
    setIsLoadingAuth(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!mounted) return;
      await checkAppState();
    })();

    let sub = null;
    if (isSupabaseConfigured) {
      const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        if (isDevDemoMode()) return;
        debugLog("auth-state-change", { event: _event });
        applySession(session);
      });
      sub = data;
    }

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [checkAppState]);

  const navigateToLogin = useCallback(() => {
    const targetPath = createPageUrl("Auth");
    const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

    if (!shouldNavigateToPath(currentPath, targetPath)) {
      debugLog("auth-redirect-skipped", { currentPath, targetPath });
      return;
    }

    debugLog("auth-redirect", { currentPath, targetPath });
    window.location.assign(targetPath);
  }, []);

  const logout = useCallback(
    async (shouldRedirect = true) => {
      try {
        await supabaseClient.auth.signOut();
      } catch {
        // ignore
      }

      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: "auth_required", message: "Authentication required" });
      clearLegacyLocalStorage();
      try { localStorage.removeItem("dev_demo_mode"); } catch {}

      if (shouldRedirect) {
        navigateToLogin();
      }
    },
    [navigateToLogin]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        logout,
        navigateToLogin,
        checkAppState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
