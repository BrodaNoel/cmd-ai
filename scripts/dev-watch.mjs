import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const watchedFiles = [
  'bin/ai.js',
  'cmd-ai-completion.sh',
  'package.json',
  'README.md',
].map(file => path.resolve(process.cwd(), file));

const watchers = [];
let runInProgress = false;
let rerunRequested = false;
let debounceTimer = null;

function runChecks(reason) {
  console.log(`\n[dev:watch] Change detected: ${reason}`);

  try {
    execSync('npm run -s dev:check', {
      stdio: 'inherit',
    });
    console.log('[dev:watch] Checks passed.');
  } catch (error) {
    console.error('[dev:watch] Checks failed.');
  }
}

function scheduleChecks(reason) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    if (runInProgress) {
      rerunRequested = true;
      return;
    }

    runInProgress = true;
    runChecks(reason);
    runInProgress = false;

    if (rerunRequested) {
      rerunRequested = false;
      scheduleChecks('queued changes');
    }
  }, 150);
}

for (const filePath of watchedFiles) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[dev:watch] Skipping missing file: ${filePath}`);
    continue;
  }

  const watcher = fs.watch(filePath, eventType => {
    scheduleChecks(`${eventType} ${path.basename(filePath)}`);
  });
  watchers.push(watcher);
}

if (watchers.length === 0) {
  console.error('[dev:watch] No files to watch. Exiting.');
  process.exit(1);
}

console.log('[dev:watch] Watching files:');
for (const filePath of watchedFiles) {
  if (fs.existsSync(filePath)) {
    console.log(`- ${filePath}`);
  }
}
console.log('[dev:watch] Press Ctrl+C to stop.');

runChecks('startup');

process.on('SIGINT', () => {
  for (const watcher of watchers) {
    watcher.close();
  }
  console.log('\n[dev:watch] Stopped.');
  process.exit(0);
});

