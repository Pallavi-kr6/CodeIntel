import axios from "axios";
import { supabase } from "./supabase";

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
  return response.data;
}

export async function saveRepository(userId: string, repo: any) {
  const { data, error } = await supabase.from("repositories").insert({
    user_id: userId,
    repo_name: repo.name,
    repo_owner: repo.owner.login,
  });
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
  return response.data;
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
  return response.data;
}