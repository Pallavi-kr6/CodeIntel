import axios from "axios";
import { supabase } from "./supabase";

export interface GithubRepository {
  id: number;
  name: string;
  description?: string | null;
  private: boolean;
  default_branch: string;
  owner: {
    login: string;
  };
}

export interface GithubPullRequest {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  created_at: string;
  user: {
    login: string;
    avatar_url?: string | null;
  };
}

export interface GithubPullRequestFile {
  filename: string;
  patch?: string;
}

export async function getGithubRepos(accessToken: string) {
  const response = await axios.get("https://api.github.com/user/repos", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    params: {
      sort: "updated",
      per_page: 100,
    },
  });
  return response.data as GithubRepository[];
}

export async function saveRepository(userId: string, repo: GithubRepository) {
  const { data, error } = await supabase
    .from("repositories")
    .upsert(
      {
        user_id: userId,
        repo_name: repo.name,
        repo_owner: repo.owner.login,
        github_repo_id: repo.id,
        default_branch: repo.default_branch,
        is_connected: true,
      },
      { onConflict: "user_id,repo_owner,repo_name" }
    )
    .select();
  if (error) {
    console.error("Error in saveRepository DB insert:", error);
    throw error;
  }
  return data;
}

export async function getPullRequests(token: string, owner: string, repo: string) {
  const response = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        state: "all",
      },
    }
  );
  return response.data as GithubPullRequest[];
}

export async function getPRFiles(
  token: string,
  owner: string,
  repo: string,
  pullNumber: number
) {
  const response = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data as GithubPullRequestFile[];
}
