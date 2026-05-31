import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { fetchRepositoryFiles } from "@/lib/repository-analysis/github-scanner";
import { runRepositoryAnalysis } from "@/lib/repository-analysis/pipeline";
import type { RepositoryAuditResult, ScanProgress } from "@/lib/repository-analysis/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface StartScanBody {
  owner: string;
  repo: string;
  branch?: string;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!authHeader || !owner || !repo) {
    return NextResponse.json({ error: "Missing authorization, owner, or repo." }, { status: 400 });
  }

  const supabase = createUserSupabaseClient(authHeader);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Supabase session is invalid." }, { status: 401 });
  }

  const { data: repository } = await supabase
    .from("repositories")
    .select("id")
    .eq("user_id", user.id)
    .eq("repo_owner", owner)
    .eq("repo_name", repo)
    .maybeSingle();

  if (!repository) {
    return NextResponse.json({ scan: null });
  }

  const { data: scan, error } = await supabase
    .from("repository_scans")
    .select(
      `
      *,
      architecture_reports(*),
      security_reports(*),
      technical_debt_reports(*),
      file_analyses(*)
    `
    )
    .eq("repo_id", repository.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ scan });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const githubToken = request.headers.get("x-github-token");

  if (!authHeader || !githubToken) {
    return NextResponse.json({ error: "Missing Supabase or GitHub authorization." }, { status: 401 });
  }

  const body = (await request.json()) as StartScanBody;
  if (!body.owner || !body.repo) {
    return NextResponse.json({ error: "Repository owner and name are required." }, { status: 400 });
  }

  const supabase = createUserSupabaseClient(authHeader);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Supabase session is invalid." }, { status: 401 });
  }

  const repository = await upsertRepository(supabase, {
    userId: user.id,
    owner: body.owner,
    repo: body.repo,
    branch: body.branch,
  });

  const { data: scan, error: scanError } = await supabase
    .from("repository_scans")
    .insert({
      repo_id: repository.id,
      user_id: user.id,
      repo_owner: body.owner,
      repo_name: body.repo,
      branch: body.branch || repository.default_branch || "main",
      status: "running",
      progress: 5,
      current_stage: "fetching",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (scanError) {
    return NextResponse.json({ error: scanError.message }, { status: 500 });
  }

  try {
    await updateScanProgress(supabase, scan.id, {
      stage: "fetching",
      percent: 15,
      message: "Fetching repository tree and high-signal source files from GitHub.",
    });

    const fetched = await fetchRepositoryFiles({
      token: githubToken,
      owner: body.owner,
      repo: body.repo,
      branch: body.branch || repository.default_branch,
    });

    await supabase
      .from("repository_scans")
      .update({
        branch: fetched.branch,
        commit_sha: fetched.commitSha,
        total_files: fetched.files.length + fetched.skippedFiles,
        analyzed_files: fetched.files.length,
        skipped_files: fetched.skippedFiles,
      })
      .eq("id", scan.id);

    const result = await runRepositoryAnalysis({
      owner: body.owner,
      repo: body.repo,
      files: fetched.files,
      skippedFiles: fetched.skippedFiles,
      onProgress: (progress) => updateScanProgress(supabase, scan.id, progress),
    });

    await updateScanProgress(supabase, scan.id, {
      stage: "persisting",
      percent: 92,
      message: "Persisting repository intelligence reports.",
    });

    await persistResult(supabase, scan.id, repository.id, result);

    await supabase
      .from("repositories")
      .update({
        default_branch: fetched.branch,
        last_analyzed_at: new Date().toISOString(),
      })
      .eq("id", repository.id);

    const { data: completedScan } = await supabase
      .from("repository_scans")
      .update({
        status: "completed",
        progress: 100,
        current_stage: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", scan.id)
      .select(
        `
        *,
        architecture_reports(*),
        security_reports(*),
        technical_debt_reports(*),
        file_analyses(*)
      `
      )
      .single();

    return NextResponse.json({ scan: completedScan });
  } catch (error: unknown) {
    console.error("Repository scan failed", error);
    const message = error instanceof Error ? error.message : "Repository analysis failed.";
    await supabase
      .from("repository_scans")
      .update({
        status: "failed",
        progress: 100,
        current_stage: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", scan.id);

    return NextResponse.json({ error: message, scanId: scan.id }, { status: 500 });
  }
}

function createUserSupabaseClient(authHeader: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });
}

async function upsertRepository(
  supabase: ReturnType<typeof createUserSupabaseClient>,
  input: { userId: string; owner: string; repo: string; branch?: string }
) {
  const { data, error } = await supabase
    .from("repositories")
    .upsert(
      {
        user_id: input.userId,
        repo_owner: input.owner,
        repo_name: input.repo,
        default_branch: input.branch,
        is_connected: true,
      },
      { onConflict: "user_id,repo_owner,repo_name" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateScanProgress(
  supabase: ReturnType<typeof createUserSupabaseClient>,
  scanId: string,
  progress: ScanProgress
) {
  await supabase
    .from("repository_scans")
    .update({
      progress: progress.percent,
      current_stage: progress.stage,
    })
    .eq("id", scanId);
}

async function persistResult(
  supabase: ReturnType<typeof createUserSupabaseClient>,
  scanId: string,
  repoId: string,
  result: RepositoryAuditResult
) {
  await supabase
    .from("repository_scans")
    .update({
      total_lines: result.totalLines,
      analyzed_files: result.analyzedFiles,
      skipped_files: result.skippedFiles,
      health_score: result.scores.health,
      architecture_score: result.scores.architecture,
      engineering_quality_score: result.scores.engineeringQuality,
      maintainability_score: result.scores.maintainability,
      scalability_score: result.scores.scalability,
      security_score: result.scores.security,
      technical_debt_score: result.scores.technicalDebt,
      risk_distribution: result.riskDistribution,
      complexity_heatmap: result.complexityHeatmap,
      graph: result.graph,
    })
    .eq("id", scanId);

  if (result.fileAnalyses.length > 0) {
    const { error } = await supabase.from("file_analyses").insert(
      result.fileAnalyses.map((file) => ({
        scan_id: scanId,
        repo_id: repoId,
        file_path: file.path,
        language: file.language,
        purpose: file.purpose,
        lines: file.lines,
        complexity: file.complexity,
        risk_score: file.riskScore,
        maintainability_score: file.maintainabilityScore,
        imports: file.imports,
        exports: file.exports,
        issues: file.issues,
      }))
    );
    if (error) throw error;
  }

  const securityIssues = result.issues.filter((issue) => issue.category === "security");
  const writes = [
    supabase.from("architecture_reports").insert({
      scan_id: scanId,
      repo_id: repoId,
      summary: result.architectureReport.summary,
      production_readiness: result.architectureReport.productionReadiness,
      priority_fixes: result.architectureReport.priorityFixes,
      refactoring_suggestions: result.architectureReport.refactoringSuggestions,
      recommendations: result.architectureReport.recommendations,
    }),
    supabase.from("security_reports").insert({
      scan_id: scanId,
      repo_id: repoId,
      score: result.scores.security,
      critical_findings: securityIssues.filter((issue) => issue.severity === "critical").length,
      high_findings: securityIssues.filter((issue) => issue.severity === "high").length,
      findings: securityIssues,
      recommendations: result.architectureReport.recommendations.filter((item) => /security|secret|auth|validation/i.test(item)),
    }),
    supabase.from("technical_debt_reports").insert({
      scan_id: scanId,
      repo_id: repoId,
      score: result.scores.technicalDebt,
      hotspots: result.complexityHeatmap.slice(0, 12),
      duplicated_logic: result.issues.filter((issue) => /duplicate|repeated/i.test(issue.title)),
      refactoring_plan: result.architectureReport.refactoringSuggestions,
    }),
  ];

  const responses = await Promise.all(writes);
  const firstError = responses.find((response) => response.error)?.error;
  if (firstError) throw firstError;
}
