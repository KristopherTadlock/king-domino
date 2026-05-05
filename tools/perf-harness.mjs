import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_BUDGETS = Object.freeze({
  renderBoardDuringInteractions: 0,
  cycleSyncP95Ms: 150,
  rotateSyncP95Ms: 100,
  // Headless software WebGL frame cadence is useful telemetry, but noisy
  // enough across machines that we report it instead of failing by default.
  cycleNextFrameP95Ms: null,
  rotateNextFrameP95Ms: null,
  frameP95Ms: null,
});

function parseArgs(argv) {
  const args = {
    scenario: 'late-placement',
    setupPlacements: 28,
    iterations: 30,
    frameSamples: 60,
    maxActions: 180,
    playerCount: 2,
    seed: 123,
    json: false,
    url: '',
  };

  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg.startsWith('--scenario=')) args.scenario = arg.slice('--scenario='.length);
    else if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length);
    else if (arg.startsWith('--setup-placements=')) args.setupPlacements = Number.parseInt(arg.slice('--setup-placements='.length), 10);
    else if (arg.startsWith('--iterations=')) args.iterations = Number.parseInt(arg.slice('--iterations='.length), 10);
    else if (arg.startsWith('--frame-samples=')) args.frameSamples = Number.parseInt(arg.slice('--frame-samples='.length), 10);
    else if (arg.startsWith('--max-actions=')) args.maxActions = Number.parseInt(arg.slice('--max-actions='.length), 10);
    else if (arg.startsWith('--players=')) args.playerCount = Number.parseInt(arg.slice('--players='.length), 10);
    else if (arg.startsWith('--seed=')) args.seed = Number.parseInt(arg.slice('--seed='.length), 10);
  }

  return args;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, timeoutMs = 10000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function startAppServer() {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    if (process.env.PERF_VERBOSE) process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    if (process.env.PERF_VERBOSE) process.stderr.write(chunk);
  });

  const url = `http://127.0.0.1:${port}/`;
  await waitForHttp(url);
  return { child, url };
}

function commandExists(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return result.status === 0;
}

function findChromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'chrome',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes(path.sep)) {
      if (existsSync(candidate)) return candidate;
    } else if (commandExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function waitForDevToolsUrl(child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for Chrome DevTools endpoint.'));
    }, timeoutMs);

    const onData = (chunk) => {
      const text = chunk.toString();
      chunks.push(text);
      const match = chunks.join('').match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      cleanup();
      resolve(match[1]);
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`Chrome exited before DevTools was ready (code ${code}).`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', onExit);
  });
}

async function launchChrome() {
  const chrome = findChromeBinary();
  if (!chrome) {
    throw new Error('Could not find Chrome/Chromium. Set CHROME_BIN to the browser executable path and rerun npm run perf.');
  }

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'kingdomino-perf-chrome-'));
  const child = spawn(chrome, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    'about:blank',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const wsUrl = await waitForDevToolsUrl(child);
  return { child, userDataDir, wsUrl };
}

async function stopChild(child) {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode == null && child.signalCode == null) child.kill('SIGKILL');
      resolve();
    }, 750);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = [];

  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result ?? {});
      return;
    }

    for (const listener of [...listeners]) {
      if (listener.sessionId && listener.sessionId !== message.sessionId) continue;
      if (listener.method !== message.method) continue;
      if (!listener.predicate(message.params ?? {})) continue;
      listeners.splice(listeners.indexOf(listener), 1);
      clearTimeout(listener.timer);
      listener.resolve(message.params ?? {});
    }
  });

  return {
    async send(method, params = {}, sessionId = null) {
      await opened;
      const id = nextId++;
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      ws.send(JSON.stringify(payload));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    waitForEvent(method, sessionId = null, predicate = () => true, timeoutMs = 30000) {
      return new Promise((resolve, reject) => {
        const listener = {
          method,
          sessionId,
          predicate,
          resolve,
          timer: setTimeout(() => {
            listeners.splice(listeners.indexOf(listener), 1);
            reject(new Error(`Timed out waiting for ${method}`));
          }, timeoutMs),
        };
        listeners.push(listener);
      });
    },
    close() {
      ws.close();
    },
  };
}

async function openPage(cdp, url) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);

  const loaded = cdp.waitForEvent('Page.loadEventFired', sessionId);
  await cdp.send('Page.navigate', { url }, sessionId);
  await loaded;
  return sessionId;
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);

  if (result.exceptionDetails) {
    const text = result.exceptionDetails.text || result.exceptionDetails.exception?.description || 'Runtime evaluation failed';
    throw new Error(text);
  }
  return result.result?.value;
}

async function waitForPerfApi(cdp, sessionId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    const ready = await evaluate(cdp, sessionId, `
      Boolean(document.querySelector('game-layout')?.runPerformanceScenario)
    `);
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for game-layout performance API.');
}

function evaluateBudgets(result, budgets = DEFAULT_BUDGETS) {
  if (result.scenario !== 'late-placement') return [];

  const checks = [
    ['renderBoardDuringInteractions', result.counters.renderBoardDuringInteractions, budgets.renderBoardDuringInteractions],
    ['cycle.sync.p95', result.actions?.cycle?.syncMs?.p95, budgets.cycleSyncP95Ms],
    ['rotate.sync.p95', result.actions?.rotate?.syncMs?.p95, budgets.rotateSyncP95Ms],
    ['cycle.nextFrame.p95', result.actions?.cycle?.nextFrameMs?.p95, budgets.cycleNextFrameP95Ms],
    ['rotate.nextFrame.p95', result.actions?.rotate?.nextFrameMs?.p95, budgets.rotateNextFrameP95Ms],
    ['frame.p95', result.frame.p95, budgets.frameP95Ms],
  ];
  return checks
    .filter(([, actual, budget]) => typeof budget === 'number' && typeof actual === 'number' && actual > budget)
    .map(([name, actual, budget]) => ({ name, actual, budget }));
}

function formatMs(value) {
  return `${Number(value).toFixed(2)}ms`;
}

function printHuman(result, failures) {
  console.log(`Performance scenario: ${result.scenario}`);
  const setupLabel = result.setup.placements != null
    ? `${result.setup.placements} setup placements`
    : `${result.playthrough?.placements ?? 0} playthrough placements`;
  console.log(`Seed ${result.seed}, ${result.playerCount} players, ${setupLabel}`);
  console.log(`Board objects: ${result.setup.boardObjectCount}, animated objects: ${result.setup.animatedObjectCount}`);
  console.log(`Initial board render: ${formatMs(result.setup.initialRenderBoardMs)}`);
  console.log('');
  console.log('Interaction metrics');
  if (result.actions.cycle) {
    console.log(`- Cycle placement: p50 ${formatMs(result.actions.cycle.syncMs.p50)}, p95 ${formatMs(result.actions.cycle.syncMs.p95)}, max ${formatMs(result.actions.cycle.syncMs.max)}`);
  }
  if (result.actions.rotate) {
    console.log(`- Rotate placement: p50 ${formatMs(result.actions.rotate.syncMs.p50)}, p95 ${formatMs(result.actions.rotate.syncMs.p95)}, max ${formatMs(result.actions.rotate.syncMs.max)}`);
  }
  for (const [label, action] of Object.entries(result.actions)) {
    if (label === 'cycle' || label === 'rotate') continue;
    console.log(`- ${label}: ${action.count}x, p50 ${formatMs(action.syncMs.p50)}, p95 ${formatMs(action.syncMs.p95)}, max ${formatMs(action.syncMs.max)}, board renders ${action.renderBoardCalls}`);
  }
  console.log(`- Frame cadence: p50 ${formatMs(result.frame.p50)}, p95 ${formatMs(result.frame.p95)}, max ${formatMs(result.frame.max)}`);
  console.log(`- Board renders during ghost interactions: ${result.counters.renderBoardDuringInteractions}`);
  console.log('');

  if (!failures.length) {
    console.log('✔ Performance budgets passed.');
    return;
  }

  console.log('✘ Performance budgets failed:');
  failures.forEach((failure) => {
    console.log(`- ${failure.name}: ${failure.actual} > ${failure.budget}`);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let appServer = null;
  let chrome = null;
  let cdp = null;

  try {
    appServer = args.url ? { url: args.url } : await startAppServer();
    const baseUrl = appServer.url.replace(/\/$/, '');
    const url = `${baseUrl}/?hotseat=1&seed=${args.seed}&players=${args.playerCount}&p1=Perf&p2=Helper&v=perf`;

    chrome = await launchChrome();
    cdp = createCdpClient(chrome.wsUrl);
    const sessionId = await openPage(cdp, url);
    await waitForPerfApi(cdp, sessionId);

    const scenarioOptions = {
      seed: args.seed,
      playerCount: args.playerCount,
      setupPlacements: args.setupPlacements,
      iterations: args.iterations,
      frameSamples: args.frameSamples,
      maxActions: args.maxActions,
    };
    const result = await evaluate(cdp, sessionId, `
      document.querySelector('game-layout').runPerformanceScenario(${JSON.stringify(args.scenario)}, ${JSON.stringify(scenarioOptions)})
    `);
    const failures = evaluateBudgets(result);

    if (args.json) {
      console.log(JSON.stringify({ result, budgets: DEFAULT_BUDGETS, failures }, null, 2));
    } else {
      printHuman(result, failures);
    }

    if (failures.length) process.exitCode = 1;
  } finally {
    cdp?.close();
    await stopChild(chrome?.child);
    if (chrome?.userDataDir) {
      await rm(chrome.userDataDir, { recursive: true, force: true });
    }
    await stopChild(appServer?.child);
  }
}

main().then(() => {
  process.exit(process.exitCode ?? 0);
}).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
