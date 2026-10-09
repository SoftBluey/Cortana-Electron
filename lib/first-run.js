(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CortanaFirstRun = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function createTour({ host, createRenderer, load, getTheme, getProfile, save, onVisibility, onFinished }) {
    const title = host.querySelector('#first-run-title');
    const features = host.querySelector('#first-run-features');
    const personal = host.querySelector('#first-run-personal');
    const name = host.querySelector('#first-run-name'), city = host.querySelector('#first-run-weather');
    const back = host.querySelector('#first-run-back'), next = host.querySelector('#first-run-next');
    const error = host.querySelector('#first-run-error');
    const continueButton = host.querySelector('#first-run-continue');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let stage = 0, opened = false, active = false, saving = false;
    const records = [
      { canvas: host.querySelector('#first-run-orb'), file: 'circle_static.gif', wanted: true, header: true },
      ...Array.from(host.querySelectorAll('[data-tour-gif]'), canvas => ({ canvas, file: canvas.dataset.tourGif, wanted: false })),
    ];
    records.forEach(record => { record.renderer = createRenderer(record.canvas); record.renderer.active = false; });
    function pause(record) {
      record.renderer.active = false;
      clearTimeout(record.renderer.timer); record.renderer.timer = null; record.renderer._nextFrameAt = null;
    }
    function eligible(record) {
      return !host.hidden && active && (record.header || (record.wanted && !record.canvas.closest('.first-run-scroll').hidden));
    }
    async function prepare(record) {
      if (record.loaded) return;
      if (record.loading) return record.loading;
      record.loading = (async () => {
        await load(record.renderer, record.file, record.header ? 80 : 204);
        record.loaded = true;
        record.renderer.setThemeColor(getTheme());
        record.renderer._renderFrame(reduced.matches ? Math.floor(record.renderer.frames.length / 2) : 0);
      })().catch(failure => console.warn('Tour illustration could not be loaded:', record.file, failure.message))
        .finally(() => { record.loading = null; });
      return record.loading;
    }
    function sync(record) {
      if (!eligible(record)) { pause(record); return; }
      if (!record.loaded) { prepare(record).then(() => { if (record.loaded) sync(record); }); return; }
      if (reduced.matches) {
        pause(record);
        record.renderer._renderFrame(Math.floor(record.renderer.frames.length / 2));
        return;
      }
      record.renderer.active = true;
      if (!record.started) { record.started = true; record.renderer.start(true); }
      else if (record.renderer.running && !record.renderer.timer) record.renderer._tick();
    }
    function syncAll() { records.forEach(sync); }
    const observers = [features, personal].map(root => {
      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          const record = records.find(record => record.canvas === entry.target);
          record.wanted = entry.isIntersecting; sync(record);
        }
      }, { root, threshold: .01 });
      records.filter(record => !record.header && root.contains(record.canvas)).forEach(record => observer.observe(record.canvas));
      return observer;
    });
    function showStage(value, focus = true) {
      stage = value; features.hidden = stage !== 0; personal.hidden = stage !== 1;
      title.textContent = stage === 0 ? 'Here are some of the things I can do for you.' : 'Let’s make this yours.';
      back.textContent = stage === 0 ? 'Not interested' : 'Back';
      next.textContent = stage === 0 ? 'Next' : 'Get started';
      next.type = stage === 0 ? 'button' : 'submit';
      next.setAttribute('form', 'first-run-personal');
      error.hidden = continueButton.hidden = true; syncAll();
      if (focus) (stage === 0 ? next : name).focus({ preventScroll: true });
    }
    function suspend() {
      if (host.hidden) return;
      host.hidden = true; host.inert = true; syncAll(); onVisibility(false);
    }
    async function finish(withProfile) {
      if (saving) return;
      if (withProfile && !personal.reportValidity()) return;
      saving = true; back.disabled = next.disabled = true; name.disabled = city.disabled = true;
      error.hidden = continueButton.hidden = true; host.setAttribute('aria-busy', 'true');
      try {
        const result = await save(withProfile ? { name: name.value.trim(), weatherCity: city.value.trim() } : null);
        if (!result.success) { error.textContent = result.error || 'Could not save your setup. Please try again.'; error.hidden = continueButton.hidden = false; return; }
        suspend(); onFinished();
      } catch (_) { error.textContent = 'Could not save your setup. Your entries are still here; try again.'; error.hidden = continueButton.hidden = false; }
      finally {
        saving = false; back.disabled = next.disabled = false; name.disabled = city.disabled = false;
        host.removeAttribute('aria-busy');
      }
    }
    back.onclick = () => stage === 0 ? finish(false) : showStage(0);
    continueButton.onclick = () => { if (!saving) { suspend(); onFinished(); } };
    next.onclick = event => { event.preventDefault(); stage === 0 ? showStage(1) : void finish(true); };
    personal.onsubmit = event => { event.preventDefault(); void finish(true); };
    reduced.addEventListener('change', syncAll);
    return {
      get visible() { return !host.hidden; },
      get saving() { return saving; },
      async open({ resume = false, focus = true } = {}) {
        if (!resume || !opened) {
          const profile = getProfile(); name.value = profile.name || ''; city.value = profile.weatherCity || '';
          features.scrollTop = personal.scrollTop = 0; stage = 0;
        }
        opened = true; host.hidden = false; host.inert = false; onVisibility(true); showStage(stage, focus);
        await Promise.all([prepare(records[0]), prepare(records[1])]); syncAll();
      },
      suspend,
      setActivity(value) { active = value; syncAll(); },
      setThemeColor(color) {
        const rgb = color.slice(1).match(/.{2}/g).map(value => parseInt(value, 16));
        host.style.setProperty('--first-run-button-text', .299 * rgb[0] + .587 * rgb[1] + .114 * rgb[2] > 128 ? '#000' : '#fff');
        records.forEach(record => { record.renderer.setThemeColor(color); if (record.loaded && reduced.matches) record.renderer._renderFrame(Math.floor(record.renderer.frames.length / 2)); });
      },
      destroy() { observers.forEach(observer => observer.disconnect()); reduced.removeEventListener('change', syncAll); records.forEach(record => record.renderer.stop()); },
    };
  }
  return { createTour };
});
