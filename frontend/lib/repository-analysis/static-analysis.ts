import crypto from "crypto";
import ts from "typescript";
import type { AnalysisIssue, FileAnalysis, IssueSeverity, RepositoryFile } from "./types";

const SOURCE_EXTENSIONS = /\.(tsx?|jsx?|mjs|cjs)$/;

export function analyzeFiles(files: RepositoryFile[]): FileAnalysis[] {
  const duplicateHashes = findDuplicateBlocks(files);

  return files.map((file) => {
    const lines = file.content.split(/\r?\n/);
    const imports = extractImports(file.content);
    const exports = extractExports(file.content);
    const complexity = calculateComplexity(file.content);
    const issues = [
      ...runPatternRules(file, lines),
      ...runTypeScriptAnalysis(file),
      ...runDuplicateAnalysis(file, duplicateHashes),
      ...runDevOpsRules(file, files),
    ];

    const riskScore = clamp(
      issues.reduce((score, issue) => score + severityWeight(issue.severity), 0) + Math.max(0, complexity - 12) * 2,
      0,
      100
    );
    const maintainabilityScore = clamp(100 - riskScore - Math.max(0, lines.length - 250) / 8, 0, 100);

    return {
      path: file.path,
      purpose: inferPurpose(file.path, file.content),
      language: file.language,
      lines: lines.length,
      complexity,
      riskScore: Math.round(riskScore),
      maintainabilityScore: Math.round(maintainabilityScore),
      issues,
      imports,
      exports,
    };
  });
}

function runPatternRules(file: RepositoryFile, lines: string[]): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const content = file.content;

  addIf(issues, /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|TOKEN|KEY|PASSWORD)/.test(content), {
    category: "security",
    severity: "critical",
    title: "Public environment variable appears to contain sensitive material",
    description: "Variables prefixed with NEXT_PUBLIC_ are exposed to browsers. Secret-looking values must stay server-side.",
    filePath: file.path,
    recommendation: "Move secrets to server-only environment variables and call them from API routes or server actions.",
  });

  addIf(issues, /(api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{12,}["']/i.test(content), {
    category: "security",
    severity: "critical",
    title: "Hardcoded credential-like value detected",
    description: "The file contains a value that looks like a secret or token.",
    filePath: file.path,
    recommendation: "Rotate the credential if real, move it to a secret manager, and keep only a validated environment reference in code.",
  });

  addIf(issues, /\beval\s*\(|new Function\s*\(/.test(content), {
    category: "security",
    severity: "high",
    title: "Dynamic code execution detected",
    description: "Runtime code execution is difficult to secure and can become a remote code execution vector.",
    filePath: file.path,
    recommendation: "Replace dynamic execution with a constrained parser, command map, or schema-validated interpreter.",
  });

  addIf(issues, /dangerouslySetInnerHTML/.test(content), {
    category: "security",
    severity: "high",
    title: "Unsafe HTML injection surface",
    description: "Rendering raw HTML can introduce XSS when content is not sanitized.",
    filePath: file.path,
    recommendation: "Sanitize HTML with a trusted sanitizer and isolate this rendering behind a small reviewed component.",
  });

  addIf(issues, /select\s+.*\$\{|insert\s+.*\$\{|update\s+.*\$\{|delete\s+.*\$\{/i.test(content), {
    category: "security",
    severity: "high",
    title: "Potential SQL injection through string interpolation",
    description: "SQL built with template interpolation can allow user input to alter query structure.",
    filePath: file.path,
    recommendation: "Use parameterized queries, query builders, or Supabase typed APIs instead of interpolated SQL.",
  });

  addIf(issues, file.path.includes("/api/") && !/auth\.get(User|Session)|getServerSession|verify|authorization|provider_token/i.test(content), {
    category: "security",
    severity: "high",
    title: "API route lacks an obvious authentication check",
    description: "Server routes should validate the caller before touching repository or user data.",
    filePath: file.path,
    recommendation: "Verify the Supabase session or a signed server-side token before executing the route.",
  });

  addIf(issues, /console\.log\(/.test(content), {
    category: "code_quality",
    severity: "low",
    title: "Debug logging left in source",
    description: "Unstructured console output makes production observability noisy.",
    filePath: file.path,
    recommendation: "Replace with structured logging at an appropriate level or remove before production.",
  });

  addIf(issues, lines.length > 350, {
    category: "architecture",
    severity: "medium",
    title: "Large file with elevated maintenance risk",
    description: `This file has ${lines.length} lines, making ownership, review, and testing harder.`,
    filePath: file.path,
    recommendation: "Split by responsibility into smaller modules, hooks, route handlers, or presentational components.",
  });

  addIf(issues, maxIndentDepth(lines) >= 6, {
    category: "code_quality",
    severity: "medium",
    title: "Deeply nested control flow",
    description: "Deep nesting increases the chance of missed edge cases and makes code harder to test.",
    filePath: file.path,
    recommendation: "Use guard clauses, extracted functions, or state machines to flatten the control flow.",
  });

  addIf(issues, /useEffect\s*\([^]*?set[A-Z][A-Za-z0-9_]*\([^]*?\[[^\]]*\]\)/m.test(content) && !/AbortController|isMounted|ignore\s*=/.test(content), {
    category: "performance",
    severity: "medium",
    title: "Effect updates state without visible cancellation",
    description: "Async effects can update state after unmount or race when dependencies change.",
    filePath: file.path,
    recommendation: "Use AbortController, cleanup guards, or a request lifecycle helper for async effects.",
  });

  addIf(issues, /\.map\([^)]*=>[^]*?\.filter\(|\.filter\([^)]*=>[^]*?\.map\(/m.test(content), {
    category: "performance",
    severity: "low",
    title: "Repeated collection traversal",
    description: "Chained iteration may be acceptable for small data but can become expensive on repository-scale inputs.",
    filePath: file.path,
    recommendation: "Combine passes or memoize derived collections when operating on large lists.",
  });

  addIf(issues, /per_page:\s*100/.test(content) && !/page|pagination|Link/.test(content), {
    category: "scalability",
    severity: "medium",
    title: "GitHub request appears to miss pagination",
    description: "GitHub returns paginated responses, so repositories or PRs beyond the first page may be omitted.",
    filePath: file.path,
    recommendation: "Follow GitHub Link headers or iterate pages until the response is exhausted.",
  });

  return issues;
}

function runTypeScriptAnalysis(file: RepositoryFile): AnalysisIssue[] {
  if (!SOURCE_EXTENSIONS.test(file.path)) return [];

  const source = ts.createSourceFile(
    file.path,
    file.content,
    ts.ScriptTarget.Latest,
    true,
    file.path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const issues: AnalysisIssue[] = [];

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node)) {
      const start = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const name = "name" in node && node.name ? node.name.getText(source) : "anonymous function";
      const body = node.body?.getText(source) || "";
      const functionComplexity = calculateComplexity(body);
      if (functionComplexity >= 14) {
        issues.push(createIssue({
          category: "code_quality",
          severity: "medium",
          title: "High-complexity function",
          description: `${name} has a complexity score of ${functionComplexity}.`,
          filePath: file.path,
          line: start,
          recommendation: "Extract decision branches into named helpers and add tests around edge cases.",
          source: "typescript",
        }));
      }
      if (!node.type && !ts.isArrowFunction(node)) {
        issues.push(createIssue({
          category: "code_quality",
          severity: "low",
          title: "Function is missing an explicit return type",
          description: `${name} relies on inferred return typing.`,
          filePath: file.path,
          line: start,
          recommendation: "Add explicit return types to public or complex functions to stabilize contracts.",
          source: "typescript",
        }));
      }
    }

    if (ts.isVariableDeclaration(node) && node.type?.getText(source) === "any") {
      const start = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      issues.push(createIssue({
        category: "code_quality",
        severity: "medium",
        title: "Explicit any weakens type safety",
        description: "The code opts out of TypeScript checking for this value.",
        filePath: file.path,
        line: start,
        recommendation: "Replace any with a domain type, unknown plus narrowing, or a generated API type.",
        source: "typescript",
      }));
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return issues;
}

function runDuplicateAnalysis(file: RepositoryFile, duplicateHashes: Set<string>): AnalysisIssue[] {
  const blockHashes = normalizedBlocks(file.content);
  if (!blockHashes.some((hash) => duplicateHashes.has(hash))) return [];

  return [
    createIssue({
      category: "code_quality",
      severity: "medium",
      title: "Repeated logic block detected",
      description: "This file shares a similar non-trivial code block with another file.",
      filePath: file.path,
      recommendation: "Extract shared logic into a utility, service, hook, or component with a clear contract.",
      source: "static",
    }),
  ];
}

function runDevOpsRules(file: RepositoryFile, allFiles: RepositoryFile[]): AnalysisIssue[] {
  if (file.path !== "package.json") return [];
  const paths = new Set(allFiles.map((item) => item.path.toLowerCase()));
  const content = file.content;
  const issues: AnalysisIssue[] = [];

  addIf(issues, !/"test"\s*:/.test(content), {
    category: "devops",
    severity: "medium",
    title: "No test script declared",
    description: "The package manifest does not expose a test entry point.",
    filePath: file.path,
    recommendation: "Add a repeatable test script and wire it into CI before releases.",
  });

  addIf(issues, !/"lint"\s*:/.test(content), {
    category: "devops",
    severity: "medium",
    title: "No lint script declared",
    description: "The package manifest does not expose linting as a standard command.",
    filePath: file.path,
    recommendation: "Add a lint script backed by ESLint or the stack's standard analyzer.",
  });

  addIf(issues, !Array.from(paths).some((path) => path.startsWith(".github/workflows/")), {
    category: "devops",
    severity: "medium",
    title: "No GitHub Actions workflow detected",
    description: "The repository has no visible CI/CD workflow in .github/workflows.",
    filePath: file.path,
    recommendation: "Add CI that runs install, lint, typecheck, tests, and build on pull requests.",
  });

  addIf(issues, !paths.has("dockerfile") && !paths.has("docker-compose.yml"), {
    category: "devops",
    severity: "low",
    title: "No container runtime definition detected",
    description: "A Dockerfile is not mandatory, but it helps standardize production and review environments.",
    filePath: file.path,
    recommendation: "Add Dockerfile or deployment-specific runtime documentation if container deployment is expected.",
  });

  return issues;
}

export function calculateComplexity(content: string) {
  const matches = content.match(/\b(if|else if|for|while|switch|case|catch|\?|&&|\|\|)\b/g);
  return 1 + (matches?.length || 0);
}

export function extractImports(content: string) {
  const imports = new Set<string>();
  for (const match of content.matchAll(/import(?:\s+type)?(?:[^'"]*from\s*)?["']([^"']+)["']/g)) {
    imports.add(match[1]);
  }
  for (const match of content.matchAll(/require\(["']([^"']+)["']\)/g)) {
    imports.add(match[1]);
  }
  return Array.from(imports);
}

function extractExports(content: string) {
  const exports = new Set<string>();
  for (const match of content.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type)\s+([A-Za-z0-9_]+)/g)) {
    exports.add(match[1]);
  }
  if (/export\s+default/.test(content)) exports.add("default");
  return Array.from(exports);
}

function findDuplicateBlocks(files: RepositoryFile[]) {
  const counts = new Map<string, number>();
  files.forEach((file) => {
    normalizedBlocks(file.content).forEach((hash) => counts.set(hash, (counts.get(hash) || 0) + 1));
  });
  return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([hash]) => hash));
}

function normalizedBlocks(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//") && !line.startsWith("*"));

  const hashes: string[] = [];
  for (let index = 0; index <= lines.length - 12; index += 6) {
    const block = lines.slice(index, index + 12).join("\n").replace(/\s+/g, " ");
    if (block.length > 220) hashes.push(crypto.createHash("sha1").update(block).digest("hex"));
  }
  return hashes;
}

function inferPurpose(path: string, content: string) {
  const lower = path.toLowerCase();
  if (lower.includes("/api/") || lower.endsWith("route.ts")) return "API route or server endpoint";
  if (lower.includes("/components/") || /export default function [A-Z]/.test(content)) return "Reusable UI component";
  if (lower.includes("/app/") || lower.includes("/pages/")) return "Application route or page";
  if (lower.includes("/lib/") || lower.includes("/utils/")) return "Shared library or utility module";
  if (lower.includes("auth")) return "Authentication or authorization logic";
  if (lower.endsWith(".sql") || lower.includes("database") || lower.includes("prisma")) return "Database schema or persistence code";
  if (lower.includes("config") || lower.endsWith(".json") || lower.endsWith(".yml")) return "Configuration";
  return "Repository source or supporting file";
}

function maxIndentDepth(lines: string[]) {
  return lines.reduce((max, line) => {
    const spaces = line.match(/^\s*/)?.[0].length || 0;
    return Math.max(max, Math.floor(spaces / 2));
  }, 0);
}

function addIf(
  issues: AnalysisIssue[],
  condition: boolean,
  input: Omit<AnalysisIssue, "id" | "confidence" | "source">
) {
  if (!condition) return;
  issues.push(createIssue({ ...input, source: "static" }));
}

function createIssue(input: Omit<AnalysisIssue, "id" | "confidence"> & { confidence?: number }): AnalysisIssue {
  return {
    id: crypto.createHash("sha1").update(JSON.stringify(input)).digest("hex").slice(0, 16),
    confidence: input.confidence || 0.82,
    ...input,
  };
}

function severityWeight(severity: IssueSeverity) {
  return {
    info: 1,
    low: 4,
    medium: 9,
    high: 16,
    critical: 26,
  }[severity];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
