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
  assert.ok(build.includes('activeRigs.flatMap'), 'Each scene must reuse the generated character rigs');
  assert.ok(build.includes('scene.autoDirection.gesture'), 'Story gesture analysis must drive automatic arm animation');
});

test('story video defaults to widescreen and renderer supports mobile aspect ratios', () => {
  const buildStart = html.indexOf('async function autoBuildEpisodeFromStory');
  const buildEnd = html.indexOf("$('autoEpisodeButton').addEventListener", buildStart);
  const build = html.slice(buildStart, buildEnd);
  assert.match(build, /\$\('aspect'\)\.value='wide'/);
  assert.match(html, /square:\[960,960\],landscape:\[960,720\],portrait:\[720,960\],wide:\[960,540\],tall:\[540,960\]/);
  assert.match(html, /canvas\.width=videoDimensions\[0\];canvas\.height=videoDimensions\[1\]/);
});

test('automatic episode render keeps generated character layers attached to scene one', () => {
  const start = html.indexOf('async function autoBuildEpisodeFromStory');
  const end = html.indexOf("$('autoEpisodeButton').addEventListener", start);
  const build = html.slice(start, end);
  assert.ok(build.includes("motionLayers.splice(0,motionLayers.length,...(motionScenes[0]?.layers||[]))"));
  assert.ok(build.includes('selectedMotionLayer=motionLayers[motionScenes[0]?.selectedIndex]||motionLayers[0]||null'));
  assert.ok(!build.includes("motionLayers.splice(0,motionLayers.length);selectedMotionLayer=null;"), 'Generated character rig must not be cleared before createMotionClip');
});

test('automatic director is loaded and connected to story, camera, emotion and continuity planning', () => {
  assert.match(html, /src="\.\/auto-director\.js" defer/);
  assert.match(html, /AIAnimatorDirector\.enrichScreenplay\(screenplay,raw\)/);
  assert.match(html, /DIRECTOR CONTINUITY NOTES/);
  assert.match(html, /CHARACTER FOCUS/);
  const director = readFileSync(new URL('../auto-director.js', import.meta.url), 'utf8');
  for (const token of ['actionRules', 'emotionRules', 'gestureRules', 'cameraRules', 'durationSeconds', 'directorNotes', 'characterFocus', 'continuityChecked']) {
    assert.ok(director.includes(token), 'Director intelligence missing: ' + token);
  }
  assert.match(html, /directorNotes:String\(plan\.directorNotes\|\|''\)/);
});


test('cloud video generation is an explicit opt-in and uses scene clips', () => {
  assert.match(html, /id="enablePaidCloudVideo" type="checkbox"/);
  assert.match(html, /cloudVideoEnabled=\$\('enablePaidCloudVideo'\)\?\.checked===true/);
  assert.match(html, /generateFalVideoScene\(cloudPrompt,status\)/);
  assert.match(html, /task:'video'/);
  assert.match(html, /backgroundVideo=true/);
  assert.match(html, /function visualFrameSize\(image\)/);
  assert.match(html, /instanceof HTMLVideoElement/);
  assert.match(html, /canvas\.captureStream\(24\)/);
});

test('Fal gateway exposes controlled Seedance and image-to-video routes', () => {
  const gateway = readFileSync(new URL('../supabase/functions/fal-gateway/index.ts', import.meta.url), 'utf8');
  assert.match(gateway, /bytedance\/seedance-2\.5\/us\/text-to-video/);
  assert.match(gateway, /alibaba\/wan-3\.0-prime\/image-to-video/);
  assert.match(gateway, /generate_audio: false/);
  assert.match(gateway, /INVALID_DURATION/);
  assert.match(gateway, /INVALID_IMAGE_URL/);
  assert.match(gateway, /FAL_KEY/);
});

test('high-detail cloud image generation is explicit opt-in and supports 2K/4K', () => {
  assert.ok(html.includes('id="backgroundUseCloudAI"'));
  assert.ok(html.includes('id="backgroundImageResolution"'));
  assert.match(html, /value="2K" selected/);
  assert.match(html, /value="4K"/);
  assert.match(html, /useCloudAI=\$\('backgroundUseCloudAI'\)\?\.checked===true/);
  assert.match(html, /generateFalBackground\(prompt,status/);
  assert.match(html, /backgroundImageToBlob\(image,maxEdge=4096,quality=0\.94\)/);
  assert.match(html, /REFERENCE PALETTE \(sampled locally; no reference image is uploaded\)/);
  const gateway = readFileSync(new URL('../supabase/functions/fal-gateway/index.ts', import.meta.url), 'utf8');
  assert.match(gateway, /google\/nano-banana-2\.1/);
  assert.match(gateway, /thinking_level: "high"/);
  assert.match(gateway, /"1K", "2K", "4K"/);
  assert.ok(html.includes('id="enablePaidCharacterReferences"'));
  assert.match(html, /generateFalReferenceVideoScene/);
  assert.match(html, /professional CHARACTER MODEL SHEET/);
  assert.match(html, /matching front, side and back turnarounds/);
  assert.match(html, /neutral, happy, worried, surprised/);
  assert.match(html, /same identity, not alternate redesigns/);
  assert.match(html, /hands must be compact and proportionate to the forearms and face, never oversized/i);
  assert.match(html, /characterReferences/);
  assert.match(gateway, /minimax\/h3-max\/reference-to-video/);
  assert.match(gateway, /INVALID_REFERENCE_IMAGES/);
});


test('cartoon face rig supports expressive brows, eye states, and dialogue visemes', () => {
  const start = html.indexOf('function drawAnimatedMouth(ctx,layer,width,height,progress,dialogues)');
  const end = html.indexOf('function renderMotionPreview()', start);
  const face = html.slice(start, end);
  for (const token of ['worried', 'confused', 'sleepy', 'surprised', 'activeLine', 'syllableCount', 'viseme', 'blinkPulse']) {
    assert.ok(face.includes(token), 'Facial animation is missing: ' + token);
  }
  for (const token of ["'worried'", "'confused'", "'sleepy'"]) {
    assert.ok(html.includes(token), 'Emotion pipeline is missing: ' + token);
  }
  assert.match(html, /\['worried','نگران'\]/);
  assert.match(html, /\['confused','گیج'\]/);
  assert.match(html, /\['sleepy','خواب‌آلود'\]/);
});


test('rig world transforms propagate the full parent rotation and use parent-local gait time', () => {
  const start = html.indexOf('function getRigWorldTransform(layer,layers,progress,canvas)');
  const end = html.indexOf('function drawAnimatedMouth', start);
  const transform = html.slice(start, end);
  assert.match(transform, /const worldDelta=inheritedDelta\+localDelta/);
  assert.match(transform, /delta:worldDelta/);
  assert.ok(transform.includes('parentProgress=parentTo<=parentFrom?0:Math.max(0,Math.min(1,(progress-parentFrom)/(parentTo-parentFrom)))'));
  assert.match(transform, /Math\.sin\(parentProgress\*Math\.PI/);
});

test('automatic character rigs animate head nods and both arms even during neutral scenes', () => {
  const start = html.indexOf('async function autoBuildEpisodeFromStory');
  const end = html.indexOf("$('autoEpisodeButton').addEventListener", start);
  const build = html.slice(start, end);
  assert.match(build, /const nod=speaking\?5:2\.5/);
  assert.match(build, /layer\.motionKeys=\[/);
  assert.match(build, /gesture==='wave'\?48:gesture!=='neutral'\?27:5/);
  assert.match(build, /gesture==='neutral'\?sign\*-3:0/);
});


test('automatic character rigs use separate upper-arm and forearm joints', () => {
  const start = html.indexOf('async function createAutomaticCharacterRig');
  const end = html.indexOf('async function autoBuildEpisodeFromStory', start);
  const rig = html.slice(start, end);
  assert.match(rig, /بازوی بالایی چپ/);
  assert.match(rig, /ساعد و دست چپ/);
  assert.match(rig, /forearm\.parentLayerId=upper\.rigId/);
  assert.match(rig, /forearm\.jointY=78/);
  assert.match(rig, /return \[leftArm,rightArm,leftForearm,rightForearm,\.\.\.handLayers,\.\.\.propLayers,leftLeg,rightLeg,body,head\]/);
});

test('forearms receive independent gesture and gait articulation', () => {
  const start = html.indexOf('async function autoBuildEpisodeFromStory');
  const end = html.indexOf("$('autoEpisodeButton').addEventListener", start);
  const build = html.slice(start, end);
  assert.match(build, /role\.startsWith\('forearm-'\)/);
  assert.match(build, /segmentScale=role\.startsWith\('forearm-'\)\?\.58:1/);
  assert.match(html, /role\.startsWith\('forearm-'\)\?\(running\?17:9\):0/);
});


test('automatic character rigs use separate wrist and hand joints', () => {
  const start = html.indexOf('async function createAutomaticCharacterRig');
  const end = html.indexOf('async function autoBuildEpisodeFromStory', start);
  const rig = html.slice(start, end);
  assert.match(rig, /handLayers=\[\]/);
  assert.match(rig, /hand\.handPose=pose/);
  assert.match(rig, /hand\.parentLayerId=forearm\.rigId/);
  assert.match(rig, /hand\.jointY=70/);
  assert.match(rig, /hand\.jointOffsetY=26/);
  assert.match(rig, /return \[leftArm,rightArm,leftForearm,rightForearm,\.\.\.handLayers,\.\.\.propLayers,leftLeg,rightLeg,body,head\]/);
});

test('wrist articulation responds deterministically to scene gestures', () => {
  const start = html.indexOf('async function autoBuildEpisodeFromStory');
  const end = html.indexOf("$('autoEpisodeButton').addEventListener", start);
  const build = html.slice(start, end);
  assert.match(build, /const hand=role\.startsWith\('hand-'\)/);
  assert.match(build, /gesture==='wave'\?sign\*24:gesture==='talk'\?sign\*12:gesture==='point'\?sign\*8:gesture==='hold'\?sign\*2:sign\*3/);
  assert.match(build, /if\(hand\)\{/);
});


test('automatic hand artwork is scaled down to stay proportional to forearms', () => {
  const rigStart = html.indexOf('async function createAutomaticCharacterRig');
  const rigEnd = html.indexOf('async function autoBuildEpisodeFromStory', rigStart);
  const rig = html.slice(rigStart, rigEnd);
  assert.ok(rig.includes("const proportionalHandSvg='<g transform=\"translate(8.36 15.4) scale(.78)\">'+svg+'</g>'"));
  assert.match(rig, /const hand=await make\('دست '\+pose\+' '\+side\+' '\+characterName,76,86,proportionalHandSvg,'hand-'\+pose\+'-'\+side,0,0,\.48\)/);
  assert.match(rig, /hand\.parentLayerId=forearm\.rigId/);
  assert.match(rig, /hand\.jointOffsetY=26/);
});

test('automatic rigs provide open, fist, and pointing hand poses', () => {
  const start = html.indexOf('async function createAutomaticCharacterRig');
  const end = html.indexOf('async function autoBuildEpisodeFromStory', start);
  const rig = html.slice(start, end);
  assert.match(rig, /\['open',handArtwork\],\['fist',fistArtwork\],\['point',pointArtwork\]/);
  assert.match(rig, /hand\.handPose=pose/);
  assert.match(rig, /\.\.\.handLayers/);
});

test('scene gestures select one visible hand pose and render opacity in preview and export', () => {
  const start = html.indexOf('async function autoBuildEpisodeFromStory');
  const end = html.indexOf("$('autoEpisodeButton').addEventListener", start);
  const build = html.slice(start, end);
  assert.match(build, /const desiredPose=gesture==='fist'\|\|gesture==='hold'\?'fist':gesture==='point'\?'point':'open'/);
  assert.match(build, /layer\.opacity=base\.handPose===desiredPose\?1:0/);
  assert.match(html, /alpha=Math\.max\(0,Math\.min\(1,Number\(layer\.opacity\?\?1\)\)\)/);
});


test('automatic rigs attach reusable story props to the grasping hand', () => {
  const start = html.indexOf('async function createAutomaticCharacterRig');
  const end = html.indexOf('async function autoBuildEpisodeFromStory', start);
  const rig = html.slice(start, end);
  assert.match(rig, /const propArtworks=/);
  assert.match(rig, /prop\.parentLayerId=rightFist\.rigId/);
  assert.match(rig, /cup:'<path/);
  assert.match(rig, /book:'<path/);
  assert.match(rig, /phone:'<rect/);
  assert.match(rig, /orb:'<circle/);
  assert.match(rig, /\.\.\.propLayers/);
});

test('screenplay detects object-specific holding and renders only the matching prop', () => {
  const infer = html.slice(html.indexOf('function inferSceneDirection'), html.indexOf("$('autoSceneMotionButton')", html.indexOf('function inferSceneDirection')));
  assert.match(infer, /holding&&propType!=='none'\?'hold'/);
  const build = html.slice(html.indexOf('async function autoBuildEpisodeFromStory'), html.indexOf("$('autoEpisodeButton').addEventListener"));
  assert.match(build, /gesture==='fist'\|\|gesture==='hold'\?'fist'/);
  assert.match(build, /scene\.autoDirection\.gesture==='hold'&&base\.propType===requested\?1:0/);
  assert.match(build, /scene\.autoDirection\.propType=inferred\.propType/);
});


test('scene staging selects all named participants and supports four-character layouts', () => {
  const start = html.indexOf('async function autoBuildEpisodeFromStory');
  const end = html.indexOf("$('autoEpisodeButton').addEventListener", start);
  const build = html.slice(start, end);
  assert.match(build, /const focusNames=Array\.isArray\(scene\.characterFocus\)/);
  assert.match(build, /const mentionedNames=speakerNames\.filter\(name=>sceneText\.includes/);
  assert.match(build, /activeCharacterNames=Array\.from\(new Set\(\[\.\.\.focusNames,\.\.\.dialogueNames,\.\.\.mentionedNames\]\)\)/);
  assert.match(build, /activeRigs=autoCharacterRigs\.filter/);
  assert.match(build, /positionsByCount=\{1:\[50\],2:\[35,65\],3:\[25,50,75\],4:\[18,39,61,82\]\}/);
  assert.match(build, /scene\.activeCharacterNames=activeCharacterNames/);
});

test('one-input ToonVerse workflow hides paid switches and internal production diagnostics', () => {
  assert.match(html, /id="storyToScenesInput"/);
  assert.match(html, /id="autoEpisodeButton"/);
  assert.match(html, /#storyToScenesPanel \.cloud-video-optin[\s\S]*display:none !important/);
  assert.match(html, /#storyToScenesPanel #liveProduction[\s\S]*display:none !important/);
  assert.match(html, /#storyToScenesPanel #autoEpisodeButton[\s\S]*min-height:56px/);
});
