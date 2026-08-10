/**
 * Client address resolution and pattern matching.
 *
 * Forwarded headers are attacker-controlled unless the request genuinely
 * arrived through a proxy we operate, so the resolver only consults them when
 * the socket peer is a loopback or private address, and it walks back exactly
 * the configured number of trusted hops rather than blindly taking the first
 * entry in `X-Forwarded-For`.
 */
import type { Request } from "express";
import { env } from "../config/env.js";

function isPrivateOrLoopback(address: string): boolean {
  const value = address.replace(/^::ffff:/, "");
  if (value === "::1" || value.startsWith("127.")) return true;
  if (value.startsWith("10.")) return true;
  if (value.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(value)) return true;
  if (value.startsWith("fc") || value.startsWith("fd")) return true;
  return false;
}

function normalise(address: string | undefined): string {
  if (!address) return "0.0.0.0";
  return address.replace(/^::ffff:/, "").trim();
}

export function resolveClientIp(req: Request): string {
  const socketAddress = normalise(req.socket.remoteAddress ?? undefined);
  if (!isPrivateOrLoopback(socketAddress)) return socketAddress;

  if (env.behindCloudflare) {
    const cfIp = req.headers["cf-connecting-ip"];
    if (typeof cfIp === "string" && cfIp.trim()) return normalise(cfIp);
  }

  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    const chain = forwarded.split(",").map((entry) => normalise(entry));
    const hops = Math.max(1, env.trustProxyHops);
    const candidate = chain[Math.max(0, chain.length - hops)];
    if (candidate) return candidate;
  }

  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return normalise(realIp);

  return socketAddress;
}

function ipv4ToLong(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

export type IpPatternType = "single" | "cidr" | "range";

export function detectPatternType(pattern: string): IpPatternType {
  if (pattern.includes("/")) return "cidr";
  if (pattern.includes("-")) return "range";
  return "single";
}

/**
 * Match an address against a single address, a CIDR block, or a dashed range.
 * IPv6 is supported for exact matches; ranged IPv6 matching is intentionally
 * out of scope rather than implemented approximately.
 */
export function ipMatchesPattern(address: string, pattern: string): boolean {
  const target = normalise(address);
  const candidate = pattern.trim();
  if (!candidate) return false;

  if (candidate.includes("/")) {
    const [network, prefixPart] = candidate.split("/");
    if (!network || prefixPart === undefined) return false;
    const prefix = Number(prefixPart);
    const networkLong = ipv4ToLong(network);
    const targetLong = ipv4ToLong(target);
    if (networkLong === null || targetLong === null) return false;
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
    if (prefix === 0) return true;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (networkLong & mask) === (targetLong & mask);
  }

  if (candidate.includes("-")) {
    const [startRaw, endRaw] = candidate.split("-");
    const start = ipv4ToLong((startRaw ?? "").trim());
    const end = ipv4ToLong((endRaw ?? "").trim());
    const targetLong = ipv4ToLong(target);
    if (start === null || end === null || targetLong === null) return false;
    return targetLong >= Math.min(start, end) && targetLong <= Math.max(start, end);
  }

  return normalise(candidate) === target;
}

export function ipMatchesAny(address: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => ipMatchesPattern(address, pattern));
}
