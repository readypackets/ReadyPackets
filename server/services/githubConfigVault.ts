import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { decryptField, encryptField } from "../security/crypto.js";
import { getSetting, getSettingJson, setSetting } from "./settings.js";

const GITHUB_API = "https://api.github.com";
const EXPORT_DIRECTORY = "/var/lib/readypackets/storage/admin-exports";
const TOKEN_SETTING = "backup.github_vault.token";
const CONFIG_SETTING = "backup.github_vault.config";
const TOKEN_AAD = "backup.github_vault.token";
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCH = /^(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]{1,255}$/;
const FOLDER = /^(?!\/)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]{1,240}$/;
const EXPORTED_CONFIG = /^readypackets-config-github-secrets-[0-9TZ-]+\.rpconfig$/;

export interface GitHubVaultConfiguration {
  repository: string;
  branch: string;
  folder: string;
  enabled: boolean;
}

export interface GitHubVaultStatus extends GitHubVaultConfiguration {
  tokenConfigured: boolean;
}

export interface GitHubVaultPublication {
  repository: string;
  branch: string;
  archivePath: string;
  manifestPath: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
}

const DEFAULT_CONFIGURATION: GitHubVaultConfiguration = {
  repository: "",
  branch: "main",
  folder: "readypackets-platform-config",
  enabled: false,
};

function cleanRepository(repository: string): string {
  const cleaned = repository.trim();
  if (!REPOSITORY.test(cleaned)) throw new Error("Use owner/repository for the private GitHub repository.");
  return cleaned;
}

function cleanBranch(branch: string): string {
  const cleaned = branch.trim();
  if (!BRANCH.test(cleaned) || cleaned.startsWith("/") || cleaned.endsWith("/")) throw new Error("GitHub branch name is invalid.");
  return cleaned;
}

function cleanFolder(folder: string): string {
  const cleaned = folder.trim().replace(/^\/+|\/+$/g, "");
  if (!FOLDER.test(cleaned)) throw new Error("GitHub backup folder may contain only letters, numbers, dots, underscores, hyphens, and single path separators.");
  return cleaned;
}

function safePathSegment(value: string): string {
  return value.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function githubHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ReadyPackets-Configuration-Vault",
  };
}

async function githubRequest(token: string, requestPath: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    return await fetch(`${GITHUB_API}${requestPath}`, {
      ...init,
      headers: { ...githubHeaders(token), ...(init.headers ?? {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function tokenForUse(): Promise<string> {
  const encrypted = await getSetting(TOKEN_SETTING);
  const token = decryptField(encrypted, TOKEN_AAD)?.trim() ?? "";
  if (!token) throw new Error("Configure a GitHub fine-grained access token before publishing a configuration vault backup.");
  return token;
}

async function configured(): Promise<GitHubVaultConfiguration> {
  const value = await getSettingJson<Partial<GitHubVaultConfiguration>>(CONFIG_SETTING, DEFAULT_CONFIGURATION);
  return {
    repository: value.repository ?? "",
    branch: value.branch ?? DEFAULT_CONFIGURATION.branch,
    folder: value.folder ?? DEFAULT_CONFIGURATION.folder,
    enabled: value.enabled ?? false,
  };
}

export function validateGitHubVaultConfiguration(input: Pick<GitHubVaultConfiguration, "repository" | "branch" | "folder"> & { enabled?: boolean }): GitHubVaultConfiguration {
  return {
    repository: cleanRepository(input.repository),
    branch: cleanBranch(input.branch),
    folder: cleanFolder(input.folder),
    enabled: input.enabled ?? false,
  };
}

export async function getGitHubVaultStatus(): Promise<GitHubVaultStatus> {
  const [config, token] = await Promise.all([configured(), getSetting(TOKEN_SETTING)]);
  return { ...config, tokenConfigured: Boolean(decryptField(token, TOKEN_AAD)) };
}

export async function configureGitHubVault(input: {
  repository: string;
  branch: string;
  folder: string;
  enabled: boolean;
  token?: string;
  updatedByUserId: number;
}): Promise<GitHubVaultStatus> {
  const config = validateGitHubVaultConfiguration(input);
  if (input.token !== undefined && input.token.trim()) {
    const encrypted = encryptField(input.token.trim(), TOKEN_AAD);
    if (!encrypted) throw new Error("GitHub token could not be encrypted.");
    await setSetting(TOKEN_SETTING, encrypted, { valueType: "secret", category: "backups", isSecret: true, userId: input.updatedByUserId });
  }
  const existingToken = await getSetting(TOKEN_SETTING);
  if (config.enabled && !decryptField(existingToken, TOKEN_AAD)) throw new Error("A GitHub fine-grained access token is required before enabling the configuration vault.");
  await setSetting(CONFIG_SETTING, JSON.stringify(config), { valueType: "json", category: "backups", userId: input.updatedByUserId });
  return { ...config, tokenConfigured: Boolean(decryptField(existingToken, TOKEN_AAD)) };
}

export async function testGitHubVault(): Promise<{ repository: string; branch: string; folder: string; privateRepository: boolean }> {
  const [config, token] = await Promise.all([configured(), tokenForUse()]);
  if (!config.enabled) throw new Error("Enable the GitHub configuration vault before testing it.");
  const response = await githubRequest(token, `/repos/${safePathSegment(config.repository)}`);
  if (!response.ok) throw new Error(`GitHub repository test failed with HTTP ${response.status}. Confirm the private repository and token Contents permissions.`);
  const payload = await response.json() as { private?: boolean };
  if (payload.private !== true) throw new Error("The configured GitHub repository is not private. ReadyPackets will not publish configuration vault backups to a public repository.");
  return { repository: config.repository, branch: config.branch, folder: config.folder, privateRepository: true };
}

async function putPrivateContent(token: string, repository: string, branch: string, targetPath: string, content: Buffer, message: string): Promise<void> {
  const response = await githubRequest(token, `/repos/${safePathSegment(repository)}/contents/${safePathSegment(targetPath)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: content.toString("base64"), branch }),
  });
  if (!response.ok) throw new Error(`GitHub archive upload failed with HTTP ${response.status}. Confirm token Contents read/write access and repository protection rules.`);
}

export async function publishGitHubVaultBackup(input: {
  filename: string;
  releasedAt: string;
}): Promise<GitHubVaultPublication> {
  if (!EXPORTED_CONFIG.test(input.filename)) throw new Error("The protected export filename is invalid.");
  const [config, token] = await Promise.all([configured(), tokenForUse()]);
  if (!config.enabled) throw new Error("Enable and test the private GitHub configuration vault before publishing a backup.");
  const archive = await readFile(path.join(EXPORT_DIRECTORY, input.filename));
  if (archive.byteLength === 0 || archive.byteLength > MAX_ARCHIVE_BYTES) throw new Error("The encrypted configuration vault archive is missing or exceeds the protected publication limit.");
  const createdAt = input.releasedAt;
  const sha256 = createHash("sha256").update(archive).digest("hex");
  const day = createdAt.slice(0, 10);
  const archivePath = `${config.folder}/${day}/${input.filename}`;
  const manifestPath = `${config.folder}/${day}/${input.filename}.manifest.json`;
  const manifest = Buffer.from(JSON.stringify({
    format: "readypackets-github-configuration-vault",
    formatVersion: 1,
    createdAt,
    archive: input.filename,
    sha256,
    sizeBytes: archive.byteLength,
    encrypted: true,
    recovery: "Administrator-supplied export passphrase. The passphrase is not retained by ReadyPackets or GitHub.",
    contains: ["platform configuration", "protected environment", "encrypted application secret settings"],
    excludes: ["customer data", "orders", "uploaded files", "sessions", "activity logs"],
  }, null, 2) + "\n", "utf8");
  await testGitHubVault();
  await putPrivateContent(token, config.repository, config.branch, archivePath, archive, `backup: encrypted ReadyPackets configuration vault ${input.filename}`);
  await putPrivateContent(token, config.repository, config.branch, manifestPath, manifest, `backup: manifest for ${input.filename}`);
  return { repository: config.repository, branch: config.branch, archivePath, manifestPath, sha256, sizeBytes: archive.byteLength, createdAt };
}
