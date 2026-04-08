import React, { useState, useRef } from "react";
import { Image, X, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { showToast } from "@/components/ui/toast-provider";

export default function ImageUpload({ 
  value, 
  onChange, 
  placeholder = "Upload image or enter URL",
  accept = "image/*",
  maxSizeMB = 5,
  className = "",
  showPreview = true,
  bucket = "uploads"
}) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(value || "");
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size
    if (file.size > maxSizeMB * 1024 * 1024) {
      showToast(`Image must be under ${maxSizeMB}MB`, "error");
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast("Please select an image file", "error");
      return;
    }

    setUploading(true);
    setPreview(URL.createObjectURL(file));

    try {
      const result = await base44.integrations.Core.UploadFile({ file, bucket });
      onChange(result.file_url);
      showToast("Image uploaded successfully!", "success");
    } catch (error) {
      console.error("Upload error:", error);
      showToast("Failed to upload image", "error");
      setPreview(value || ""); // Reset preview on error
    } finally {
      setUploading(false);
    }
  };

  const handleUrlChange = (e) => {
    const url = e.target.value;
    onChange(url);
    setPreview(url);
  };

  const handleRemove = () => {
    onChange("");
    setPreview("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Preview */}
      {showPreview && preview && (
        <div className="relative group">
          <img 
            src={preview} 
            alt="Preview" 
            className="w-full h-32 object-cover rounded-lg border border-white/[0.1]"
            onError={(e) => {
              e.target.src = "";
              setPreview("");
            }}
          />
          <button
            onClick={handleRemove}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remove image"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Upload Button */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={triggerFileSelect}
          disabled={uploading}
          className="flex-1 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] rounded-lg px-3 py-2 text-white text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload className="w-4 h-4" />
          {uploading ? "Uploading..." : "Choose File"}
        </button>
        
        {!showPreview && (
          <button
            type="button"
            onClick={triggerFileSelect}
            className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm transition-colors"
          >
            Upload
          </button>
        )}
      </div>

      {/* URL Input */}
      <div className="relative">
        <input
          type="text"
          value={value || ""}
          onChange={handleUrlChange}
          placeholder={placeholder}
          className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 pr-8 text-white text-sm placeholder-gray-500 outline-none focus:border-blue-500/40 transition-colors"
        />
        {value && (
          <button
            onClick={handleRemove}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
            title="Clear URL"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Help Text */}
      <p className="text-gray-500 text-[10px]">
        Upload an image ({maxSizeMB}MB max) or paste a direct image URL
      </p>
    </div>
  );
}
