"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getGithubRepos, saveRepository, type GithubRepository } from "@/lib/github";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { 
  GitBranch, 
  Search, 
  Sparkles, 
  LogOut, 
  ExternalLink, 
  Database,
  Code2,
  FolderGit2,
  Loader2,
  User
} from "lucide-react";

export default function Home() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [repos, setRepos] = useState<GithubRepository[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [connectingId, setConnectingId] = useState<number | null>(null);

  useEffect(() => {
    async function loadUserAndRepos() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);

        if (user) {
          // 1. Sync User into the public.users database to avoid Foreign Key violations on connected repos!
          const { error: syncError } = await supabase.from("users").upsert({
            id: user.id,
            email: user.email,
            name: user.user_metadata.full_name || user.user_metadata.preferred_username || user.email?.split("@")[0] || "User",
          });
          
          if (syncError) {
            console.error("Failed to sync authenticated user profile to public database:", syncError);
          }

          // 2. Fetch Github repositories
          const { data: { session } } = await supabase.auth.getSession();
          const providerToken = session?.provider_token;

          if (providerToken) {
            const repoData = await getGithubRepos(providerToken);
            setRepos(repoData);
          }
        }
      } catch (error) {
        console.error("Initialization error:", error);
      } finally {
        setLoading(false);
      }
    }

    loadUserAndRepos();
  }, []);

  async function handleConnect(repo: GithubRepository) {
    if (!user) return;
    try {
      setConnectingId(repo.id);
      await saveRepository(user.id, repo);
      alert(`Successfully connected ${repo.name} to AI Code Reviewer!`);
    } catch (err: unknown) {
      console.error(err);
      alert(`Failed to connect repository: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setConnectingId(null);
    }
  }

  const filteredRepos = repos.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (repo.description && repo.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header / Navbar */}
      <header className="glass-panel border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20 text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="font-extrabold text-xl bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
              AI Code Reviewer
            </span>
          </div>

          {user ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                {user.user_metadata.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt="avatar"
                    className="w-5 h-5 rounded-full ring-1 ring-white/10"
                  />
                ) : (
                  <User className="w-4 h-4 text-gray-400" />
                )}
                <span className="text-sm font-semibold text-gray-300">
                  {user.user_metadata.preferred_username || user.email}
                </span>
              </div>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  location.reload();
                }}
                className="p-2 text-gray-400 hover:text-red-400 bg-white/5 hover:bg-red-500/10 border border-white/5 hover:border-red-500/20 rounded-xl transition duration-200"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="glow-btn bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-xl text-sm transition duration-200"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10">
        {!user ? (
          <div className="glass-panel text-center py-20 px-6 rounded-3xl border border-white/5 mt-10">
            <Code2 className="w-16 h-16 text-indigo-400/30 mx-auto mb-6" />
            <h2 className="text-3xl font-extrabold text-white">Review Code with AI</h2>
            <p className="text-gray-400 mt-3 max-w-lg mx-auto">
              Connect your GitHub repositories, fetch your pull requests, and let an expert AI review your code for bugs, performance bottlenecks, and security flaws instantly.
            </p>
            <Link
              href="/login"
              className="glow-btn inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-3.5 rounded-xl mt-8 transition duration-200"
            >
              Get Started
            </Link>
          </div>
        ) : (
          <div className="space-y-8 animate-fade-in">
            {/* Greeting / Intro */}
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight text-white">
                Welcome back, {user.user_metadata.full_name || "Developer"}
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                Select a repository to inspect its active pull requests and run diagnostics.
              </p>
            </div>

            {/* Repos Listing Header & Filters */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search repositories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/5 rounded-xl text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 text-white transition duration-200"
                  />
                </div>
                <div className="flex items-center gap-2.5 text-xs text-indigo-300 bg-indigo-500/10 px-3.5 py-2.5 rounded-xl border border-indigo-500/20 font-semibold self-start sm:self-auto">
                  <FolderGit2 className="w-4 h-4" />
                  <span>{repos.length} Repositories Found</span>
                </div>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
                  <span>Loading GitHub repositories...</span>
                </div>
              ) : filteredRepos.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <Database className="w-12 h-12 text-white/10 mx-auto mb-4" />
                  <p className="text-sm">No repositories found matching your query.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredRepos.map((repo) => (
                    <div
                      key={repo.id}
                      className="glass-card p-5 rounded-xl flex flex-col justify-between"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <Link
                            href={`/repository/${repo.owner.login}/${repo.name}`}
                            className="font-bold text-white hover:text-indigo-400 text-lg flex items-center gap-1.5 transition duration-150"
                          >
                            {repo.name}
                            <ExternalLink className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
                          </Link>
                          {repo.private && (
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-gray-400">
                              Private
                            </span>
                          )}
                        </div>
                        <p className="text-gray-400 text-xs line-clamp-2 h-8">
                          {repo.description || "No description provided."}
                        </p>
                      </div>

                      <div className="mt-5 flex items-center justify-between pt-4 border-t border-white/5">
                        <div className="flex items-center gap-1 text-[11px] text-gray-500">
                          <GitBranch className="w-3.5 h-3.5" />
                          <span>{repo.default_branch}</span>
                        </div>
                        
                        <button
                          onClick={() => handleConnect(repo)}
                          disabled={connectingId === repo.id}
                          className="bg-indigo-600/10 hover:bg-indigo-600 border border-indigo-500/20 hover:border-indigo-500 text-indigo-300 hover:text-white font-semibold text-xs px-3.5 py-2 rounded-lg transition duration-200 flex items-center gap-1.5"
                        >
                          {connectingId === repo.id ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              <Database className="w-3.5 h-3.5" />
                              Connect
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/5 py-6">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 gap-4">
          <span>&copy; {new Date().getFullYear()} AI Code Reviewer. Powered by DeepMind & Antigravity.</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-indigo-400 transition">Terms</a>
            <a href="#" className="hover:text-indigo-400 transition">Privacy</a>
            <a href="#" className="hover:text-indigo-400 transition">Docs</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
