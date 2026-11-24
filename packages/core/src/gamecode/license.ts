// GameCode: install stamp, 2-day license check, and API key gating
// (fork addition, not upstream OpenCode). Same rules as the tested
// reference module in the build package (gamecode-license.mjs):
//   - License not active (expired, missing, or tampered stamp): stop.
//   - No valid Zen workspace key: only Build and Plan are registered.
//   - Valid key and active license: all agents are registered.
// The stamp is HMAC-signed with the prompt key so casual date editing is
// detectable. This is a test-task license check, not DRM.
import { createHmac } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export const LICENSE_DAYS = 2
const STAMP_FILE = "install-stamp.json"

export type LicenseStatus =
  | { status: "active"; installedAt: string; expiresAt: string }
  | { status: "expired"; installedAt: string; expiresAt: string }
  | { status: "missing" }
  | { status: "tampered" }

export function appDataDir(): string {
  if (process.env.GAMECODE_APPDATA_DIR) return process.env.GAMECODE_APPDATA_DIR
  if (process.platform === "win32" && process.env.LOCALAPPDATA)
    return join(process.env.LOCALAPPDATA, "GameCode")
  return join(process.env.HOME ?? ".", ".local", "share", "GameCode")
}

function sign(installedAt: string, keyBase64: string): string {
  return createHmac("sha256", Buffer.from(keyBase64, "base64"))
    .update(`gamecode-install:${installedAt}`)
    .digest("base64")
}

function readKey(keyPath: string): string {
  return readFileSync(keyPath, "utf8").trim()
}

// Called by the installer through the hidden --gamecode-write-stamp flag.
export function writeInstallStamp(dir: string, keyPath: string, now: Date = new Date()): void {
  const installedAt = now.toISOString()
  const stamp = { installedAt, sig: sign(installedAt, readKey(keyPath)) }
  writeFileSync(join(dir, STAMP_FILE), JSON.stringify(stamp, null, 2))
}

export function checkLicense(dir: string, keyPath: string, now: Date = new Date()): LicenseStatus {
  const path = join(dir, STAMP_FILE)
  if (!existsSync(path)) return { status: "missing" }
  let stamp: { installedAt?: string; sig?: string }
  try {
    stamp = JSON.parse(readFileSync(path, "utf8")) as { installedAt?: string; sig?: string }
  } catch {
    return { status: "tampered" }
  }
  if (!stamp.installedAt || stamp.sig !== sign(stamp.installedAt, readKey(keyPath)))
    return { status: "tampered" }
  const expiresAt = new Date(new Date(stamp.installedAt).getTime() + LICENSE_DAYS * 24 * 60 * 60 * 1000)
  if (now > expiresAt)
    return { status: "expired", installedAt: stamp.installedAt, expiresAt: expiresAt.toISOString() }
  return { status: "active", installedAt: stamp.installedAt, expiresAt: expiresAt.toISOString() }
}

export function promptKeyPath(): string {
  return join(appDataDir(), "prompt.key")
}

// One-call gate state for startup and agent registration: reads the stamp
// and the saved Zen workspace key from local app data.
export function gateState(): { licenseStatus: string; hasValidZenKey: boolean; allowed: string[] } {
  const dir = appDataDir()
  const keyPath = promptKeyPath()
  const licenseStatus = existsSync(keyPath) ? checkLicense(dir, keyPath).status : "missing"
  const zenKeyPath = join(dir, "credentials", "zen.key")
  const hasValidZenKey = existsSync(zenKeyPath) && readFileSync(zenKeyPath, "utf8").trim().length > 0
  return { licenseStatus, hasValidZenKey, allowed: visibleAgents(licenseStatus, hasValidZenKey) }
}

export const CUSTOM_AGENTS = [
  "agent1",
  "agent1-helper",
  "agent2",
  "agent2-helper",
  "agent3",
  "agent3-helper",
  "agent4",
  "agent4-helper",
  "agent5",
  "agent5-helper",
]
export const BUILTIN_AGENTS = ["build", "plan"]

// The gating rule used at agent registration time.
export function visibleAgents(licenseStatus: string, hasValidZenKey: boolean): string[] {
  if (licenseStatus !== "active") return []
  if (!hasValidZenKey) return [...BUILTIN_AGENTS]
  return [...BUILTIN_AGENTS, ...CUSTOM_AGENTS]
}
