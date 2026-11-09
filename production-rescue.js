/* AI Animator Production Rescue Console v2
 * Local diagnostics and recovery inventory. Never transmits story content or credentials.
 */
(() => {
 'use strict';
 if (window.__AI_ANIMATOR_RESCUE__) return;
 const KEY = 'aiAnimatorRescueReportsV1';
 const APP_KEYS = [
  'aiAnimatorNamedProjectsV1',
  'aiAnimatorSceneRetryQueueV1',
  'aiAnimatorBackgroundBatchQueueV2',
  'aiAnimatorSavedPromptsV1',
  'aiAnimatorLanguageV1',
  'aiAnimatorLastViewV1'
 ];
 const DB_NAMES = ['AIAnimatorStudioHistory', 'ai-animator-character-library'];
 const now = () => new Date().toISOString();
 const safe = (fn, fallback = null) => { try { return fn(); } catch (_) { return fallback; } };
 const report = { startedAt: now(), checks: [], events: [], errors: [] };
 const clean = value => String(value ?? 'Unknown error')
  .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
  .replace(/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[redacted-token]')
  .replace(/(api[_-]?key|secret|token)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[redacted]')
  .slice(0, 700);
 const add = (name, status, detail) => report.checks.push({ name, status, detail: clean(detail), at: now() });
 const record = (kind, message, extra = {}) => {
  report.events.push({ kind, message: clean(message), extra, at: now() });
  if (report.events.length > 100) report.events.shift();
  safe(() => localStorage.setItem(KEY, JSON.stringify(report)));
 };
 const errorText = e => clean(e?.message || e || 'Unknown error');
 const previous = safe(() => JSON.parse(localStorage.getItem(KEY) || 'null'));
 if (previous && Array.isArray(previous.events)) {
  report.events = previous.events.slice(-80);
  record('session-restored', 'گزارش فنی نشست قبلی بازیابی شد');
 }
 window.addEventListener('error', e => record('browser-error', errorText(e.error || e.message)));
 window.addEventListener('unhandledrejection', e => record('unhandled-rejection', errorText(e.reason)));
 window.addEventListener('online', () => record('network', 'مرورگر آنلاین شد'));
 window.addEventListener('offline', () => record('network', 'مرورگر آفلاین شد'));

 const panel = document.createElement('section');
 panel.id = 'aiAnimatorRescuePanel';
 panel.dir = 'rtl';
 panel.hidden = true;
 panel.innerHTML = `
 <style>
 #aiAnimatorRescuePanel{position:fixed;z-index:2147483000;inset:auto 10px 10px 10px;max-height:82vh;overflow:auto;background:#111827;color:#f9fafb;border:1px solid #475569;border-radius:16px;padding:15px;box-shadow:0 16px 60px #0008;font:14px/1.75 system-ui,sans-serif}
 #aiAnimatorRescuePanel *{box-sizing:border-box}#aiAnimatorRescuePanel h2{font-size:18px;margin:0 0 7px}
 #aiAnimatorRescuePanel .rescue-actions{display:flex;flex-wrap:wrap;gap:7px;margin:11px 0}
 #aiAnimatorRescuePanel button{border:1px solid #64748b;border-radius:9px;padding:8px 11px;background:#263449;color:white;font:inherit}
 #aiAnimatorRescuePanel button.primary{background:#17634b;border-color:#34d399}
 #aiAnimatorRescuePanel pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0b1220;border-radius:10px;padding:10px;font-size:12px;max-height:38vh;overflow:auto}
 #aiAnimatorRescuePanel .muted{color:#cbd5e1;font-size:12px}
 #aiAnimatorRescuePanel .rescue-note{padding:8px 10px;border:1px solid #475569;border-radius:9px;margin-top:8px;color:#e2e8f0;font-size:12px}
 #aiAnimatorRescueOpen{position:fixed;z-index:2147482999;bottom:14px;left:14px;border:0;border-radius:999px;background:#155e75;color:white;padding:11px 15px;font:600 13px system-ui;box-shadow:0 5px 20px #0005}
 </style>
 <h2>مرکز نجات و عیب‌یابی تولید</h2>
 <div class="muted">نسخهٔ ۲ · بررسی اتصال‌ها، حافظه، صف‌های تولید و خطاهای مرورگر</div>
 <div class="rescue-actions">
  <button class="primary" data-action="run">اجرای بررسی کامل</button>
  <button data-action="inventory">بررسی داده‌های پروژه</button>
  <button data-action="export">خروجی گزارش فنی</button>
  <button data-action="close">بستن</button>
 </div>
 <div id="aiAnimatorRescueStatus" aria-live="polite">برای شروع، بررسی کامل را اجرا کن.</div>
 <pre id="aiAnimatorRescueOutput">هنوز بررسی‌ای اجرا نشده است.</pre>
 <div class="rescue-note">این پنل فقط وضعیت و اندازهٔ داده‌ها را می‌خواند؛ هیچ داستان، تصویر، رمز یا کلیدی را ارسال یا حذف نمی‌کند.</div>
 <div class="muted">نکته: پاسخ سالم /health فقط روشن‌بودن Worker را ثابت می‌کند؛ اتصال موتور هوش مصنوعی و تولید واقعی تصویر جداگانه‌اند.</div>`;
 const mount = () => {
  if (!document.body || document.getElementById('aiAnimatorRescueOpen')) return;
  const open = document.createElement('button');
  open.id = 'aiAnimatorRescueOpen'; open.type = 'button'; open.textContent = 'عیب‌یابی هوشمند';
  open.addEventListener('click', () => { panel.hidden = !panel.hidden; });
  document.body.append(open, panel);
 };
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
 else mount();
 const status = () => panel.querySelector('#aiAnimatorRescueStatus');
 const output = () => panel.querySelector('#aiAnimatorRescueOutput');
 const timeoutSignal = ms => {
  if (window.AbortSignal?.timeout) return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
 };
 async function check(name, fn) {
  try { const detail = await fn(); add(name, 'ok', detail); return true; }
  catch (e) { add(name, 'failed', errorText(e)); return false; }
 }
 const renderChecks = () => {
  output().textContent = report.checks.map(x => (x.status === 'ok' ? '✓ ' : '✕ ') + x.name + ' — ' + x.detail).join('\n');
 };
 function recommendations() {
  const failed = report.checks.filter(x => x.status === 'failed').map(x => x.name);
  const tips = [];
  if (failed.includes('Network')) tips.push('اتصال اینترنت گوشی را بررسی کن و دوباره بررسی را اجرا کن.');
  if (failed.includes('Cloudflare Worker')) tips.push('Worker پاسخ نداده است: وضعیت Deploy، مسیر /health و تنظیم ALLOWED_ORIGIN را در Cloudflare بررسی کن.');
  if (failed.includes('Supabase endpoint')) tips.push('ارتباط Supabase برقرار نیست: وضعیت پروژه و دسترسی شبکه را بررسی کن.');
  if (failed.includes('Supabase session')) tips.push('نشست کاربر موجود نیست یا منقضی شده؛ از حساب خارج و دوباره وارد شو.');
  if (failed.includes('Local storage') || failed.includes('IndexedDB')) tips.push('حافظهٔ سایت ممکن است مسدود یا پر باشد؛ فضای خالی دستگاه و مجوز ذخیره‌سازی مرورگر را بررسی کن. داده‌های سایت را پاک نکن.');
  if (!tips.length) tips.push('خطای قطعی در بررسی‌های پایه پیدا نشد. برای تشخیص خطای تولید تصویر، گزارش همین پنل را همراه متن خطای صفحه بررسی کن.');
  return tips;
 }
 async function run() {
  report.checks = [];
  status().textContent = 'در حال بررسی اجزای برنامه...';
  const tasks = [
   ['JavaScript runtime', () => { if (!window.Promise || !window.fetch) throw Error('مرورگر APIهای پایه را ندارد'); return 'APIهای پایه فعال‌اند'; }],
   ['Local storage', () => { localStorage.setItem('__ai_rescue_probe', '1'); localStorage.removeItem('__ai_rescue_probe'); return 'خواندن و نوشتن فعال است'; }],
   ['Session storage', () => { sessionStorage.setItem('__ai_rescue_probe', '1'); sessionStorage.removeItem('__ai_rescue_probe'); return 'خواندن و نوشتن فعال است'; }],
   ['IndexedDB', () => { if (!window.indexedDB) throw Error('IndexedDB پشتیبانی نمی‌شود'); return 'API ذخیره‌سازی در دسترس است'; }],
   ['Storage capacity', async () => { const x = await navigator.storage?.estimate?.(); if (!x) return 'مرورگر میزان فضا را گزارش نمی‌کند'; return Math.round((x.usage || 0) / 1048576) + ' MB مصرف از ' + Math.round((x.quota || 0) / 1048576) + ' MB'; }],
   ['Network', () => { if (!navigator.onLine) throw Error('مرورگر آفلاین است'); return 'مرورگر آنلاین است'; }],
   ['Cloudflare Worker', async () => { const r = await fetch('https://shiny-field-9b69.mslmadelt8.workers.dev/health', { method: 'GET', mode: 'cors', cache: 'no-store', signal: timeoutSignal(8000) }); if (!r.ok) throw Error('HTTP ' + r.status); const j = await r.json(); if (j.ok !== true) throw Error('پاسخ سلامت معتبر نیست'); return 'Worker پاسخ می‌دهد؛ مدل: ' + (j.model || 'نامشخص'); }],
   ['Supabase endpoint', async () => { const r = await fetch('https://zgqqbwwjcyndlfcccpih.supabase.co/auth/v1/health', { method: 'GET', cache: 'no-store', signal: timeoutSignal(8000) }); if (!r.ok) throw Error('HTTP ' + r.status); return 'پاسخ HTTP ' + r.status; }]
  ];
  for (const [name, fn] of tasks) { await check(name, fn); renderChecks(); }
  await check('Supabase session', async () => {
   const client = window.__aiAnimatorSupabaseClient;
   if (!client?.auth?.getSession) throw Error('کلاینت نشست در صفحه در دسترس نیست');
   const { data, error } = await client.auth.getSession();
   if (error) throw error;
   return data?.session ? 'نشست فعال است' : 'نشست فعال نیست؛ ورود لازم است';
  });
  renderChecks();
  const ok = report.checks.filter(x => x.status === 'ok').length;
  const failed = report.checks.filter(x => x.status === 'failed').length;
  status().textContent = 'پایان بررسی: ' + ok + ' مورد سالم، ' + failed + ' مورد نیازمند بررسی.';
  output().textContent += '\n\nپیشنهادهای بعدی:\n• ' + recommendations().join('\n• ');
  record('diagnostic', 'بررسی کامل اجرا شد', { ok, failed });
 }
 function inventory() {
  const rows = APP_KEYS.map(key => {
   const raw = safe(() => localStorage.getItem(key));
   let count = 'نامشخص';
   if (raw !== null) {
    try { const parsed = JSON.parse(raw); count = Array.isArray(parsed) ? parsed.length + ' مورد' : (parsed && typeof parsed === 'object' ? Object.keys(parsed).length + ' فیلد' : 'مقدار ذخیره‌شده'); }
    catch (_) { count = 'دادهٔ متنی'; }
   }
   return key + ': ' + (raw === null ? 'وجود ندارد' : 'موجود · ' + raw.length + ' بایت · ' + count);
  });
  const dbCheck = indexedDB.databases ? indexedDB.databases().then(list => DB_NAMES.map(n => n + ': ' + (list.some(x => x.name === n) ? 'موجود' : 'هنوز ساخته نشده'))) : Promise.resolve(['فهرست دیتابیس‌ها در این مرورگر قابل خواندن نیست']);
  dbCheck.then(dbs => {
   output().textContent = 'فهرست امن داده‌های محلی پروژه:\n' + rows.join('\n') + '\n\nدیتابیس‌ها:\n' + dbs.join('\n') + '\n\nهیچ داده‌ای باز یا تغییر داده نشد.';
   status().textContent = 'بررسی موجودی انجام شد؛ هیچ داده‌ای حذف یا بازنویسی نشد.';
  }).catch(e => { status().textContent = 'خواندن فهرست دیتابیس ممکن نشد: ' + errorText(e); });
  record('inventory', 'موجودی داده‌های محلی بررسی شد');
 }
 function exportReport() {
  const payload = {
   product: 'AI Animator Studio', version: 2, generatedAt: now(),
   browser: navigator.userAgent, online: navigator.onLine,
   checks: report.checks, events: report.events.slice(-80),
   note: 'No story, image, credential, or local project content included.'
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'ai-animator-diagnostic-' + Date.now() + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  status().textContent = 'گزارش فنی روی دستگاه ساخته شد؛ به سروری ارسال نشد.';
 }
 panel.addEventListener('click', e => {
  const b = e.target.closest('button[data-action]'); if (!b) return;
  if (b.dataset.action === 'run') run().catch(err => { status().textContent = 'بررسی ناموفق: ' + errorText(err); record('diagnostic-error', errorText(err)); });
  if (b.dataset.action === 'inventory') inventory();
  if (b.dataset.action === 'export') exportReport();
  if (b.dataset.action === 'close') panel.hidden = true;
 });
 window.__AI_ANIMATOR_RESCUE__ = { record, run, inventory, report };
 record('startup', 'Rescue console v2 loaded');
})();