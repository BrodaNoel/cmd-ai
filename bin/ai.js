#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(os.homedir(), '.ai-config.json');
const HISTORY_PATH = path.join(os.homedir(), '.ai-command-history.json');

const PROVIDERS = ['ollama', 'openai', 'gemini', 'claude'];

const OPENAI_MODELS = [
  'gpt-5.3-codex',
  'gpt-5.3-codex-spark',
  'gpt-5.2-codex',
  'gpt-5.1-codex',
  'gpt-5.1-codex-max',
];

const GEMINI_MODELS = [
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

const CLAUDE_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
];

const DEFAULT_CONFIG = {
  provider: 'ollama',
  openaiModel: OPENAI_MODELS[0],
  openaiReasoningEffort: 'medium',
  geminiModel: GEMINI_MODELS[0],
  geminiReasoningEffort: 'medium',
  claudeModel: CLAUDE_MODELS[1],
  claudeReasoningEffort: 'medium',
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function startGenerationLoading(provider) {
  const message = `Generating command with ${provider}...`;

  if (!process.stdout.isTTY) {
    console.log(message);
    return {
      stop() {},
    };
  }

  const frames = ['-', '\\', '|', '/'];
  let frameIndex = 0;
  let stopped = false;

  const render = () => {
    const frame = frames[frameIndex];
    frameIndex = (frameIndex + 1) % frames.length;

    if (
      typeof process.stdout.clearLine === 'function' &&
      typeof process.stdout.cursorTo === 'function'
    ) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(`${message} ${frame}`);
      return;
    }

    process.stdout.write(`\r${message} ${frame}`);
  };

  render();
  const intervalId = setInterval(render, 120);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(intervalId);

      if (
        typeof process.stdout.clearLine === 'function' &&
        typeof process.stdout.cursorTo === 'function'
      ) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        return;
      }

      process.stdout.write('\r');
    },
  };
}

function saveHistory(entry) {
  let history = [];
  if (fs.existsSync(HISTORY_PATH)) {
    try {
      history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8')).slice(-1000);
    } catch (e) {
      console.error('Error reading history file, starting fresh:', e.message);
      history = [];
    }
  }

  history.push({ ...entry, timestamp: new Date().toISOString() });

  try {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  } catch (e) {
    console.error('Error writing history file:', e.message);
  }
}

function isDangerous(command) {
  const normalized = command
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\\+$/, '')
    .replace(/\n/g, ';');

  const subcommands = normalized
    .split(/;|&&|\|\||\(|\)|\{|\}/)
    .map(s => s.trim())
    .filter(Boolean);

  const blackListPatterns = [
    'rm -rf /',
    'rm -rf ~',
    'rm -rf .*',
    'rm -rf *',
    'rm --no-preserve-root',
    'rm -r --no-preserve-root /',
    'mkfs',
    'mkfs.ext4',
    'mkfs.xfs',
    'mkfs.vfat',
    'dd if=',
    'dd of=/dev/',
    ':(){:|:&};:',
    '>:()',
    'shutdown',
    'reboot',
    'halt',
    'poweroff',
    'init 0',
    'init 6',
    'kill -9 1',
    'mv /',
    'chmod 000',
    'chmod -r 000 /',
    'chown root',
    'yes > /dev/',
    '>/dev/',
    'mount -o bind / /dev/null',
    'crontab -r',
    'echo .* >',
    'cat /dev/urandom >',
    'find / -exec rm',
    'find / -delete',
    'wipefs',
    'shred',
    'nohup .* >/dev/null 2>&1 &',
    'curl .* | sh',
    'wget .* | sh',
    'base64 -d <<< .* | sh',
  ];

  if (
    /\s*\|\s*(sh|bash|zsh|csh|ksh|python|perl|ruby)\s*(-c|\s|$)/.test(
      normalized
    )
  ) {
    console.warn(
      'Potential dangerous pattern: Piping output to a shell or interpreter.'
    );
    return true;
  }

  return subcommands.some(sub =>
    blackListPatterns.some(pattern => sub.startsWith(pattern))
  );
}

function printHelp() {
  console.log(`
Usage: ai [prompt or command] [--flags]

Examples:
  ai list files in current directory
  ai remove all docker containers
  ai list files in current directory and save to file.txt
  ai config                    Configure provider, model, API keys, and reasoning effort
  ai history                   Show history of AI-generated commands
  ai man / --help / -h         Show this help message
  ai install-autocomplete      Install autocomplete to your shell config

Flags:
  --explain     Ask AI to explain the command before returning it
  --dry         Show the command but do not execute it
  --version     Show the package version

Providers:
  ollama      Uses local Ollama models (requires ollama installed).
  openai      Uses OpenAI Codex models (requires API key).
  gemini      Uses Google Gemini API models (requires API key).
  claude      Uses Anthropic Claude API models (requires API key).

Autocomplete:
  Run the following to enable autocomplete:
    ai install-autocomplete
`);
}

function installAutocompleteScript() {
  const sourcePath = path.join(__dirname, '..', 'cmd-ai-completion.sh');
  const targetPath = path.join(os.homedir(), '.cmd-ai-completion.sh');

  if (!fs.existsSync(sourcePath)) {
    console.error(`Autocomplete script not found at: ${sourcePath}\n`);
    console.error(
      "Could not locate the bundled completion script. Reinstall cmd-ai and try again.\n"
    );
    process.exit(1);
  }

  try {
    fs.copyFileSync(sourcePath, targetPath);
    fs.chmodSync(targetPath, 0o644);
    console.log(`✅ Autocomplete script copied to: ${targetPath}`);
  } catch (e) {
    console.error(`Error copying autocomplete script: ${e.message}\n`);
    process.exit(1);
  }

  const shell = process.env.SHELL || '';
  let rcFile = null;
  if (shell.includes('zsh')) {
    rcFile = path.join(os.homedir(), '.zshrc');
  } else if (shell.includes('bash')) {
    rcFile = path.join(os.homedir(), '.bashrc');
  } else if (shell.includes('ksh')) {
    rcFile = path.join(os.homedir(), '.kshrc');
  }

  const sourceCmd = `source ${targetPath}`;

  if (!rcFile) {
    console.log('\n🚨 Could not detect shell config file automatically.');
    console.log(
      'Please manually add this line to your shell config (.bashrc, .zshrc, etc.):'
    );
    console.log(`   ${sourceCmd}\n`);
    return;
  }

  try {
    const rcContent = fs.existsSync(rcFile)
      ? fs.readFileSync(rcFile, 'utf-8')
      : '';

    if (!rcContent.includes(sourceCmd)) {
      const lines = rcContent.split('\n');
      const alreadySourced = lines.some(line =>
        line.trim().replace(/^#\s*/, '').includes(sourceCmd)
      );

      if (!alreadySourced) {
        fs.appendFileSync(rcFile, `\n# cmd-ai autocomplete\n${sourceCmd}\n`);
        console.log(`✅ Updated ${rcFile} to include autocomplete.`);
      } else {
        console.log(
          `ℹ️ ${rcFile} already includes the autocomplete script (or a commented version).`
        );
      }
    } else {
      console.log(`ℹ️ ${rcFile} already includes the autocomplete script.`);
    }

    console.log('\nℹ️ Please restart your terminal or run:');
    console.log(`   source ${rcFile}\n`);
  } catch (e) {
    console.error(`Error updating shell config file ${rcFile}: ${e.message}\n`);
    console.log('\n🚨 Could not update shell config file automatically.');
    console.log(
      `Please manually add this line to your shell config (${rcFile} or similar):`
    );
    console.log(`   ${sourceCmd}\n`);
  }
}

function parseModelOutput(output, explainMode) {
  let explanation = null;
  let command = output.trim();

  const fencedCodeBlockRegex = /```(?:\w+)?\s*([\s\S]+?)```/s;
  const fencedMatch = command.match(fencedCodeBlockRegex);

  if (fencedMatch) {
    command = fencedMatch[1].trim();
    const explanationPart = output.substring(0, fencedMatch.index).trim();
    if (explanationPart) {
      explanation = explanationPart;
    }

    command = command.replace(/^['"`\s]+/, '').replace(/['"`\s]+$/, '');

    if (explanation) {
      const conversationalStarts =
        /^(?:(hi|hello|hey|greetings|i am|i'm|as a large language model|i cannot|i'm sorry|i understand|okay|sure|alright|of course|you can|you could|to do that|here is|here's)|[^\s]+:)/i;

      const explanationLines = explanation
        .split('\n')
        .filter(line => line.trim() !== '');

      const cleanedExplanationLines = [];
      for (const line of explanationLines) {
        if (conversationalStarts.test(line.trim())) {
          break;
        }
        cleanedExplanationLines.push(line);
      }

      explanation = cleanedExplanationLines.join('\n').trim();
      if (explanation === '') explanation = null;
    }
  } else {
    const commandStartRegex =
      /^[a-zA-Z0-9_-]+|^\.|\/|~|^[>|!$%&*+,-./:;=?@^_~]/;
    const conversationalLineRegex =
      /^(?:(hi|hello|hey|greetings|i am|i'm|as a large language model|i cannot|i'm sorry|i understand|okay|sure|alright|of course|you can|you could|to do that|here is|here's)|[^\s]+:)/i;

    const lines = output.split('\n');

    let firstCommandLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const trimmedLine = lines[i].trim();
      if (!trimmedLine) continue;

      if (
        commandStartRegex.test(trimmedLine) &&
        !conversationalLineRegex.test(trimmedLine.toLowerCase())
      ) {
        firstCommandLineIndex = i;
        break;
      }
    }

    if (firstCommandLineIndex !== -1) {
      if (explainMode) {
        explanation = lines.slice(0, firstCommandLineIndex).join('\n').trim();
        if (explanation === '') explanation = null;
      }
      command = lines.slice(firstCommandLineIndex).join('\n').trim();
      command = command.replace(/^['"`\s]+/, '').replace(/['"`\s]+$/, '');
      command = command.replace(/^\$\s+/, '').replace(/^#\s+/, '');
    } else {
      console.warn(
        'Warning: Could not identify a clear command start line or code block in the model output.'
      );
      command = output.trim();
      explanation = null;
    }
  }

  if (command === '') {
    console.warn(
      'Warning: Command extraction resulted in an empty string. Using full output as command.'
    );
    command = output.trim();
    explanation = null;
  }

  if (explanation) {
    explanation = explanation.trim();
    if (explanation === '') explanation = null;
  }

  return { explanation, command };
}

function normalizeConfig(rawConfig) {
  const config = { ...DEFAULT_CONFIG, ...(rawConfig || {}) };

  if (config.provider === 'local') {
    config.provider = 'ollama';
  }

  if (!config.openaiApiKey && config.apiKey) {
    config.openaiApiKey = config.apiKey;
  }
  if (config.apiKey) {
    delete config.apiKey;
  }

  if (!PROVIDERS.includes(config.provider)) {
    config.provider = DEFAULT_CONFIG.provider;
  }

  if (!OPENAI_MODELS.includes(config.openaiModel)) {
    config.openaiModel = DEFAULT_CONFIG.openaiModel;
  }
  if (!GEMINI_MODELS.includes(config.geminiModel)) {
    config.geminiModel = DEFAULT_CONFIG.geminiModel;
  }
  if (!CLAUDE_MODELS.includes(config.claudeModel)) {
    config.claudeModel = DEFAULT_CONFIG.claudeModel;
  }

  return config;
}

function buildSystemInstruction(osInfo, shellInfo, explainMode) {
  const modeInstruction = explainMode
    ? 'First, provide a brief explanation of the command. Then provide the command, ideally in a fenced code block (for example: ```bash\\n...\\n```).'
    : 'Respond only with the command, ideally in a fenced code block (for example: ```bash\\n...\\n```). No commentary or headings.';

  return `
You are a helpful shell (${shellInfo}) assistant, running on ${osInfo}.
The user will ask for a task they want to accomplish or need help with.
Your goal is to provide safe and correct shell command(s) to accomplish that task.
${modeInstruction}
Output only the explanation and command, or just the command.
`.trim();
}

function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

async function isCommandInstalled(command) {
  try {
    await execFileAsync(command, ['--version'], {
      timeout: 5000,
      windowsHide: true,
    });
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    return true;
  }
}

async function getOllamaModels() {
  let stdout = '';
  let stderr = '';

  try {
    const result = await execFileAsync('ollama', ['list'], {
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    stdout = result.stdout || '';
    stderr = result.stderr || '';
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        'Ollama command was not found. Install Ollama first: https://ollama.com/download'
      );
    }
    const errOut = [error.stdout, error.stderr, error.message]
      .filter(Boolean)
      .join('\n')
      .trim();
    throw new Error(`Failed to list Ollama models.\n${stripAnsi(errOut)}`);
  }

  const output = stripAnsi(stdout).trim();
  const lines = output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    if (stderr && stderr.trim()) {
      throw new Error(stripAnsi(stderr).trim());
    }
    return [];
  }

  const rows = lines[0].toLowerCase().startsWith('name')
    ? lines.slice(1)
    : lines;
  const models = rows
    .map(line => line.split(/\s+/)[0])
    .filter(Boolean)
    .filter(model => model.toLowerCase() !== 'name');

  return [...new Set(models)];
}

async function promptChoice(label, options, currentValue = null) {
  if (!options || options.length === 0) {
    throw new Error(`No options were provided for ${label}.`);
  }

  const defaultIndex =
    currentValue && options.includes(currentValue)
      ? options.indexOf(currentValue)
      : 0;

  console.log(`\n${label}:`);
  options.forEach((option, index) => {
    const marker = index === defaultIndex ? ' (default)' : '';
    console.log(`  ${index + 1}. ${option}${marker}`);
  });

  while (true) {
    const answer = (await ask(`Choose ${label.toLowerCase()} [${defaultIndex + 1}]: `)).trim();

    if (!answer) {
      return options[defaultIndex];
    }

    if (/^\d+$/.test(answer)) {
      const selectedIndex = Number.parseInt(answer, 10) - 1;
      if (selectedIndex >= 0 && selectedIndex < options.length) {
        return options[selectedIndex];
      }
    }

    if (options.includes(answer)) {
      return answer;
    }

    console.log(
      `Invalid selection. Enter a number between 1 and ${options.length}, or an exact option value.`
    );
  }
}

async function promptApiKey(name, existingKey = '') {
  if (existingKey) {
    const answer = (
      await ask(`Paste your ${name} API key (press ENTER to keep current): `)
    ).trim();
    return answer || existingKey;
  }

  while (true) {
    const answer = (await ask(`Paste your ${name} API key: `)).trim();
    if (answer) {
      return answer;
    }
    console.log('API key is required.');
  }
}

function getOpenAIReasoningOptions(model) {
  if (model === 'gpt-5.3-codex' || model === 'gpt-5.2-codex') {
    return ['low', 'medium', 'high', 'xhigh'];
  }
  return ['low', 'medium', 'high'];
}

function supportsClaudeReasoningEffort(model) {
  return ['claude-opus-4-6', 'claude-sonnet-4-6'].includes(model);
}

function getGeminiThinkingConfig(model, effort) {
  if (model.startsWith('gemini-3')) {
    return { thinkingLevel: effort };
  }

  const budgetMap = {
    'gemini-2.5-pro': {
      low: 2048,
      medium: 8192,
      high: 24576,
    },
    'gemini-2.5-flash': {
      low: 1024,
      medium: 6144,
      high: 16384,
    },
    'gemini-2.5-flash-lite': {
      low: 512,
      medium: 4096,
      high: 12288,
    },
  };

  const modelMap = budgetMap[model];
  if (!modelMap) {
    return null;
  }

  const thinkingBudget = modelMap[effort] || modelMap.medium;
  return { thinkingBudget };
}

function extractOpenAIText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data?.output)) {
    const parts = [];
    for (const item of data.output) {
      if (!Array.isArray(item?.content)) continue;
      for (const content of item.content) {
        if (
          (content?.type === 'output_text' || content?.type === 'text') &&
          typeof content.text === 'string' &&
          content.text.trim()
        ) {
          parts.push(content.text.trim());
        }
      }
    }
    if (parts.length) {
      return parts.join('\n').trim();
    }
  }

  if (typeof data?.choices?.[0]?.message?.content === 'string') {
    return data.choices[0].message.content.trim();
  }

  return '';
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return '';
  }

  const textParts = parts
    .map(part => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean);

  return textParts.join('\n').trim();
}

function extractClaudeText(data) {
  if (!Array.isArray(data?.content)) {
    return '';
  }

  const textBlocks = data.content
    .filter(block => block?.type === 'text' && typeof block?.text === 'string')
    .map(block => block.text.trim())
    .filter(Boolean);

  return textBlocks.join('\n').trim();
}

async function generateCommandOpenAI(
  userPrompt,
  osInfo,
  shellInfo,
  apiKey,
  model,
  reasoningEffort,
  explainMode
) {
  const systemInstruction = buildSystemInstruction(osInfo, shellInfo, explainMode);

  const payload = {
    model,
    reasoning: { effort: reasoningEffort },
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: systemInstruction,
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: userPrompt,
          },
        ],
      },
    ],
    max_output_tokens: explainMode ? 1200 : 400,
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `OpenAI API request failed: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  const rawOutput = extractOpenAIText(data);

  if (!rawOutput) {
    throw new Error('OpenAI API returned an empty response.');
  }

  return rawOutput;
}

async function generateCommandGemini(
  userPrompt,
  osInfo,
  shellInfo,
  apiKey,
  model,
  reasoningEffort,
  explainMode
) {
  const systemInstruction = buildSystemInstruction(osInfo, shellInfo, explainMode);
  const thinkingConfig = getGeminiThinkingConfig(model, reasoningEffort);

  const generationConfig = {
    responseMimeType: 'text/plain',
  };

  if (thinkingConfig) {
    generationConfig.thinkingConfig = thinkingConfig;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${systemInstruction}\n\nTask: "${userPrompt}"`,
              },
            ],
          },
        ],
        generationConfig,
      }),
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Google Gemini API request failed: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  const rawOutput = extractGeminiText(data);
  if (!rawOutput) {
    throw new Error('Gemini API returned an empty response.');
  }

  return rawOutput;
}

async function generateCommandClaude(
  userPrompt,
  osInfo,
  shellInfo,
  apiKey,
  model,
  reasoningEffort,
  explainMode
) {
  const systemInstruction = buildSystemInstruction(osInfo, shellInfo, explainMode);

  const payload = {
    model,
    max_tokens: explainMode ? 1200 : 400,
    messages: [
      {
        role: 'user',
        content: `${systemInstruction}\n\nTask: "${userPrompt}"`,
      },
    ],
  };

  if (supportsClaudeReasoningEffort(model)) {
    payload.output_config = {
      effort: reasoningEffort,
    };
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Anthropic API request failed: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  const rawOutput = extractClaudeText(data);
  if (!rawOutput) {
    throw new Error('Claude API returned an empty response.');
  }

  return rawOutput;
}

async function generateCommandOllama(
  userPrompt,
  osInfo,
  shellInfo,
  model,
  explainMode
) {
  const isInstalled = await isCommandInstalled('ollama');
  if (!isInstalled) {
    throw new Error(
      'Ollama command was not found. Install Ollama first: https://ollama.com/download'
    );
  }

  const systemInstruction = buildSystemInstruction(osInfo, shellInfo, explainMode);
  const prompt = `${systemInstruction}\n\nTask: "${userPrompt}"`;

  try {
    const { stdout, stderr } = await execFileAsync('ollama', ['run', model, prompt], {
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });

    const output = stripAnsi((stdout || '').trim());
    if (output) {
      return output;
    }

    const errText = stripAnsi((stderr || '').trim());
    if (errText) {
      throw new Error(errText);
    }

    throw new Error('Ollama returned no output.');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        'Ollama command was not found. Install Ollama first: https://ollama.com/download'
      );
    }
    const details = [error.stdout, error.stderr, error.message]
      .filter(Boolean)
      .join('\n')
      .trim();
    throw new Error(`Ollama request failed.\n${stripAnsi(details)}`);
  }
}

async function configureOpenAI(config) {
  console.log('\nConfiguring OpenAI provider.');
  console.log(
    'Models are hardcoded to current Codex options. You can update this list in bin/ai.js later.'
  );

  config.openaiApiKey = await promptApiKey(
    'OpenAI',
    config.openaiApiKey || ''
  );
  config.openaiModel = await promptChoice(
    'OpenAI model',
    OPENAI_MODELS,
    config.openaiModel
  );

  const effortOptions = getOpenAIReasoningOptions(config.openaiModel);
  config.openaiReasoningEffort = await promptChoice(
    'OpenAI reasoning effort',
    effortOptions,
    config.openaiReasoningEffort
  );
}

async function configureGemini(config) {
  console.log('\nConfiguring Gemini provider.');
  console.log(
    'Models are hardcoded from current Gemini API docs. You can update this list in bin/ai.js later.'
  );

  config.geminiApiKey = await promptApiKey(
    'Google Gemini',
    config.geminiApiKey || ''
  );
  config.geminiModel = await promptChoice(
    'Gemini model',
    GEMINI_MODELS,
    config.geminiModel
  );
  config.geminiReasoningEffort = await promptChoice(
    'Gemini reasoning effort',
    ['low', 'medium', 'high'],
    config.geminiReasoningEffort
  );
}

async function configureClaude(config) {
  console.log('\nConfiguring Claude provider.');
  console.log(
    'Models are hardcoded from current Anthropic API docs. You can update this list in bin/ai.js later.'
  );

  config.claudeApiKey = await promptApiKey(
    'Anthropic Claude',
    config.claudeApiKey || ''
  );
  config.claudeModel = await promptChoice(
    'Claude model',
    CLAUDE_MODELS,
    config.claudeModel
  );

  if (supportsClaudeReasoningEffort(config.claudeModel)) {
    const effortOptions =
      config.claudeModel === 'claude-opus-4-6'
        ? ['low', 'medium', 'high', 'max']
        : ['low', 'medium', 'high'];

    config.claudeReasoningEffort = await promptChoice(
      'Claude reasoning effort',
      effortOptions,
      config.claudeReasoningEffort
    );
  } else {
    console.log(
      '\nSelected Claude model does not expose reasoning effort controls in this CLI path; using default model behavior.'
    );
  }
}

async function configureOllama(config) {
  console.log('\nConfiguring Ollama provider.');

  const installed = await isCommandInstalled('ollama');
  if (!installed) {
    throw new Error(
      'Ollama is not installed or not in PATH. Install it first: https://ollama.com/download'
    );
  }

  const models = await getOllamaModels();
  if (models.length === 0) {
    throw new Error(
      'No Ollama models found. Pull one first, for example: ollama pull llama3.2'
    );
  }

  config.ollamaModel = await promptChoice(
    'Ollama model',
    models,
    config.ollamaModel
  );
}

async function configureProviderSettings(config) {
  if (config.provider === 'openai') {
    await configureOpenAI(config);
    return;
  }

  if (config.provider === 'gemini') {
    await configureGemini(config);
    return;
  }

  if (config.provider === 'claude') {
    await configureClaude(config);
    return;
  }

  if (config.provider === 'ollama') {
    await configureOllama(config);
    return;
  }

  throw new Error(`Unsupported provider "${config.provider}".`);
}

function summarizeProvider(config) {
  if (config.provider === 'openai') {
    return `Provider: openai | Model: ${config.openaiModel} | Reasoning effort: ${config.openaiReasoningEffort}`;
  }
  if (config.provider === 'gemini') {
    return `Provider: gemini | Model: ${config.geminiModel} | Reasoning effort: ${config.geminiReasoningEffort}`;
  }
  if (config.provider === 'claude') {
    if (supportsClaudeReasoningEffort(config.claudeModel)) {
      return `Provider: claude | Model: ${config.claudeModel} | Reasoning effort: ${config.claudeReasoningEffort}`;
    }
    return `Provider: claude | Model: ${config.claudeModel}`;
  }
  return `Provider: ollama | Model: ${config.ollamaModel || '(not set)'}`;
}

async function generateWithConfiguredProvider(
  config,
  userPrompt,
  osInfo,
  shellInfo,
  explainMode
) {
  if (config.provider === 'openai') {
    if (!config.openaiApiKey) {
      throw new Error(
        'Missing OpenAI API key for provider "openai". Run "ai config" first.'
      );
    }
    return generateCommandOpenAI(
      userPrompt,
      osInfo,
      shellInfo,
      config.openaiApiKey,
      config.openaiModel,
      config.openaiReasoningEffort,
      explainMode
    );
  }

  if (config.provider === 'gemini') {
    if (!config.geminiApiKey) {
      throw new Error(
        'Missing Google Gemini API key for provider "gemini". Run "ai config" first.'
      );
    }
    return generateCommandGemini(
      userPrompt,
      osInfo,
      shellInfo,
      config.geminiApiKey,
      config.geminiModel,
      config.geminiReasoningEffort,
      explainMode
    );
  }

  if (config.provider === 'claude') {
    if (!config.claudeApiKey) {
      throw new Error(
        'Missing Anthropic API key for provider "claude". Run "ai config" first.'
      );
    }
    return generateCommandClaude(
      userPrompt,
      osInfo,
      shellInfo,
      config.claudeApiKey,
      config.claudeModel,
      config.claudeReasoningEffort,
      explainMode
    );
  }

  if (!config.ollamaModel) {
    throw new Error(
      'Missing Ollama model for provider "ollama". Run "ai config" first.'
    );
  }

  return generateCommandOllama(
    userPrompt,
    osInfo,
    shellInfo,
    config.ollamaModel,
    explainMode
  );
}

async function main() {
  process.on('exit', () => {
    if (!rl.closed) {
      rl.close();
    }
  });

  rl.on('SIGINT', () => {
    console.log('\nOperation cancelled.');
    if (!rl.closed) {
      rl.close();
    }
    process.exit(1);
  });

  const args = process.argv.slice(2);

  let config = { ...DEFAULT_CONFIG };
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const existingConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      config = normalizeConfig(existingConfig);
    } catch (e) {
      console.error('Error reading config file:', e.message);
      config = { ...DEFAULT_CONFIG };
    }
  } else {
    config = normalizeConfig(config);
  }

  if (args[0] === 'config') {
    console.log('\nConfigure cmd-ai settings.');
    console.log(`Current provider: ${config.provider}`);

    const selectedProvider = (
      await ask(
        `Choose AI provider (${PROVIDERS.join(', ')}) [${config.provider}]: `
      )
    )
      .trim()
      .toLowerCase();

    if (selectedProvider) {
      if (!PROVIDERS.includes(selectedProvider)) {
        console.error(
          `Invalid provider selected. Choose one of: ${PROVIDERS.join(', ')}.`
        );
        rl.close();
        process.exit(1);
      }
      config.provider = selectedProvider;
    }

    try {
      await configureProviderSettings(config);
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

      console.log('\n✅ Configuration saved successfully.');
      console.log(summarizeProvider(config));
      console.log('You can now run commands like:');
      console.log('  ai list all files in this folder\n');
    } catch (error) {
      console.error(`\nConfiguration failed: ${error.message}`);
      rl.close();
      process.exit(1);
    }

    rl.close();
    return;
  }

  if (['man', '--help', '-h'].includes(args[0])) {
    printHelp();
    rl.close();
    return;
  }

  if (args[0] === '--version') {
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')
      );
      console.log(`cmd-ai v${pkg.version}`);
    } catch (error) {
      console.error(
        'Could not read package.json to determine version: ' + error.message
      );
      console.log('cmd-ai version unknown');
    }

    rl.close();
    return;
  }

  if (args[0] === 'install-autocomplete') {
    installAutocompleteScript();
    rl.close();
    return;
  }

  if (args[0] === 'history') {
    if (!fs.existsSync(HISTORY_PATH)) {
      console.log('No command history found.');
      rl.close();
      return;
    }

    try {
      const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
      if (history.length === 0) {
        console.log('Command history is empty.');
        rl.close();
        return;
      }

      history.forEach((entry, idx) => {
        console.log(
          `\n--- History Entry #${idx + 1} ---\nTimestamp: ${
            entry.timestamp
          }\nPrompt: ${entry.prompt}\nCommand:\n${entry.command}\nExecuted: ${
            entry.executed
          }${entry.provider ? ` (Provider: ${entry.provider})` : ''}${
            entry.notes ? `\nNotes: ${entry.notes}` : ''
          }`
        );
      });
    } catch (e) {
      console.error('Error reading or parsing history file:', e.message);
    }

    rl.close();
    return;
  }

  const explainMode = args.includes('--explain');
  const dryRun = args.includes('--dry');
  const filteredArgs = args.filter(arg => !['--explain', '--dry'].includes(arg));
  const userPrompt = filteredArgs.join(' ');
  const osInfo = `${os.platform()} ${os.release()} (${os.arch()})`;
  const shellInfo = process.env.SHELL
    ? path.basename(process.env.SHELL)
    : 'sh, zsh, ksh, etc';

  if (!userPrompt) {
    printHelp();
    rl.close();
    process.exit(0);
  }

  let rawModelOutput = '';
  const executedProvider = config.provider;
  const loadingIndicator = startGenerationLoading(executedProvider);

  try {
    rawModelOutput = await generateWithConfiguredProvider(
      config,
      userPrompt,
      osInfo,
      shellInfo,
      explainMode
    );
    loadingIndicator.stop();
  } catch (error) {
    loadingIndicator.stop();
    console.error(`\nError generating command: ${error.message}`);
    saveHistory({
      prompt: userPrompt,
      command: 'Error generating command',
      executed: false,
      provider: executedProvider,
      notes: `Generation failed: ${error.message}`,
    });
    rl.close();
    process.exit(1);
  }

  const { explanation, command } = parseModelOutput(rawModelOutput, explainMode);

  console.log(`\nAI Response (Provider: ${executedProvider}):`);

  if (explainMode && explanation) {
    console.log('\n--- Explanation ---');
    console.log(explanation);
  }

  console.log('\n--- Proposed Command ---');
  console.log(command);
  console.log('----------------------');

  if (!command || command.trim() === '') {
    console.error('\nCould not extract a valid command from the AI response.');
    console.log('Full AI output was:');
    console.log(rawModelOutput);
    saveHistory({
      prompt: userPrompt,
      command: rawModelOutput,
      executed: false,
      provider: executedProvider,
      notes: 'Command extraction failed',
    });
    rl.close();
    return;
  }

  if (isDangerous(command)) {
    console.error(
      '\n** WARNING: This command looks dangerous and will not be executed automatically. **'
    );
    saveHistory({
      prompt: userPrompt,
      command,
      executed: false,
      provider: executedProvider,
      notes: 'Dangerous command detected',
    });
    rl.close();
    return;
  }

  const confirm = await ask(
    dryRun
      ? '\n[Dry run] Press ENTER to simulate execution, or Ctrl+C to cancel: '
      : '\nDo you want to run the proposed command(s)? (Y/n): '
  );
  const shouldRun =
    confirm.trim() === '' || confirm.trim().toLowerCase() === 'y';

  if (!shouldRun) {
    console.log('Operation cancelled.');
    saveHistory({
      prompt: userPrompt,
      command,
      executed: false,
      provider: executedProvider,
      notes: 'Cancelled by user',
    });
    rl.close();
    return;
  }

  if (dryRun) {
    console.log('\n[Dry run] Command not executed.');
    saveHistory({
      prompt: userPrompt,
      command,
      executed: false,
      provider: executedProvider,
      notes: 'Dry run',
    });
    rl.close();
    return;
  }

  rl.close();

  console.log('\nExecuting command...');
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`\nExecution error:\n${error.message}`);
      saveHistory({
        prompt: userPrompt,
        command,
        executed: false,
        provider: executedProvider,
        notes: `Execution failed: ${error.message}`,
      });
      return;
    }

    if (stdout) console.log(`\nStdout:\n${stdout}`);
    if (stderr) console.error(`\nStderr:\n${stderr}`);
    if (!stdout && !stderr) {
      console.log('\nCommand executed successfully with no output.');
    }

    saveHistory({
      prompt: userPrompt,
      command,
      executed: true,
      provider: executedProvider,
    });
  });
}

process.on('unhandledRejection', reason => {
  console.error('Unhandled Rejection:', reason);
  if (rl && !rl.closed) {
    rl.close();
  }
  if (!process.exitCode) {
    process.exit(1);
  }
});

process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
  if (rl && !rl.closed) {
    rl.close();
  }
  if (!process.exitCode) {
    process.exit(1);
  }
});

main();
