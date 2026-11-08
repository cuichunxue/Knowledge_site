// STEP 4 — the page around the model.
//
// Left (desktop) / pull-up sheet (phone): the part menu, grouped 本体 / 触手 / 細部 (TRIZ A: many parts, one
// level at a time). Right / bottom sheet: the selected part's card. Bottom dock: 全体分解, 再組み立て,
// pause / play and the explode slider. Top right: reset, auto-rotate, labels, fullscreen, more (views,
// reference, focus, about). Hotspots: pulsing dots on 4 parts for the first seconds, so a visitor sees at once
// what can be tapped (Journey 3-8 s) without a forced tutorial.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

export function createUI({parts, on}) {
  const list = $('#partsList');
  const groups = [...new Set(parts.map((p) => p.group))];
  list.innerHTML = groups.map((g) => `
    <li class="grp"><span>${esc(g)}</span>
      <ul>${parts.filter((p) => p.group === g).map((p) => `
        <li><button class="part" data-id="${p.id}" aria-pressed="false">
          <b>${p.id}</b><span>${esc(p.name)}</span><i class="dot" aria-hidden="true"></i>
        </button></li>`).join('')}
      </ul>
    </li>`).join('');
  const btns = new Map([...list.querySelectorAll('.part')].map((b) => [b.dataset.id, b]));
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.part');
    if (!b) return;
    on.select(b.dataset.id);
    if (matchMedia('(max-width: 760px)').matches) setPanel(false);
  });

  // ---- mobile: the part menu folds away so the 3D keeps the screen
  const panel = $('#parts');
  const setPanel = (open) => {
    panel.classList.toggle('open', open);
    $('#partsToggle').setAttribute('aria-expanded', open);
  };
  $('#partsToggle').addEventListener('click', () => setPanel(!panel.classList.contains('open')));

  // ---- the card
  const card = $('#card');
  let cardId = null;
  function showCard(p, e) {
    cardId = p.id;
    card.hidden = false;
    card.innerHTML = `
      <button class="x" data-act="close" aria-label="閉じる">✕</button>
      <p class="id">${p.id} · ${esc(p.group)}</p>
      <h2>${esc(p.name)}<small>${esc(p.en)}</small></h2>
      <p class="sub">${esc(p.sub)}</p>
      <p>${esc(p.desc)}</p>
      <p class="motion"><b>分解の動き</b>${esc(p.motion)}</p>
      <div class="acts">
        <button class="act primary" data-act="toggle">${e > 0.5 ? '🔧 組み立てる' : '🔓 分解する'}</button>
        <button class="act" data-act="look">🎯 カメラを向ける</button>
      </div>`;
  }
  card.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'close') on.close();
    if (a === 'toggle') on.toggle(cardId);
    if (a === 'look') on.look(cardId);
  });
  const hideCard = () => {
    card.hidden = true;
    cardId = null;
  };

  // ---- dock
  const slider = $('#slider');
  const sliderVal = $('#sliderVal');
  slider.addEventListener('input', () => on.slider(Number(slider.value) / 1000));
  $('#explodeBtn').addEventListener('click', () => on.explode());
  $('#assembleBtn').addEventListener('click', () => on.assemble());
  $('#playBtn').addEventListener('click', () => on.playPause());

  // ---- tools
  $('#resetBtn').addEventListener('click', () => on.reset());
  $('#autoBtn').addEventListener('click', () => on.auto());
  $('#lblBtn').addEventListener('click', () => on.labels());
  $('#fsBtn').addEventListener('click', () => on.fullscreen());
  if (!document.fullscreenEnabled) $('#fsBtn').hidden = true;
  const more = $('#morePanel');
  $('#moreBtn').addEventListener('click', () => {
    more.hidden = !more.hidden;
    $('#moreBtn').setAttribute('aria-expanded', !more.hidden);
  });
  more.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.view) on.view(b.dataset.view);
    if (b.id === 'refBtn') on.ref();
    if (b.id === 'infoBtn') on.info();
    if (b.id === 'focusBtn') on.focusToggle();
    more.hidden = true;
  });

  // ---- hotspots
  const hot = $('#hotspots');
  let hotOn = true;
  function placeHotspots(items) {
    if (!hotOn) return;
    hot.innerHTML = items.filter((h) => h.visible).map((h) =>
      `<button class="hs" data-id="${h.id}" style="transform:translate(${h.x.toFixed(0)}px,${h.y.toFixed(0)}px)" aria-label="${esc(h.name)}を分解"><i></i><span>${esc(h.name)}</span></button>`).join('');
  }
  hot.addEventListener('click', (e) => {
    const b = e.target.closest('.hs');
    if (b) on.select(b.dataset.id);
  });
  const dismissHints = () => {
    if (!hotOn) return;
    hotOn = false;
    hot.innerHTML = '';
    $('#hint').classList.add('gone');
  };

  return {
    showCard,
    hideCard,
    get cardId() {
      return cardId;
    },
    setSelected(id) {
      for (const [k, b] of btns) b.setAttribute('aria-pressed', k === id);
    },
    setStates(e) {
      for (const [k, b] of btns) b.classList.toggle('open', e[k] > 0.02);
      if (cardId) {
        const t = card.querySelector('[data-act="toggle"]');
        if (t) t.textContent = e[cardId] > 0.5 ? '🔧 組み立てる' : '🔓 分解する';
      }
    },
    setSlider(p) {
      if (document.activeElement !== slider) slider.value = Math.round(p * 1000);
      sliderVal.textContent = `${Math.round(p * 100)}%`;
    },
    setPlaying(playing, paused) {
      $('#playBtn').textContent = playing ? '⏸' : '▶';
      $('#playBtn').setAttribute('aria-label', playing ? '一時停止' : paused ? '再開' : '再生');
    },
    setToggle(id, on) {
      $(id)?.setAttribute('aria-pressed', on);
    },
    placeHotspots,
    dismissHints,
    get hintsOn() {
      return hotOn;
    },
  };
}
