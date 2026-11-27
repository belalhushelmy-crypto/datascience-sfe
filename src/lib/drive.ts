import "server-only";
import { createSign, randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type DriveConfig = { clientEmail: string; privateKey: string; folderId: string | null };

function config(): DriveConfig | null {
  const clientEmail = (process.env.GOOGLE_DRIVE_CLIENT_EMAIL ?? "").trim();
  const privateKey = (process.env.GOOGLE_DRIVE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();
  const folderId = (process.env.GOOGLE_DRIVE_FOLDER_ID ?? "").trim();
  if (!clientEmail || !privateKey) return null;
  return { clientEmail, privateKey, folderId: folderId || null };
}

function b64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

async function accessToken(cfg: DriveConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: cfg.clientEmail,
      scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const input = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(input);
  signer.end();
  const assertion = `${input}.${signer.sign(cfg.privateKey).toString("base64url")}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token error: ${response.status} ${await response.text()}`);
  }
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google token response had no access token");
  return json.access_token;
}

export async function deleteNotebookFromDrive(fileId: string): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  const token = await accessToken(cfg);
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
}

export function colabDriveUrl(fileId: string): string {
  return `https://colab.research.google.com/drive/${fileId}`;
}

export function isDriveConfigured(): boolean {
  return config() !== null;
}

/**
 * Upload a submitted notebook to Drive once, share it with anyone-with-link,
 * and remember the file id on the submission so Colab can open it directly.
 */
export async function ensureNotebookDriveFile(
  submissionId: string,
  filePath: string,
  fileName: string,
): Promise<string | null> {
  const cfg = config();
  if (!cfg) return null;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("submissions")
    .select("notebook_drive_file_id")
    .eq("id", submissionId)
    .maybeSingle()
    .returns<{ notebook_drive_file_id: string | null } | null>();

  if (row?.notebook_drive_file_id) return row.notebook_drive_file_id;

  const { data: blob, error: downloadError } = await admin.storage
    .from("submissions")
    .download(filePath);
  if (downloadError || !blob) {
    throw new Error(downloadError?.message ?? "Could not download the notebook");
  }

  const token = await accessToken(cfg);
  const boundary = `sfe-${randomUUID()}`;
  const metadata = {
    name: fileName.endsWith(".ipynb") ? fileName : `${fileName}.ipynb`,
    ...(cfg.folderId ? { parents: [cfg.folderId] } : {}),
  };
  const bytes = Buffer.from(await blob.arrayBuffer());
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    ),
    Buffer.from(`--${boundary}\r\nContent-Type: application/x-ipynb+json\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const upload = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!upload.ok) throw new Error(`Drive upload failed: ${upload.status} ${await upload.text()}`);
  const file = (await upload.json()) as { id?: string };
  if (!file.id) throw new Error("Drive upload returned no file id");

  await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });

  await admin
    .from("submissions")
    .update({ notebook_drive_file_id: file.id })
    .eq("id", submissionId);

  return file.id;
}
