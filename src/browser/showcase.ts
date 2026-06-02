import { getLocale, setLocale, onLocaleChange, t } from "./i18n.ts";
import type { Locale } from "./i18n.ts";

// --- タイプライターアニメーション ---

const TYPE_SPEED = 100;
const DELETE_SPEED = 60;
const PAUSE_AFTER_TYPE = 1800;
const PAUSE_AFTER_DELETE = 400;

function initTypewriter(): void {
  const maybeEl = document.getElementById("typewriter-word");
  if (!maybeEl) return;
  const typewriterEl: HTMLElement = maybeEl;

  let wordIndex = 0;
  let charIndex = 0;
  let isDeleting = false;

  function getWords(): string[] {
    return t().kv.typewriterWords;
  }

  function tick(): void {
    const words = getWords();
    const word = words[wordIndex % words.length]!;

    if (!isDeleting) {
      charIndex++;
      typewriterEl.textContent = word.slice(0, charIndex);
      if (charIndex >= word.length) {
        setTimeout(() => {
          isDeleting = true;
          tick();
        }, PAUSE_AFTER_TYPE);
        return;
      }
      setTimeout(tick, TYPE_SPEED);
    } else {
      charIndex--;
      typewriterEl.textContent = word.slice(0, charIndex);
      if (charIndex === 0) {
        isDeleting = false;
        wordIndex = (wordIndex + 1) % words.length;
        setTimeout(tick, PAUSE_AFTER_DELETE);
        return;
      }
      setTimeout(tick, DELETE_SPEED);
    }
  }

  tick();
}

// --- Parallax (全セクション対応) ---

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function initParallax(): void {
  const kvContent = document.getElementById("kv-content");
  const kvHint = document.querySelector<HTMLElement>(".kv-scroll-hint");
  const qualityBg = document.getElementById("quality-parallax-bg");
  const harnessBg = document.getElementById("harness-parallax-bg");
  const qualitySection = qualityBg?.parentElement ?? null;
  const harnessSection = harnessBg?.parentElement ?? null;
  const emulatorSection = document.getElementById("emulator-section");

  const nesFrames = Array.from(document.querySelectorAll<HTMLElement>(".nes-frame"));
  const frameData = nesFrames.map((frame) => ({
    el: frame,
    speed: parseFloat(frame.dataset["speed"] ?? "0.1"),
    rotate: parseFloat(frame.dataset["rotate"] ?? "0"),
  }));

  const darkColor: [number, number, number] = [15, 15, 36];
  const whiteColor: [number, number, number] = [255, 255, 255];

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        const vh = window.innerHeight;
        const progress = Math.min(scrollY / vh, 1);

        if (kvContent) {
          kvContent.style.transform = `translate3d(0, ${scrollY * 0.4}px, 0)`;
          kvContent.style.opacity = String(Math.max(0, 1 - progress * 1.5));
        }
        if (kvHint) {
          kvHint.style.opacity = String(Math.max(0, 1 - progress * 3));
        }

        for (const fd of frameData) {
          fd.el.style.transform = `translateY(${scrollY * fd.speed}px) rotate(${fd.rotate}deg)`;
        }

        if (qualityBg && qualitySection) {
          const rect = qualitySection.getBoundingClientRect();
          qualityBg.style.transform = `translate3d(0, ${(-rect.top / vh) * 40}px, 0)`;
        }

        if (harnessBg && harnessSection) {
          const rect = harnessSection.getBoundingClientRect();
          harnessBg.style.transform = `translate3d(0, ${(-rect.top / vh) * 30}px, 0)`;
        }

        if (emulatorSection) {
          const transitionStart = emulatorSection.offsetTop + emulatorSection.offsetHeight * 0.4;
          const transitionEnd = emulatorSection.offsetTop + emulatorSection.offsetHeight;
          const range = transitionEnd - transitionStart;
          const t = range > 0 ? Math.max(0, Math.min(1, (scrollY - transitionStart) / range)) : 0;
          document.body.style.backgroundColor = lerpColor(darkColor, whiteColor, t);
        }

        ticking = false;
      });
      ticking = true;
    }
  });
}

// --- Fade-in on scroll (Intersection Observer) ---

function initFadeIn(): void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).classList.add("visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15 }
  );

  for (const el of document.querySelectorAll<HTMLElement>(".fade-in")) {
    observer.observe(el);
  }
}

// --- カウントアップアニメーション ---

function initCounters(): void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement;
          const target = parseInt(el.dataset["target"] ?? "0", 10);
          const format = el.dataset["format"];
          animateCounter(el, target, format === "compact");
          observer.unobserve(el);
        }
      }
    },
    { threshold: 0.3 }
  );

  for (const el of document.querySelectorAll<HTMLElement>(".counter")) {
    observer.observe(el);
  }
}

const numFmt = new Intl.NumberFormat();

function animateCounter(el: HTMLElement, target: number, compact: boolean): void {
  const duration = 1500;
  const start = performance.now();

  function step(now: number): void {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(eased * target);
    el.textContent = compact ? formatCompact(current) : numFmt.format(current);
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function formatCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
}

// --- 互換性バーのアニメーション ---

function initStatBars(): void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const fill = entry.target as HTMLElement;
          const percent = fill.dataset["percent"] ?? "0";
          fill.style.width = `${percent}%`;
          observer.unobserve(fill);
        }
      }
    },
    { threshold: 0.3 }
  );

  for (const el of document.querySelectorAll<HTMLElement>(".stat-bar-fill")) {
    observer.observe(el);
  }
}

// --- i18n ---

function applyI18n(): void {
  const tr = t();

  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = el.dataset["i18n"]!;
    const value = resolveKey(tr, key);
    if (typeof value === "string") {
      el.textContent = value;
    }
  }

  // Oracle items (dynamic list)
  const oracleList = document.getElementById("oracle-list");
  if (oracleList) {
    oracleList.innerHTML = "";
    for (const item of tr.harness.oracleItems) {
      const li = document.createElement("li");
      li.textContent = item;
      oracleList.appendChild(li);
    }
  }

  document.documentElement.lang = getLocale();
}

function resolveKey(obj: object, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function initLangSwitcher(): void {
  const switcher = document.getElementById("lang-switcher");
  if (!switcher) return;

  function updateActive(): void {
    const locale = getLocale();
    for (const btn of switcher!.querySelectorAll<HTMLButtonElement>(".lang-btn")) {
      btn.classList.toggle("active", btn.dataset["lang"] === locale);
    }
  }

  switcher.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".lang-btn");
    if (!btn) return;
    const lang = btn.dataset["lang"];
    if (lang === "en" || lang === "ja" || lang === "zh") {
      setLocale(lang as Locale);
    }
  });

  onLocaleChange(() => {
    updateActive();
    applyI18n();
  });

  updateActive();
  applyI18n();
}

// --- ヘッダーのスクロール追従カラー切替 ---

function initHeaderScroll(): void {
  const header = document.querySelector<HTMLElement>(".site-header");
  if (!header) return;

  const whiteSections = Array.from(document.querySelectorAll<HTMLElement>(".section-white"));

  let ticking = false;
  function update(): void {
    const y = header!.getBoundingClientRect().bottom;
    const onLight = whiteSections.some((s) => {
      const r = s.getBoundingClientRect();
      return r.top < y && r.bottom > y;
    });
    header!.classList.toggle("on-light", onLight);
    ticking = false;
  }

  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  });
  update();
}

// --- Init all showcase features ---

export function initShowcase(): void {
  initTypewriter();
  initParallax();
  initFadeIn();
  initCounters();
  initStatBars();
  initLangSwitcher();
  initHeaderScroll();
}
