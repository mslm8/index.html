(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const button = $('toggleRigEditor');
  const workspace = $('rigEditorWorkspace');
  const mount = $('rigEditorMount');
  if (!button || !workspace || !mount) return;

  const controls = [
    document.querySelector('label[for="motionLayerFiles"]'),
    $('motionLayerFiles'), $('motionLayerList'), $('motionLivePreview'), $('animate')
  ].filter(Boolean);
  controls.forEach((node) => mount.appendChild(node));

  button.addEventListener('click', () => {
    const opening = workspace.hidden;
    workspace.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    button.textContent = opening ? 'بستن ابزار ریگ شخصیت' : 'باز کردن ابزار ریگ شخصیت';
    if (opening) $('motionLayerList')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  const STORAGE_KEY = 'aiAnimatorRigProfilesV1';
  const MAX_PROFILES = 10;
  const MAX_TOTAL_BYTES = 2.5 * 1024 * 1024;
  const status = (message, error = false) => {
    const node = $('rigProfileStatus');
    if (node) { node.textContent = message; node.style.color = error ? 'var(--bad)' : ''; }
  };
  const readProfiles = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.layers)).slice(0, MAX_PROFILES) : [];
    } catch (_) { return []; }
  };
  const renderProfiles = (selected = '') => {
    const select = $('rigProfileSelect');
    if (!select) return;
    const profiles = readProfiles();
    select.replaceChildren();
    if (!profiles.length) select.add(new Option('هنوز ریگی ذخیره نشده', ''));
    profiles.forEach(profile => select.add(new Option(profile.name, profile.id)));
    if (profiles.some(p => p.id === selected)) select.value = selected;
    $('loadRigProfile').disabled = !profiles.length;
    $('deleteRigProfile').disabled = !profiles.length;
  };
  const fileToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('خواندن تصویر ناموفق بود.'));
    reader.onerror = () => reject(new Error('خواندن تصویر ناموفق بود.'));
    reader.readAsDataURL(blob);
  });
  const safeValue = (value, depth = 0) => {
    if (depth > 5) return undefined;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    if (Array.isArray(value)) return value.slice(0, 120).map(item => safeValue(item, depth + 1)).filter(item => item !== undefined);
    if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      const result = {};
      for (const [key, item] of Object.entries(value).slice(0, 100)) {
        const clean = safeValue(item, depth + 1);
        if (clean !== undefined) result[key] = clean;
      }
      return result;
    }
    return undefined;
  };
  const safeLayerData = (layer) => {
    const data = {};
    for (const [key, value] of Object.entries(layer)) {
      if (['image', 'url', 'blob', 'element'].includes(key)) continue;
      const clean = safeValue(value);
      if (clean !== undefined) data[key] = clean;
    }
    return data;
  };
  const makeId = () => 'rig-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

  $('saveRigProfile')?.addEventListener('click', async () => {
    const name = $('rigProfileName').value.trim();
    if (!name) { status('ابتدا نام شخصیت را وارد کن.', true); $('rigProfileName').focus(); return; }
    if (!Array.isArray(window.motionLayers) && typeof motionLayers === 'undefined') {
      status('موتور لایه‌های انیمیشن آماده نیست.', true); return;
    }
    const layers = typeof motionLayers !== 'undefined' ? motionLayers : [];
    if (!layers.length) { status('برای ذخیره ریگ، ابتدا حداقل یک لایه تصویری اضافه کن.', true); return; }
    const saveButton = $('saveRigProfile');
    saveButton.disabled = true;
    try {
      const packed = [];
      for (const layer of layers) {
        if (!layer.image || !layer.url) throw new Error('یکی از لایه‌ها تصویر معتبر ندارد؛ آن را دوباره وارد کن.');
        const response = await fetch(layer.url);
        if (!response.ok) throw new Error('دریافت تصویر یکی از اعضا ناموفق بود.');
        const dataUrl = await fileToDataUrl(await response.blob());
        packed.push({ data: safeLayerData(layer), image: dataUrl });
      }
      const profile = { id: makeId(), name: name.slice(0, 48), savedAt: new Date().toISOString(), selectedIndex: layers.indexOf(selectedMotionLayer), layers: packed };
      const profiles = readProfiles();
      const existing = profiles.findIndex(p => p.name.toLocaleLowerCase() === profile.name.toLocaleLowerCase());
      if (existing >= 0) profiles.splice(existing, 1);
      profiles.unshift(profile);
      profiles.splice(MAX_PROFILES);
      const serialized = JSON.stringify(profiles);
      if (serialized.length > MAX_TOTAL_BYTES) throw new Error('حجم کتابخانه از ۲٫۵ مگابایت بیشتر شد؛ تصاویر کوچک‌تری استفاده کن یا چند ریگ را حذف کن.');
      localStorage.setItem(STORAGE_KEY, serialized);
      renderProfiles(profile.id);
      status('ریگ «' + profile.name + '» همراه با ' + packed.length + ' لایه ذخیره شد.');
    } catch (error) {
      status('ذخیره انجام نشد: ' + error.message, true);
    } finally { saveButton.disabled = false; }
  });

  $('loadRigProfile')?.addEventListener('click', async () => {
    const id = $('rigProfileSelect').value;
    const profile = readProfiles().find(p => p.id === id);
    if (!profile) { status('یک ریگ معتبر انتخاب کن.', true); return; }
    const loadButton = $('loadRigProfile');
    loadButton.disabled = true;
    try {
      const restored = [];
      for (const item of profile.layers.slice(0, 24)) {
        if (!item || typeof item.image !== 'string' || !item.image.startsWith('data:image/')) throw new Error('ساختار یکی از تصاویر ریگ معتبر نیست.');
        const response = await fetch(item.image);
        const blob = await response.blob();
        if (!/^image\/(png|jpeg|webp|gif)$/.test(blob.type)) throw new Error('فرمت یکی از تصاویر پشتیبانی نمی‌شود.');
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.src = url;
        try { await image.decode(); } catch (error) { URL.revokeObjectURL(url); throw error; }
        restored.push({ ...(item.data || {}), image, url });
      }
      if (!restored.length) throw new Error('این ریگ تصویر قابل بازیابی ندارد.');
      if (typeof saveActiveMotionScene === 'function') saveActiveMotionScene();
      if (typeof motionLayers === 'undefined') throw new Error('موتور انیمیشن در دسترس نیست.');
      motionLayers.forEach(layer => { if (layer.url && String(layer.url).startsWith('blob:')) URL.revokeObjectURL(layer.url); });
      motionLayers.splice(0, motionLayers.length, ...restored);
      selectedMotionLayer = restored[Math.max(0, Math.min(restored.length - 1, Number(profile.selectedIndex) || 0))];
      if (typeof motionScenes !== 'undefined' && motionScenes[activeMotionScene]) motionScenes[activeMotionScene].layers = motionLayers.slice();
      if (typeof renderMotionLayerList === 'function') renderMotionLayerList();
      if (typeof renderMotionPreview === 'function') renderMotionPreview();
      status('ریگ «' + profile.name + '» با ' + restored.length + ' لایه بارگذاری شد.');
    } catch (error) {
      status('بارگذاری ناموفق بود: ' + error.message, true);
    } finally { loadButton.disabled = false; }
  });

  $('deleteRigProfile')?.addEventListener('click', () => {
    const id = $('rigProfileSelect').value;
    const profiles = readProfiles();
    const index = profiles.findIndex(p => p.id === id);
    if (index < 0) { status('ریگی برای حذف انتخاب نشده است.', true); return; }
    const name = profiles[index].name;
    profiles.splice(index, 1);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles)); renderProfiles(); status('ریگ «' + name + '» حذف شد.'); }
    catch (_) { status('حذف ریگ ذخیره نشد.', true); }
  });

  renderProfiles();
})();
