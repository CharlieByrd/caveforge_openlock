/**
 * CaveForge — global floating tooltip (side-effect module).
 * Install once by importing this file in App.tsx.
 * Any element with [data-tip] gets a tooltip; [data-kbd] adds a mono shortcut badge.
 * Portaled to <body>, so it escapes the header's overflow:hidden clip.
 */

declare global {
  interface Window { __cfTooltipInstalled?: boolean }
}

if (!window.__cfTooltipInstalled) {
  window.__cfTooltipInstalled = true;

  let bubble: HTMLDivElement | null = null;
  let current: Element | null = null;
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  const OPEN_DELAY = 320;

  function ensureBubble(): HTMLDivElement {
    if (bubble) return bubble;
    bubble = document.createElement('div');
    bubble.className = 'cf-tooltip';
    document.body.appendChild(bubble);
    return bubble;
  }

  function place(target: Element): void {
    const text = target.getAttribute('data-tip');
    if (!text) return;
    const el = ensureBubble();
    const kbd = target.getAttribute('data-kbd');
    el.innerHTML = '';
    el.appendChild(document.createTextNode(text));
    if (kbd) {
      const k = document.createElement('span');
      k.className = 'cf-tooltip-kbd';
      k.textContent = kbd;
      el.appendChild(k);
    }
    const r = target.getBoundingClientRect();
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    let top = r.bottom + 7;
    let placement = 'bottom';
    if (top + th > window.innerHeight - 6) { top = r.top - th - 7; placement = 'top'; }
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(6, Math.min(left, window.innerWidth - tw - 6));
    el.style.top = top + 'px';
    el.style.left = left + 'px';
    el.dataset.placement = placement;
    el.style.setProperty('--arrow-x', (r.left + r.width / 2 - left) + 'px');
    el.classList.add('visible');
  }

  function hide(): void {
    if (showTimer) clearTimeout(showTimer);
    current = null;
    if (bubble) bubble.classList.remove('visible');
  }

  document.addEventListener('mouseover', (e) => {
    const t = (e.target as Element).closest?.('[data-tip]') ?? null;
    if (t === current) return;
    if (showTimer) clearTimeout(showTimer);
    if (bubble) bubble.classList.remove('visible');
    current = t;
    if (t) showTimer = setTimeout(() => place(t), OPEN_DELAY);
  });

  document.addEventListener('mouseout', (e) => {
    const t = (e.target as Element).closest?.('[data-tip]') ?? null;
    if (t && t === current) hide();
  });

  document.addEventListener('mousedown', hide);

  document.addEventListener('focusin', (e) => {
    const t = (e.target as Element).closest?.('[data-tip]') ?? null;
    if (t) { current = t; place(t); }
  });

  document.addEventListener('focusout', (e) => {
    const t = (e.target as Element).closest?.('[data-tip]') ?? null;
    if (t && t === current) hide();
  });

  window.addEventListener('scroll', hide, true);
}

export {};
