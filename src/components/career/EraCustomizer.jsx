import React, { useState } from "react";
import { X, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { showToast } from "@/components/ui/toast-provider";

const PRESET_COLORS = [
  "#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7ff",
  "#30b0c0", "#af52de", "#ff2d55", "#a2845e", "#8b7355"
];

export default function EraCustomizer({ era, onSave, onClose, profile }) {
  const [eraName, setEraName] = useState(era?.era_name || "Untitled Era");
  const [themeColor, setThemeColor] = useState(era?.theme_color || "#ff3b30");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!eraName.trim()) {
      showToast("Era name cannot be empty", "warning");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        era_name: eraName,
        theme_color: themeColor
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-50 flex items-end bg-black/50"
    >
      <div className="w-full bg-[#111118] border-t border-white/[0.08] rounded-t-3xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-xl font-bold">Customize Era</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Era Name */}
        <div className="space-y-2">
          <label className="text-gray-400 text-sm font-medium">Era Name</label>
          <Input
            value={eraName}
            onChange={(e) => setEraName(e.target.value)}
            placeholder="Name your era..."
            className="bg-white/[0.04] border-white/[0.08] text-white"
            maxLength={50}
          />
          <p className="text-gray-500 text-xs">{eraName.length}/50 characters</p>
        </div>

        {/* Theme Color */}
        <div className="space-y-3">
          <label className="text-gray-400 text-sm font-medium flex items-center gap-2">
            <Palette className="w-4 h-4" />
            Theme Color
          </label>

          {/* Color Presets */}
          <div className="grid grid-cols-5 gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setThemeColor(color)}
                className={`h-10 rounded-lg transition-all border-2 ${
                  themeColor === color
                    ? "border-white"
                    : "border-transparent hover:border-white/20"
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>

          {/* Custom Color Input */}
          <div className="flex gap-2 items-center">
            <Input
              type="color"
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              className="h-10 w-16 cursor-pointer"
            />
            <Input
              type="text"
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              placeholder="#ff3b30"
              className="bg-white/[0.04] border-white/[0.08] text-white text-sm"
              maxLength={7}
            />
          </div>
        </div>

        {/* Preview */}
        <div
          className="p-4 rounded-xl border-2 transition-colors"
          style={{
            borderColor: themeColor,
            backgroundColor: `${themeColor}10`
          }}
        >
          <p className="text-white text-sm font-semibold">{eraName}</p>
          <p className="text-gray-400 text-xs mt-1">This is how your era will look</p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-red-600 hover:bg-red-700"
          >
            {saving ? "Saving..." : "Save Era"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}