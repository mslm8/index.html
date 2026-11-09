import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const analytics = fs.readFileSync('analytics.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const workflow = fs.readFileSync('.github/workflows/deploy-pages.yml', 'utf8');

test('analytics initializes only from deployment-injected PostHog configuration', () => {
  assert.match(analytics, /__POSTHOG_CONFIG__/);
  assert.match(analytics, /config\.token/);
  assert.match(analytics, /config\.host/);
  assert.match(analytics, /if\s*\(!config/);
  assert.doesNotMatch(analytics, /phc_[A-Za-z0-9]+/);
});

test('analytics disables autocapture and session replay to avoid collecting form content', () => {
  assert.match(analytics, /autocapture\s*:\s*false/);
  assert.match(analytics, /disable_session_recording\s*:\s*true/);
  assert.doesNotMatch(analytics, /sessionRecording|startSessionRecording/);
  assert.doesNotMatch(analytics, /\.value\b|\.innerText\b|\.textContent\b/);
});

test('analytics tracks only an explicit allowlist of studio actions', () => {
  for (const id of ['generate', 'generateSceneBackground', 'generateAllSceneBackgrounds',
    'storyToScenesButton', 'aiStoryEngineButton', 'download', 'downloadVideo',
    'saveNamedProject', 'exportProject', 'productionExportShots',
    'runManagerDiagnostics', 'exportManagerReport']) {
    assert.ok(analytics.includes("'" + id + "'") || analytics.includes('"' + id + '"'), 'missing analytics mapping for ' + id);
  }
  assert.match(analytics, /addEventListener\(['"]click['"]/);
});

test('analytics captures unhandled browser errors without reading rejection text', () => {
  assert.match(analytics, /unhandledrejection/);
  assert.match(analytics, /captureException/);
  assert.match(analytics, /addEventListener\(['"]error['"]/);
});

test('the application loads generated config before analytics instrumentation', () => {
  const configIndex = html.indexOf('posthog-config.js');
  const analyticsIndex = html.indexOf('analytics.js');
  assert.ok(configIndex >= 0, 'generated PostHog config script is missing');
  assert.ok(analyticsIndex > configIndex, 'analytics must load after its config');
});

test('Pages deployment injects PostHog values from repository settings, not source code', () => {
  assert.match(workflow, /POSTHOG_PROJECT_TOKEN:\s*\$\{\{\s*secrets\.POSTHOG_PROJECT_TOKEN\s*\}\}/);
  assert.match(workflow, /POSTHOG_API_HOST:\s*\$\{\{\s*vars\.POSTHOG_API_HOST\s*\}\}/);
  assert.match(workflow, /posthog-config\.js/);
});
