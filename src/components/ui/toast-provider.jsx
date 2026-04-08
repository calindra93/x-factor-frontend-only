import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, CheckCircle, AlertTriangle, XCircle, Info } from "lucide-react";

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  info: Info
};

const COLORS = {
  success: "border-green-500/40 bg-green-500/10 text-green-300",
  warning: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  error: "border-red-500/40 bg-red-500/10 text-red-300",
  info: "border-blue-500/40 bg-blue-500/10 text-blue-300"
};

const ICON_COLORS = {
  success: "text-green-400",
  warning: "text-yellow-400",
  error: "text-red-400",
  info: "text-blue-400"
};

let _globalShowToast = null;

export function showToast(message, type = "info", duration = 3500) {
  if (_globalShowToast) {
    _globalShowToast(message, type, duration);
  } else {
    console.warn("[Toast] Provider not mounted, falling back to console:", message);
  }
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { showToast };
  }
  return ctx;
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idCounter = useRef(0);

  const addToast = useCallback((message, type = "info", duration = 3500) => {
    const id = ++idCounter.current;
    setToasts((prev) => [...prev.slice(-4), { id, message, type, duration }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  _globalShowToast = addToast;

  return (
    <ToastContext.Provider value={{ showToast: addToast }}>
      {children}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-[90vw] max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => {
            const Icon = ICONS[toast.type] || Info;
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2.5 backdrop-blur-md shadow-lg ${COLORS[toast.type]}`}
              >
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${ICON_COLORS[toast.type]}`} />
                <span className="text-xs font-medium flex-1 leading-snug">{toast.message}</span>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-white/40 hover:text-white/70 flex-shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
