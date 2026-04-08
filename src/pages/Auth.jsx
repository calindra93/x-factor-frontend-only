// @ts-nocheck
import React, { useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../components/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogIn, UserPlus, FlaskConical } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

export default function Auth() {
  const navigate = useNavigate();
  const { checkAppState } = useAuth();
  const [mode, setMode] = useState(null); // null, 'signup', 'signin'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    accessCode: "",
  });

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const isDev = import.meta.env.DEV;

  const handleDevDemo = async () => {
    setError("");
    setInfo("");
    setLoading(true);
    const demoUserId = `dev-demo-${Date.now()}`;
    localStorage.setItem("dev_demo_mode", "1");
    localStorage.setItem("user_account_id", demoUserId);
    localStorage.setItem("user_email", "demo@xfactor.local");

    try {
      const existing = await base44.entities.ArtistProfile.filter({ user_account_id: demoUserId });
      if (!existing?.length) {
        await base44.entities.ArtistProfile.create({
          user_account_id: demoUserId,
          artist_name: "Demo Artist",
          genre: "Pop",
          region: "United States",
          followers: 110,
          clout: 5,
          income: 700,
          energy: 85,
          max_energy: 100,
          inspiration: 90,
          hype: 40,
          label: "Independent",
        });
      }
    } catch (err) {
      console.warn("[Auth] Demo seed failed; continuing in local demo mode.", err);
    }

    await checkAppState();
    navigate(createPageUrl("HomeV2"));
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!isValidEmail(form.email)) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const { data, error: signUpErr } = await supabaseClient.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/Auth`,
        },
      });

      if (signUpErr) throw signUpErr;

      // If confirmations are enabled, there may be no session yet.
      // Either way, the user should show up in Supabase Auth -> Users.
      setInfo(
        "Account created. If email confirmation is enabled, check your inbox then come back and sign in."
      );

      // If a session exists immediately, you can route right away.
      if (data?.session?.user?.id || data?.user?.id) {
        const userId = data.session?.user?.id || data.user?.id;
        localStorage.setItem("user_account_id", userId);
        localStorage.setItem("user_email", form.email);
        navigate(createPageUrl("Onboarding"));
        return;
      }

      setLoading(false);
    } catch (err) {
      setError(err?.message || "Unable to create your account. Please try again.");
      setLoading(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!isValidEmail(form.email)) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const { data, error: signInErr } = await supabaseClient.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });

      if (signInErr) throw signInErr;

      const userId = data?.user?.id;
      localStorage.setItem("user_account_id", userId || "");
      localStorage.setItem("user_email", data?.user?.email || form.email);

      // Next page decision can be refined later (profile existence, etc).
      navigate(createPageUrl("Onboarding"));
    } catch (err) {
      setError(err?.message || "Unable to sign in. Please try again.");
      setLoading(false);
    }
  };

  if (!mode) {
    return (
      <div className="min-h-full bg-[#0a0a0f] flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-red-600/10 rounded-full blur-[140px]" />

        <div className="mb-16 text-center relative z-10">
          <div className="relative mx-auto mb-4" style={{ width: 220 }}>
            <div className="absolute inset-0 rounded-full bg-red-600/20 blur-[60px]" />
            <img
              src="/xf-logo.png"
              alt="X-Factor"
              className="relative w-full h-auto drop-shadow-[0_0_40px_rgba(239,68,68,0.5)]"
              style={{ filter: "drop-shadow(0 0 32px rgba(239,68,68,0.45))" }}
            />
          </div>
          <p className="text-gray-400 text-sm tracking-[0.3em] uppercase mt-2">Build Your Music Empire</p>
        </div>

        <div className="w-full max-w-sm space-y-4 relative z-10">
          <Button
            onClick={() => setMode("signup")}
            className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white rounded-xl h-14 text-base font-semibold shadow-2xl shadow-red-500/30"
          >
            <UserPlus className="w-5 h-5 mr-2" />
            Create An Account
          </Button>
          <Button
            onClick={() => setMode("signin")}
            variant="outline"
            className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-xl h-14 text-base font-semibold backdrop-blur-xl"
          >
            <LogIn className="w-5 h-5 mr-2" />
            Sign In
          </Button>
          {isDev && (
            <Button
              onClick={handleDevDemo}
              variant="outline"
              className="w-full bg-emerald-500/10 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/20 rounded-xl h-12 text-sm font-semibold"
            >
              <FlaskConical className="w-4 h-4 mr-2" />
              Enter Demo Mode (Dev)
            </Button>
          )}
        </div>

        <p className="text-gray-600 text-xs mt-12 relative z-10">The game is still within active development. Expect bugs & incomplete features.</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0a0a0f] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-red-600/8 rounded-full blur-[120px]" />

      <div className="mb-8 text-center relative z-10">
        <div className="relative mx-auto" style={{ width: 140 }}>
          <div className="absolute inset-0 rounded-full bg-red-600/15 blur-[40px]" />
          <img
            src="/xf-logo.png"
            alt="X-Factor"
            className="relative w-full h-auto"
            style={{ filter: "drop-shadow(0 0 20px rgba(239,68,68,0.4))" }}
          />
        </div>
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/[0.06] rounded-2xl p-8 shadow-2xl">
          <h2 className="text-white text-2xl font-bold mb-6 text-center">
            {mode === "signup" ? "Create Your Account" : "Welcome Back"}
          </h2>

          <form onSubmit={mode === "signup" ? handleSignUp : handleSignIn} className="space-y-4">
            <div>
              <label className="text-gray-400 text-sm mb-2 block">Email</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="your@email.com"
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 h-12 rounded-xl focus:border-red-500/50 focus:ring-red-500/20"
              />
              {mode === "signup" && form.email && (
                <div className="mt-2">
                  {isValidEmail(form.email) ? (
                    <p className="text-emerald-400 text-xs">Valid email format.</p>
                  ) : (
                    <p className="text-gray-500 text-xs">Please enter a valid email address.</p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-2 block">Password</label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="••••••••"
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 h-12 rounded-xl focus:border-red-500/50 focus:ring-red-500/20"
              />
            </div>

            {mode === "signup" && (
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Access Code (optional)</label>
                <Input
                  type="text"
                  value={form.accessCode}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, accessCode: e.target.value.toUpperCase() }))
                  }
                  placeholder="Enter access code"
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 h-12 rounded-xl focus:border-red-500/50 focus:ring-red-500/20 font-mono tracking-wider"
                />
              </div>
            )}

            {info && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                <p className="text-emerald-300 text-sm">{info}</p>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white rounded-xl h-12 font-semibold shadow-lg shadow-red-500/20 disabled:opacity-30 mt-6"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : mode === "signup" ? (
                "Continue"
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <button
            onClick={() => {
              setMode(null);
              setError("");
              setInfo("");
              setLoading(false);
            }}
            className="w-full text-gray-500 text-sm mt-4 hover:text-gray-400 transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
