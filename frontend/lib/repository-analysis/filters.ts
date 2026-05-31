const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".nuxt",
  ".turbo",
  ".vercel",
  "node_modules",
  "bower_components",
  "dist",
  "build",
  "coverage",
  "out",
  "target",
  "vendor",
  "__pycache__",
]);

const IGNORED_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "composer.lock",
  "poetry.lock",
  "Pipfile.lock",
  "Cargo.lock",
]);

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".toml",
  ".env",
  ".example",
  ".sql",
  ".prisma",
  ".css",
  ".scss",
  ".html",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".php",
  ".rb",
  ".sh",
  ".dockerfile",
]);

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".7z",
  ".mp4",
  ".mov",
  ".mp3",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".wasm",
]);

export const MAX_FILE_BYTES = 180_000;
export const MAX_REPOSITORY_FILES = 450;

export function shouldAnalyzePath(path: string, size = 0) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const fileName = parts[parts.length - 1];
  const lowerName = fileName.toLowerCase();
  const extension = getExtension(lowerName);

  if (parts.some((part) => IGNORED_DIRECTORIES.has(part))) return false;
  if (IGNORED_FILES.has(lowerName)) return false;
  if (BINARY_EXTENSIONS.has(extension)) return false;
  if (size > MAX_FILE_BYTES) return false;
  if (lowerName.endsWith(".min.js") || lowerName.endsWith(".map")) return false;

  return TEXT_EXTENSIONS.has(extension) || importantConfigName(lowerName);
}

export function isHighSignalPath(path: string) {
  const normalized = path.toLowerCase();
  return [
    "/app/",
    "/pages/",
    "/api/",
    "/components/",
    "/lib/",
    "/utils/",
    "/services/",
    "/server/",
    "/backend/",
    "/database/",
    "/supabase/",
    "/prisma/",
    "/auth",
    "middleware.",
    "next.config",
    "eslint.config",
    "tsconfig",
    "package.json",
    "dockerfile",
    ".github/workflows",
  ].some((signal) => normalized.includes(signal) || normalized.startsWith(signal.replace("/", "")));
}

export function languageForPath(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".tsx")) return "TSX";
  if (lower.endsWith(".ts")) return "TypeScript";
  if (lower.endsWith(".jsx")) return "JSX";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "JavaScript";
  if (lower.endsWith(".sql")) return "SQL";
  if (lower.endsWith(".json")) return "JSON";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "YAML";
  if (lower.endsWith(".css") || lower.endsWith(".scss")) return "Stylesheet";
  if (lower.endsWith(".md")) return "Markdown";
  if (lower.endsWith(".py")) return "Python";
  if (lower.endsWith(".go")) return "Go";
  if (lower.endsWith(".rs")) return "Rust";
  if (lower.includes("dockerfile")) return "Docker";
  return "Text";
}

function importantConfigName(fileName: string) {
  return [
    ".env.example",
    ".env.local.example",
    "dockerfile",
    "eslint.config.mjs",
    "next.config.ts",
    "next.config.js",
    "tsconfig.json",
  ].includes(fileName);
}

function getExtension(fileName: string) {
  if (fileName === "dockerfile") return ".dockerfile";
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index) : "";
}
