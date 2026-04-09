import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "./utils";
import { Music, Briefcase, Home, Users, User } from "lucide-react";
import { FloatingDock } from "@/components/ui/floating-dock";

const navItems = [
  { id: "studio",  label: "Studio",  page: "Studio",  Icon: Music },
  { id: "career",  label: "Career",  page: "Career",  Icon: Briefcase },
  { id: "home",    label: "Home",    page: "HomeV2",  Icon: Home },
  { id: "social",  label: "Social",  page: "Social",  Icon: Users },
  { id: "profile", label: "Profile", page: "Profile", Icon: User },
];

export default function BottomNav({ currentPage }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavClick = (e, page) => {
    e.preventDefault();
    if (currentPage === page) {
      const rootPath = createPageUrl(page);
      if (location.pathname !== rootPath) {
        navigate(rootPath, { replace: true });
      }
    } else {
      navigate(createPageUrl(page));
    }
  };

  const dockItems = navItems.map((item) => {
    const isActive = currentPage === item.page;
    return {
      title: item.label,
      href: createPageUrl(item.page),
      onClick: (e) => handleNavClick(e, item.page),
      icon: (
        <item.Icon
          className={`h-full w-full transition-colors ${
            isActive ? "text-red-400" : "text-gray-400"
          }`}
        />
      ),
    };
  });

  return (
    <nav className="app-bottom-nav fixed bottom-0 left-0 right-0 z-50">
      <div className="mx-auto flex w-full max-w-[var(--app-max-content-width)] items-center justify-center px-4 pb-[max(var(--space-2),env(safe-area-inset-bottom))] pt-2">
        <FloatingDock
          items={dockItems}
          desktopClassName="w-full border border-white/[0.08]"
        />
      </div>
    </nav>
  );
}
