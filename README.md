# cmd-ai

**cmd-ai** is a natural language shell assistant powered by AI. It turns plain English (or any prompt) into real, executable shell commands — with safety, explanation, history, and autocompletion built-in.

By default, it uses **Ollama** (local models on your machine), and you can also configure it to use **OpenAI**, **Google Gemini**, or **Anthropic Claude** APIs.

![Example Usage](example.png)

## Installation

To install `cmd-ai`, use the following command:

```bash
npm install -g cmd-ai
```

Ensure you have Node.js installed (v24 via `.nvmrc` is recommended) on your system before proceeding with the installation.

## Configuration

Set your AI provider, model, reasoning effort, and API keys (where required):

```bash
ai config
```

This command will guide you through provider setup.

- **ollama** (default): Uses local models from your Ollama installation. `ai config` checks Ollama and lets you choose one of your installed models.
- **openai**: Uses OpenAI Codex models (hardcoded list in code, including `gpt-5.3-codex` and `gpt-5.3-codex-spark`) and lets you choose reasoning effort.
- **gemini**: Uses Google Gemini API models (hardcoded list in code) and lets you choose reasoning effort.
- **claude**: Uses Anthropic Claude API models (hardcoded list in code). Reasoning effort is configurable for supported models (e.g. Opus/Sonnet).

The default provider is **ollama**.

Your configuration is stored securely in:
```bash
$XDG_CONFIG_HOME/cmd-ai/config.json
```

If `XDG_CONFIG_HOME` is not set, `cmd-ai` uses:
```bash
~/.config/cmd-ai/config.json
```

## Usage

Once installed, you can invoke this library using the `ai` command. For example:

```bash
ai Tell me how much free space is left on the disk
```

This will first display the suggested command based on your input. If you confirm by pressing "Enter," the command will then be executed.

On non-Windows systems, when the Node.js runtime supports `process.execve`, `ai` hands off execution to your shell with `execve`, so `ai` is replaced in the process tree. If `execve` is unavailable (or fails), `ai` falls back to `child_process.exec`.

Before generation, `ai` also builds a local command inventory from your `PATH`, detects common package managers, and samples versions of known tools. That context is included in the model prompt so it can prefer installed commands and suggest install steps when required commands appear missing. To keep token usage bounded, command names are capped.

Here some pre-defined commands:

```bash
ai [your task here] [--flags]
ai list all running Docker containers
ai remove all .DS_Store files recursively
ai config                         # Configure provider/model/API key/reasoning effort
ai history                        # View past commands
ai man                            # Show help
ai install-autocomplete           # Automatically set up autocomplete
```

## Flags

- `--explain` – Ask AI to explain the command before returning it.
- `--dry` – Show the command but don’t execute it.
- `--help` or `-h` – Show help screen.
- `--version` – Show installed package version.

## Shell Autocompletion

Generate and install the autocompletion script:

```bash
ai install-autocomplete
```

This will:

- Generate the autocomplete script at `$XDG_DATA_HOME/cmd-ai/cmd-ai-completion.sh`
- Add source `$XDG_DATA_HOME/cmd-ai/cmd-ai-completion.sh` to your `.bashrc` or `.zshrc`

If `XDG_DATA_HOME` is not set, `cmd-ai` uses:
```bash
~/.local/share/cmd-ai/cmd-ai-completion.sh
```

## Developers

### Local setup

```bash
npm install
npm run dev:link
```

What this does:
- Installs dependencies.
- Links your local repo globally, so the `ai` command points to your working copy.

### Fast local iteration

Run automated checks on file changes while coding:

```bash
npm run dev:watch
```

This watches key files and reruns:
- `npm run dev:check`

`dev:check` performs:
- syntax check (`node --check bin/ai.js`)
- CLI smoke check (`node bin/ai.js --help`)

Build note:
- This project is plain Node.js ESM (no transpilation step), so `npm run dev:link` is enough to test changes immediately in your global `ai` command.

### Manual testing during development

In another terminal, run the linked CLI:

```bash
ai --help
ai --version
ai config
ai list files --dry
npm run dev:pack
```

Tip:
- Use `--dry` while testing generation to avoid executing commands.
- For safe config experiments, you can isolate config/history files:

```bash
HOME=/tmp ai config
HOME=/tmp ai list files --dry
```

### Cleanup local global link

```bash
npm run dev:unlink
```

### Release and publish to npm

Use this flow when shipping a new version:

1. Start from an updated main branch.

```bash
git checkout main
git pull origin main
```

2. Run local checks and packaging dry-run.

```bash
npm install
npm run dev:check
npm run dev:pack
```

You can run the full flow with the release helper:

```bash
npm run release
```

Use one of:

```bash
npm run release -- fix
npm run release -- feature
npm run release -- breaking
```

3. Bump version and create git tag (choose one).

```bash
npm version patch
# or: npm version minor
# or: npm version major
```

This command updates `package.json`/`package-lock.json`, creates a release commit, and creates a git tag like `v1.2.1`.

4. Push commit and tags.

```bash
git push origin main --follow-tags
```

5. Publish to npm.

```bash
npm publish
npm publish --otp=<code> # when your npm account/org requires 2FA
```

When using `npm run release`, provide OTP interactively when prompted, or set `NPM_OTP`:

```bash
NPM_OTP=<code> npm run release -- feature
```

If npm 2FA is enabled for publish, run:

```bash
npm publish --otp=<code>
```

6. Verify published version.

```bash
npm view cmd-ai version
```

## Safety

`cmd-ai` is designed with safety in mind. It includes mechanisms to filter harmful or inappropriate content. However, always review AI-generated outputs before using them in critical applications.

## History

All AI-generated commands are saved (with timestamp and status) in:

```bash
$XDG_STATE_HOME/cmd-ai/history.json
```

If `XDG_STATE_HOME` is not set, `cmd-ai` uses:
```bash
~/.local/state/cmd-ai/history.json
```

Backward compatibility:
- Existing `~/.ai-config.json` and `~/.ai-command-history.json` files are still read if present.
- New writes use XDG paths, migrating data gradually on next write.

View them using:

```bash
ai history
```

## License

This project is licensed under the MIT License.

## Author

Made by Broda Noel (brodanoel@gmail.com)

## ⚠️ Disclaimer

The use of `cmd-ai` is entirely at your own risk.

This tool uses artificial intelligence to generate shell commands automatically. While it includes safety checks to prevent destructive operations, it **does not guarantee the accuracy, safety, or appropriateness** of any generated command.

**You are solely responsible** for reviewing and understanding every command before executing it.

The author(s) of this project **accept no liability** for data loss, system damage, security breaches, or any unintended consequences resulting from the use of this software.
