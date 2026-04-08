import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import BottomNav from "./components/BottomNav";
import PageShell from "@/components/layout/PageShell";
import AppShell from "@/components/layout/AppShell";
import TopBar from "@/components/layout/TopBar";
import { LayoutChromeProvider } from "@/components/layout/LayoutChromeContext";

const PAGES_WITHOUT_GLOBAL_CHROME = ["Onboarding", "Auth", "SoundburstApp", "StreamifyApp", "AppleCoreApp", "MerchApp", "TouringAppV2", "EraManagementApp", "AppleMusic", "AmplifiApp"];

export default function Layout({ children, currentPageName }) {
  const [chrome, setChrome] = useState({ hideTopBar: false, hideBottomNav: false });
  const baseShowChrome = !PAGES_WITHOUT_GLOBAL_CHROME.includes(currentPageName);

  useEffect(() => {
    setChrome({ hideTopBar: false, hideBottomNav: false });
  }, [currentPageName]);

  const showTopBar = baseShowChrome && !chrome.hideTopBar;
  const showBottomNav = baseShowChrome && !chrome.hideBottomNav;

  const contextValue = useMemo(() => ({ chrome, setChrome }), [chrome]);

  return (
    <LayoutChromeProvider value={contextValue}>
      <AppShell>
        {showTopBar && <TopBar />}
        <PageShell
          withTopBar={showTopBar}
          withBottomNav={showBottomNav}
          className="app-route-viewport"
          contentClassName="px-0"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPageName}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeInOut" }}
              className="min-h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </PageShell>
        {showBottomNav && <BottomNav currentPage={currentPageName} />}
      </AppShell>
    </LayoutChromeProvider>
  );
}
