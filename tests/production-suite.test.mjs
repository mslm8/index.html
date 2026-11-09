import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const suite = readFileSync(new URL('../production-suite.js', import.meta.url), 'utf8');

test('production suite is connected to navigation and loaded by the app', () => {
  assert.match(html, /data-view="production">اتاق تولید/);
  assert.match(html, /id="productionSuite"/);
  assert.match(html, /production:document\.getElementById\("productionSuite"\)/);
  assert.match(html, /src="\.\/production-suite\.js"/);
});

test('production suite exposes script, scene, character, location and quality tools', () => {
  for (const id of [
    'productionStory', 'productionSplitStory', 'productionSceneList',
    'productionSceneEditor', 'productionTimeline', 'productionCharacterList',
    'productionLocationList', 'productionChecklist', 'productionSendToAnimator',
    'productionExport', 'productionExportShots', 'productionImport'
  ]) assert.ok(html.includes('id="' + id + '"'), 'Missing UI element: ' + id);
  for (const token of ['function splitStory()', 'function renderTimeline()', 'function renderCharacters()', 'function renderChecklist()', 'productionSendToAnimator']) {
    assert.ok(suite.includes(token), 'Missing implementation: ' + token);
  }
});

test('project import is bounded and validates its basic structure', () => {
  assert.match(suite, /file\.size > 2\*1024\*1024/);
  assert.match(suite, /Array\.isArray\(next\.scenes\)/);
  assert.match(suite, /Array\.isArray\(next\.characters\)/);
});

test('scene transfer uses the existing animator scene conversion entry point', () => {
  assert.match(suite, /storyToScenesInput/);
  assert.match(suite, /storyToScenesButton/);
  assert.match(suite, /data-view="animation"/);
});
