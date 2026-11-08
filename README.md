# AI Animator Studio

وب‌اپلیکیشن موبایل برای تولید تصویر از متن با واسط امن Hugging Face.

## انتشار سایت با GitHub Pages
1. در Settings مخزن، بخش Pages را باز کن.
2. Source را روی Deploy from a branch، شاخه main و پوشه /(root) قرار بده.
3. پس از انتشار، نشانی GitHub Pages را باز کن.

## راه‌اندازی موتور تصویر
1. فایل worker.js را در یک Cloudflare Worker قرار بده.
2. در Settings → Variables and Secrets یک Secret با نام HF_TOKEN و توکن Hugging Face دارای دسترسی Inference Providers ثبت کن.
3. متغیر ALLOWED_ORIGIN را برابر Origin دقیق سایت منتشرشده قرار بده؛ مانند https://OWNER.github.io
4. برای مسیر /generate در Cloudflare محدودیت نرخ درخواست تنظیم کن. CORS به‌تنهایی مانع فراخوانی مستقیم endpoint نمی‌شود.
5. URL مربوط به Worker را در سایت وارد کن.

توجه: اعتبار Hugging Face یا ارائه‌دهنده محدود یا پولی است و رایگان نامحدود نیست. انتشار Worker و ثبت Secret باید در حساب Cloudflare انجام شود. هرگز HF_TOKEN را در HTML یا مخزن GitHub قرار نده.
