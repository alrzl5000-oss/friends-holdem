// 그림: 말(도트 12×12) · 윷가락 · 판 · 장식 — 민화풍 색 (주·청·적·황·먹)
(function () {
  const N = 12;
  // ----- 도트 말 -----
  function pat(name, x, y) {
    const dx = x - 5.5, dy = y - 5.5, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    switch (name) {
      case 'flower': return d < 1.4 || (d > 2.2 && d < 4.2 && Math.cos(4 * a) > 0.35);
      case 'sun': return d < 2.4 || (d > 3.0 && d < 4.4 && Math.cos(8 * a) > 0.2);
      case 'moon': return d < 4.2 && Math.hypot(x - 3.6, y - 4.2) > 3.4;
      case 'cloud': return Math.hypot(x - 3.3, y - 7.3) < 2 || Math.hypot(x - 6.2, y - 6.6) < 2.6 || Math.hypot(x - 8.6, y - 7.6) < 1.8;
      case 'bamboo': return ((x === 4 || x === 7) && y > 1 && y < 10) || ((y === 3 || y === 7) && x > 3 && x < 8);
      case 'wave': return ((y + Math.round(Math.sin(x * 0.9) * 1.4)) % 4 === 0);
      default: return ((x + y) % 4 === 0 && d < 4.4);
    }
  }
  function pieceCells(art) {
    const cells = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - 5.5, y - 5.5);
      let c = null;
      if (d <= 5.6) { c = art.c1; if (d <= 4.6) { c = art.c2; if (pat(art.pat, x, y)) c = art.c3; } }
      if (c) cells.push([x, y, c]);
    }
    return cells;
  }
  function pieceSVG(art, px = 36) {
    const rects = pieceCells(art).map(([x, y, c]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`).join('');
    return `<svg class="pc" width="${px}" height="${px}" viewBox="0 0 12 12" shape-rendering="crispEdges">${rects}</svg>`;
  }

  // ----- 색 보조 -----
  function mix(hex, to, f) {
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const a = p(hex), b = p(to);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * f).toString(16).padStart(2, '0')).join('');
  }
  const dark = (h, f = .35) => mix(h, '#1a120a', f);
  const light = (h, f = .4) => mix(h, '#fff8e6', f);

  // ----- 윷가락: 나무 결 그라데이션 + 앞면(평평한 쪽) 표시 -----
  // face=true 면 평평한 면이 위로 (앞면), false 면 둥근 면 (뒷면)
  function stickEl(wood, face, extra = '') {
    const st = `--w1:${dark(wood, .45)};--w2:${wood};--w3:${light(wood, .42)};--w4:${dark(wood, .25)}`;
    return `<span class="stk ${face ? 'flat' : 'round'} ${extra}" style="${st}"><i></i></span>`;
  }

  // ----- 판 SVG: 한지 질감 + 단청 띠 + 구름·해 장식 -----
  const THEMES = {
    hanji: { paper: '#f3e7c6', ink: '#5b3a22', band: null, accent: '#b8323b', gold: '#c8962e', night: false },
    dancheong: { paper: '#e9dcb8', ink: '#1f4e5a', band: ['#2f6f73', '#b8323b', '#e0b13a'], accent: '#b8323b', gold: '#e0b13a', night: false },
    night: { paper: '#1d2b4a', ink: '#e0c27a', band: null, accent: '#f4e3a1', gold: '#f4e3a1', night: true },
  };
  function boardSVG(players, options, themeKey, nodesFn) {
    const T = THEMES[themeKey] || THEMES.hanji;
    const band = T.band
      ? `<pattern id="band" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${T.band[0]}"/><path d="M5 0 L10 5 L5 10 L0 5Z" fill="${T.band[2]}"/><circle cx="5" cy="5" r="1.6" fill="${T.band[1]}"/></pattern>`
      : '';
    const stars = T.night
      ? Array.from({ length: 26 }, (_, i) => { const x = (i * 37) % 96 + 2, y = (i * 53) % 96 + 2; return `<circle cx="${x}" cy="${y}" r="${i % 3 ? .35 : .6}" fill="#fff8d6" opacity="${.5 + (i % 4) * .12}"/>`; }).join('')
      : '';
    const cloud = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}" opacity=".35"><circle cx="0" cy="0" r="2.4"/><circle cx="2.6" cy="-.8" r="2.9"/><circle cx="5.4" cy="0" r="2.2"/><rect x="-2" y="0" width="9.4" height="2.4" rx="1.2"/></g>`;
    const lines = `<g stroke="${T.ink}" stroke-width="1.5" stroke-linecap="round" fill="none">
      <polygon points="${[TL, TR, BR, BL].map(p => p.join(',')).join(' ')}"/>
      <line x1="${TR[0]}" y1="${TR[1]}" x2="${BL[0]}" y2="${BL[1]}" stroke-width="1.1" stroke-dasharray="3 1.6"/>
      <line x1="${TL[0]}" y1="${TL[1]}" x2="${BR[0]}" y2="${BR[1]}" stroke-width="1.1" stroke-dasharray="3 1.6"/></g>`;
    const sun = `<g transform="translate(50 50)"><circle r="5.2" fill="${T.gold}" opacity=".85"/><circle r="5.2" fill="none" stroke="${T.ink}" stroke-width=".5"/>${Array.from({ length: 8 }, (_, i) => `<line x1="0" y1="-6.4" x2="0" y2="-8.6" stroke="${T.gold}" stroke-width=".9" transform="rotate(${i * 45})"/>`).join('')}</g>`;
    const nodes = Object.keys(XY).filter(n => n !== 'C').map(n => {
      const [x, y] = XY[n];
      const corner = /^R(5|10|15|20)$/.test(n);
      const opt = options.some(o => o.from === n);
      const r = corner ? 3.5 : 2.5;
      const fill = opt ? T.accent : T.paper;
      return `<g class="nd${opt ? ' opt' : ''}"><circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${T.ink}" stroke-width=".9"/><circle cx="${x}" cy="${y}" r="${r - 1}" fill="none" stroke="${T.gold}" stroke-width=".4" opacity=".7"/>${n[0] === 'R' ? `<text x="${x}" y="${y + 1.1}" font-size="2.6" text-anchor="middle" fill="${opt ? '#fff' : T.ink}" font-family="Nanum Myeongjo, serif">${n.slice(1)}</text>` : ''}</g>`;
    }).join('');
    const bandFrame = T.band
      ? `<rect x="1" y="1" width="98" height="98" fill="url(#band)" opacity=".9" rx="2"/><rect x="5.5" y="5.5" width="89" height="89" fill="${T.paper}" rx="1"/>`
      : `<rect x="1" y="1" width="98" height="98" fill="${T.paper}" rx="2"/>`;
    return { defs: band, frame: bandFrame + stars + cloud(9, 90, .9, T.ink) + cloud(78, 6, .8, T.ink), lines, sun, nodes, tailTheme: T };
  }
  // 좌표는 app 쪽과 같은 값을 쓰기 위해 여기 둠
  const TL = [10, 10], TR = [90, 10], BR = [90, 90], BL = [10, 90], CEN = [50, 50];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const XY = {};
  for (let k = 1; k <= 4; k++) {
    XY['R' + k] = lerp(TL, TR, k / 5); XY['R' + (k + 5)] = lerp(TR, BR, k / 5);
    XY['R' + (k + 10)] = lerp(BR, BL, k / 5); XY['R' + (k + 15)] = lerp(BL, TL, k / 5);
  }
  XY.R5 = TR; XY.R10 = BR; XY.R15 = BL; XY.R20 = TL;
  XY.A1 = lerp(TR, CEN, 1 / 3); XY.A2 = lerp(TR, CEN, 2 / 3);
  XY.B1 = lerp(CEN, BL, 1 / 3); XY.B2 = lerp(CEN, BL, 2 / 3);
  XY.D1 = lerp(BR, CEN, 1 / 3); XY.D2 = lerp(BR, CEN, 2 / 3);
  XY.E1 = lerp(CEN, TL, 1 / 3); XY.E2 = lerp(CEN, TL, 2 / 3);
  XY.C = CEN;

  window.Art = { pieceSVG, pieceCells, stickEl, boardSVG, THEMES, XY, mix };
})();
