(() => {
  "use strict";
  const WIDTH = 1280, HEIGHT = 720;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const hash = value => {
    let h = 2166136261;
    const s = String(value || "");
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const xml = value => String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;" }[ch]));
  const palettes = {
    warm: ["#f6b36a","#e97858","#9c4d55","#432d4d","#f4d9a2"],
    cool: ["#77c6d8","#3986a8","#34517c","#1d294e","#b4e5ed"],
    pastel: ["#f5c7d9","#c5c5f5","#91d7d2","#f5dfac","#756c9c"],
    vivid: ["#ffbd45","#ff6c73","#8d5cff","#22c8bd","#17264e"],
    muted: ["#c4ad91","#8e9a9a","#667b87","#46516a","#d7c8aa"],
    consistent: ["#85c8d7","#8b83ca","#4d7890","#263b59","#e8c98b"]
  };
  function choosePalette(text, requested, referenceColors, seed) {
    let key = requested || "consistent";
    const s = String(text || "").toLowerCase();
    if (key === "consistent") {
      if (/neon|نئون|رنگارنگ|جادویی|رنگی/.test(s)) key = "vivid";
      else if (/باران|شب|سرد|یخ|برف|دریا|اقیانوس|زیر آب/.test(s)) key = "cool";
      else if (/غروب|کویر|آتشفشان|آتش|بیابان|گرم/.test(s)) key = "warm";
      else if (/پاستل|ملایم|رویایی|فانتزی/.test(s)) key = "pastel";
      else key = "consistent";
    }
    const base = (palettes[key] || palettes.consistent).slice();
    if (Array.isArray(referenceColors) && referenceColors.length) {
      const refs = referenceColors.slice(0, 3).filter(x => /^#[0-9a-f]{6}$/i.test(String(x)));
      if (refs.length) return [refs[0], refs[1] || base[1], refs[2] || base[2], base[3], refs[0]];
    }
    const shift = seed % 2;
    if (shift) return [base[1], base[0], base[2], base[3], base[4]];
    return base;
  }
  function inferEnvironment(prompt, preset) {
    if (preset && preset !== "story") return preset;
    const s = String(prompt || "").toLowerCase();
    if (/زیر آب|اقیانوس|دریا|ماهی|مرجان|underwater|ocean|coral|sea floor/.test(s)) return "underwater";
    if (/آزمایشگاه|اتاق کنترل|راهرو|داخل|اتاق|سالن|laboratory|lab|interior|corridor|control room/.test(s)) return "interior";
    if (/فضا|سیاره|ستاره|کهکشان|فضاپیما|ماه|space|planet|galaxy|spaceship|asteroid|volcano/.test(s)) return "space";
    if (/شهر|خیابان|آسمان.?خراش|ساختمان|پل|city|street|skyscraper|urban|buildings/.test(s)) return "city";
    if (/روستا|خانه|کلبه|مزرعه|دهکده|village|cottage|farm|rural/.test(s)) return "village";
    if (/قلعه|باستان|تاریخی|قصر|castle|ancient|historical|palace/.test(s)) return "historical";
    if (/جنگل|درخت|کوه|طبیعت|رودخانه|forest|tree|mountain|nature|river/.test(s)) return "nature";
    if (/جادویی|ژله|کریستال|اژدها|فانتزی|magic|jelly|crystal|fantasy|mushroom/.test(s)) return "fantasy";
    if (/علمی.?تخیلی|ربات|فناوری|نئون|سفینه|سایبر|sci.?fi|robot|futuristic|neon|cyber/.test(s)) return "scifi";
    return "nature";
  }
  function rng(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pathMountain(random, y, amplitude, fill, opacity) {
    let d = "M0 " + HEIGHT;
    for (let x = 0; x <= WIDTH; x += 80) {
      const yy = y - random() * amplitude;
      d += " L" + x + " " + Math.round(yy);
    }
    d += " L" + WIDTH + " " + HEIGHT + " Z";
    return '<path d="' + d + '" fill="' + fill + '" opacity="' + opacity + '"/>';
  }
  function buildSvg(options) {
    const prompt = String(options.prompt || options.sceneText || "").slice(0, 2400);
    const seed = Number.isSafeInteger(options.seed) ? options.seed >>> 0 : hash(prompt + "|" + (options.sceneIndex || 0));
    const random = rng(seed);
    const env = inferEnvironment(prompt, options.preset);
    const palette = choosePalette(prompt, options.palette, options.referenceColors, seed);
    const mood = options.mood || "match";
    const composition = options.composition || "layered";
    const detailed = composition !== "minimal";
    const c0 = palette[0], c1 = palette[1], c2 = palette[2], c3 = palette[3], accent = palette[4];
    const skyTop = mood === "night" ? "#10172e" : mood === "sunset" ? "#522d59" : mood === "rain" ? "#43566f" : mood === "dramatic" ? "#171d3c" : c3;
    const skyBottom = mood === "night" ? "#3e456d" : mood === "sunset" ? "#e58a67" : mood === "rain" ? "#8999a8" : mood === "soft" ? "#d7d9e8" : c1;
    const parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + WIDTH + '" height="' + HEIGHT + '" viewBox="0 0 ' + WIDTH + ' ' + HEIGHT + '" role="img" aria-label="Generated illustrated background">');
    parts.push('<defs>');
    parts.push('<linearGradient id="sky" x2="0" y2="1"><stop stop-color="' + skyTop + '"/><stop offset="1" stop-color="' + skyBottom + '"/></linearGradient>');
    parts.push('<linearGradient id="ground" x2="0" y2="1"><stop stop-color="' + c2 + '"/><stop offset="1" stop-color="' + c3 + '"/></linearGradient>');
    parts.push('<radialGradient id="sunGlow"><stop stop-color="' + accent + '" stop-opacity=".95"/><stop offset="1" stop-color="' + accent + '" stop-opacity="0"/></radialGradient>');
    parts.push('<linearGradient id="water" x2="0" y2="1"><stop stop-color="' + c0 + '"/><stop offset="1" stop-color="' + c3 + '"/></linearGradient>');
    parts.push('<linearGradient id="glass" x2="1" y2="1"><stop stop-color="' + c0 + '" stop-opacity=".7"/><stop offset="1" stop-color="' + c1 + '" stop-opacity=".18"/></linearGradient>');
    parts.push('<filter id="glow"><feGaussianBlur stdDeviation="22"/></filter>');
    parts.push('<pattern id="grain" width="48" height="48" patternUnits="userSpaceOnUse"><circle cx="5" cy="9" r="1" fill="#fff" opacity=".13"/><circle cx="33" cy="28" r="1.2" fill="#fff" opacity=".09"/><circle cx="19" cy="41" r=".8" fill="#fff" opacity=".12"/></pattern>');
    parts.push('</defs>');
    parts.push('<rect width="1280" height="720" fill="url(#sky)"/>');
    parts.push('<circle cx="1010" cy="160" r="190" fill="url(#sunGlow)" filter="url(#glow)"/>');
    const sunY = mood === "sunset" ? 440 : mood === "night" ? 125 : 180;
    if (mood === "night") {
      parts.push('<circle cx="1010" cy="' + sunY + '" r="48" fill="#e9e5c8" opacity=".9"/><circle cx="1030" cy="' + (sunY-14) + '" r="43" fill="' + skyTop + '"/>');
    } else {
      parts.push('<circle cx="1010" cy="' + sunY + '" r="' + (mood === "sunset" ? 66 : 52) + '" fill="' + accent + '" opacity=".9"/>');
    }
    if (env === "space" || mood === "night") {
      for (let i = 0; i < (env === "space" ? 125 : 85); i++) {
        const x = Math.round(random() * WIDTH), y = Math.round(random() * 470), r = .7 + random() * 2.2;
        parts.push('<circle cx="' + x + '" cy="' + y + '" r="' + r.toFixed(1) + '" fill="#fff" opacity="' + (.3 + random() * .65).toFixed(2) + '"/>');
      }
      parts.push('<path d="M80 180 Q320 20 590 170 T1120 90" fill="none" stroke="' + accent + '" stroke-width="70" opacity=".09" filter="url(#glow)"/>');
    } else if (mood !== "rain") {
      for (let i = 0; i < (detailed ? 5 : 3); i++) {
        const x = 110 + i * 245 + random() * 90, y = 115 + random() * 100;
        parts.push('<path d="M' + x + ' ' + y + ' q28 -24 56 0 q22 -28 50 -2 q32 0 32 22 h-138 q-10 -16 0 -20" fill="#fff" opacity=".10"/>');
      }
    } else {
      for (let i = 0; i < 24; i++) {
        const x = Math.round(random() * WIDTH), y = Math.round(random() * HEIGHT);
        parts.push('<path d="M' + x + ' ' + y + ' l-24 54" stroke="#d9e8f5" stroke-width="2" opacity=".18"/>');
      }
    }

    if (env === "underwater") {
      parts.push('<path d="M0 430 Q260 360 500 430 T980 415 T1280 430 V720 H0Z" fill="url(#water)"/>');
      parts.push('<path d="M0 545 Q250 490 510 555 T1000 530 T1280 550 V720 H0Z" fill="' + c3 + '" opacity=".75"/>');
      for (let i = 0; i < 13; i++) {
        const x = 80 + random() * 1120, y = 160 + random() * 400, r = 5 + random() * 18;
        parts.push('<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="' + r.toFixed(0) + '" fill="none" stroke="#d9f8ff" stroke-width="3" opacity=".25"/>');
      }
      for (let i = 0; i < 7; i++) {
        const x = 90 + i * 180 + random() * 45, h = 90 + random() * 130;
        parts.push('<path d="M' + x + ' 620 q-24 -' + h*.35 + ' 12 -' + h*.6 + ' q-24 -' + h*.2 + ' 16 -' + h*.4 + ' M' + x + ' 620 q24 -' + h*.4 + ' 4 -' + h*.7 + '" fill="none" stroke="' + (i%2?accent:c0) + '" stroke-width="16" stroke-linecap="round"/>');
      }
      parts.push('<path d="M0 120 L240 430 M220 60 L390 430 M900 40 L760 430 M1100 70 L960 430" stroke="#dffaff" stroke-width="38" opacity=".07"/>');
    } else if (env === "interior") {
      parts.push('<rect x="0" y="0" width="1280" height="520" fill="' + c3 + '" opacity=".45"/>');
      parts.push('<path d="M0 500 L1280 500 L1280 720 L0 720Z" fill="url(#ground)"/>');
      parts.push('<path d="M100 80 H520 V410 H100Z" fill="url(#glass)" stroke="' + accent + '" stroke-width="13"/>');
      parts.push('<path d="M310 80 V410 M100 245 H520" stroke="' + accent + '" stroke-width="9" opacity=".75"/>');
      parts.push('<path d="M0 500 L1280 500" stroke="' + accent + '" stroke-width="8" opacity=".4"/>');
      for (let i = 0; i < 6; i++) {
        const x = 640 + i * 85, y = 185 + random() * 120;
        parts.push('<rect x="' + x + '" y="' + y.toFixed(0) + '" width="58" height="120" rx="9" fill="' + c2 + '" stroke="' + accent + '" stroke-width="4"/><rect x="' + (x+10) + '" y="' + (y+14) + '" width="38" height="42" rx="5" fill="' + c0 + '" opacity=".65"/><circle cx="' + (x+29) + '" cy="' + (y+82) + '" r="7" fill="' + accent + '"/>');
      }
      parts.push('<path d="M0 650 L1280 650" stroke="#fff" stroke-width="3" opacity=".08"/>');
    } else if (env === "city" || env === "scifi" || env === "village" || env === "historical") {
      const count = env === "village" ? 7 : 13;
      for (let i = 0; i < count; i++) {
        const x = i * (1280 / count) - 10, w = (1280 / count) * (.58 + random() * .35);
        const bh = env === "village" ? 90 + random() * 100 : env === "historical" ? 140 + random() * 120 : 180 + random() * 250;
        const y = 500 - bh;
        const fill = i % 2 ? c3 : c2;
        if (env === "village" || env === "historical") {
          parts.push('<path d="M' + x + ' 500 V' + (y+32) + ' L' + (x+w/2) + ' ' + y + ' L' + (x+w) + ' ' + (y+32) + ' V500Z" fill="' + fill + '" stroke="' + accent + '" stroke-width="4" opacity=".9"/>');
        } else {
          parts.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + bh + '" fill="' + fill + '" stroke="' + accent + '" stroke-width="3" opacity=".86"/>');
          for (let wy = y+24; wy < 475; wy += 38) for (let wx = x+15; wx < x+w-12; wx += 28) {
            if (random() > .22) parts.push('<rect x="' + wx + '" y="' + wy + '" width="10" height="16" rx="2" fill="' + (random()>.5?accent:c0) + '" opacity=".68"/>');
          }
        }
      }
      parts.push('<path d="M0 505 Q320 470 640 510 T1280 500 V720 H0Z" fill="url(#ground)"/>');
      if (env === "scifi") {
        parts.push('<path d="M0 590 H1280 M0 635 H1280" stroke="' + accent + '" stroke-width="3" opacity=".25"/>');
        for (let i = 0; i < 12; i++) parts.push('<path d="M' + (i*115) + ' 510 l-30 210" stroke="' + c0 + '" stroke-width="3" opacity=".22"/>');
      }
    } else {
      parts.push(pathMountain(random, 495, env === "space" ? 190 : 260, c2, ".88"));
      parts.push(pathMountain(random, 545, env === "space" ? 120 : 170, c3, ".72"));
      parts.push('<path d="M0 520 Q250 450 490 530 T930 510 T1280 520 V720 H0Z" fill="url(#ground)"/>');
      if (env === "space") {
        parts.push('<circle cx="890" cy="330" r="122" fill="' + c0 + '" stroke="' + accent + '" stroke-width="8"/>');
        parts.push('<ellipse cx="890" cy="330" rx="205" ry="45" transform="rotate(-18 890 330)" fill="none" stroke="' + accent + '" stroke-width="20" opacity=".7"/>');
        for (let i = 0; i < 11; i++) {
          const x = 90 + random() * 1100, y = 540 + random() * 125, r = 5 + random() * 22;
          parts.push('<ellipse cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" rx="' + r.toFixed(0) + '" ry="' + (r*.45).toFixed(0) + '" fill="' + c3 + '" opacity=".5"/>');
        }
      }
      if (env === "nature" || env === "fantasy" || env === "village" || env === "historical") {
        const trees = composition === "minimal" ? 4 : 10;
        for (let i = 0; i < trees; i++) {
          const x = 35 + random() * 1210, y = 485 + random() * 70, h = 70 + random() * 125;
          const trunk = env === "fantasy" ? c0 : c3;
          parts.push('<path d="M' + (x-9) + ' ' + y + ' Q' + (x+4) + ' ' + (y-h*.5) + ' ' + x + ' ' + (y-h) + ' Q' + (x+22) + ' ' + (y-h*.45) + ' ' + (x+12) + ' ' + y + 'Z" fill="' + trunk + '"/>');
          if (env === "fantasy" && /ژله|jelly|alien|بیگانه/.test(prompt.toLowerCase())) {
            parts.push('<path d="M' + (x-52) + ' ' + (y-h*.65) + ' Q' + x + ' ' + (y-h*1.45) + ' ' + (x+52) + ' ' + (y-h*.65) + ' Q' + x + ' ' + (y-h*.35) + ' ' + (x-52) + ' ' + (y-h*.65) + 'Z" fill="' + accent + '" stroke="' + c0 + '" stroke-width="5" opacity=".85"/>');
            parts.push('<circle cx="' + (x-18) + '" cy="' + (y-h*.75) + '" r="7" fill="#fff" opacity=".7"/><circle cx="' + (x+16) + '" cy="' + (y-h*.78) + '" r="5" fill="#fff" opacity=".7"/>');
          } else {
            parts.push('<circle cx="' + x + '" cy="' + (y-h*.85) + '" r="' + (28+random()*18) + '" fill="' + (i%2?c0:accent) + '" opacity=".84"/>');
            parts.push('<circle cx="' + (x-18) + '" cy="' + (y-h*.72) + '" r="22" fill="' + c1 + '" opacity=".65"/>');
          }
        }
      }
    }

    const lower = composition === "minimal" ? 0.12 : composition === "layered" ? 0.32 : 0.2;
    if (env !== "interior" && env !== "underwater") {
      parts.push('<path d="M0 625 Q260 570 510 635 T1000 610 T1280 625 V720 H0Z" fill="' + c3 + '" opacity="' + lower + '"/>');
      if (detailed) {
        for (let i = 0; i < 16; i++) {
          const x = random() * WIDTH, y = 580 + random() * 120;
          parts.push('<path d="M' + x.toFixed(0) + ' ' + y.toFixed(0) + ' q-12 -22 -22 -28 m22 28 q8 -22 20 -30" stroke="' + accent + '" stroke-width="4" fill="none" opacity=".35"/>');
        }
      }
    }

    if (/آتشفشان|volcano/.test(prompt.toLowerCase())) {
      parts.push('<path d="M820 520 L970 210 L1110 520Z" fill="' + c3 + '" stroke="' + accent + '" stroke-width="7"/><path d="M950 260 Q980 300 1010 260" fill="none" stroke="#ffb24d" stroke-width="18" stroke-linecap="round"/><path d="M970 240 Q900 170 950 115 Q1000 150 1010 220" fill="' + c1 + '" opacity=".4"/>');
      parts.push('<path d="M965 300 Q920 380 890 480 M1000 300 Q1040 390 1070 480" stroke="#e66b4e" stroke-width="12" opacity=".7" fill="none"/>');
    }
    if (/دروازه|پورتال|portal/.test(prompt.toLowerCase())) {
      parts.push('<ellipse cx="650" cy="480" rx="105" ry="170" fill="' + c0 + '" opacity=".18" filter="url(#glow)"/><ellipse cx="650" cy="470" rx="64" ry="130" fill="none" stroke="' + accent + '" stroke-width="22"/><ellipse cx="650" cy="470" rx="43" ry="111" fill="none" stroke="#fff" stroke-width="5" opacity=".7"/>');
    }
    if (/کریستال|بلور|crystal/.test(prompt.toLowerCase())) {
      for (let i = 0; i < 8; i++) {
        const x = 120 + random() * 1040, y = 610 + random() * 65, h = 45 + random() * 110;
        parts.push('<path d="M' + x.toFixed(0) + ' ' + y.toFixed(0) + ' l-18 -' + h*.65 + ' l24 -' + h + ' l25 ' + h*.72 + 'Z" fill="' + (i%2?c0:accent) + '" stroke="#fff" stroke-opacity=".35" stroke-width="3"/>');
      }
    }
    if (/فضاپیما|سفینه|spaceship|rocket/.test(prompt.toLowerCase())) {
      parts.push('<g transform="translate(270 265) rotate(-12)"><path d="M-95 0 Q0 -85 95 0 Q0 85 -95 0Z" fill="' + accent + '" stroke="' + c3 + '" stroke-width="8"/><ellipse cx="0" cy="0" rx="32" ry="26" fill="url(#glass)" stroke="#fff" stroke-width="5"/><path d="M-60 25 L-110 60 L-48 55 M60 25 L110 60 L48 55" fill="' + c1 + '" stroke="' + c3 + '" stroke-width="6"/><path d="M-28 54 L0 110 L28 54" fill="' + c1 + '" opacity=".8"/></g>');
    }
    if (/درخت ژله|jelly tree/.test(prompt.toLowerCase())) {
      parts.push('<path d="M1080 560 Q1090 400 1065 300" stroke="' + c3 + '" stroke-width="24" fill="none"/><path d="M965 340 Q1075 160 1190 340 Q1170 450 1080 430 Q990 455 965 340Z" fill="' + accent + '" stroke="' + c0 + '" stroke-width="7" opacity=".86"/>');
    }
    parts.push('<rect width="1280" height="720" fill="url(#grain)" opacity=".55"/>');
    parts.push('<rect x="12" y="12" width="1256" height="696" rx="18" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="3"/>');
    parts.push('</svg>');
    return { svg: parts.join(""), seed, environment: env, palette, width: WIDTH, height: HEIGHT };
  }
  function svgDataUrl(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }
  async function extractPalette(dataUrl) {
    if (typeof Image === "undefined" || typeof document === "undefined") return [];
    const image = new Image();
    image.src = String(dataUrl || "");
    if (image.decode) await image.decode();
    else await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    const canvas = document.createElement("canvas");
    canvas.width = 48; canvas.height = 48;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(image, 0, 0, 48, 48);
    const pixels = ctx.getImageData(0, 0, 48, 48).data;
    const buckets = new Map();
    for (let i = 0; i < pixels.length; i += 16) {
      const r = pixels[i], g = pixels[i+1], b = pixels[i+2], a = pixels[i+3];
      if (a < 100) continue;
      const key = [r >> 5, g >> 5, b >> 5].join(",");
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    return [...buckets.entries()].sort((a,b) => b[1]-a[1]).slice(0,3).map(([key]) => {
      const rgb = key.split(",").map(v => (Number(v)*32+16).toString(16).padStart(2,"0"));
      return "#" + rgb.join("");
    });
  }
  async function generateBackground(options) {
    const result = buildSvg(options || {});
    return Object.assign(result, { dataUrl: svgDataUrl(result.svg), engine: "AI Animator Studio · Procedural Vector Engine", format: "SVG" });
  }
  globalThis.AIAnimatorImageEngine = Object.freeze({
    version: "1.0.0",
    generateBackground,
    extractPalette,
    inferEnvironment,
    buildSvg
  });
})();