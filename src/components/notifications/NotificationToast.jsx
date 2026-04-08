import { toast } from "sonner";
import { AlertCircle, CheckCircle, Info } from "lucide-react";

export function showNotification(message, type = "info", duration = 4000) {
  const icons = {
    success: <CheckCircle className="w-4 h-4 text-green-400" />,
    error: <AlertCircle className="w-4 h-4 text-red-400" />,
    info: <Info className="w-4 h-4 text-blue-400" />
  };

  toast.custom(
    (t) => (
      <div className={`flex items-center gap-3 px-4 py-3 rounded-lg backdrop-blur-xl border ${
        type === "success" ? "bg-green-950/40 border-green-900/30" :
        type === "error" ? "bg-red-950/40 border-red-900/30" :
        "bg-blue-950/40 border-blue-900/30"
      }`}>
        {icons[type]}
        <span className="text-white text-sm">{message}</span>
      </div>
    ),
    {
      duration: duration,
      position: "bottom-center"
    }
  );
}