"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getPRFiles } from "@/lib/github";
import { reviewCode } from "@/lib/ai";
import { 
  ArrowLeft, 
  Sparkles, 
  Loader2, 
  Code, 
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  ListRestart
} from "lucide-react";

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  
  const owner = params.owner as string;
  const repo = params.repo as string;
  const pr = params.pr as string;

  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prFilesCount, setPrFilesCount] = useState(0);

  useEffect(() => {
    async function runReview() {
      try {
        setLoading(true);
        setError(null);

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.provider_token;
        const user = session?.user;

        if (token && user) {
          const files = await getPRFiles(token, owner, repo, Number(pr));
          setPrFilesCount(files?.length || 0);

          if (!files || files.length === 0) {
            setReview("No files changed in this Pull Request to review.");
            setLoading(false);
            return;
          }

          let combinedPatch = "";
          files.forEach((file) => {
            if (file.patch) {
              combinedPatch += `\n\n--- File: ${file.filename} ---\n${file.patch}`;
            }
          });

          if (!combinedPatch.trim()) {
            setReview("The modified files do not contain any textual code differences (patches) to review.");
            setLoading(false);
            return;
          }

          const aiReview = await reviewCode(combinedPatch);
          // Fix: Ensure we assign an empty string in case the review is null to resolve TypeScript typing errors!
          setReview(aiReview || "Failed to generate review results.");
        } else {
          setError("GitHub authentication session not found. Please log in again.");
        }
      } catch (err: unknown) {
        console.error("Error running AI review:", err);
        setError(err instanceof Error ? err.message : "An error occurred while compiling code diffs and querying the AI model.");
      } finally {
        setLoading(false);
      }
    }

    if (owner && repo && pr) {
      runReview();
    }
  }, [owner, repo, pr]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="glass-panel border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/repository/${owner}/${repo}`)}
              className="p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition duration-200"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 font-semibold text-xs">{owner}</span>
              <span className="text-gray-600">/</span>
              <span className="text-gray-400 font-semibold text-xs">{repo}</span>
              <span className="text-gray-600">/</span>
              <span className="text-indigo-400 font-bold text-xs">PR #{pr}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Review Diagnostics</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10">
        <div className="space-y-6">
          
          {/* Headline */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                <Sparkles className="w-8 h-8 text-indigo-500 animate-pulse-slow" />
                AI Code Review Report
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Deep analysis of changed files using Groq-powered LLaMA 3.3.
              </p>
            </div>
            
            {!loading && !error && (
              <div className="flex items-center gap-2 bg-white/5 border border-white/5 px-4 py-2 rounded-xl text-xs text-gray-400 font-mono">
                <FileCode2 className="w-4 h-4 text-indigo-400" />
                <span>Reviewed {prFilesCount} files</span>
              </div>
            )}
          </div>

          {/* Core Visual Logic */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-center glass-panel rounded-2xl border border-white/5 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-pulse-slow"></div>
              
              <Loader2 className="w-12 h-12 animate-spin text-indigo-500 mb-6" />
              
              <h3 className="text-xl font-bold text-white mb-2">Analyzing Pull Request...</h3>
              <p className="text-gray-400 text-sm max-w-md mx-auto px-6">
                Please wait while we pull file changes, extract git diff patches, and construct diagnostic vectors for our AI review engine. This may take a few moments.
              </p>

              {/* Status Checklist animation */}
              <div className="mt-8 space-y-2 text-left max-w-xs mx-auto border-t border-white/5 pt-6 w-full px-6">
                <div className="flex items-center gap-2.5 text-xs text-green-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Retrieved pull request files</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-indigo-400 font-semibold animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing patch changes...</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-gray-600 font-semibold">
                  <Code className="w-4 h-4" />
                  <span>Running LLM review engine</span>
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="p-8 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-300">
              <div className="flex items-center gap-3 mb-3">
                <AlertTriangle className="w-6 h-6 text-red-400" />
                <h3 className="text-lg font-bold text-white">Diagnostics Failed</h3>
              </div>
              <p className="text-sm opacity-80 mb-6">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-xl transition duration-150"
              >
                <ListRestart className="w-4 h-4" />
                Retry Diagnostics
              </button>
            </div>
          ) : (
            <div className="glass-panel p-8 rounded-2xl border border-white/5 shadow-2xl relative overflow-hidden animate-fade-in">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-indigo-300"></div>
              
              <div className="prose prose-invert max-w-none text-gray-300 leading-relaxed text-sm sm:text-base space-y-4">
                {/* Standard formatting support for basic raw markdown structure in pre-wrap block */}
                <div className="whitespace-pre-wrap font-sans">
                  {review}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
