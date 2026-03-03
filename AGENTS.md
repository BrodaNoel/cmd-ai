# cmd-ai Agent Notes

## What This Project Is
`cmd-ai` is an npm package that installs a global `ai` terminal command.

The main use case is:
- User types natural language, e.g. `ai list files`
- Tool generates shell command(s) with AI
- Tool shows the proposed command
- User confirms
- Tool executes the command (unless blocked, cancelled, or dry run)

Package metadata:
- npm package: `cmd-ai`
- binary entrypoint: `ai` -> `bin/ai.js`
- current package version in repo: `1.2.0`
- engines: Node `>=18.17.0` (`.nvmrc` currently points to `v24`)

## Implemented CLI Features

### 1) Natural-language command generation
- `ai <prompt>`
- Example: `ai list all running Docker containers`
- Supports multi-command output (joins and executes whatever command text is extracted)

### 2) AI providers
Configured via `ai config`.

Supported providers:
- `local` (default): `onnx-community/Qwen3-0.6B-ONNX` through `@huggingface/transformers`
- `openai`: OpenAI Chat Completions API (`gpt-3.5-turbo-0125`)
- `gemini`: Google Gemini API (`gemini-2.0-flash-lite`)

Behavior:
- Provider saved in `~/.ai-config.json`
- Switching provider removes unrelated API keys from config
- Selecting `local` in `ai config` triggers model download/setup

### 3) Flags
- `--explain`: asks model to include a short explanation before command
- `--dry`: does not execute command, but still goes through confirmation flow
- `--help` / `-h` / `man`: help text
- `--version`: prints `cmd-ai v<version>`

### 4) Interactive execution confirmation
- After generation, user is prompted:
  - default mode: `Do you want to run the proposed command(s)? (Y/n):`
  - dry mode: press Enter to simulate and skip execution
- Empty input defaults to yes

### 5) Dangerous-command guard
Before execution, commands are checked by a blacklist/pattern matcher.

Blocked examples include patterns like:
- destructive deletes (`rm -rf /`, variants)
- filesystem/boot-impacting commands (`mkfs`, `dd of=/dev/`, `shutdown`, `reboot`)
- command piping into interpreters (`curl ... | sh`, `... | bash`, etc.)
- other destructive patterns (`wipefs`, `shred`, risky `find / -delete`, etc.)

If flagged as dangerous:
- command is not executed
- event is saved to history with note `Dangerous command detected`

### 6) Command history
Command sessions are stored at:
- `~/.ai-command-history.json`

Stored fields include:
- timestamp
- prompt
- command
- executed true/false
- provider
- optional notes (dry run, cancelled, error details, dangerous detection, parse failure)

History behavior:
- Keeps up to the last 1000 entries before appending new ones
- `ai history` prints entries in a readable block format

### 7) Autocomplete installer
Command:
- `ai install-autocomplete`

Behavior:
- Copies `cmd-ai-completion.sh` to `~/.cmd-ai-completion.sh`
- Tries to auto-detect shell and append `source ~/.cmd-ai-completion.sh` to:
  - `~/.zshrc`, `~/.bashrc`, or `~/.kshrc`

Autocomplete suggestions include:
- commands: `config`, `history`, `man`, `install-autocomplete` (plus `autocomplete` token in the script)
- flags: `--dry`, `--explain`, `--help`, `-h`

### 8) Model output parsing
The tool attempts to extract command text robustly by:
- preferring fenced code blocks (```bash ... ```)
- fallback line parsing for command-like lines
- stripping common wrappers/prompts (quotes, backticks, `$`, `#`)
- separating explanation from command when `--explain` is enabled

If parsing fails:
- raw model output is shown/saved
- no execution proceeds for empty extracted command

### 9) Runtime and error handling
- Uses OS and shell metadata in prompts (platform, kernel release, arch, shell name)
- Executes commands with `child_process.exec`
- Handles `SIGINT`, unhandled rejections, and uncaught exceptions with cleanup

## Files That Define Core Behavior
- CLI logic: `bin/ai.js`
- local model download progress UI: `utils/logs.js`
- shell completion script: `cmd-ai-completion.sh`
- docs: `README.md`
- package/binary mapping: `package.json`

## Known Limitations / Gotchas
- `bin/ai.js` imports `@huggingface/transformers` at top-level, so even `--help`/`--version` require dependencies installed.
- `install-autocomplete` looks for `cmd-ai-completion.sh` in the current working directory (`process.cwd()`), so running from the wrong directory can fail.
- completion script includes `autocomplete` as a suggestion, but no `ai autocomplete` command exists in `bin/ai.js`.
- Safety filtering is string-pattern based; it reduces risk but is not a full shell parser/sandbox.
