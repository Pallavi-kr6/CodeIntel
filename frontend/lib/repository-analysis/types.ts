export type ScanStatus = "queued" | "running" | "completed" | "failed";

export type IssueSeverity = "info" | "low" | "medium" | "high" | "critical";

export type IssueCategory =
  | "architecture"
  | "code_quality"
  | "performance"
  | "security"
  | "scalability"
  | "devops";

export interface RepositoryFile {
  path: string;
  sha: string;
  size: number;
  language: string;
  content: string;
}

export interface AnalysisIssue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  filePath?: string;
  line?: number;
  recommendation: string;
  confidence: number;
  source: "static" | "ai" | "graph" | "semgrep" | "eslint" | "typescript";
}

export interface FileAnalysis {
  path: string;
  purpose: string;
  language: string;
  lines: number;
  complexity: number;
  riskScore: number;
  maintainabilityScore: number;
  issues: AnalysisIssue[];
  imports: string[];
  exports: string[];
}

export interface RepositoryGraph {
  nodes: Array<{
    id: string;
    path: string;
    folder: string;
    language: string;
    riskScore: number;
    complexity: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    importPath: string;
  }>;
  circularDependencies: string[][];
  coupledModules: Array<{
    path: string;
    dependencyCount: number;
    dependentsCount: number;
    score: number;
  }>;
  folderRelationships: Array<{
    from: string;
    to: string;
    count: number;
  }>;
}

export interface RepositoryScores {
  health: number;
  architecture: number;
  engineeringQuality: number;
  maintainability: number;
  scalability: number;
  security: number;
  technicalDebt: number;
}

export interface ArchitectureReport {
  summary: string;
  productionReadiness: string;
  priorityFixes: string[];
  refactoringSuggestions: string[];
  recommendations: string[];
}

export interface RepositoryAuditResult {
  scores: RepositoryScores;
  architectureReport: ArchitectureReport;
  fileAnalyses: FileAnalysis[];
  graph: RepositoryGraph;
  issues: AnalysisIssue[];
  analyzedFiles: number;
  skippedFiles: number;
  totalLines: number;
  riskDistribution: Array<{
    name: string;
    value: number;
  }>;
  complexityHeatmap: Array<{
    file: string;
    complexity: number;
    risk: number;
    maintainability: number;
  }>;
}

export interface ScanProgress {
  stage:
    | "queued"
    | "fetching"
    | "filtering"
    | "static_analysis"
    | "graph_analysis"
    | "ai_analysis"
    | "persisting"
    | "completed"
    | "failed";
  percent: number;
  message: string;
}
