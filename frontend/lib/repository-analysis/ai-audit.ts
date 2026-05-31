import Groq from "groq-sdk";
import type {
  AnalysisIssue,
  ArchitectureReport,
  FileAnalysis,
  RepositoryFile,
  RepositoryGraph,
  RepositoryScores,
} from "./types";

interface GenerateAiAuditInput {
  owner: string;
  repo: string;
  files: RepositoryFile[];
  fileAnalyses: FileAnalysis[];
  graph: RepositoryGraph;
  staticIssues: AnalysisIssue[];
  scores: RepositoryScores;
}

interface AiAuditOutput {
  architectureReport: ArchitectureReport;
  aiIssues: AnalysisIssue[];
}

export async function generateAiAudit(input: GenerateAiAuditInput): Promise<AiAuditOutput> {
  const groq = getGroqClient();
  if (!groq) {
    return fallbackAudit(input);
  }

  const chunks = buildRepositoryChunks(input.files, input.fileAnalyses);
  const chunkSummaries = [];

  for (const chunk of chunks.slice(0, 8)) {
    const summary = await askGroqForChunk(groq, input, chunk);
    chunkSummaries.push(summary);
  }

  return askGroqForFinalAudit(groq, input, chunkSummaries);
}

function buildRepositoryChunks(files: RepositoryFile[], analyses: FileAnalysis[]) {
  const byRisk = [...analyses].sort((a, b) => b.riskScore - a.riskScore);
  const selectedPaths = new Set(byRisk.slice(0, 80).map((analysis) => analysis.path));
  const selected = files.filter((file) => selectedPaths.has(file.path));
  const chunks: string[] = [];
  let current = "";

  selected.forEach((file) => {
    const analysis = analyses.find((item) => item.path === file.path);
    const excerpt = file.content.slice(0, 5_500);
    const block = [
      `FILE: ${file.path}`,
      `LANGUAGE: ${file.language}`,
      `PURPOSE: ${analysis?.purpose || "Unknown"}`,
      `STATIC_RISK: ${analysis?.riskScore ?? 0}`,
      `STATIC_ISSUES: ${(analysis?.issues || []).map((issue) => `${issue.severity}:${issue.title}`).join("; ")}`,
      "CONTENT:",
      excerpt,
    ].join("\n");

    if (current.length + block.length > 18_000 && current.length > 0) {
      chunks.push(current);
      current = "";
    }
    current += `\n\n${block}`;
  });

  if (current.trim()) chunks.push(current);
  return chunks;
}

async function askGroqForChunk(groq: Groq, input: GenerateAiAuditInput, chunk: string) {
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.15,
    messages: [
      {
        role: "system",
        content:
          "You are a senior staff engineer performing repository intelligence. Return concise JSON only with keys: summary, architectureRisks, securityRisks, scalabilityRisks, refactorCandidates, productionReadinessNotes.",
      },
      {
        role: "user",
        content: `Repository: ${input.owner}/${input.repo}\nAnalyze this repository chunk using the static findings and source excerpts.\n${chunk}`,
      },
    ],
  });

  return completion.choices[0]?.message?.content || "{}";
}

async function askGroqForFinalAudit(groq: Groq, input: GenerateAiAuditInput, chunkSummaries: string[]): Promise<AiAuditOutput> {
  const staticDigest = input.staticIssues.slice(0, 80).map((issue) => ({
    category: issue.category,
    severity: issue.severity,
    title: issue.title,
    filePath: issue.filePath,
  }));

  const graphDigest = {
    files: input.fileAnalyses.length,
    circularDependencies: input.graph.circularDependencies.slice(0, 10),
    coupledModules: input.graph.coupledModules.slice(0, 10),
    folderRelationships: input.graph.folderRelationships.slice(0, 15),
  };

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: `You are an AI senior engineer auditing a complete codebase.
Return strict JSON only:
{
  "summary": "architecture summary",
  "productionReadiness": "production readiness analysis",
  "priorityFixes": ["..."],
  "refactoringSuggestions": ["..."],
  "recommendations": ["..."],
  "issues": [
    {
      "category": "architecture|code_quality|performance|security|scalability|devops",
      "severity": "info|low|medium|high|critical",
      "title": "...",
      "description": "...",
      "filePath": "optional/path",
      "recommendation": "...",
      "confidence": 0.0
    }
  ]
}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          repository: `${input.owner}/${input.repo}`,
          currentScores: input.scores,
          staticDigest,
          graphDigest,
          chunkSummaries,
        }),
      },
    ],
  });

  const parsed = parseJson(completion.choices[0]?.message?.content || "{}");
  const architectureReport: ArchitectureReport = {
    summary: parsed.summary || "The repository was analyzed with static and AI-assisted checks.",
    productionReadiness: parsed.productionReadiness || "Production readiness requires reviewing the listed findings.",
    priorityFixes: asStringArray(parsed.priorityFixes),
    refactoringSuggestions: asStringArray(parsed.refactoringSuggestions),
    recommendations: asStringArray(parsed.recommendations),
  };

  const aiIssues: AnalysisIssue[] = Array.isArray(parsed.issues)
    ? parsed.issues.slice(0, 40).map((issue: Record<string, unknown>, index: number) => ({
        id: `ai-${index}-${slug(String(issue.title || "issue"))}`,
        category: normalizeCategory(issue.category),
        severity: normalizeSeverity(issue.severity),
        title: String(issue.title || "AI-detected repository concern"),
        description: String(issue.description || "The AI model identified a repository-level concern."),
        filePath: typeof issue.filePath === "string" ? issue.filePath : undefined,
        recommendation: String(issue.recommendation || "Review and address this concern with targeted refactoring."),
        confidence: typeof issue.confidence === "number" ? issue.confidence : 0.72,
        source: "ai",
      }))
    : [];

  return { architectureReport, aiIssues };
}

function fallbackAudit(input: GenerateAiAuditInput): AiAuditOutput {
  const topRiskFiles = input.fileAnalyses
    .slice()
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 5)
    .map((file) => file.path);

  return {
    architectureReport: {
      summary: `${input.owner}/${input.repo} was scanned across ${input.fileAnalyses.length} important files. Static analysis found ${input.staticIssues.length} issues and ${input.graph.circularDependencies.length} circular dependency chain(s).`,
      productionReadiness:
        "The repository needs the high and critical security, architecture, and DevOps findings resolved before it should be treated as production-ready.",
      priorityFixes: [
        "Resolve high and critical security findings first.",
        "Add CI checks for linting, type checking, tests, and build.",
        "Refactor the highest-risk files into smaller modules with clearer contracts.",
      ],
      refactoringSuggestions: topRiskFiles.map((file) => `Review ${file} for separation of concerns and testable boundaries.`),
      recommendations: [
        "Introduce repository-wide environment validation.",
        "Track complexity and file risk trends on every full scan.",
        "Use pagination and caching for GitHub-backed workflows.",
      ],
    },
    aiIssues: [],
  };
}

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;
  return apiKey ? new Groq({ apiKey }) : null;
}

function parseJson(value: string) {
  try {
    const trimmed = value.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
    return JSON.parse(trimmed);
  } catch {
    return {};
  }
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, 12) : [];
}

function normalizeCategory(value: unknown): AnalysisIssue["category"] {
  const categories: AnalysisIssue["category"][] = [
    "architecture",
    "code_quality",
    "performance",
    "security",
    "scalability",
    "devops",
  ];
  return categories.includes(value as AnalysisIssue["category"]) ? (value as AnalysisIssue["category"]) : "architecture";
}

function normalizeSeverity(value: unknown): AnalysisIssue["severity"] {
  const severities: AnalysisIssue["severity"][] = ["info", "low", "medium", "high", "critical"];
  return severities.includes(value as AnalysisIssue["severity"]) ? (value as AnalysisIssue["severity"]) : "medium";
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
}
