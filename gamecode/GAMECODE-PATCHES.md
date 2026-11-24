# GameCode wiring: exact remaining edits (for the Nov 24 build session)

Already done in this tree (Nov 23 night, updated after full wiring):
- `packages/core/src/gamecode/prompt-loader.ts`: encrypted prompt loader (new file). Passes `bun build`.
- `packages/core/src/gamecode/license.ts`: license check + gating rules + `gateState()` and `promptKeyPath()` helpers (new file). Passes `bun build`.
- `packages/core/src/session/runner/prompt/system.txt`: first line now says GameCode, so built-in Build and Plan also identify as GameCode.
- Edit 1 is APPLIED: the prompt hook is live in model-request.ts.
- Edit 2 is APPLIED: the key gate is live in packages/core/src/config/plugin/agent.ts (custom agents are skipped at registration unless gateState().allowed contains them).
- Edit 3 is APPLIED: packages/cli/src/index.ts handles `--gamecode-write-stamp` and gates every other run on an active license. packages/cli/package.json gained the `@opencode/core` workspace dependency for this import.
- Edit 4 is APPLIED in full: CLI "models" Spec removed (commands.ts), handler registration removed (index.ts), orphaned handlers/models.ts DELETED (keeping it broke the CLI typecheck, verified Nov 23). TUI: model.list (slash "models"), model.cycle_recent, model.cycle_recent_reverse, model.cycle_favorite, model.cycle_favorite_reverse, variant.cycle, variant.list (slash "variants"), and agent.list (slash "agents") command definitions removed from packages/tui/src/app.tsx, and their names removed from appBindingCommands. @-mention agent calls disabled in packages/tui/src/component/prompt/autocomplete.tsx (agents memo returns no options; file and skill mentions still work).
- Edit 5 is APPLIED for the main surfaces: the assistant message footer in packages/tui/src/routes/session/index.tsx now shows "GameCode" instead of the model/provider name, and the config keybinds already disable model list and cycling.
- Edit 6 is PARTLY applied: system.txt identity line and the sidebar footer string (feature-plugins/sidebar/footer.tsx) say GameCode. Remaining minor "OpenCode" strings in deep UI corners are cosmetic only.
- GameCode config, prompts.enc, prompt.key, installer: in the build package folder (package/gamecode, package/installer).
- Verified Nov 23 night on this clone: `bun install` completed (183 packages), packages/core typecheck passed with the GameCode modules and prompt hook inside (1,978 files, no errors), packages/cli typecheck passed after the models cleanup (2,111 files, no errors). Typechecks are re-run after the full wiring above before the transfer zip is made.

## Edit 1: prompt hook, packages/core/src/session/model-request.ts

In `baseTranscript`, the first system part currently reads:

```ts
SystemPart.make(
  input.agent.system
    ? input.agent.system
    : SessionSystemPrompt.make(input.tools.definitions.map((tool) => tool.name)),
),
```

Change to consult the GameCode loader first (custom agents have no `system` in config, by design):

```ts
SystemPart.make(
  GameCodePrompt.promptForAgent(input.agent.id) ??
    (input.agent.system
      ? input.agent.system
      : SessionSystemPrompt.make(input.tools.definitions.map((tool) => tool.name))),
),
```

Add the import with the other core imports:

```ts
import * as GameCodePrompt from "../gamecode/prompt-loader.js"
```

Verify the exact export style of neighbouring imports in the file and match it.

## Edit 2: key gate at agent registration, packages/core/src/config/plugin/agent.ts

In the transform loop over `document.info.agents`, skip any custom GameCode agent that the gate does not allow:

```ts
const allowed = GameCodeLicense.visibleAgents(licenseStatus, hasValidZenKey)
if (GameCodePrompt.isCustomAgent(id) && !allowed.includes(id)) continue
```

Where `licenseStatus` comes from `GameCodeLicense.checkLicense(appDataDir, keyPath).status`, and `hasValidZenKey` is true when `%LOCALAPPDATA%\GameCode\credentials\zen.key` exists and is non-empty (the provider itself rejects a bad key at first model call; document this). Compute both once per transform, not per agent.

## Edit 3: startup license gate + stamp flag, packages/cli/src/index.ts

- If argv contains `--gamecode-write-stamp`: call `GameCodeLicense.writeInstallStamp(appDataDir(), keyPath)`, print nothing, exit 0. The installer runs this at the end of setup.
- On a normal start: run `checkLicense`. If the status is not "active", print a clear message ("GameCode license has expired or is not active. Please reinstall GameCode.") and exit before the TUI loads. Expired, missing, and tampered all stop here, which is what makes every agent, prompt, and tool stop after 2 days.

## Edit 4: remove /models and @-mentions

- CLI: find where `packages/cli/src/commands/handlers/models.ts` is registered in the commands table and remove the registration (keep the file, unused, or delete it; removal from the table is the behaviour that matters).
- TUI: find the models command in the TUI command registry (packages/tui/src/config and keymap) and remove it; the config keybinds already set model_list to "none".
- @-mentions: find the mention handling in the TUI composer (search for "mention" under packages/tui/src) and disable agent invocation from mentions. Typing text must keep working; only the agent-call behaviour goes.

## Edit 5: hide model and provider names in the TUI

Search packages/tui/src for components that render the model id or provider name (session header, footer, usage component) and render the agent name instead. The config-side half (no model list, no cycling) is already done in opencode.jsonc.

## Edit 6: branding strings

- packages/cli/src/version.ts and the CLI banner/help in packages/cli/src/index.ts: product name GameCode.
- packages/tui/src: user-visible "OpenCode" strings (footer, session routes, usage) become GameCode. Do not rename @opencode/* package imports.

## After the edits

- `bun install` at the repo root, then in packages/core: `bun run typecheck` (fix any type errors in the two new modules first).
- Copy the GameCode opencode.jsonc into the working folder, place prompts.enc next to the built exe (or set GAMECODE_PROMPTS_ENC), prompt.key into %LOCALAPPDATA%\GameCode (or set GAMECODE_PROMPT_KEY_FILE), and a test zen.key into %LOCALAPPDATA%\GameCode\credentials.
- Run from packages/cli with `bun run dev`, then the 7 guardrail tests.
- Build the binary (`bun run build` in packages/cli), stage the installer per package/installer/BUILD-INSTALLER.md, compile with Inno Setup.
