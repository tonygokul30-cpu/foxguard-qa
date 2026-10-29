// Illustrative sample only. This widget never requests or calculates a live audit.
(() => {
  const card = document.querySelector('.health-preview');
  if (!card) return;
  const tabs = [...card.querySelectorAll('[role="tab"]')];
  const panel = card.querySelector('[role="tabpanel"]');
  const number = card.querySelector('[data-score]');
  const arc = card.querySelector('.gauge-progress');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  const animate = () => {
    cancelAnimationFrame(frame);
    if (motion.matches) { number.textContent = '98'; arc.style.strokeDashoffset = '2'; return; }
    const start = performance.now();
    const draw = now => {
      const progress = Math.min((now - start) / 950, 1);
      const score = 98 * (1 - Math.pow(1 - progress, 3));
      number.textContent = String(Math.round(score));
      arc.style.strokeDashoffset = String(100 - score);
      if (progress < 1) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
  };
  const select = index => {
    tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
    card.dataset.view = index ? 'mobile' : 'desktop';
    panel.setAttribute('aria-labelledby', tabs[index].id);
    card.querySelector('[data-view-title]').textContent = index ? 'Mobile sample' : 'Desktop sample';
    card.querySelector('[data-viewport]').textContent = index ? '390 × 844 · Touch viewport' : '1365 × 900 · Browser viewport';
    card.querySelector('[data-view-check]').textContent = index ? 'Mobile layout + navigation' : 'Desktop layout + navigation';
    animate();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      select(next); tabs[next].focus();
    });
  });
  card.querySelector('[role="tablist"]').hidden = false;
  motion.addEventListener('change', animate);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { animate(); observer.disconnect(); }
    }, {threshold: 0.25});
    observer.observe(card);
  } else animate();
})();
