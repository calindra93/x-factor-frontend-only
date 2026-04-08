import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "./utils";
import { Music, Briefcase, Home, Users, User } from "lucide-react";

const navItems = [
  { id: "profile", icon: User, label: "Profile", page: "Profile" },
  { id: "studio", icon: Music, label: "Studio", page: "Studio" },
  { id: "home", icon: Home, label: "Home", page: "HomeV2", isCenter: true, activePages: ["HomeV2"] },
  { id: "career", icon: Briefcase, label: "Career", page: "Career" },
  { id: "social", icon: Users, label: "Social", page: "Social" },
];

export default function BottomNav({ currentPage }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavClick = (e, page) => {
    e.preventDefault();

    if (currentPage === page) {
      const currentPath = location.pathname;
      const rootPath = createPageUrl(page);

      if (currentPath !== rootPath) {
        navigate(rootPath, { replace: true });
      }
    } else {
      navigate(createPageUrl(page));
    }
  };

  return (
    <nav className="app-bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.08] bg-[#111118]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[var(--app-bottom-nav-offset)] w-full max-w-[var(--app-max-content-width)] items-end justify-between gap-1 px-2 pb-[max(var(--space-2),env(safe-area-inset-bottom))] pt-2">
        {navItems.map((item) => {
          const activePages = item.activePages ?? [item.page];
          const isActive = activePages.includes(currentPage);
          const Icon = item.icon;

          if (item.isCenter) {
            return (
              <a
                key={item.id}
                href={createPageUrl(item.page)}
                onClick={(e) => handleNavClick(e, item.page)}
                data-tap-target
                aria-label={`Go to ${item.label}`}
                className="group flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center"
              >
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg transition-all ${
                    isActive
                      ? "bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/30"
                      : "bg-white/10 group-hover:bg-white/20"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? "text-white" : "text-gray-300"}`} />
                </div>
                <span className={`mt-1 text-[11px] font-medium ${isActive ? "text-red-400" : "text-gray-400"}`}>
                  {item.label}
                </span>
              </a>
            );
          }

          return (
            <a
              key={item.id}
              href={createPageUrl(item.page)}
              onClick={(e) => handleNavClick(e, item.page)}
              data-tap-target
              aria-label={`Go to ${item.label}`}
              className="flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center rounded-xl px-2 py-1"
            >
              <Icon className={`h-5 w-5 transition-colors ${isActive ? "text-red-400" : "text-gray-400"}`} />
              <span className={`mt-1 text-[11px] font-medium transition-colors ${isActive ? "text-red-400" : "text-gray-400"}`}>
                {item.label}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
