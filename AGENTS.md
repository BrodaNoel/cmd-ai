# cmd-ai Agent Notes

## What This Project Is
`cmd-ai` is an npm package that installs a global `ai` command for terminal use.

Primary flow:
- user writes a natural-language task, e.g. `ai list files`
- provider generates shell command(s)
- CLI shows the proposed command
- user confirms execution
- command runs (or is skipped by `--dry`, cancellation, or safety block)

## Current Providers
Configured with `ai config`.

Supported providers:
- `ollama` (default): uses local Ollama models selected from `ollama list`
- `openai`: uses OpenAI Codex models through the Responses API
- `gemini`: uses Google Gemini models through `generateContent`
- `claude`: uses Anthropic Claude models through the Messages API

### OpenAI (hardcoded model list)
- `gpt-5.3-codex`
- `gpt-5.3-codex-spark`
- `gpt-5.2-codex`
- `gpt-5.1-codex`
- `gpt-5.1-codex-max`

Configurable in CLI:
- API key
- model
- reasoning effort (`low`/`medium`/`high`, plus `xhigh` for `gpt-5.3-codex` and `gpt-5.2-codex`)

### Gemini (hardcoded model list)
- `gemini-3.1-pro-preview`
- `gemini-3-flash-preview`
- `gemini-3.1-flash-lite-preview`
- `gemini-2.5-pro`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

Configurable in CLI:
- API key
- model
- reasoning effort (`low`/`medium`/`high`)

Implementation detail:
- Gemini 3.x models use `thinkingConfig.thinkingLevel`
- Gemini 2.5 models use `thinkingConfig.thinkingBudget` mapped from effort

### Claude (hardcoded model list)
- `claude-opus-4-6`
- `claude-sonnet-4-6`
- `claude-haiku-4-5`

Configurable in CLI:
- API key
- model
- reasoning effort (`low`/`medium`/`high`; `max` also available for `claude-opus-4-6`)

Implementation detail:
- reasoning effort is sent via `output_config.effort` for supported models (`opus` and `sonnet`)
- `claude-haiku-4-5` is supported as a model choice, but effort control is not applied in this CLI path

### Ollama behavior
- checks that `ollama` command exists
- fetches local models from `ollama list`
- user picks one model in `ai config`
- selected model is stored in config and used for prompt generation

## Commands and Flags
Commands:
- `ai <task>`
- `ai config`
- `ai history`
- `ai man`
- `ai install-autocomplete`

Flags:
- `--explain`
- `--dry`
- `--help` / `-h`
- `--version`

## Config and History Files
Config:
- `~/.ai-config.json`

History:
- `~/.ai-command-history.json`

History entry fields:
- `timestamp`
- `prompt`
- `command`
- `executed`
- `provider`
- optional `notes`

History is trimmed to the latest 1000 entries before append.

## Safety and Execution
- proposed commands pass through a danger-pattern filter before execution
- obviously risky commands are not auto-executed and are logged
- execution still requires user confirmation (unless cancelled/dry run path)
- actual execution uses `child_process.exec`

## Output Parsing
Generated provider output is parsed by:
- extracting fenced code blocks when present
- otherwise finding first command-like line
- stripping shell prompt noise and wrappers
- separating explanation from command when `--explain` is on

## Autocomplete
`ai install-autocomplete`:
- copies `cmd-ai-completion.sh` to `~/.cmd-ai-completion.sh`
- appends `source ~/.cmd-ai-completion.sh` to shell rc file when possible

## Core Files
- CLI logic: `bin/ai.js`
- shell completion script: `cmd-ai-completion.sh`
- package metadata + bin mapping: `package.json`
- docs: `README.md`
- release helper: `scripts/release.mjs`

## Release flow

Use this for future releases:

1. Decide release kind:
   - `fix` (patch)
   - `feature` (minor)
   - `breaking` (major)
2. Run:

```bash
npm run release
```

`npm run release` does all of the following:
- verifies required scripts exist in `package.json` (`dev:check`, `lint`, `dev:pack` when available)
- runs `npm run dev:check`
- runs optional `npm run lint` and `npm run dev:pack` checks if present
- ensures the git working tree is clean
- prompts for release kind if not passed as an argument (or accepts:
  - `npm run release -- fix`
  - `npm run release -- feature`
  - `npm run release -- breaking`
  )
- runs `npm version` with a chore release commit
- creates an annotated version tag (default `npm version` format)
- pushes commit and tags
- runs `npm publish`
- prints the published package version

If you prefer manual steps, run these in order:

```bash
npm run dev:check
npm run lint
npm run dev:pack
npm version patch # or minor/major
git push --follow-tags
npm publish
```

## Known Limitations
- model lists are intentionally hardcoded; updating requires code changes in `bin/ai.js`
- `install-autocomplete` copies the bundled `cmd-ai-completion.sh` from the installed package path and sources it from `~/.cmd-ai-completion.sh`
- safety filter is pattern-based, not a full shell parser/sandbox
