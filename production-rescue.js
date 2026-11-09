/* AI Animator Production Rescue Console
 * Browser-side diagnostics, safe recovery snapshots, and actionable fault reports.
 * No credentials are collected or transmitted.
 */
(() => {
 'use strict';
 if(window.__AI_ANIMATOR_RESCUE__) return;
 const KEY='aiAnimatorRescueReportsV1';
 const now=()=>new Date().toISOString();
 const safe=(fn,fallback=null)=>{try{return fn()}catch(_){return fallback}};
 const report={startedAt:now(),checks:[],events:[],errors:[]};
 const add=(name,status,detail)=>{report.checks.push({name,status,detail:String(detail||''),at:now()});};
 const record=(kind,message,extra={})=>{
   report.events.push({kind,message:String(message||'').slice(0,500),extra,at:now()});
   if(report.events.length>150) report.events.shift();
   safe(()=>localStorage.setItem(KEY,JSON.stringify(report)));
 };
 const errorText=e=>String(e?.stack||e?.message||e||'Unknown error').slice(0,1200);
 window.addEventListener('error',e=>record('browser-error',errorText(e.error||e.message)));
 window.addEventListener('unhandledrejection',e=>record('unhandled-rejection',errorText(e.reason)));
 window.addEventListener('online',()=>record('network','Browser reports online'));
 window.addEventListener('offline',()=>record('network','Browser reports offline'));
 const panel=document.createElement('section');
 panel.id='aiAnimatorRescuePanel';
 panel.dir='rtl';
 panel.hidden=true;
 panel.innerHTML=`
 <style>
 #aiAnimatorRescuePanel{position:fixed;z-index:2147483000;inset:auto 12px 12px 12px;max-height:78vh;overflow:auto;background:#111827;color:#f9fafb;border:1px solid #475569;border-radius:16px;padding:16px;box-shadow:0 16px 60px #0008;font:14px/1.7 system-ui,sans-serif}
 #aiAnimatorRescuePanel *{box-sizing:border-box}#aiAnimatorRescuePanel h2{font-size:18px;margin:0 0 8px}
 #aiAnimatorRescuePanel .rescue-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
 #aiAnimatorRescuePanel button{border:1px solid #64748b;border-radius:9px;padding:8px 12px;background:#263449;color:white;font:inherit}
 #aiAnimatorRescuePanel button.primary{background:#17634b;border-color:#34d399}
 #aiAnimatorRescuePanel pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0b1220;border-radius:10px;padding:10px;font-size:12px}
 #aiAnimatorRescuePanel .muted{color:#cbd5e1;font-size:12px}
 #aiAnimatorRescueOpen{position:fixed;z-index:2147482999;bottom:14px;left:14px;border:0;border-radius:999px;background:#155e75;color:white;padding:11px 15px;font:600 13px system-ui;box-shadow:0 5px 20px #0005}
 </style>
 <h2>مرکز نجات و عیب‌یابی تولید</h2>
 <div class="muted">بررسی مرورگر، اتصال‌ها، حافظه و خطاهای اخیر. هیچ رمز یا کلیدی جمع‌آوری نمی‌شود.</div>
 <div class="rescue-actions">
 <button class="primary" data-action="run">اجرای بررسی کامل</button>
 <button data-action="export">دریافت گزارش تشخیصی</button>
 <button data-action="recover">بررسی امکان بازیابی</button>
 <button data-action="close">بستن</button>
 </div>
 <div id="aiAnimatorRescueStatus" aria-live="polite">برای شروع، بررسی کامل را اجرا کن.</div>
 <pre id="aiAnimatorRescueOutput">هنوز بررسی‌ای اجرا نشده است.</pre>
 <div class="muted">گزارش فقط شامل وضعیت فنی و پیام خطاهاست؛ متن داستان و محتوای تصاویر در آن ذخیره نمی‌شود.</div>`;
 document.addEventListener('DOMContentLoaded',()=>{
   const open=document.createElement('button');
   open.id='aiAnimatorRescueOpen';open.type='button';open.textContent='عیب‌یابی هوشمند';
   open.addEventListener('click',()=>{panel.hidden=!panel.hidden;});
   document.body.append(open,panel);
 });
 const status=()=>panel.querySelector('#aiAnimatorRescueStatus');
 const output=()=>panel.querySelector('#aiAnimatorRescueOutput');
 async function check(name,fn){
   try{const detail=await fn();add(name,'ok',detail);return true}
   catch(e){add(name,'failed',errorText(e));return false}
 }
 async function run(){
   report.checks=[];status().textContent='در حال بررسی اجزای برنامه...';
   const tasks=[
    ['JavaScript runtime',()=>{if(!window.Promise||!window.fetch)throw Error('مرورگر APIهای پایه را ندارد');return 'مرورگر APIهای پایه را پشتیبانی می‌کند'}],
    ['IndexedDB',()=>new Promise((resolve,reject)=>{if(!indexedDB)return reject(Error('IndexedDB unavailable'));const req=indexedDB.open('__ai_animator_rescue_test__',1);req.onupgradeneeded=()=>req.result.createObjectStore('probe');req.onsuccess=()=>{req.result.close();indexedDB.deleteDatabase('__ai_animator_rescue_test__');resolve('قابل استفاده')};req.onerror=()=>reject(req.error)})],
    ['Local storage',()=>{localStorage.setItem('__ai_rescue_probe','1');localStorage.removeItem('__ai_rescue_probe');return 'قابل نوشتن و خواندن'}],
    ['Storage capacity',async()=>{const estimate=await navigator.storage?.estimate?.();if(!estimate)return 'مرورگر مقدار حافظه را گزارش نمی‌کند';return Math.round((estimate.usage||0)/1048576)+' MB مصرف از '+Math.round((estimate.quota||0)/1048576)+' MB'}],
    ['Network',()=>{if(!navigator.onLine)throw Error('مرورگر آفلاین است');return 'مرورگر آنلاین است'}],
    ['Cloudflare Worker reachability',async()=>{const r=await fetch('https://shiny-field-9b69.mslmadelt8.workers.dev/health',{method:'GET',mode:'cors',cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('HTTP '+r.status);return 'پاسخ HTTP '+r.status}],
    ['Supabase reachability',async()=>{const r=await fetch('https://zgqqbwwjcyndlfcccpih.supabase.co/auth/v1/health',{method:'GET',cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('HTTP '+r.status);return 'پاسخ HTTP '+r.status}]
   ];
   for(const [n,fn] of tasks){await check(n,fn);output().textContent=report.checks.map(x=>(x.status==='ok'?'✓ ':'✕ ')+x.name+' — '+x.detail).join('\n')}
   const client=window.__aiAnimatorSupabaseClient;
   await check('Supabase session',async()=>{if(!client?.auth?.getSession)throw Error('Client در این صفحه پیدا نشد');const {data,error}=await client.auth.getSession();if(error)throw error;return data?.session?'نشست کاربر فعال است':'نشست کاربر وجود ندارد؛ ورود لازم است'});
   status().textContent='بررسی کامل شد: '+report.checks.filter(x=>x.status==='ok').length+' موفق، '+report.checks.filter(x=>x.status==='failed').length+' ناموفق.';
   record('diagnostic','بررسی کامل اجرا شد',{failed:report.checks.filter(x=>x.status==='failed').map(x=>x.name)});
 }
 function exportReport(){
   const payload={product:'AI Animator Studio',generatedAt:now(),userAgent:navigator.userAgent,online:navigator.onLine,checks:report.checks,events:report.events.slice(-100),errors:report.errors};
   const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ai-animator-diagnostic-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function recover(){
   const keys=['aiAnimatorSceneRetryQueueV1','aiAnimatorBackgroundLibraryV1','aiAnimatorProjectDraftV1'];
   const rows=keys.map(k=>({key:k,exists:localStorage.getItem(k)!==null,bytes:(localStorage.getItem(k)||'').length}));
   const draftKeys=Object.keys(localStorage).filter(k=>/aiAnimator.*(retry|draft|queue|history)/i.test(k));
   output().textContent='وضعیت داده‌های قابل بازیابی:\n'+rows.map(x=>x.key+': '+(x.exists?'موجود ('+x.bytes+' بایت)':'وجود ندارد')).join('\n')+'\n\nکلیدهای مرتبط: '+draftKeys.join(', ');
   status().textContent='بررسی بازیابی انجام شد؛ داده‌ای حذف یا بازنویسی نشد.';
 }
 panel.addEventListener('click',e=>{
   const b=e.target.closest('button[data-action]');if(!b)return;
   if(b.dataset.action==='run')run().catch(err=>{status().textContent='بررسی ناموفق: '+errorText(err);record('diagnostic-error',errorText(err))});
   if(b.dataset.action==='export')exportReport();
   if(b.dataset.action==='recover')recover();
   if(b.dataset.action==='close')panel.hidden=true;
 });
 window.__AI_ANIMATOR_RESCUE__={record,run,report};
 record('startup','Rescue console loaded');
})();