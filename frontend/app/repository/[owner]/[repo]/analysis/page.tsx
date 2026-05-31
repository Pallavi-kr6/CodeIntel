"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  FileCode2,
  GitBranch,
  GitFork,
  Layers3,
  Loader2,
  Network,
  Play,
  RefreshCcw,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
  info: "#38bdf8",
};

interface Scan {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  current_stage: string;
  error_message?: string;
  branch: string;
  commit_sha?: string;
  analyzed_files: number;
  skipped_files: number;
  total_lines: number;
  health_score: number;
  architecture_score: number;
  engineering_quality_score: number;
  maintainability_score: number;
  scalability_score: number;
  security_score: number;
  technical_debt_score: number;
  risk_distribution: Array<{ name: string; value: number }>;
  complexity_heatmap: Array<{ file: string; complexity: number; risk: number; maintainability: number }>;
  graph: {
    circularDependencies?: string[][];
    coupledModules?: Array<{ path: string; score: number; dependencyCount: number; dependentsCount: number }>;
    folderRelationships?: Array<{ from: string; to: string; count: number }>;
  };
  architecture_reports?: Array<{
    summary: string;
    production_readiness: string;
    priority_fixes: string[];
    refactoring_suggestions: string[];
    recommendations: string[];
  }>;
  security_reports?: Array<{
    score: number;
    critical_findings: number;
    high_findings: number;
    findings: ScanIssue[];
  }>;
  technical_debt_reports?: Array<{
    score: number;
    hotspots: HeatmapPoint[];
    refactoring_plan: string[];
  }>;
  file_analyses?: Array<{
    file_path: string;
    language: string;
    purpose: string;
    lines: number;
    complexity: number;
    risk_score: number;
    maintainability_score: number;
    issues: ScanIssue[];
  }>;
}

interface ScanIssue {
  id?: string;
  category?: string;
  severity?: string;
  title?: string;
  description?: string;
  recommendation?: string;
  filePath?: string;
}

interface HeatmapPoint {
  file: string;
  complexity: number;
  risk: number;
  maintainability: number;
}

export default function RepositoryAnalysisPage() {
  const router = useRouter();
  const params = useParams();
  const owner = params.owner as string;
  const repo = params.repo as string;

  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function authHeaders() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token || !session.provider_token) {
      throw new Error("GitHub and Supabase session not found. Please sign in again.");
    }

    return {
      Authorization: `Bearer ${session.access_token}`,
      "x-github-token": session.provider_token,
    };
  }

  const loadLatestScan = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("Supabase session not found. Please sign in again.");
        return;
      }

      const response = await fetch(`/api/repository-scans?owner=${owner}&repo=${repo}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load repository scan.");
      setScan(payload.scan);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load repository analysis.");
    } finally {
      setLoading(false);
    }
  }, [owner, repo]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadLatestScan();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadLatestScan]);

  async function runAnalysis() {
    try {
      setAnalyzing(true);
      setError(null);
      setScan((current) =>
        current
          ? { ...current, status: "running", progress: 8, current_stage: "fetching" }
          : ({
              id: "pending",
              status: "running",
              progress: 8,
              current_stage: "fetching",
              branch: "default",
              analyzed_files: 0,
              skipped_files: 0,
              total_lines: 0,
              health_score: 0,
              architecture_score: 0,
              engineering_quality_score: 0,
              maintainability_score: 0,
              scalability_score: 0,
              security_score: 0,
              technical_debt_score: 0,
              risk_distribution: [],
              complexity_heatmap: [],
              graph: {},
            } as Scan)
      );

      const response = await fetch("/api/repository-scans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({ owner, repo }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Repository analysis failed.");
      setScan(payload.scan);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Repository analysis failed.";
      setError(message);
      setScan((current) => (current ? { ...current, status: "failed", error_message: message } : current));
    } finally {
      setAnalyzing(false);
    }
  }

  const report = scan?.architecture_reports?.[0];
  const highRiskFiles = useMemo(
    () => [...(scan?.file_analyses || [])].sort((a, b) => b.risk_score - a.risk_score).slice(0, 8),
    [scan]
  );
  const allIssues = useMemo(() => (scan?.file_analyses || []).flatMap((file) => file.issues || []), [scan]);
  const trendData = useMemo(
    () => [
      { name: "Architecture", score: scan?.architecture_score || 0 },
      { name: "Quality", score: scan?.engineering_quality_score || 0 },
      { name: "Maintainability", score: scan?.maintainability_score || 0 },
      { name: "Scalability", score: scan?.scalability_score || 0 },
      { name: "Security", score: scan?.security_score || 0 },
      { name: "Tech Debt", score: scan?.technical_debt_score || 0 },
    ],
    [scan]
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="glass-panel border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.push(`/repository/${owner}/${repo}`)}
              className="p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>{owner}</span>
                <span>/</span>
                <span>{repo}</span>
              </div>
              <h1 className="text-sm font-extrabold text-white truncate">Repository Intelligence</h1>
            </div>
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="glow-btn inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold px-4 py-2 rounded-xl text-sm transition"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : scan ? <RefreshCcw className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {analyzing ? "Analyzing" : scan ? "Re-analyze" : "Analyze Repository"}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-6">
        {loading ? (
          <EmptyState icon={<Loader2 className="w-10 h-10 animate-spin text-indigo-400" />} title="Loading repository intelligence" />
        ) : error ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-5 text-red-200 text-sm">{error}</div>
        ) : !scan ? (
          <EmptyState
            icon={<BrainCircuit className="w-12 h-12 text-indigo-400" />}
            title="No full-codebase analysis yet"
            description="Run a repository scan to audit architecture, code quality, security, scalability, DevOps, and high-risk files without relying on pull requests."
            action={runAnalysis}
          />
        ) : scan.status === "running" || analyzing ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-2xl p-8 border border-white/5">
            <div className="flex items-center gap-3">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              <div>
                <h2 className="text-xl font-extrabold text-white">Analyzing full repository</h2>
                <p className="text-sm text-gray-400 capitalize">{scan.current_stage.replaceAll("_", " ")}</p>
              </div>
            </div>
            <div className="mt-6 h-3 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.max(scan.progress, 8)}%` }} />
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Fetching files, filtering generated assets, running static analysis, building import graph, and synthesizing the AI audit.
            </p>
          </motion.div>
        ) : (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <ScoreCard label="Health" value={scan.health_score} icon={<CheckCircle2 className="w-5 h-5" />} />
              <ScoreCard label="Security" value={scan.security_score} icon={<ShieldCheck className="w-5 h-5" />} />
              <ScoreCard label="Architecture" value={scan.architecture_score} icon={<Network className="w-5 h-5" />} />
              <ScoreCard label="Technical Debt" value={scan.technical_debt_score} icon={<Layers3 className="w-5 h-5" />} inverse />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 glass-panel rounded-2xl p-6 border border-white/5">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-extrabold text-white">Engineering Scorecard</h2>
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <GitBranch className="w-3.5 h-3.5" />
                    {scan.branch}
                  </div>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} domain={[0, 100]} />
                      <Tooltip contentStyle={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                      <Area type="monotone" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.18} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-panel rounded-2xl p-6 border border-white/5">
                <h2 className="text-lg font-extrabold text-white mb-5">Risk Distribution</h2>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={scan.risk_distribution || []} dataKey="value" nameKey="name" innerRadius={58} outerRadius={94} paddingAngle={3}>
                        {(scan.risk_distribution || []).map((entry) => (
                          <Cell key={entry.name} fill={COLORS[entry.name] || "#64748b"} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2 glass-panel rounded-2xl p-6 border border-white/5">
                <h2 className="text-lg font-extrabold text-white mb-3">AI Architecture Review</h2>
                <p className="text-sm text-gray-300 leading-6">{report?.summary || "No architecture summary was generated."}</p>
                <p className="text-sm text-gray-400 leading-6 mt-4">{report?.production_readiness}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <RecommendationList title="Priority Fixes" items={report?.priority_fixes || []} />
                  <RecommendationList title="Refactoring Plan" items={report?.refactoring_suggestions || []} />
                </div>
              </div>

              <div className="glass-panel rounded-2xl p-6 border border-white/5">
                <h2 className="text-lg font-extrabold text-white mb-4">Scan Coverage</h2>
                <MetricRow label="Analyzed files" value={scan.analyzed_files} />
                <MetricRow label="Skipped files" value={scan.skipped_files} />
                <MetricRow label="Lines analyzed" value={scan.total_lines} />
                <MetricRow label="Circular dependencies" value={scan.graph?.circularDependencies?.length || 0} />
                <MetricRow label="Total findings" value={allIssues.length} />
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="glass-panel rounded-2xl p-6 border border-white/5">
                <h2 className="text-lg font-extrabold text-white mb-5">Complexity Heatmap</h2>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={(scan.complexity_heatmap || []).slice(0, 12)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="file" stroke="#9ca3af" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={90} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                      <Bar dataKey="complexity" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="risk" fill="#f97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-panel rounded-2xl p-6 border border-white/5">
                <h2 className="text-lg font-extrabold text-white mb-5">High-Risk Files</h2>
                <div className="space-y-3">
                  {highRiskFiles.map((file) => (
                    <div key={file.file_path} className="rounded-xl bg-white/5 border border-white/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{file.file_path}</p>
                          <p className="text-xs text-gray-500 mt-1">{file.purpose}</p>
                        </div>
                        <span className="text-xs font-mono text-orange-300 bg-orange-500/10 border border-orange-500/20 px-2 py-1 rounded-lg">
                          {file.risk_score}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="glass-panel rounded-2xl p-6 border border-white/5">
              <h2 className="text-lg font-extrabold text-white mb-5">Repository Graph Findings</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <GraphList
                  icon={<GitFork className="w-4 h-4" />}
                  title="Over-coupled Modules"
                  items={(scan.graph?.coupledModules || []).slice(0, 8).map((item) => `${item.path} · score ${item.score}`)}
                />
                <GraphList
                  icon={<ShieldAlert className="w-4 h-4" />}
                  title="Circular Dependencies"
                  items={(scan.graph?.circularDependencies || []).slice(0, 8).map((cycle) => cycle.join(" -> "))}
                />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: () => void;
}) {
  return (
    <div className="glass-panel rounded-2xl p-10 border border-white/5 text-center">
      <div className="mx-auto w-fit mb-4">{icon}</div>
      <h2 className="text-xl font-extrabold text-white">{title}</h2>
      {description && <p className="text-sm text-gray-400 max-w-xl mx-auto mt-2">{description}</p>}
      {action && (
        <button onClick={action} className="glow-btn mt-6 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm">
          <Play className="w-4 h-4" />
          Analyze Repository
        </button>
      )}
    </div>
  );
}

function ScoreCard({ label, value, icon, inverse }: { label: string; value: number; icon: React.ReactNode; inverse?: boolean }) {
  const color = inverse ? debtColor(value) : scoreColor(value);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-2xl p-5 border border-white/5">
      <div className="flex items-center justify-between">
        <div className={`p-2 rounded-xl ${color.bg} ${color.text}`}>{icon}</div>
        <span className={`text-3xl font-black ${color.text}`}>{value}</span>
      </div>
      <p className="mt-4 text-sm font-bold text-white">{label}</p>
      <div className="mt-3 h-2 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${color.bar}`} style={{ width: `${value}%` }} />
      </div>
    </motion.div>
  );
}

function RecommendationList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/5 p-4">
      <h3 className="text-sm font-bold text-white mb-3">{title}</h3>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-gray-500">No recommendations generated.</p>
        ) : (
          items.slice(0, 6).map((item) => (
            <div key={item} className="flex gap-2 text-xs text-gray-300 leading-5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>{item}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-3 last:border-b-0">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-bold text-white font-mono">{value.toLocaleString()}</span>
    </div>
  );
}

function GraphList({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/5 p-4">
      <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h3>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-gray-500">No findings detected.</p>
        ) : (
          items.map((item) => (
            <div key={item} className="flex items-center gap-2 text-xs text-gray-300 bg-black/10 rounded-lg px-3 py-2">
              <FileCode2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="truncate">{item}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function scoreColor(value: number) {
  if (value >= 80) return { text: "text-emerald-300", bg: "bg-emerald-500/10", bar: "bg-emerald-500" };
  if (value >= 60) return { text: "text-amber-300", bg: "bg-amber-500/10", bar: "bg-amber-500" };
  return { text: "text-red-300", bg: "bg-red-500/10", bar: "bg-red-500" };
}

function debtColor(value: number) {
  return scoreColor(value);
}
