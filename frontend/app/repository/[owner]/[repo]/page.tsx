"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getPullRequests, type GithubPullRequest } from "@/lib/github";
import { 
  ArrowLeft, 
  GitPullRequest, 
  User, 
  Calendar, 
  Sparkles,
  Loader2,
  FolderDot,
  BrainCircuit,
  Network
} from "lucide-react";

export default function RepoPage() {
  const params = useParams();
  const router = useRouter();
  const owner = params.owner as string;
  const repoName = params.repo as string;

  const [prs, setPrs] = useState<GithubPullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPRs() {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.provider_token;
        const user = session?.user;

        if (token && user) {
          const data = await getPullRequests(token, owner, repoName);
          setPrs(data || []);
        } else {
          setError("GitHub authentication session not found. Please log in again.");
        }
      } catch (err: unknown) {
        console.error("Error loading PRs:", err);
        setError(err instanceof Error ? err.message : "Failed to load Pull Requests from GitHub API.");
      } finally {
        setLoading(false);
      }
    }

    if (owner && repoName) {
      loadPRs();
    }
  }, [owner, repoName]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="glass-panel border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition duration-200"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 font-medium text-sm">{owner}</span>
              <span className="text-gray-600">/</span>
              <span className="text-white font-extrabold text-sm flex items-center gap-1.5">
                {repoName}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
            <FolderDot className="w-3.5 h-3.5" />
            <span>Repository Details</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-10">
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
            <div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                <Network className="w-8 h-8 text-indigo-500" />
                Repository Intelligence
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Analyze the full codebase or inspect pull requests for {owner}/{repoName}.
              </p>
            </div>
            <Link
              href={`/repository/${owner}/${repoName}/analysis`}
              className="glow-btn inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-xl text-sm transition duration-200"
            >
              <BrainCircuit className="w-4 h-4" />
              Analyze Repository
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card rounded-xl p-5 border border-white/5">
              <BrainCircuit className="w-5 h-5 text-indigo-400 mb-3" />
              <h2 className="text-sm font-bold text-white">Full Codebase Scan</h2>
              <p className="text-xs text-gray-400 mt-1">Fetches repository files recursively and audits architecture, quality, scalability, security, and DevOps.</p>
            </div>
            <div className="glass-card rounded-xl p-5 border border-white/5">
              <Network className="w-5 h-5 text-sky-400 mb-3" />
              <h2 className="text-sm font-bold text-white">Dependency Graph</h2>
              <p className="text-xs text-gray-400 mt-1">Maps imports, folder relationships, circular dependencies, and over-coupled modules.</p>
            </div>
            <div className="glass-card rounded-xl p-5 border border-white/5">
              <GitPullRequest className="w-5 h-5 text-emerald-400 mb-3" />
              <h2 className="text-sm font-bold text-white">PR Diagnostics</h2>
              <p className="text-xs text-gray-400 mt-1">Keeps the existing pull request workflow for focused diff reviews.</p>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <GitPullRequest className="w-6 h-6 text-indigo-500" />
              Pull Requests
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              Choose a branch diff to analyze when pull requests exist.
            </p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500 bg-white/5 border border-white/5 rounded-2xl">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
              <span className="text-sm">Fetching pull requests from GitHub...</span>
            </div>
          ) : error ? (
            <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
              <p className="font-bold">Error Occurred</p>
              <p className="mt-1 opacity-80">{error}</p>
              <Link 
                href="/login" 
                className="inline-block mt-4 text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition"
              >
                Go to Sign In
              </Link>
            </div>
          ) : prs.length === 0 ? (
            <div className="text-center py-20 glass-panel rounded-2xl border border-white/5">
              <GitPullRequest className="w-12 h-12 text-white/10 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white">No Pull Requests</h3>
              <p className="text-gray-400 text-sm mt-1 max-w-xs mx-auto">
                We couldn&apos;t find any open pull requests in this repository.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {prs.map((pr) => {
                const formattedDate = new Date(pr.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric"
                });

                return (
                  <div
                    key={pr.id}
                    className="glass-card p-6 rounded-xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-indigo-500/30 transition duration-300"
                  >
                    <div className="space-y-3 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-indigo-400 text-xs font-bold font-mono">
                          #{pr.number}
                        </span>
                        <span className={`text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-md border ${
                          pr.state === "open" 
                            ? "bg-green-500/10 border-green-500/20 text-green-400" 
                            : "bg-red-500/10 border-red-500/20 text-red-400"
                        }`}>
                          {pr.state}
                        </span>
                      </div>
                      <h3 className="font-bold text-white text-lg hover:text-indigo-300 transition duration-150">
                        {pr.title}
                      </h3>
                      
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
                        <div className="flex items-center gap-1.5">
                          {pr.user.avatar_url ? (
                            <img
                              src={pr.user.avatar_url}
                              alt={pr.user.login}
                              className="w-4 h-4 rounded-full"
                            />
                          ) : (
                            <User className="w-3.5 h-3.5" />
                          )}
                          <span className="font-semibold text-gray-400">{pr.user.login}</span>
                        </div>
                        <span className="text-gray-700">&bull;</span>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formattedDate}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center">
                      <Link
                        href={`/review/${owner}/${repoName}/${pr.number}`}
                        className="glow-btn flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition duration-200 w-full md:w-auto"
                      >
                        <Sparkles className="w-4 h-4" />
                        Run AI Review
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
