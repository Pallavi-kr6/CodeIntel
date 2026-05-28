"use client";

import { supabase } from "@/lib/supabase";
import { Code2, Bot, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";

export default function Login() {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: typeof window !== "undefined" ? `${window.location.origin}/` : undefined,
        },
      });
      if (error) throw error;
    } catch (err) {
      console.error("Auth error:", err);
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen justify-center items-center px-4 relative overflow-hidden bg-[#030712]">
      {/* Background visual accents */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl animate-pulse-slow"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: "1.5s" }}></div>

      {/* Main glass card */}
      <div className="glass-panel w-full max-w-md p-8 rounded-2xl border border-white/10 shadow-2xl relative z-10">
        
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/25 mb-4 text-indigo-400">
            <Bot className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            AI Code Reviewer
          </h1>
          <p className="text-gray-400 mt-2 text-sm">
            Automate code reviews with advanced artificial intelligence.
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="space-y-4 mb-8">
          <div className="flex items-start gap-3 text-left">
            <div className="p-1.5 bg-indigo-500/10 rounded-md text-indigo-400 mt-0.5">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-200">Instant PR Diagnostics</h4>
              <p className="text-xs text-gray-400">Analyze code changes automatically on any connected pull request.</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3 text-left">
            <div className="p-1.5 bg-purple-500/10 rounded-md text-purple-400 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-200">LLaMA 3.3 Intelligence</h4>
              <p className="text-xs text-gray-400">Powered by high-quality versatile language models for smart code advice.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 text-left">
            <div className="p-1.5 bg-pink-500/10 rounded-md text-pink-400 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-200">Secure Integration</h4>
              <p className="text-xs text-gray-400">OAuth verification directly through GitHub keeping credentials safe.</p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={signIn}
          disabled={loading}
          className="glow-btn w-full flex items-center justify-center gap-3 bg-white text-[#030712] hover:bg-gray-100 font-bold py-3.5 px-6 rounded-xl text-md transition duration-300 shadow-lg shadow-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"/>
          </svg>
          {loading ? "Connecting to GitHub..." : "Sign in with GitHub"}
        </button>

        {/* Info footer */}
        <p className="text-center text-xs text-gray-500 mt-6">
          By signing in, you grant read permissions to list your repositories and pull requests.
        </p>

      </div>
    </div>
  );
}