import path from "path";
import type { FileAnalysis, RepositoryGraph } from "./types";

const RESOLVABLE_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];

export function buildRepositoryGraph(files: FileAnalysis[]): RepositoryGraph {
  const filePaths = new Set(files.map((file) => normalize(file.path)));
  const edges: RepositoryGraph["edges"] = [];

  files.forEach((file) => {
    file.imports.forEach((importPath) => {
      if (!importPath.startsWith(".") && !importPath.startsWith("@/")) return;
      const resolved = resolveImport(file.path, importPath, filePaths);
      if (resolved) {
        edges.push({
          from: normalize(file.path),
          to: resolved,
          importPath,
        });
      }
    });
  });

  const circularDependencies = findCycles(Array.from(filePaths), edges);
  const coupledModules = calculateCoupling(Array.from(filePaths), edges);
  const folderRelationships = calculateFolderRelationships(edges);

  return {
    nodes: files.map((file) => ({
      id: normalize(file.path),
      path: normalize(file.path),
      folder: folderFor(file.path),
      language: file.language,
      riskScore: file.riskScore,
      complexity: file.complexity,
    })),
    edges,
    circularDependencies,
    coupledModules,
    folderRelationships,
  };
}

function resolveImport(fromFile: string, importPath: string, files: Set<string>) {
  const fromDirectory = path.posix.dirname(normalize(fromFile));
  const base = importPath.startsWith("@/")
    ? importPath.slice(2)
    : path.posix.normalize(path.posix.join(fromDirectory, importPath));

  for (const extension of RESOLVABLE_EXTENSIONS) {
    const direct = normalize(`${base}${extension}`);
    if (files.has(direct)) return direct;
    const indexFile = normalize(`${base}/index${extension}`);
    if (files.has(indexFile)) return indexFile;
  }

  return null;
}

function findCycles(nodes: string[], edges: RepositoryGraph["edges"]) {
  const adjacency = new Map<string, string[]>();
  edges.forEach((edge) => {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) || []), edge.to]);
  });

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const trail: string[] = [];

  function visit(node: string) {
    if (stack.has(node)) {
      const start = trail.indexOf(node);
      if (start >= 0) cycles.push([...trail.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    stack.add(node);
    trail.push(node);
    (adjacency.get(node) || []).forEach(visit);
    trail.pop();
    stack.delete(node);
  }

  nodes.forEach(visit);
  return dedupeCycles(cycles).slice(0, 25);
}

function calculateCoupling(nodes: string[], edges: RepositoryGraph["edges"]) {
  return nodes
    .map((node) => {
      const dependencyCount = edges.filter((edge) => edge.from === node).length;
      const dependentsCount = edges.filter((edge) => edge.to === node).length;
      return {
        path: node,
        dependencyCount,
        dependentsCount,
        score: dependencyCount + dependentsCount * 2,
      };
    })
    .filter((item) => item.score >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

function calculateFolderRelationships(edges: RepositoryGraph["edges"]) {
  const relationships = new Map<string, number>();
  edges.forEach((edge) => {
    const from = folderFor(edge.from);
    const to = folderFor(edge.to);
    if (from === to) return;
    const key = `${from} -> ${to}`;
    relationships.set(key, (relationships.get(key) || 0) + 1);
  });

  return Array.from(relationships.entries())
    .map(([key, count]) => {
      const [from, to] = key.split(" -> ");
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
}

function dedupeCycles(cycles: string[][]) {
  const seen = new Set<string>();
  return cycles.filter((cycle) => {
    const key = [...new Set(cycle)].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function folderFor(filePath: string) {
  const parts = normalize(filePath).split("/");
  if (parts.length <= 1) return "/";
  return parts.slice(0, Math.min(2, parts.length - 1)).join("/");
}

function normalize(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}
