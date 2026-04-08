import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabaseClient } from "@/lib/supabaseClient";
import { Settings as SettingsIcon, Trash2, LogOut, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatePresence } from "framer-motion";
import BackButton from "../components/BackButton";
import ErrorLogViewer from "../components/ErrorLogViewer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Settings() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showErrorLog, setShowErrorLog] = useState(false);

  const handleDeleteAccount = async () => {
    try {
      setIsDeleting(true);
      
      const userAccountId = localStorage.getItem('user_account_id');
      if (!userAccountId) {
        console.error("No user account found");
        return;
      }

      // Delete artist profile
      const profiles = await base44.entities.ArtistProfile.filter({ user_account_id: userAccountId });
      if (profiles.length > 0) {
        await base44.entities.ArtistProfile.delete(profiles[0].id);
      }

      // Delete user account
      await base44.entities.UserAccount.delete(userAccountId);

      // Clear localStorage and redirect
      localStorage.removeItem('user_account_id');
      localStorage.removeItem('user_email');
      window.location.href = '/';
    } catch (error) {
      console.error("Failed to delete account:", error);
      setIsDeleting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabaseClient.auth.signOut();
    } catch {
      // ignore signOut errors
    }
    localStorage.removeItem('user_account_id');
    localStorage.removeItem('user_email');
    window.location.href = '/';
  };

  return (
    <div className="min-h-full bg-[#0a0a0f] pb-4 max-w-md mx-auto px-4">
      <BackButton />
      <div className="flex items-center gap-3 mb-6 pt-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <SettingsIcon className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">Settings</h1>
            <p className="text-gray-500 text-xs">Manage your account</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Account Section */}
          <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-4 space-y-3">
            <h2 className="text-white font-semibold text-sm mb-3">Account</h2>
            
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full justify-start gap-3 bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] text-white"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out</span>
            </Button>
          </div>

          {/* Debug / Error Log */}
          <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-4 space-y-3">
            <h2 className="text-white font-semibold text-sm mb-3">Debug</h2>
            <Button
              onClick={() => setShowErrorLog(true)}
              variant="outline"
              className="w-full justify-start gap-3 bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] text-white"
            >
              <Bug className="w-4 h-4" />
              <span>Error Log</span>
            </Button>
          </div>

          {/* Danger Zone */}
          <div className="bg-red-500/[0.04] border border-red-500/[0.15] rounded-2xl p-4 space-y-3">
            <h2 className="text-red-400 font-semibold text-sm mb-3">Danger Zone</h2>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 bg-red-500/[0.08] border-red-500/[0.25] hover:bg-red-500/[0.15] text-red-400"
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeleting ? "Deleting..." : "Delete Account"}</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-[#0a0a0f] border-red-500/[0.25]">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription className="text-gray-400">
                    This action cannot be undone. This will permanently delete your account,
                    artist profile, releases, and all associated data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-white/[0.06] border-white/[0.08] text-white hover:bg-white/[0.10]">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    className="bg-red-500 hover:bg-red-600 text-white"
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Deleting..." : "Delete Account"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
      </div>

      <AnimatePresence>
        {showErrorLog && <ErrorLogViewer onClose={() => setShowErrorLog(false)} />}
      </AnimatePresence>
    </div>
  );
}