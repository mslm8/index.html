import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../auto-director.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const director = sandbox.window.AIAnimatorDirector;

test('director preserves screenplay shot type and scene geography', () => {
  const result = director.enrichScreenplay({
    characters: [{ name: 'آوا', description: 'لباس آبی و کلاه زرد' }, { name: 'نوید', description: 'لباس سبز' }],
    scenes: [{
      visual: 'آوا وارد آزمایشگاه می‌شود و دستگاه را بررسی می‌کند',
      location: 'آزمایشگاه',
      timeOfDay: 'شب',
      shotType: 'wide',
      continuityNote: 'دستگاه در سمت راست قاب باقی بماند',
      dialogues: [{ speaker: 'آوا', text: 'آماده‌ای؟' }]
    }]
  }, 'داستان آزمایشگاه');
  assert.equal(result.scenes[0].shotType, 'wide');
  assert.equal(result.scenes[0].location, 'آزمایشگاه');
  assert.equal(result.scenes[0].timeOfDay, 'شب');
  assert.ok(result.scenes[0].characterFocus.includes('آوا'));
  assert.match(result.scenes[0].directorNotes, /دستگاه در سمت راست قاب/);
});

test('director detects characters named in visuals even without dialogue', () => {
  const result = director.enrichScreenplay({
    characters: [{ name: 'آوا' }, { name: 'نوید' }, { name: 'رها' }],
    scenes: [{ visual: 'نوید و رها کنار سفینه ایستاده‌اند', dialogues: [] }]
  }, 'داستان سفینه');
  assert.deepEqual(Array.from(result.scenes[0].characterFocus), ['نوید', 'رها']);
});

test('director bounds duration and keeps a stable scene index', () => {
  const result = director.enrichScreenplay({
    characters: [{ name: 'آوا' }],
    scenes: [{ visual: 'آوا می‌دود', durationSeconds: 99 }]
  }, 'داستان');
  assert.equal(result.scenes[0].durationSeconds, 18);
  assert.equal(result.scenes[0].continuityIndex, 0);
  assert.equal(result.director.continuityChecked, true);
});
