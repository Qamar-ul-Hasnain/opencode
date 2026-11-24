// GameCode: encrypted prompt loader (fork addition, not upstream OpenCode).
// Decrypts ONLY the active agent's system prompt into memory from
// prompts.enc (AES-256-GCM). On an agent switch the previous prompt is
// dropped before the next one is decrypted, so at most one agent prompt
// is held in memory at a time. Plain prompts never live in opencode.json
// or in agent .md files.
import { createDecipheriv } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"

type BundleEntry = { iv: string; tag: string; data: string }
type Bundle = { version: number; alg: string; entries: Record<string, BundleEntry> }

let cache: { agentId: string | null; prompt: string | null } = { agentId: null, prompt: null }

export const CUSTOM_AGENT_IDS = new Set([
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
])

export function isCustomAgent(agentId: string): boolean {
  return CUSTOM_AGENT_IDS.has(agentId)
}

function keyFilePath(): string {
  if (process.env.GAMECODE_PROMPT_KEY_FILE) return process.env.GAMECODE_PROMPT_KEY_FILE
  if (process.platform === "win32" && process.env.LOCALAPPDATA)
    return join(process.env.LOCALAPPDATA, "GameCode", "prompt.key")
  return join(process.env.HOME ?? ".", ".local", "share", "GameCode", "prompt.key")
}

function encFilePath(): string {
  if (process.env.GAMECODE_PROMPTS_ENC) return process.env.GAMECODE_PROMPTS_ENC
  const candidates = [
    join(dirname(process.execPath), "prompts.enc"),
    join(process.cwd(), "gamecode", "prompts.enc"),
    join(process.cwd(), "prompts.enc"),
  ]
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  return candidates[0]
}

function loadKey(): Buffer {
  const key = Buffer.from(readFileSync(keyFilePath(), "utf8").trim(), "base64")
  if (key.length !== 32) throw new Error("GameCode prompt.key must hold a base64 32-byte key")
  return key
}

// Returns the decrypted system prompt for a custom GameCode agent, or
// undefined for built-in agents (Build, Plan), which keep their own prompt.
export function promptForAgent(agentId: string): string | undefined {
  if (!isCustomAgent(agentId)) return undefined
  if (cache.agentId === agentId && cache.prompt !== null) return cache.prompt
  // Agent switch (or first load): clear the previous prompt from memory first.
  cache = { agentId: null, prompt: null }
  const bundle = JSON.parse(readFileSync(encFilePath(), "utf8")) as Bundle
  if (bundle.alg !== "aes-256-gcm") throw new Error(`Unsupported GameCode prompts bundle alg: ${bundle.alg}`)
  const entry = bundle.entries[agentId]
  if (!entry) throw new Error(`No encrypted prompt found for GameCode agent: ${agentId}`)
  const decipher = createDecipheriv("aes-256-gcm", loadKey(), Buffer.from(entry.iv, "base64"))
  decipher.setAuthTag(Buffer.from(entry.tag, "base64"))
  const prompt = Buffer.concat([
    decipher.update(Buffer.from(entry.data, "base64")),
    decipher.final(),
  ]).toString("utf8")
  cache = { agentId, prompt }
  return prompt
}

export function clearPromptCache(): void {
  cache = { agentId: null, prompt: null }
}
