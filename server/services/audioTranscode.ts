import { randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const TRANSCODE_ROOT = path.join(tmpdir(), "readypackets-sharepoint-audio");
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

/**
 * Creates a transient MP3 transfer copy for SharePoint when app-only Microsoft
 * Graph rejects a WebM source. The caller retains the original encrypted WebM;
 * no transcoded artifact is persisted in ReadyPackets storage. Arguments and
 * paths are server-generated, ffmpeg runs without a shell, and the private
 * workspace is removed in all cases.
 */
export async function transcodeWebmToMp3ForSharePoint(source: Buffer): Promise<Buffer> {
  if (!source.byteLength || source.byteLength > MAX_SOURCE_BYTES) {
    throw new Error("The WebM recording is outside the safe SharePoint fallback transcoding size limit.");
  }

  const directory = path.join(TRANSCODE_ROOT, randomUUID());
  const inputPath = path.join(directory, "recording.webm");
  const outputPath = path.join(directory, "recording.mp3");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(inputPath, source, { mode: 0o600 });
    await execFile(
      "/usr/bin/ffmpeg",
      [
        "-hide_banner",
        "-loglevel", "error",
        "-nostdin",
        "-i", inputPath,
        "-map", "0:a:0",
        "-vn",
        "-ac", "1",
        "-ar", "44100",
        "-c:a", "libmp3lame",
        "-b:a", "96k",
        "-y",
        outputPath,
      ],
      { timeout: 60_000, maxBuffer: 64 * 1024, windowsHide: true },
    );
    const mp3 = await readFile(outputPath);
    if (!mp3.byteLength || mp3.byteLength > MAX_OUTPUT_BYTES) {
      throw new Error("The MP3 transfer copy is outside the safe SharePoint fallback output size limit.");
    }
    return mp3;
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 240) : "unknown conversion failure";
    throw new Error(`Could not prepare the SharePoint-only MP3 audio copy: ${reason}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
