import { generateAiAudit } from "./ai-audit";
import { buildRepositoryGraph } from "./graph";
import { analyzeFiles } from "./static-analysis";
import type {
  AnalysisIssue,
  RepositoryAuditResult,
  RepositoryFile,
  RepositoryScores,
  ScanProgress,
} from "./types";

interface RunRepositoryAnalysisInput {
  owner: string;
  repo: string;
  files: RepositoryFile[];
  skippedFiles: number;
  onProgress?: (progress: ScanProgress) => Promise<void> | void;
}

export async function runRepositoryAnalysis({
  owner,
  repo,
  files,
  skippedFiles,
  onProgress,
}: RunRepositoryAnalysisInput): Promise<RepositoryAuditResult> {
  await onProgress?.({
    stage: "static_analysis",
    percent: 35,
    message: "Running TypeScript, security, quality, performance, scalability, and DevOps checks.",
  });

  const fileAnalyses = analyzeFiles(files);
  const staticIssues = fileAnalyses.flatMap((file) => file.issues);

  await onProgress?.({
    stage: "graph_analysis",
    percent: 55,
    message: "Building repository dependency graph and detecting coupling hotspots.",
  });

  const graph = buildRepositoryGraph(fileAnalyses);
  const graphIssues = graph.circularDependencies.flatMap((cycle, index) => ({
    id: `cycle-${index}`,
    category: "architecture" as const,
    severity: "high" as const,
    title: "Circular dependency detected",
    description: `Circular import chain: ${cycle.join(" -> ")}`,
    filePath: cycle[0],
    recommendation: "Move shared contracts into a lower-level module or invert the dependency between these files.",
    confidence: 0.9,
    source: "graph" as const,
  }));

  const preliminaryIssues = [...staticIssues, ...graphIssues];
  const preliminaryScores = calculateScores(fileAnalyses, preliminaryIssues, graph.circularDependencies.length);

  await onProgress?.({
    stage: "ai_analysis",
    percent: 70,
    message: "Chunking high-signal files and asking the AI engineer to synthesize an architecture audit.",
  });

  const aiAudit = await generateAiAudit({
    owner,
    repo,
    files,
    fileAnalyses,
    graph,
    staticIssues: preliminaryIssues,
    scores: preliminaryScores,
  });

  const issues = dedupeIssues([...preliminaryIssues, ...aiAudit.aiIssues]);
  const scores = calculateScores(fileAnalyses, issues, graph.circularDependencies.length);
  const totalLines = fileAnalyses.reduce((sum, file) => sum + file.lines, 0);

  return {
    scores,
    architectureReport: aiAudit.architectureReport,
    fileAnalyses,
    graph,
    issues,
    analyzedFiles: fileAnalyses.length,
    skippedFiles,
    totalLines,
    riskDistribution: buildRiskDistribution(issues),
    complexityHeatmap: fileAnalyses
      .slice()
      .sort((a, b) => b.riskScore + b.complexity - (a.riskScore + a.complexity))
      .slice(0, 30)
      .map((file) => ({
        file: file.path,
        complexity: file.complexity,
        risk: file.riskScore,
        maintainability: file.maintainabilityScore,
      })),
  };
}

function calculateScores(fileAnalyses: Array<{ riskScore: number; maintainabilityScore: number }>, issues: AnalysisIssue[], cycleCount: number): RepositoryScores {
  const issuePenalty = issues.reduce((sum, issue) => sum + severityPenalty(issue.severity), 0);
  const averageRisk =
    fileAnalyses.length === 0 ? 0 : fileAnalyses.reduce((sum, file) => sum + file.riskScore, 0) / fileAnalyses.length;
  const averageMaintainability =
    fileAnalyses.length === 0
      ? 100
      : fileAnalyses.reduce((sum, file) => sum + file.maintainabilityScore, 0) / fileAnalyses.length;

  const securityPenalty = issues
    .filter((issue) => issue.category === "security")
    .reduce((sum, issue) => sum + severityPenalty(issue.severity) * 1.2, 0);
  const architecturePenalty =
    issues.filter((issue) => issue.category === "architecture").reduce((sum, issue) => sum + severityPenalty(issue.severity), 0) +
    cycleCount * 8;
  const scalabilityPenalty = issues
    .filter((issue) => issue.category === "scalability" || issue.category === "performance")
    .reduce((sum, issue) => sum + severityPenalty(issue.severity), 0);
  const debtPenalty = issues
    .filter((issue) => issue.category === "code_quality" || issue.category === "devops")
    .reduce((sum, issue) => sum + severityPenalty(issue.severity), 0);

  const security = clamp(100 - securityPenalty, 0, 100);
  const architecture = clamp(100 - architecturePenalty - averageRisk * 0.25, 0, 100);
  const scalability = clamp(100 - scalabilityPenalty - averageRisk * 0.15, 0, 100);
  const technicalDebt = clamp(100 - debtPenalty - averageRisk * 0.35, 0, 100);
  const maintainability = clamp(averageMaintainability - issuePenalty * 0.08, 0, 100);
  const engineeringQuality = clamp((maintainability + technicalDebt + architecture) / 3, 0, 100);
  const health = clamp((security + architecture + scalability + maintainability + engineeringQuality) / 5, 0, 100);

  return {
    health: Math.round(health),
    architecture: Math.round(architecture),
    engineeringQuality: Math.round(engineeringQuality),
    maintainability: Math.round(maintainability),
    scalability: Math.round(scalability),
    security: Math.round(security),
    technicalDebt: Math.round(technicalDebt),
  };
}

function buildRiskDistribution(issues: AnalysisIssue[]) {
  const severities = ["critical", "high", "medium", "low", "info"];
  return severities.map((severity) => ({
    name: severity,
    value: issues.filter((issue) => issue.severity === severity).length,
  }));
}

function dedupeIssues(issues: AnalysisIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.category}:${issue.severity}:${issue.title}:${issue.filePath || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function severityPenalty(severity: AnalysisIssue["severity"]) {
  return {
    info: 1,
    low: 3,
    medium: 7,
    high: 14,
    critical: 24,
  }[severity];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
