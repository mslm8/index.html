(() => {
  const panel = document.getElementById("managerPanel");
  if (!panel || panel.dataset.ready) return;
  panel.dataset.ready = "1";
  const $ = id => document.getElementById(id);
  const checksBox = $("managerChecks");
  const reportBox = $("managerReport");
  const statusBox = $("managerStatus");
  const runButton = $("runManagerDiagnostics");
  const analyzeButton = $("analyzeManagerReport");
  const events = [];
  const redact = value => String(value || "")
    .replace(/Bearer\\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/(?:sk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,})/g, "[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi, "[EMAIL]")
    .slice(0, 420);
  const addEvent = (type, message) => {
    events.push({ type, message: redact(message), at: new Date().toISOString() });
    if (events.length > 20) events.shift();
  };
  window.addEventListener("error", event => addEvent("javascript", event.message || "Browser error"));
  window.addEventListener("unhandledrejection", event => addEvent("promise", event.reason?.message || event.reason || "Unhandled promise rejection"));
  const timeoutFetch = async (url, ms = 9000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try { return await fetch(url, { cache: "no-store", signal: controller.signal }); }
    finally { clearTimeout(timer); }
  };
  const showChecks = rows => {
    checksBox.innerHTML = "";
    for (const row of rows) {
      const item = document.createElement("div");
      item.className = "manager-check";
      const mark = document.createElement("b");
      mark.textContent = row.ok ? "✓" : "!";
      mark.style.color = row.ok ? "var(--b)" : "var(--warn)";
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = row.name;
      const detail = document.createElement("small");
      detail.textContent = row.detail;
      copy.append(title, detail);
      item.append(mark, copy);
      checksBox.append(item);
    }
  };
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  function renderReport(report) {
    reportBox.replaceChildren();
    const summary = document.createElement("p");
    summary.className = "manager-summary";
    summary.textContent = report.summary || "گزارشی دریافت نشد.";
    reportBox.append(summary);
    const severity = document.createElement("div");
    severity.className = "manager-severity";
    severity.textContent = "شدت کلی: " + ({ok:"عادی",low:"کم",medium:"متوسط",high:"زیاد",critical:"بحرانی"}[report.severity] || "نامشخص");
    reportBox.append(severity);
    for (const finding of report.findings || []) {
      const card = document.createElement("article");
      card.className = "manager-finding";
      const title = document.createElement("strong"); title.textContent = finding.title;
      const evidence = document.createElement("p"); evidence.textContent = "شواهد: " + finding.evidence;
      const impact = document.createElement("p"); impact.textContent = "اثر: " + finding.impact;
      const priority = document.createElement("small"); priority.textContent = "اولویت: " + finding.priority;
      card.append(title, evidence, impact, priority); reportBox.append(card);
    }
    const steps = document.createElement("ol");
    for (const step of report.recommendedSteps || []) { const li = document.createElement("li"); li.textContent = step; steps.append(li); }
    if (steps.children.length) { const heading = document.createElement("h3"); heading.textContent = "اقدام‌های پیشنهادی"; reportBox.append(heading, steps); }
    if (report.missingEvidence?.length) {
      const missing = document.createElement("p");
      missing.textContent = "اطلاعات تکمیلی لازم: " + report.missingEvidence.join("؛ ");
      reportBox.append(missing);
    }
    const safety = document.createElement("p");
    safety.className = "manager-note";
    safety.textContent = "تغییر خودکار فایل و انتشار در این نسخه غیرفعال است. هیچ اصلاحی بدون تست و تأیید اعمال نمی‌شود.";
    reportBox.append(safety);
  }
  async function runChecks() {
    const rows = [];
    const client = window.__aiAnimatorSupabaseClient;
    let session = null;
    try {
      if (!client) throw new Error("Supabase client not initialized");
      const result = await client.auth.getSession();
      if (result.error) throw result.error;
      session = result.data?.session || null;
      rows.push({ name: "نشست کاربر", ok: !!session, detail: session ? "نشست معتبر در مرورگر موجود است." : "نشست ورود پیدا نشد." });
    } catch (error) { rows.push({ name: "نشست کاربر", ok: false, detail: redact(error.message || error) }); }
    try {
      const response = await timeoutFetch("https://zgqqbwwjcyndlfcccpih.supabase.co/auth/v1/health");
      rows.push({ name: "Supabase Auth", ok: response.ok, detail: "HTTP " + response.status });
    } catch (error) { rows.push({ name: "Supabase Auth", ok: false, detail: redact(error.message || error) }); }
    try {
      const response = await timeoutFetch("https://shiny-field-9b69.mslmadelt8.workers.dev/health");
      const body = await response.json().catch(() => ({}));
      rows.push({ name: "Cloudflare Worker", ok: response.ok && body.ok !== false, detail: "HTTP " + response.status + (body.engine ? " · " + body.engine : "") });
    } catch (error) { rows.push({ name: "Cloudflare Worker", ok: false, detail: redact(error.message || error) }); }
    try {
      if (!client || !session) throw new Error("برای بررسی درگاه، ابتدا وارد حساب شو.");
      const result = await client.functions.invoke("fal-gateway", { body: { action: "health" } });
      if (result.error) throw result.error;
      rows.push({ name: "Supabase fal-gateway", ok: !!result.data?.ok, detail: result.data?.cloudflareImageCredentialState || "پاسخ سلامت دریافت شد؛ دسترسی واقعی مدل با تولید آزمایشی مشخص می‌شود." });
    } catch (error) { rows.push({ name: "Supabase fal-gateway", ok: false, detail: redact(error.message || error) }); }
    try {
      if (!client || !session) throw new Error("برای بررسی کاتالوگ مدل‌ها، ابتدا وارد حساب شو.");
      const result = await client.functions.invoke("studio-manager", { body: { action: "cloudflare-model-catalog" } });
      if (result.error) throw result.error;
      if (!result.data?.ok) {
        const details = result.data?.code || "خطای نامشخص";
        rows.push({ name: "کاتالوگ مدل‌های تصویری Cloudflare", ok: false, detail: details + (result.data?.httpStatus ? " · HTTP " + result.data.httpStatus : "") });
      } else {
        const listed = (result.data.imageModelCandidates || []).filter(item => item.listedInAccountCatalog).map(item => item.id.split("/").slice(-1)[0]);
        rows.push({
          name: "کاتالوگ مدل‌های تصویری Cloudflare",
          ok: listed.length > 0,
          detail: listed.length ? "مدل‌های موجود در کاتالوگ حساب: " + listed.join("، ") : "هیچ‌یک از مدل‌های تصویری شناخته‌شده در کاتالوگ حساب پیدا نشد."
        });
      }
    } catch (error) { rows.push({ name: "کاتالوگ مدل‌های تصویری Cloudflare", ok: false, detail: redact(error.message || error) }); }
    try {
      if (!client || !session) throw new Error("برای بررسی موتور مدیر، ابتدا وارد حساب شو.");
      const result = await client.functions.invoke("studio-manager", { body: { action: "health" } });
      if (result.error) throw result.error;
      const mode = result.data?.mode === "ai_ready" ? "مدل زبانی آماده است." : "تحلیل قواعدمحور فعال است؛ اتصال مدل زبانی اختیاری است.";
      rows.push({ name: "موتور مدیر هوشمند", ok: !!result.data?.ok, detail: mode + (result.data?.model ? " · " + result.data.model : "") });
    } catch (error) { rows.push({ name: "موتور مدیر هوشمند", ok: false, detail: redact(error.message || error) }); }
    try {
      const response = await timeoutFetch("https://api.github.com/repos/mslm8/index.html/actions/runs?per_page=1");
      const data = await response.json();
      const run = data.workflow_runs?.[0];
      const ok = response.ok && run?.status === "completed" && run?.conclusion === "success";
      rows.push({ name: "GitHub Actions", ok, detail: run ? run.status + (run.conclusion ? " · " + run.conclusion : "") + " · " + run.head_sha.slice(0,7) : "اطلاعات اجرا دریافت نشد." });
    } catch (error) { rows.push({ name: "GitHub Actions", ok: false, detail: redact(error.message || error) }); }
    try {
      const estimate = await navigator.storage?.estimate?.();
      rows.push({ name: "فضای ذخیره‌سازی مرورگر", ok: !!estimate, detail: estimate ? Math.round((estimate.usage || 0) / 1048576) + " از " + Math.round((estimate.quota || 0) / 1048576) + " مگابایت مصرف‌شده" : "مرورگر آمار ذخیره‌سازی را ارائه نکرد." });
    } catch (error) { rows.push({ name: "فضای ذخیره‌سازی مرورگر", ok: false, detail: redact(error.message || error) }); }
    const local = { online: navigator.onLine, language: document.documentElement.lang, viewport: window.innerWidth + "×" + window.innerHeight, recentErrors: events.slice(-12) };
    showChecks(rows);
    return { checkedAt: new Date().toISOString(), checks: rows, browser: local };
  }
  let latestDiagnostics = null;
  runButton?.addEventListener("click", async () => {
    runButton.disabled = true; analyzeButton.disabled = true;
    statusBox.textContent = "در حال بررسی سرویس‌ها و مرورگر…";
    try {
      latestDiagnostics = await runChecks();
      const failed = latestDiagnostics.checks.filter(x => !x.ok).length;
      statusBox.textContent = "بررسی تمام شد؛ " + failed + " مورد نیازمند توجه است.";
      analyzeButton.disabled = false;
    } catch (error) { statusBox.textContent = redact(error.message || error); }
    finally { runButton.disabled = false; }
  });
  analyzeButton?.addEventListener("click", async () => {
    const client = window.__aiAnimatorSupabaseClient;
    if (!client || !latestDiagnostics) return;
    analyzeButton.disabled = true;
    statusBox.textContent = "در حال تحلیل گزارش…";
    try {
      const result = await client.functions.invoke("studio-manager", { body: { action: "analyze", diagnostics: latestDiagnostics } });
      if (result.error) {
        const message = result.data?.error || result.error.message || "خطا در اتصال مدیر هوشمند";
        throw new Error(message);
      }
      if (!result.data?.ok || !result.data.report) throw new Error(result.data?.error || "پاسخ مدیر هوشمند معتبر نیست.");
      renderReport(result.data.report);
      const modeLabel = result.data.mode === "rules_only" ? "تحلیل قواعدمحور" : result.data.mode === "rules_fallback" ? "تحلیل جایگزین قواعدمحور" : "تحلیل هوشمند";
      statusBox.textContent = modeLabel + " انجام شد · " + (result.data.model || "موتور داخلی");
    } catch (error) {
      reportBox.textContent = redact(error.message || error);
      statusBox.textContent = "تحلیل هوشمند در دسترس نیست؛ بررسی پایه همچنان فعال است.";
    } finally { analyzeButton.disabled = false; }
  });
  $("exportManagerReport")?.addEventListener("click", () => {
    const payload = { exportedAt: new Date().toISOString(), diagnostics: latestDiagnostics, events: events.slice(-20), reportText: reportBox.innerText };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "ai-animator-diagnostics.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
