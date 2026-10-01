"use node";
import { createHash } from "node:crypto";
export function sha256HexBytes(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
export function sha256HexText(text: string): string { return createHash("sha256").update(text).digest("hex"); }
export function contentIdentity(bytes: Uint8Array): { sha256: string; size: number } { return { sha256: sha256HexBytes(bytes), size: bytes.length }; }
