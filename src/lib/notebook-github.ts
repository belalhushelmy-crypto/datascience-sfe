import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const REPO_OWNER = "belalhushelmy-crypto";
const REPO_NAME = "datascience-sfe";
const BRANCH = "main";
const NOTEBOOK_DIR = "notebooks";

export function isGithubConfigured(): boolean {
  return Boolean((process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "").trim());
}

export async function deleteNotebookFromGithub(path: string): Promise<void> {
  const token = (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "").trim();
  if (!token) return;

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const get = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!get.ok) return;
  const file = (await get.json()) as { sha?: string };
  if (!file.sha) return;

  await fetch(url, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({
      message: `Remove withdrawn notebook ${path}`,
      sha: file.sha,
      branch: BRANCH,
    }),
  });
}

export function colabGithubUrl(path: string): string {
  return `https://colab.research.google.com/github/${REPO_OWNER}/${REPO_NAME}/blob/${BRANCH}/${path}`;
}

/**
 * Publish a submitted .ipynb once to the public repo and remember its path on
 * the submission. Colab can then open the notebook directly from that path.
 */
export async function ensureNotebookGithubPath(
  submissionId: string,
  filePath: string,
): Promise<string | null> {
  const token = (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "").trim();
  if (!token) return null;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("submissions")
    .select("notebook_github_path")
    .eq("id", submissionId)
    .maybeSingle()
    .returns<{ notebook_github_path: string | null } | null>();

  if (row?.notebook_github_path) return row.notebook_github_path;

  const { data: blob, error: downloadError } = await admin.storage
    .from("submissions")
    .download(filePath);
  if (downloadError || !blob) {
    throw new Error(downloadError?.message ?? "Could not download the notebook");
  }

  const originalName = filePath.split("/").pop() ?? "notebook.ipynb";
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${NOTEBOOK_DIR}/${submissionId}-${safeName.toLowerCase().endsWith(".ipynb") ? safeName : `${safeName}.ipynb`}`;
  const content = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const response = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        message: `Add notebook for submission ${submissionId}`,
        content,
        branch: BRANCH,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub publish failed: ${response.status} ${await response.text()}`);
  }

  await admin
    .from("submissions")
    .update({ notebook_github_path: path })
    .eq("id", submissionId);

  return path;
}
