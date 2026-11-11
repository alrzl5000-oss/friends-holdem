// 그림 모듈 — 말(도트 12×12)만 도트, 판·윷가락은 벡터 그림
(function () {
  const N = 12;

  // ---------- 색 보조 ----------
  function mix(hex, to, f) {
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const a = p(hex), b = p(to);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * f).toString(16).padStart(2, '0')).join('');
  }
  const dark = (h, f = .35) => mix(h, '#140c06', f);
  const light = (h, f = .4) => mix(h, '#fff8e8', f);
  let uid = 0;

  // ---------- 도트 말 ----------
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
  const cellRects = art => pieceCells(art).map(([x, y, c]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`).join('');
  function pieceSVG(art, px = 36) {
    return `<svg class="pc" width="${px}" height="${px}" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">${cellRects(art)}</svg>`;
  }

  // ---------- 윷가락 ----------
  // 배(평평한 면): 밝은 속살·나뭇결·모서리 광택. 등(둥근 면): 원통 음영·옹이·껍질 결.
  // marked=true 인 가락은 배에 X 표시 — 이 가락 하나만 배가 보이면 뒷도.
  function stickFace(wood, flat, marked) {
    const id = 'st' + (++uid);
    if (flat) {
      const grain = [5.5, 8.6, 11.8, 15, 18.2].map((x, i) =>
        `<path d="M${x} 7 C${x + (i % 2 ? 1.3 : -1.1)} 30, ${x + (i % 2 ? -1.1 : 1.4)} 64, ${x} 89" stroke="${dark(wood, .3)}" stroke-width="${i % 2 ? .4 : .6}" fill="none" opacity=".32"/>`).join('');
      const mark = marked
        ? `<g stroke="#2b1a0d" stroke-width="2.4" stroke-linecap="round" opacity=".88"><line x1="7.5" y1="40" x2="16.5" y2="56"/><line x1="16.5" y1="40" x2="7.5" y2="56"/></g>` : '';
      return `<svg viewBox="0 0 24 96" aria-hidden="true"><defs>
        <linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${mix(wood, '#d9b97f', .45)}"/><stop offset=".18" stop-color="${light(wood, .58)}"/>
          <stop offset=".5" stop-color="${light(wood, .74)}"/><stop offset=".82" stop-color="${light(wood, .55)}"/><stop offset="1" stop-color="${mix(wood, '#c9a46a', .4)}"/></linearGradient>
        <linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".12" stop-color="#fff" stop-opacity="0"/>
          <stop offset=".88" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs>
        <rect x="1" y="1" width="22" height="94" rx="6.5" fill="url(#${id})" stroke="${dark(wood, .5)}" stroke-width="1"/>
        ${grain}<rect x="1" y="1" width="22" height="94" rx="6.5" fill="url(#${id}h)"/>
        <rect x="3.4" y="3.6" width="17.2" height="88.8" rx="5" fill="none" stroke="#fff" stroke-width=".5" opacity=".35"/>${mark}</svg>`;
    }
    const knots = [[8, 24, 1.6], [15.5, 61, 1.25], [9.5, 79, .9]].map(([x, y, r]) =>
      `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 2.3}" fill="${dark(wood, .55)}" opacity=".6"/><ellipse cx="${x}" cy="${y}" rx="${r + .9}" ry="${r * 2.3 + 1.6}" fill="none" stroke="${dark(wood, .4)}" stroke-width=".35" opacity=".5"/>`).join('');
    const bark = [4.5, 19.5].map(x => `<path d="M${x} 8 C${x + .8} 34, ${x - .8} 60, ${x} 88" stroke="${dark(wood, .6)}" stroke-width=".7" fill="none" opacity=".45"/>`).join('');
    return `<svg viewBox="0 0 24 96" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" x2="1">
      <stop offset="0" stop-color="${dark(wood, .62)}"/><stop offset=".18" stop-color="${dark(wood, .2)}"/>
      <stop offset=".36" stop-color="${light(wood, .3)}"/><stop offset=".6" stop-color="${wood}"/><stop offset="1" stop-color="${dark(wood, .66)}"/></linearGradient></defs>
      <rect x="1" y="1" width="22" height="94" rx="11" fill="url(#${id})" stroke="${dark(wood, .65)}" stroke-width="1"/>
      ${bark}<path d="M8.6 7 C7.6 35, 9.2 62, 8.2 89" stroke="${light(wood, .7)}" stroke-width="1.8" fill="none" opacity=".5" stroke-linecap="round"/>
      ${knots}</svg>`;
  }
  // 양면 가락 (3D로 뒤집힘). rotateY(0)=배, rotateY(180deg)=등
  function stickEl(wood, marked = false) {
    return `<div class="stick"><div class="face f-flat">${stickFace(wood, true, marked)}</div><div class="face f-round">${stickFace(wood, false, marked)}</div></div>`;
  }

  // ---------- 말판 좌표 ----------
  // 전통 배치: 오른쪽 아래가 출발(참먹이), 오른쪽 변을 따라 위로 올라감.
  const BR = [88, 88], TR = [88, 12], TL = [12, 12], BL = [12, 88], CEN = [50, 50];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const XY = {};
  for (let k = 1; k <= 4; k++) {
    XY['R' + k] = lerp(BR, TR, k / 5); XY['R' + (k + 5)] = lerp(TR, TL, k / 5);
    XY['R' + (k + 10)] = lerp(TL, BL, k / 5); XY['R' + (k + 15)] = lerp(BL, BR, k / 5);
  }
  XY.R5 = TR; XY.R10 = TL; XY.R15 = BL; XY.R20 = BR;
  XY.A1 = lerp(TR, CEN, 1 / 3); XY.A2 = lerp(TR, CEN, 2 / 3);
  XY.B1 = lerp(CEN, BL, 1 / 3); XY.B2 = lerp(CEN, BL, 2 / 3);
  XY.D1 = lerp(TL, CEN, 1 / 3); XY.D2 = lerp(TL, CEN, 2 / 3);
  XY.E1 = lerp(CEN, BR, 1 / 3); XY.E2 = lerp(CEN, BR, 2 / 3);
  XY.C = CEN;
  XY.start = [97, 97]; XY.goal = [97, 97];
  const CORNER = new Set(['R5', 'R10', 'R15', 'R20']);

  // 길 그래프 (앞으로 가는 방향)
  const NEXT = { start: ['R1'], R20: ['goal'], goal: ['goal'], C: ['B1', 'E1'], A1: ['A2'], A2: ['C'], B1: ['B2'], B2: ['R15'], D1: ['D2'], D2: ['C'], E1: ['E2'], E2: ['R20'] };
  for (let k = 1; k < 20; k++) NEXT['R' + k] = ['R' + (k + 1)];
  NEXT.R5 = ['R6', 'A1']; NEXT.R10 = ['R11', 'D1'];
  // from → to 를 정확히 steps 칸에 가는 길 (route 가 A/B 면 첫 칸은 지름길)
  function pathOf(from, to, steps, route) {
    if (route === 'back' || steps < 0) return [from, to];
    let found = null;
    const walk = (node, left, acc) => {
      if (found) return;
      if (left === 0) { if (node === to) found = acc; return; }
      let nx = NEXT[node] || [];
      if (acc.length === 1 && (node === 'R5' || node === 'R10')) nx = route === 'main' ? nx.slice(0, 1) : nx.slice(1);
      for (const n of nx) walk(n, left - 1, acc.concat(n));
    };
    walk(from, steps, [from]);
    if (found && to === 'goal') { const i = found.indexOf('goal'); found = found.slice(0, i + 1); }
    return found || [from, to];
  }

  const THEMES = {
    hanji: { paper: '#f1e5c6', paper2: '#e2cf9f', ink: '#3b2a1c', rule: '#8a5a32', accent: '#c0303f', gold: '#c9952b', noise: .11, wm: .13, band: null },
    dancheong: { paper: '#ece0c0', paper2: '#d9c899', ink: '#1d3f4a', rule: '#1d3f4a', accent: '#c0303f', gold: '#d9a62e', noise: .09, wm: .12, band: ['#2d6b5f', '#c0303f', '#d9a62e', '#1d3f4a'] },
    night: { paper: '#1c2846', paper2: '#121b33', ink: '#e8d39a', rule: '#c9a85a', accent: '#ffcf5a', gold: '#f0c75e', noise: .07, wm: .2, band: null, night: true },
  };

  // opts: { theme, options:[{id,from,to,route}], steps }
  function boardSVG(opts) {
    const tk = (opts.theme in THEMES) ? opts.theme : 'hanji';
    const T = THEMES[tk];
    const options = opts.options || [];
    const [nr, ng, nb] = T.night ? [1, 1, 1] : [.3, .2, .1];
    let defs = `<filter id="fib-${tk}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.6 .35" numOctaves="2" seed="7"/>
        <feColorMatrix values="0 0 0 0 ${nr}  0 0 0 0 ${ng}  0 0 0 0 ${nb}  0 0 0 ${T.noise * 3} 0"/></filter>
      <radialGradient id="nd-${tk}" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="${T.night ? '#3a4a78' : '#fffaf0'}"/><stop offset="1" stop-color="${T.paper2}"/></radialGradient>
      <radialGradient id="gd-${tk}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff2c4"/><stop offset=".55" stop-color="${T.gold}"/><stop offset="1" stop-color="${dark(T.gold, .35)}"/></radialGradient>
      <radialGradient id="vg-${tk}" cx=".5" cy=".5" r=".72"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${T.night ? .45 : .22}"/></radialGradient>
      <filter id="glow-${tk}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    let frame = `<rect width="100" height="100" fill="${T.paper}"/>`;
    if (T.band) {
      const [g, r, y, b] = T.band;
      defs += `<pattern id="band-${tk}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${g}"/>
        <path d="M4 .6 L7.4 4 L4 7.4 L.6 4Z" fill="${y}"/><circle cx="4" cy="4" r="1.3" fill="${r}"/><path d="M0 0 L1.6 0 L0 1.6Z M8 0 L6.4 0 L8 1.6Z M0 8 L1.6 8 L0 6.4Z M8 8 L6.4 8 L8 6.4Z" fill="${b}"/></pattern>`;
      frame += `<path d="M0 0H100V100H0Z M4.2 4.2V95.8H95.8V4.2Z" fill-rule="evenodd" fill="url(#band-${tk})"/>`;
    }
    // 일월오봉도 밑그림: 해·달·다섯 봉우리·물결·소나무
    const wm = T.wm;
    frame += `<g opacity="${wm}">
      <circle cx="27" cy="27" r="6.5" fill="${T.night ? '#ffb48a' : '#c0303f'}"/>
      <circle cx="73" cy="27" r="5.6" fill="${T.night ? '#fff6d6' : '#f7f2e4'}" stroke="${T.ink}" stroke-width=".4"/>
      <path d="M6 86 L18 60 L26 70 L38 46 L50 62 L62 44 L74 70 L82 58 L94 86 Z" fill="${T.night ? '#6f86c4' : '#2d6b5f'}"/>
      <path d="M38 46 L42 54 L35 54Z M62 44 L66 52 L58 52Z" fill="${T.night ? '#dfe8ff' : '#f7f2e4'}"/>
      <g fill="none" stroke="${T.night ? '#9fb4ea' : '#2b5f8a'}" stroke-width=".9" stroke-linecap="round">
        ${[88, 91.5].map(y => `<path d="M6 ${y} q4 -3 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0"/>`).join('')}</g>
      <g fill="${T.night ? '#8fb08a' : '#3e5d2a'}"><path d="M10 84 l3 -9 l3 9z M11 78 l2 -6 l2 6z"/><path d="M84 84 l3 -9 l3 9z M85 78 l2 -6 l2 6z"/></g></g>`;
    frame += `<rect width="100" height="100" filter="url(#fib-${tk})" opacity=".9"/><rect width="100" height="100" fill="url(#vg-${tk})"/>`;
    frame += `<rect x="5.6" y="5.6" width="88.8" height="88.8" fill="none" stroke="${T.rule}" stroke-width=".5" opacity=".85"/>
      <rect x="6.7" y="6.7" width="86.6" height="86.6" fill="none" stroke="${T.gold}" stroke-width=".25" opacity=".9"/>`;

    // 선: 먹선 + 아래쪽에 옅은 그림자를 깔아 도톰하게
    const sq = `M${BR} L${TR} L${TL} L${BL} Z`, dg = `M${TR} L${BL} M${TL} L${BR}`;
    const lines = `<g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="${sq}" stroke="${T.night ? '#000' : '#7a5a3a'}" stroke-width="1.9" opacity=".18" transform="translate(.35 .45)"/>
      <path d="${dg}" stroke="${T.night ? '#000' : '#7a5a3a'}" stroke-width="1.3" opacity=".16" transform="translate(.35 .45)"/>
      <path d="${sq}" stroke="${T.ink}" stroke-width="1.05"/><path d="${dg}" stroke="${T.ink}" stroke-width=".65"/></g>`;

    // 칸
    const taegeuk = (x, y, R) => `<circle cx="${x}" cy="${y}" r="${R}" fill="#1f4f9a"/>
      <path d="M${x - R} ${y} A${R} ${R} 0 0 1 ${x + R} ${y} A${R / 2} ${R / 2} 0 0 1 ${x} ${y} A${R / 2} ${R / 2} 0 0 0 ${x - R} ${y}Z" fill="#c0303f"/>`;
    const nodes = Object.keys(XY).filter(n => n !== 'start' && n !== 'goal').map(n => {
      const [x, y] = XY[n];
      if (n === 'C') {
        return `<circle cx="${x}" cy="${y}" r="5" fill="url(#gd-${tk})" stroke="${T.ink}" stroke-width=".5"/>
          <circle cx="${x}" cy="${y}" r="3.9" fill="${T.paper}"/>${taegeuk(x, y, 3.3)}
          <circle cx="${x}" cy="${y}" r="3.3" fill="none" stroke="${T.ink}" stroke-width=".3"/>`;
      }
      if (CORNER.has(n)) {
        const petals = [0, 45, 90, 135, 180, 225, 270, 315].map(a =>
          `<ellipse cx="${x}" cy="${y - 1.75}" rx=".75" ry="1.3" fill="${a % 90 ? T.gold : T.accent}" opacity=".9" transform="rotate(${a} ${x} ${y})"/>`).join('');
        return `<circle cx="${x}" cy="${y}" r="4.4" fill="url(#gd-${tk})" stroke="${T.ink}" stroke-width=".55"/>
          <circle cx="${x}" cy="${y}" r="3.35" fill="url(#nd-${tk})" stroke="${T.ink}" stroke-width=".3"/>${petals}
          <circle cx="${x}" cy="${y}" r=".75" fill="${T.gold}" stroke="${T.ink}" stroke-width=".2"/>`;
      }
      return `<circle cx="${x}" cy="${y + .35}" r="2.45" fill="#000" opacity=".13"/>
        <circle cx="${x}" cy="${y}" r="2.4" fill="url(#nd-${tk})" stroke="${T.ink}" stroke-width=".55"/>
        <path d="M${x - 1.4} ${y - .8} a1.7 1.7 0 0 1 2 -1" stroke="#fff" stroke-width=".4" fill="none" opacity=".7" stroke-linecap="round"/>`;
    }).join('');
    // 출발 낙관(붉은 도장)
    const seal = `<g transform="translate(75.2 81)"><rect width="5.4" height="5.2" rx=".7" fill="${T.night ? '#c0303f' : '#b3202f'}" opacity=".92"/>
      <rect x=".5" y=".5" width="4.4" height="4.2" rx=".4" fill="none" stroke="#fde8d0" stroke-width=".25"/>
      <text x="2.7" y="3.45" font-size="2" text-anchor="middle" fill="#fff3e2" font-family="Pretendard, sans-serif" font-weight="800">출발</text></g>`;

    // 내 차례: 갈 길(점선 흐름) · 옮길 말 · 갈 자리
    const paths = options.map(o => {
      const p = pathOf(o.from, o.to, opts.steps, o.route).map(n => XY[n]);
      return `<polyline class="route" points="${p.map(q => q.join(',')).join(' ')}" fill="none" stroke="${T.accent}" stroke-width=".9" stroke-dasharray="1.6 1.4" stroke-linecap="round" opacity=".85"/>`;
    }).join('');
    const seenTo = new Set();
    const targets = options.map((o, i) => {
      const key = o.to;
      if (seenTo.has(key)) return '';
      seenTo.add(key);
      const [x, y] = o.to === 'goal' ? [93.5, 93.5] : XY[o.to];
      return `<g class="tg" data-opt="${o.id}" tabindex="0" role="button" aria-label="${i + 1}번으로 옮기기">
        <circle cx="${x}" cy="${y}" r="6.4" fill="${T.accent}" opacity=".18" filter="url(#glow-${tk})"/>
        <circle class="tg-ring" cx="${x}" cy="${y}" r="4.6" fill="none" stroke="${T.accent}" stroke-width=".9"/>
        <circle cx="${x}" cy="${y}" r="2.3" fill="${T.accent}"/>
        <text x="${x}" y="${y + .95}" font-size="2.7" text-anchor="middle" fill="#fff" font-weight="800" font-family="Pretendard, sans-serif">${o.to === 'goal' ? '났' : i + 1}</text></g>`;
    }).join('');

    return `<svg class="board" viewBox="0 0 100 100" role="img" aria-label="윷판"><defs>${defs}</defs>${frame}${lines}${nodes}${seal}<g class="routes">${paths}</g><g class="targets">${targets}</g></svg>`;
  }

  window.Art = { pieceSVG, pieceCells, stickEl, stickFace, boardSVG, pathOf, THEMES, XY, mix, dark, light };
})();
