import { randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const PROBE_ROOT = path.join(tmpdir(), "readypackets-audio-probe");
const SAFE_EXTENSIONS = new Set(["webm", "mp3", "m4a", "wav", "ogg"]);
const MAX_DURATION_SECONDS = 12 * 60 * 60;

/**
 * Determines an uploaded audio file's duration with ffprobe, which is already
 * present in the supported production image. The function never uses a shell,
 * exposes no client-controlled command arguments, probes a private temporary
 * file, and removes it even if media parsing fails.
 */
export async function probeAudioDurationSeconds(buffer: Buffer, extension: string): Promise<number | null> {
  const safeExtension = SAFE_EXTENSIONS.has(extension.toLowerCase()) ? extension.toLowerCase() : "bin";
  const directory = path.join(PROBE_ROOT, randomUUID());
  const sourcePath = path.join(directory, `upload.${safeExtension}`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(sourcePath, buffer, { mode: 0o600 });
    const { stdout } = await execFile(
      "/usr/bin/ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", sourcePath],
      { timeout: 5_000, maxBuffer: 1_024, windowsHide: true },
    );
    const duration = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS) return null;
    return Math.ceil(duration);
  } catch {
    return null;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function formatAudioDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}
