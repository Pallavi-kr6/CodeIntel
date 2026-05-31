import axios from "axios";
import { languageForPath, MAX_REPOSITORY_FILES, shouldAnalyzePath } from "./filters";
import type { RepositoryFile } from "./types";

interface GitTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  url: string;
}

interface FetchRepositoryFilesInput {
  token: string;
  owner: string;
  repo: string;
  branch?: string;
}

export interface FetchRepositoryFilesResult {
  files: RepositoryFile[];
  skippedFiles: number;
  commitSha?: string;
  branch: string;
}

export async function fetchRepositoryFiles({
  token,
  owner,
  repo,
  branch,
}: FetchRepositoryFilesInput): Promise<FetchRepositoryFilesResult> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const repoResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
    headers,
  });

  const selectedBranch = branch || repoResponse.data.default_branch || "main";
  const branchResponse = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/branches/${selectedBranch}`,
    { headers }
  );

  const commitSha = branchResponse.data.commit?.sha;
  const treeResponse = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`,
    { headers }
  );

  const tree: GitTreeItem[] = treeResponse.data.tree || [];
  const candidateFiles = tree
    .filter((item) => item.type === "blob")
    .filter((item) => shouldAnalyzePath(item.path, item.size || 0));

  const prioritized = candidateFiles
    .sort((a, b) => priorityScore(b.path) - priorityScore(a.path))
    .slice(0, MAX_REPOSITORY_FILES);

  const files: RepositoryFile[] = [];
  for (const item of prioritized) {
    try {
      const blob = await axios.get(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${item.sha}`, {
        headers,
      });
      const encoding = blob.data.encoding;
      const encodedContent = blob.data.content || "";
      if (encoding !== "base64") continue;

      const content = Buffer.from(encodedContent, "base64").toString("utf8");
      files.push({
        path: item.path,
        sha: item.sha,
        size: item.size || Buffer.byteLength(content),
        language: languageForPath(item.path),
        content,
      });
    } catch (error) {
      console.error(`Failed to fetch repository blob ${item.path}`, error);
    }
  }

  return {
    files,
    skippedFiles: tree.filter((item) => item.type === "blob").length - files.length,
    commitSha,
    branch: selectedBranch,
  };
}

function priorityScore(path: string) {
  const lower = path.toLowerCase();
  let score = 0;
  if (lower.includes("/app/") || lower.startsWith("app/")) score += 20;
  if (lower.includes("/pages/") || lower.startsWith("pages/")) score += 18;
  if (lower.includes("/api/") || lower.includes("route.ts")) score += 18;
  if (lower.includes("/lib/") || lower.includes("/services/") || lower.includes("/utils/")) score += 16;
  if (lower.includes("/components/")) score += 12;
  if (lower.includes("auth") || lower.includes("middleware")) score += 15;
  if (lower.includes("database") || lower.endsWith(".sql") || lower.includes("prisma")) score += 15;
  if (lower.includes(".github/workflows") || lower.includes("dockerfile")) score += 10;
  if (lower.endsWith("package.json") || lower.endsWith("tsconfig.json")) score += 8;
  return score;
}
