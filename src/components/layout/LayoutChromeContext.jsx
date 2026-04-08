import React, { createContext, useContext } from "react";

const LayoutChromeContext = createContext({
  chrome: { hideTopBar: false, hideBottomNav: false },
  setChrome: () => {},
});

export function LayoutChromeProvider({ value, children }) {
  return <LayoutChromeContext.Provider value={value}>{children}</LayoutChromeContext.Provider>;
}

export function useLayoutChrome() {
  return useContext(LayoutChromeContext);
}
