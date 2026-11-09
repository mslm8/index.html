(() => {
  'use strict';
  const ROOT = document.getElementById('productionSuite');
  if (!ROOT || ROOT.dataset.ready) return;
  ROOT.dataset.ready = '1';
  const KEY = 'aiAnimatorProductionSuiteV1';
  const $ = id => document.getElementById(id);
  const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const defaults = () => ({
    title: 'پروژه انیمیشن جدید', logline: '', format: '16:9', fps: 24, width: 1920, height: 1080,
    targetMinutes: 2, story: '', scenes: [], characters: [], locations: [], assets: [],
    checklist: { story: false, character: false, backgrounds: false, storyboard: false, audio: false, animatic: false, render: false, qc: false },
    selectedScene: ''
  });
  const load = () => {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!value || typeof value !== 'object') return defaults();
      return { ...defaults(), ...value, scenes: Array.isArray(value.scenes) ? value.scenes : [], characters: Array.isArray(value.characters) ? value.characters : [], locations: Array.isArray(value.locations) ? value.locations : [], assets: Array.isArray(value.assets) ? value.assets.slice(0,8) : [], checklist: { ...defaults().checklist, ...(value.checklist || {}) } };
    } catch (_) { return defaults(); }
  };
  let state = load();
  let saveTimer = 0;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); $('productionSaveStatus').textContent = 'ذخیره خودکار شد · ' + new Date().toLocaleTimeString(); }
      catch (_) { $('productionSaveStatus').textContent = 'فضای ذخیره‌سازی مرورگر پر است؛ از خروجی JSON نسخه پشتیبان بگیر.'; }
    }, 120);
  };
  const make = (tag, text, cls) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; };
  const download = (name, content, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  };
  const sceneText = scene => [scene.visual, scene.action, scene.dialogue ? 'دیالوگ: ' + scene.dialogue : ''].filter(Boolean).join(' — ');
  function guessShot(text) {
    if (/چشم|نگاه|اشک|لبخند|واکنش|تعجب/.test(text)) return 'close';
    if (/تعقیب|فرار|دویدن|نبرد|انفجار|پرش/.test(text)) return 'wide';
    if (/دو نفر|گفتگو|صحبت|مقابل/.test(text)) return 'medium';
    return 'wide';
  }
  function splitStory() {
    const raw = $('productionStory').value.trim();
    if (!raw) { $('productionStatus').textContent = 'ابتدا خلاصه یا داستان را وارد کن.'; return; }
    const parts = raw.split(/\n\s*\n+|(?<=[.!؟?])\s+(?=\S)/u).map(x => x.trim()).filter(Boolean);
    const chunks = parts.length ? parts : [raw];
    const scenes = chunks.slice(0, 30).map((text, index) => ({
      id: uid(), title: 'صحنه ' + (index + 1), location: '', characters: '', shot: guessShot(text), camera: 'static',
      duration: 5, visual: text.slice(0, 700), action: '', dialogue: '', notes: ''
    }));
    if (chunks.length > 30) $('productionStatus').textContent = 'فقط ۳۰ بخش نخست وارد شد؛ داستان را به چند بخش تقسیم کن.';
    else $('productionStatus').textContent = scenes.length + ' صحنه اولیه ساخته شد. جزئیات نما، حرکت و دیالوگ را بازبینی کن.';
    state.story = raw; state.scenes = scenes; state.selectedScene = scenes[0]?.id || '';
    renderAll(); persist();
  }
  function renderSceneList() {
    const host = $('productionSceneList'); host.replaceChildren();
    if (!state.scenes.length) { host.append(make('p', 'هنوز صحنه‌ای ساخته نشده است.', 'muted')); return; }
    state.scenes.forEach((scene, index) => {
      const row = make('div', undefined, 'production-scene-row' + (scene.id === state.selectedScene ? ' active' : ''));
      const select = make('button', undefined, 'production-scene-select'); select.type = 'button';
      const name = make('strong', (index + 1) + '. ' + (scene.title || 'صحنه بدون نام'));
      const meta = make('small', (Number(scene.duration) || 0) + ' ثانیه · ' + (scene.shot || 'نمای باز'));
      select.append(name, meta); select.addEventListener('click', () => { state.selectedScene = scene.id; renderSceneList(); renderSceneEditor(); persist(); });
      const up = make('button', '↑', 'mini'); up.type = 'button'; up.title = 'انتقال به بالا'; up.disabled = index === 0;
      up.addEventListener('click', () => moveScene(index, -1));
      const down = make('button', '↓', 'mini'); down.type = 'button'; down.title = 'انتقال به پایین'; down.disabled = index === state.scenes.length - 1;
      down.addEventListener('click', () => moveScene(index, 1));
      row.append(select, up, down); host.append(row);
    });
  }
  function currentScene() { return state.scenes.find(s => s.id === state.selectedScene) || state.scenes[0] || null; }
  function field(labelText, value, onChange, options) {
    const wrap = make('label', undefined, 'production-field');
    wrap.append(make('span', labelText));
    let input;
    if (options) {
      input = make('select');
      options.forEach(opt => { const o = make('option', opt.label); o.value = opt.value; input.append(o); });
      input.value = value || options[0]?.value || '';
    } else {
      input = make('input'); input.value = value || ''; input.maxLength = 1000;
    }
    input.addEventListener('input', () => onChange(input.value));
    wrap.append(input); return wrap;
  }
  function renderSceneEditor() {
    const host = $('productionSceneEditor'); host.replaceChildren();
    const scene = currentScene();
    if (!scene) { host.append(make('p', 'برای شروع، داستان را به صحنه تقسیم کن یا صحنه جدید بساز.', 'muted')); return; }
    const grid = make('div', undefined, 'production-form-grid');
    grid.append(
      field('عنوان صحنه', scene.title, v => { scene.title = v; renderSceneList(); persist(); }),
      field('مکان', scene.location, v => { scene.location = v; renderLocationOptions(); persist(); }),
      field('اندازه نما', scene.shot, v => { scene.shot = v; renderTimeline(); persist(); }, [
        {value:'wide',label:'نمای باز'},{value:'full',label:'نمای تمام‌قد'},{value:'medium',label:'نمای متوسط'},{value:'close',label:'نمای نزدیک'},{value:'detail',label:'نمای جزئیات'}
      ]),
      field('حرکت دوربین', scene.camera, v => { scene.camera = v; persist(); }, [
        {value:'static',label:'ثابت'},{value:'pan',label:'پن افقی'},{value:'tilt',label:'تیلت عمودی'},{value:'zoom-in',label:'زوم به داخل'},{value:'zoom-out',label:'زوم به بیرون'},{value:'tracking',label:'تعقیب سوژه'}
      ]),
      field('مدت (ثانیه)', String(scene.duration || 5), v => { scene.duration = Math.max(1, Math.min(120, Number(v) || 1)); renderTimeline(); persist(); })
    );
    const characters = field('شخصیت‌های حاضر (نام‌ها را با ویرگول جدا کن)', scene.characters, v => { scene.characters = v; persist(); });
    grid.append(characters); host.append(grid);
    const visual = make('label', undefined, 'production-field'); visual.append(make('span', 'شرح بصری صحنه'));
    const visualInput = make('textarea'); visualInput.rows = 3; visualInput.value = scene.visual || ''; visualInput.addEventListener('input', () => { scene.visual = visualInput.value; persist(); }); visual.append(visualInput); host.append(visual);
    const action = make('label', undefined, 'production-field'); action.append(make('span', 'کنش و حرکت بازیگران'));
    const actionInput = make('textarea'); actionInput.rows = 2; actionInput.value = scene.action || ''; actionInput.placeholder = 'مثلاً: شخصیت وارد قاب می‌شود، مکث می‌کند و به سمت پنجره می‌چرخد.'; actionInput.addEventListener('input', () => { scene.action = actionInput.value; persist(); }); action.append(actionInput); host.append(action);
    const dialogue = make('label', undefined, 'production-field'); dialogue.append(make('span', 'دیالوگ و صدا'));
    const dialogueInput = make('textarea'); dialogueInput.rows = 2; dialogueInput.value = scene.dialogue || ''; dialogueInput.placeholder = 'نام شخصیت: متن دیالوگ'; dialogueInput.addEventListener('input', () => { scene.dialogue = dialogueInput.value; persist(); }); dialogue.append(dialogueInput); host.append(dialogue);
    const notes = make('label', undefined, 'production-field'); notes.append(make('span', 'یادداشت کارگردانی / تداوم'));
    const notesInput = make('textarea'); notesInput.rows = 2; notesInput.value = scene.notes || ''; notesInput.placeholder = 'لباس، جهت نگاه، شیء در دست، نور و نکات تداوم...'; notesInput.addEventListener('input', () => { scene.notes = notesInput.value; persist(); }); notes.append(notesInput); host.append(notes);
    const actions = make('div', undefined, 'row');
    const duplicate = make('button', 'کپی صحنه', 'secondary'); duplicate.type = 'button'; duplicate.addEventListener('click', () => { const copy = {...scene, id:uid(), title:(scene.title || 'صحنه') + ' - کپی'}; state.scenes.splice(state.scenes.indexOf(scene)+1,0,copy); state.selectedScene=copy.id; renderAll(); persist(); });
    const remove = make('button', 'حذف صحنه', 'danger'); remove.type = 'button'; remove.addEventListener('click', () => { state.scenes = state.scenes.filter(x => x.id !== scene.id); state.selectedScene = state.scenes[0]?.id || ''; renderAll(); persist(); });
    const speak = make('button', 'پیش‌نمایش دیالوگ', 'secondary'); speak.type = 'button'; speak.addEventListener('click', () => { if (!scene.dialogue || !window.speechSynthesis) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(scene.dialogue); utterance.lang = 'fa-IR'; window.speechSynthesis.speak(utterance); });
    actions.append(duplicate, remove, speak); host.append(actions);
  }
  function moveScene(index, delta) {
    const next = index + delta; if (next < 0 || next >= state.scenes.length) return;
    [state.scenes[index], state.scenes[next]] = [state.scenes[next], state.scenes[index]];
    renderAll(); persist();
  }
  function renderTimeline() {
    const host = $('productionTimeline'); host.replaceChildren();
    const total = state.scenes.reduce((sum, scene) => sum + Math.max(1, Number(scene.duration) || 1), 0);
    state.scenes.forEach((scene, index) => {
      const item = make('div', undefined, 'production-timeline-item');
      item.style.flex = String(Math.max(1, Number(scene.duration) || 1));
      const name = make('strong', (index + 1) + ' · ' + (scene.title || 'صحنه'));
      const time = make('small', (Number(scene.duration) || 1) + 's');
      item.append(name, time); item.title = sceneText(scene); host.append(item);
    });
    $('productionTotalDuration').textContent = 'مدت کل: ' + total + ' ثانیه · ' + (total / 60).toFixed(2) + ' دقیقه · ' + (total * Number(state.fps || 24)) + ' فریم تقریبی';
    $('productionSceneCount').textContent = state.scenes.length + ' صحنه';
  }
  function renderCharacters() {
    const host = $('productionCharacterList'); host.replaceChildren();
    state.characters.forEach((character, index) => {
      const card = make('article', undefined, 'production-character');
      const name = make('strong', character.name || 'شخصیت بدون نام');
      const detail = make('small', [character.role, character.design, character.voice].filter(Boolean).join(' · '));
      const edit = make('button', 'ویرایش', 'secondary'); edit.type = 'button'; edit.addEventListener('click', () => {
        $('productionCharacterName').value = character.name || ''; $('productionCharacterRole').value = character.role || '';
        $('productionCharacterDesign').value = character.design || ''; $('productionCharacterVoice').value = character.voice || '';
        $('productionCharacterForm').dataset.editId = character.id;
      });
      const del = make('button', 'حذف', 'danger'); del.type = 'button'; del.addEventListener('click', () => { state.characters.splice(index,1); renderCharacters(); persist(); });
      card.append(name, detail, edit, del); host.append(card);
    });
    if (!state.characters.length) host.append(make('p', 'هنوز شناسنامه شخصیتی ثبت نشده است.', 'muted'));
  }
  function renderLocations() {
    const host = $('productionLocationList'); host.replaceChildren();
    state.locations.forEach((location, index) => {
      const row = make('div', undefined, 'production-location');
      row.append(make('span', location.name + (location.description ? ' · ' + location.description : '')));
      const del = make('button', 'حذف', 'danger'); del.type = 'button'; del.addEventListener('click', () => { state.locations.splice(index,1); renderLocations(); renderLocationOptions(); persist(); });
      row.append(del); host.append(row);
    });
    if (!state.locations.length) host.append(make('p', 'مکانی ثبت نشده است.', 'muted'));
  }
  function renderLocationOptions() {
    const scene = currentScene(); if (!scene) return;
    const datalist = $('productionLocationHints'); datalist.replaceChildren();
    state.locations.forEach(item => { const option = make('option'); option.value = item.name; datalist.append(option); });
  }
  function renderAssets() {
    const host = $('productionAssetList');
    if (!host) return;
    host.replaceChildren();
    (state.assets || []).forEach((asset, index) => {
      const card = make('article', undefined, 'production-asset');
      if (asset.dataUrl) {
        const image = make('img'); image.src = asset.dataUrl; image.alt = asset.name || 'دارایی پروژه'; image.loading = 'lazy'; card.append(image);
      }
      const title = make('strong', asset.name || 'دارایی بدون نام');
      const meta = make('small', [asset.kind, asset.scene ? 'صحنه: ' + asset.scene : 'عمومی', asset.notes].filter(Boolean).join(' · '));
      const remove = make('button', 'حذف دارایی', 'danger'); remove.type = 'button';
      remove.addEventListener('click', () => { state.assets.splice(index, 1); renderAssets(); persist(); });
      card.append(title, meta, remove); host.append(card);
    });
    if (!(state.assets || []).length) host.append(make('p', 'هنوز دارایی تصویری ثبت نشده است.', 'muted'));
    $('productionAssetCount').textContent = (state.assets || []).length + ' دارایی';
  }
  $('productionAddAsset')?.addEventListener('click', async () => {
    const file = $('productionAssetFile').files?.[0];
    const name = $('productionAssetName').value.trim();
    if (!file || !name) { $('productionAssetStatus').textContent = 'نام و فایل تصویر را انتخاب کن.'; return; }
    if (!/^image\\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 500 * 1024) {
      $('productionAssetStatus').textContent = 'فقط PNG/JPEG/WebP/GIF تا ۵۰۰ کیلوبایت پذیرفته می‌شود.';
      return;
    }
    if ((state.assets || []).length >= 8) { $('productionAssetStatus').textContent = 'حداکثر ۸ دارایی تصویری در هر پروژه نگهداری می‌شود.'; return; }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file);
      });
      state.assets = state.assets || [];
      state.assets.push({ id: uid(), name, kind: $('productionAssetKind').value, scene: $('productionAssetScene').value.trim(), notes: $('productionAssetNotes').value.trim(), dataUrl });
      $('productionAssetName').value = ''; $('productionAssetScene').value = ''; $('productionAssetNotes').value = ''; $('productionAssetFile').value = '';
      $('productionAssetStatus').textContent = 'دارایی به پروژه اضافه شد و در ذخیره محلی قرار گرفت.';
      renderAssets(); persist();
    } catch (_) { $('productionAssetStatus').textContent = 'خواندن فایل تصویر ناموفق بود.'; }
  });
  function renderChecklist() {
    const host = $('productionChecklist'); host.replaceChildren();
    const tasks = [
      ['story','فیلمنامه و ساختار سه‌پرده‌ای بازبینی شده'],['character','شناسنامه و تناسب طراحی شخصیت‌ها تأیید شده'],
      ['backgrounds','پس‌زمینه‌ها و مکان‌ها آماده‌اند'],['storyboard','استوری‌بورد و اندازه نماها بررسی شده'],
      ['audio','دیالوگ، افکت و موسیقی برنامه‌ریزی شده'],['animatic','انیماتیک با زمان‌بندی تقریبی بازبینی شده'],
      ['render','رندر نهایی با تنظیمات درست انجام شده'],['qc','کنترل کیفیت تصویر، صدا و تداوم انجام شده']
    ];
    tasks.forEach(([key,label]) => {
      const wrap = make('label', undefined, 'production-check');
      const box = make('input'); box.type = 'checkbox'; box.checked = !!state.checklist[key];
      box.addEventListener('change', () => { state.checklist[key] = box.checked; persist(); });
      wrap.append(box, make('span', label)); host.append(wrap);
    });
    const done = tasks.filter(([key]) => state.checklist[key]).length;
    $('productionChecklistProgress').textContent = done + ' از ' + tasks.length + ' مرحله تکمیل شده';
  }
  function renderAll() {
    $('productionTitle').value = state.title; $('productionLogline').value = state.logline;
    $('productionFormat').value = state.format; $('productionFps').value = String(state.fps);
    $('productionWidth').value = state.width; $('productionHeight').value = state.height;
    $('productionMinutes').value = state.targetMinutes; $('productionStory').value = state.story;
    renderSceneList(); renderSceneEditor(); renderTimeline(); renderCharacters(); renderLocations(); renderAssets(); renderChecklist();
  }
  ['productionTitle','productionLogline','productionFormat','productionFps','productionWidth','productionHeight','productionMinutes'].forEach(id => {
    $(id).addEventListener('input', () => {
      state.title = $('productionTitle').value; state.logline = $('productionLogline').value;
      state.format = $('productionFormat').value; state.fps = Number($('productionFps').value) || 24;
      state.width = Number($('productionWidth').value) || 1920; state.height = Number($('productionHeight').value) || 1080;
      state.targetMinutes = Number($('productionMinutes').value) || 1; renderTimeline(); persist();
    });
  });
  $('productionStory').addEventListener('input', () => { state.story = $('productionStory').value; persist(); });
  $('productionSplitStory').addEventListener('click', splitStory);
  $('productionAddScene').addEventListener('click', () => {
    const scene = { id:uid(), title:'صحنه ' + (state.scenes.length + 1), location:'', characters:'', shot:'wide', camera:'static', duration:5, visual:'', action:'', dialogue:'', notes:'' };
    state.scenes.push(scene); state.selectedScene=scene.id; renderAll(); persist();
  });
  $('productionSaveCharacter').addEventListener('click', () => {
    const name = $('productionCharacterName').value.trim(); if (!name) { $('productionStatus').textContent = 'نام شخصیت را وارد کن.'; return; }
    const editId = $('productionCharacterForm').dataset.editId;
    const existing = state.characters.find(x => x.id === editId);
    const value = { id: editId || uid(), name, role:$('productionCharacterRole').value.trim(), design:$('productionCharacterDesign').value.trim(), voice:$('productionCharacterVoice').value.trim() };
    if (existing) Object.assign(existing, value); else state.characters.push(value);
    $('productionCharacterForm').dataset.editId = ''; ['productionCharacterName','productionCharacterRole','productionCharacterDesign','productionCharacterVoice'].forEach(id => $(id).value = '');
    renderCharacters(); persist();
  });
  $('productionAddLocation').addEventListener('click', () => {
    const name = $('productionLocationName').value.trim(); if (!name) return;
    state.locations.push({name,description:$('productionLocationDescription').value.trim()});
    $('productionLocationName').value=''; $('productionLocationDescription').value='';
    renderLocations(); renderLocationOptions(); persist();
  });
  $('productionSendToAnimator').addEventListener('click', () => {
    if (!state.scenes.length) { $('productionStatus').textContent = 'ابتدا داستان را به صحنه تقسیم کن.'; return; }
    const text = state.scenes.map((scene, index) => 'صحنه ' + (index + 1) + ': ' + sceneText(scene) + (scene.location ? ' مکان: ' + scene.location : '')).join('\n');
    const input = document.getElementById('storyToScenesInput');
    const split = document.getElementById('storyToScenesButton');
    if (!input || !split) { $('productionStatus').textContent = 'بخش انیمیشن‌سازی در دسترس نیست.'; return; }
    input.value = text; input.dispatchEvent(new Event('input', {bubbles:true})); split.click();
    document.querySelector('#studioNav button[data-view="animation"]')?.click();
    $('productionStatus').textContent = 'طرح صحنه‌ها به استودیوی انیمیشن منتقل شد. محدودیت فعلی استودیوی انیمیشن: حداکثر ۶ صحنه در هر نوبت.';
  });
  $('productionExport').addEventListener('click', () => {
    const payload = { schema:'ai-animator-production-v1', exportedAt:new Date().toISOString(), project:state };
    download((state.title || 'animation-production').replace(/[^\p{L}\p{N}_-]+/gu,'-') + '.json', JSON.stringify(payload,null,2), 'application/json');
  });
  $('productionExportShots').addEventListener('click', () => {
    const quote = value => '"' + String(value || '').replace(/"/g,'""') + '"';
    const rows = [['Scene','Title','Duration sec','Shot','Camera','Location','Characters','Visual','Action','Dialogue','Continuity notes']];
    state.scenes.forEach((s,i) => rows.push([i+1,s.title,s.duration,s.shot,s.camera,s.location,s.characters,s.visual,s.action,s.dialogue,s.notes]));
    download('shot-list.csv', '\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  });
  $('productionImport').addEventListener('change', async event => {
    const file = event.target.files?.[0]; event.target.value=''; if (!file) return;
    if (file.size > 2*1024*1024) { $('productionStatus').textContent='فایل پروژه بزرگ‌تر از ۲ مگابایت است.'; return; }
    try {
      const payload = JSON.parse(await file.text()); const next = payload.project || payload;
      if (!next || !Array.isArray(next.scenes) || !Array.isArray(next.characters)) throw new Error('ساختار فایل پروژه معتبر نیست.');
      state = { ...defaults(), ...next, assets: Array.isArray(next.assets) ? next.assets.slice(0,8) : [], checklist:{...defaults().checklist,...(next.checklist||{})} };
      state.selectedScene = state.scenes[0]?.id || ''; renderAll(); persist(); $('productionStatus').textContent='پروژه وارد شد.';
    } catch (error) { $('productionStatus').textContent='ورود پروژه ناموفق بود: ' + error.message; }
  });
  $('productionImportButton').addEventListener('click', () => $('productionImport').click());
  $('productionReset').addEventListener('click', () => {
    if (!confirm('همه اطلاعات اتاق تولید در این مرورگر پاک شود؟ ابتدا از پروژه خروجی بگیر.')) return;
    state = defaults(); renderAll(); persist(); $('productionStatus').textContent='فرم پروژه بازنشانی شد.';
  });
  renderAll();
  $('productionSaveStatus').textContent = 'ذخیره محلی فعال است؛ خروجی JSON نسخه پشتیبان می‌سازد.';
})();