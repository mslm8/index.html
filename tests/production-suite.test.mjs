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

test('visual asset library is integrated, bounded and project-persistent', () => {
  for (const id of ['productionAssetLibrary','productionAssetName','productionAssetKind','productionAssetScene','productionAssetNotes','productionAssetFile','productionAddAsset','productionAssetList']) {
    assert.ok(html.includes('id="' + id + '"'), 'Missing asset library UI: ' + id);
  }
  assert.match(suite, /assets: \[\]/);
  assert.match(suite, /file\.size > 500 \* 1024/);
  assert.match(suite, /\(state\.assets \|\| \[\]\)\.length >= 8/);
  assert.match(suite, /storedBytes \+ dataUrl\.length/);
  assert.match(suite, /1\.7 \* 1024 \* 1024/);
  assert.match(suite, /dataUrl/);
  assert.match(suite, /renderAssets\(\)/);
});

test('continuity audit checks missing scene fields and character/location references', () => {
  assert.ok(html.includes('id="productionRunContinuity"'));
  assert.ok(html.includes('id="productionContinuityReport"'));
  assert.match(suite, /function runContinuityAudit\(\)/);
  assert.match(suite, /شناسنامه‌ای برای شخصیت/);
  assert.match(suite, /مکان در کتابخانه مکان‌ها ثبت نشده/);
});

test('manual rig editor exposes the existing layered rig controls', () => {
  assert.ok(html.includes('id="rigEditorPanel"'));
  assert.ok(html.includes('id="toggleRigEditor"'));
  assert.match(html, /src="\.\/rig-editor\.js" defer/);
  const rig = readFileSync(new URL('../rig-editor.js', import.meta.url), 'utf8');
  for (const token of ["motionLayerFiles", "motionLayerList", "motionLivePreview", "animate", "aria-expanded"]) {
    assert.ok(rig.includes(token), 'Rig editor does not expose: ' + token);
  }
  assert.match(html, /اتصال به والد \(ریگ‌بندی اولیه\)/);
  assert.match(html, /نقطه اتصال افقی روی والد/);
});

test('rig profiles provide bounded local save, restore, and delete workflows', () => {
  for (const id of ['rigProfileName', 'rigProfileSelect', 'saveRigProfile', 'loadRigProfile', 'deleteRigProfile', 'rigProfileStatus']) {
    assert.ok(html.includes('id="' + id + '"'), 'Missing rig profile control: ' + id);
  }
  const rig = readFileSync(new URL('../rig-editor.js', import.meta.url), 'utf8');
  for (const token of ['aiAnimatorRigProfilesV1', 'MAX_PROFILES = 10', 'MAX_TOTAL_BYTES', 'fileToDataUrl', 'safeLayerData', 'renderMotionLayerList', 'URL.revokeObjectURL']) {
    assert.ok(rig.includes(token), 'Rig profile workflow missing: ' + token);
  }
  assert.match(rig, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(rig, /image\.decode\(\)/);
});

test('story-only episode build creates automatic six-part character rigs', () => {
  const helper = html.slice(html.indexOf('async function createAutomaticCharacterRig'), html.indexOf('async function autoBuildEpisodeFromStory'));
  assert.ok(helper.includes("'arm-left'") && helper.includes("'arm-right'"));
  assert.ok(helper.includes("'leg-left'") && helper.includes("'leg-right'"));
  assert.ok(helper.includes("'body'") && helper.includes("'head'"));
  assert.ok(helper.includes('parentLayerId'));
  const buildStart = html.indexOf('async function autoBuildEpisodeFromStory');
  const buildEnd = html.indexOf("$('autoEpisodeButton').addEventListener", buildStart);
  const build = html.slice(buildStart, buildEnd);
  assert.ok(build.includes('createAutomaticCharacterRig(characterName,characterIndex)'), 'Automatic build must generate rigs without manual setup');
  assert.ok(build.includes('autoCharacterRigs.flatMap'), 'Each scene must reuse the generated character rigs');
  assert.ok(build.includes('scene.autoDirection.gesture'), 'Story gesture analysis must drive automatic arm animation');
});

test('automatic episode render keeps generated character layers attached to scene one', () => {
  const start = html.indexOf('async function autoBuildEpisodeFromStory');
  const end = html.indexOf("$('autoEpisodeButton').addEventListener", start);
  const build = html.slice(start, end);
  assert.ok(build.includes("motionLayers.splice(0,motionLayers.length,...(motionScenes[0]?.layers||[]))"));
  assert.ok(build.includes('selectedMotionLayer=motionLayers[motionScenes[0]?.selectedIndex]||motionLayers[0]||null'));
  assert.ok(!build.includes("motionLayers.splice(0,motionLayers.length);selectedMotionLayer=null;"), 'Generated character rig must not be cleared before createMotionClip');
});
