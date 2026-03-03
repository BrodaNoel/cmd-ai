#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const releaseCacheDir = path.join(os.tmpdir(), 'cmd-ai-release-cache');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const packageScripts = packageJson.scripts || {};

const requiredCheckScripts = ['dev:check', 'lint'];
const optionalScripts = ['dev:pack'];
const requiredChecks = requiredCheckScripts.filter(script => packageScripts[script]);
const optionalChecks = optionalScripts.filter(script => packageScripts[script]);

const releaseAliases = {
  fix: 'patch',
  feature: 'minor',
  breaking: 'major',
  patch: 'patch',
  minor: 'minor',
  major: 'major',
};

const releaseTypeLabels = {
  patch: 'Fix',
  minor: 'Feature',
  major: 'Breaking',
};

function parseReleaseType(args) {
  const arg = args.find(a =>
    ['patch', 'minor', 'major', 'fix', 'feature', 'breaking'].includes(a)
  );

  if (!arg) return null;
  return releaseAliases[arg];
}

function runCommand(label, command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: projectRoot,
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: releaseCacheDir,
      ...(options.env || {}),
    },
    ...options,
  });

  if (result.error) {
    throw new Error(`${label} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}.`);
  }
  return result;
}

function checkScriptsExist() {
  for (const script of requiredCheckScripts) {
    if (!packageScripts[script]) {
      throw new Error(
        `Missing required script "${script}" in package.json. Add it before running release.`
      );
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const releaseType = parseReleaseType(args);
  let semverType = releaseType;

  if (!semverType) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = (await rl.question(
        'Choose release type: 1) fix (patch)  2) feature (minor)  3) breaking (major)\n> '
    )).trim();
    rl.close();

    semverType =
      answer === '1' || answer.toLowerCase() === 'fix'
        ? 'patch'
        : answer === '2' || answer.toLowerCase() === 'feature'
        ? 'minor'
        : answer === '3' || answer.toLowerCase() === 'breaking'
        ? 'major'
        : null;

    if (!semverType) {
      throw new Error(
        'Invalid release type. Use fix, feature, breaking or patch, minor, major.'
      );
    }
  }

  checkScriptsExist();

  for (const script of requiredChecks) {
    runCommand(`npm run ${script}`, 'npm', ['run', script]);
  }

  for (const script of optionalChecks) {
    try {
      runCommand(`npm run ${script}`, 'npm', ['run', script]);
    } catch (error) {
      console.warn(
        `Optional check "${script}" failed and was skipped: ${error.message}`
      );
    }
  }

  const currentVersion = packageJson.version;
  runCommand(
    `npm version ${semverType}`,
    'npm',
    ['version', semverType, '--no-git-tag-version']
  );

  const refreshedPackage = JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf8')
  );
  const newVersion = refreshedPackage.version;

  console.log(
    `✔ Version bumped from ${currentVersion} to ${newVersion} (${releaseTypeLabels[semverType]} / ${semverType}).`
  );

  const postVersionStatus = spawnSync('git', ['status', '--short'], {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).stdout.trim();

  runCommand('git add', 'git', ['add', '-A']);
  if (postVersionStatus) {
    runCommand(
      'git commit',
      'git',
      ['commit', '-m', `chore(release): v${newVersion}`]
    );
  } else {
    runCommand(
      'git commit',
      'git',
      ['commit', '--allow-empty', '-m', `chore(release): v${newVersion}`]
    );
  }

  runCommand(
    'git tag',
    'git',
    ['tag', '-a', `v${newVersion}`, '-m', `Release v${newVersion}`]
  );

  runCommand(
    `git push + tags`,
    'git',
    ['push', '--follow-tags']
  );
  runCommand(`npm publish`, 'npm', ['publish']);
  runCommand(`npm view cmd-ai version`, 'npm', ['view', 'cmd-ai', 'version']);

  console.log('✔ Release complete.');
}

main().catch(error => {
  console.error(`\nRelease failed: ${error.message}\n`);
  process.exit(1);
});
