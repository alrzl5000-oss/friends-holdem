// 그림 모듈 — 말(도트 12×12)만 도트, 판·윷가락·장식은 벡터 그림
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
  // 평평한 면(배): 밝은 속살과 나뭇결. 둥근 면(등): 원통 음영과 옹이.
  // marked=true 인 가락은 배에 X 표시 — 이 가락 하나만 배가 보이면 뒷도.
  function stickFace(wood, flat, marked) {
    const id = 'st' + (++uid);
    if (flat) {
      const grain = [6, 9.5, 13, 16.5].map((x, i) =>
        `<path d="M${x} 6 C${x + (i % 2 ? 1.2 : -1)} 30, ${x + (i % 2 ? -1 : 1.3)} 62, ${x} 90" stroke="${dark(wood, .25)}" stroke-width=".55" fill="none" opacity=".35"/>`).join('');
      const mark = marked
        ? `<g stroke="#2b1a0d" stroke-width="2.2" stroke-linecap="round" opacity=".85"><line x1="7.5" y1="41" x2="16.5" y2="55"/><line x1="16.5" y1="41" x2="7.5" y2="55"/></g>` : '';
      return `<svg viewBox="0 0 24 96" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" x2="1">
        <stop offset="0" stop-color="${mix(wood, '#e9cf9c', .35)}"/><stop offset=".22" stop-color="${light(wood, .55)}"/>
        <stop offset=".55" stop-color="${light(wood, .68)}"/><stop offset=".85" stop-color="${light(wood, .5)}"/><stop offset="1" stop-color="${mix(wood, '#d9b97f', .3)}"/></linearGradient></defs>
        <rect x="1" y="1" width="22" height="94" rx="7" fill="url(#${id})" stroke="${dark(wood, .45)}" stroke-width="1"/>
        ${grain}<rect x="3.2" y="3.5" width="17.6" height="89" rx="5.5" fill="none" stroke="${dark(wood, .2)}" stroke-width=".4" opacity=".4"/>${mark}</svg>`;
    }
    const knots = [[8, 24, 1.6], [15.5, 63, 1.2], [10, 78, .9]].map(([x, y, r]) =>
      `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 2.2}" fill="${dark(wood, .5)}" opacity=".55"/>`).join('');
    return `<svg viewBox="0 0 24 96" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" x2="1">
      <stop offset="0" stop-color="${dark(wood, .55)}"/><stop offset=".2" stop-color="${dark(wood, .15)}"/>
      <stop offset=".38" stop-color="${light(wood, .28)}"/><stop offset=".62" stop-color="${wood}"/><stop offset="1" stop-color="${dark(wood, .6)}"/></linearGradient></defs>
      <rect x="1" y="1" width="22" height="94" rx="11" fill="url(#${id})" stroke="${dark(wood, .6)}" stroke-width="1"/>
      <path d="M8.5 7 C7.5 35, 9 62, 8 89" stroke="${light(wood, .6)}" stroke-width="1.6" fill="none" opacity=".45" stroke-linecap="round"/>
      ${knots}</svg>`;
  }
  // 양면 가락 (3D로 뒤집힘). 바깥에서 rotateY(0)=배, rotateY(180deg)=등
  function stickEl(wood, marked = false) {
    return `<div class="stick"><div class="face f-flat">${stickFace(wood, true, marked)}</div><div class="face f-round">${stickFace(wood, false, marked)}</div></div>`;
  }

  // ---------- 말판 ----------
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
  const BIG = new Set(['R5', 'R10', 'R15', 'R20', 'C']);

  const THEMES = {
    hanji: { paper: '#efe3c4', ink: '#3b2a1c', rule: '#8a5a32', accent: '#a8263a', gold: '#c9952b', noise: .11, band: null },
    dancheong: { paper: '#eadfc0', ink: '#1d3f4a', rule: '#1d3f4a', accent: '#a8263a', gold: '#d9a62e', noise: .09, band: ['#2d6b5f', '#a8263a', '#d9a62e', '#1d3f4a'] },
    night: { paper: '#1c2846', ink: '#e8d39a', rule: '#c9a85a', accent: '#f0c75e', gold: '#f0c75e', noise: .07, band: null, night: true },
  };

  // opts: { theme, players:[{color, skin(art), nodes}], options:[{id,from,to}], pieceArt(skin) }
  function boardSVG(opts) {
    const T = THEMES[opts.theme] || THEMES.hanji;
    const tk = opts.theme in THEMES ? opts.theme : 'hanji';
    const players = opts.players || [], options = opts.options || [];
    const noiseTint = T.night ? '1 1 1' : '.3 .2 .1';
    const [nr, ng, nb] = noiseTint.split(' ');
    let defs = `<filter id="fib-${tk}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.6 .35" numOctaves="2" seed="7"/>
      <feColorMatrix values="0 0 0 0 ${nr}  0 0 0 0 ${ng}  0 0 0 0 ${nb}  0 0 0 ${T.noise * 3} 0"/></filter>`;
    let frame = `<rect width="100" height="100" fill="${T.paper}"/>`;
    if (T.band) {
      const [g, r, y, b] = T.band;
      defs += `<pattern id="band-${tk}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${g}"/>
        <path d="M4 .6 L7.4 4 L4 7.4 L.6 4Z" fill="${y}"/><circle cx="4" cy="4" r="1.3" fill="${r}"/><path d="M0 0 L1.6 0 L0 1.6Z M8 0 L6.4 0 L8 1.6Z M0 8 L1.6 8 L0 6.4Z M8 8 L6.4 8 L8 6.4Z" fill="${b}"/></pattern>`;
      frame += `<path d="M0 0H100V100H0Z M4.2 4.2V95.8H95.8V4.2Z" fill-rule="evenodd" fill="url(#band-${tk})"/>`;
    }
    if (T.night) {
      frame += Array.from({ length: 34 }, (_, i) => {
        const x = (i * 41 + 7) % 92 + 4, y = (i * 59 + 13) % 92 + 4;
        return `<circle cx="${x}" cy="${y}" r="${i % 5 ? .22 : .45}" fill="#fff6d2" opacity="${.35 + (i % 4) * .14}"/>`;
      }).join('');
    }
    frame += `<rect width="100" height="100" filter="url(#fib-${tk})" opacity=".9"/>`;
    // 안쪽 이중 테
    frame += `<rect x="5.6" y="5.6" width="88.8" height="88.8" fill="none" stroke="${T.rule}" stroke-width=".45" opacity=".8"/>
      <rect x="6.6" y="6.6" width="86.8" height="86.8" fill="none" stroke="${T.rule}" stroke-width=".18" opacity=".7"/>`;

    // 선: 바깥 네모 + 두 대각선
    const lines = `<g stroke="${T.ink}" stroke-linecap="round" fill="none">
      <path d="M${BR} L${TR} L${TL} L${BL} Z" stroke-width=".9"/>
      <path d="M${TR} L${BL} M${TL} L${BR}" stroke-width=".55"/></g>`;

    // 칸
    const nodes = Object.keys(XY).map(n => {
      const [x, y] = XY[n];
      if (BIG.has(n)) {
        return `<circle cx="${x}" cy="${y}" r="3.7" fill="${T.paper}" stroke="${T.ink}" stroke-width=".7"/>
          <circle cx="${x}" cy="${y}" r="2.55" fill="none" stroke="${T.ink}" stroke-width=".35"/>
          ${n === 'C' ? `<circle cx="${x}" cy="${y}" r=".9" fill="${T.accent}"/>` : ''}`;
      }
      return `<circle cx="${x}" cy="${y}" r="2.25" fill="${T.paper}" stroke="${T.ink}" stroke-width=".55"/>`;
    }).join('');
    const startMark = `<g font-family="'Song Myung', serif" font-size="2.9" fill="${T.accent}" text-anchor="middle">
      <text x="${BR[0] - 7.6}" y="${BR[1] - 3.2}">출발</text>
      <path d="M${BR[0] - 4.6} ${BR[1] - 4.2} q 1.6 -.2 2.4 -1.6" stroke="${T.accent}" stroke-width=".4" fill="none"/></g>`;

    // 내 차례: 옮길 수 있는 말 / 갈 자리
    const fromSet = new Set(options.map(o => o.from));
    const fromMarks = [...fromSet].filter(n => XY[n]).map(n => {
      const [x, y] = XY[n];
      return `<circle cx="${x}" cy="${y}" r="5.6" fill="none" stroke="${T.accent}" stroke-width=".45" stroke-dasharray="1.2 1"/>`;
    }).join('');
    const seenTo = new Set();
    const targets = options.map((o, i) => {
      if (!XY[o.to] || seenTo.has(o.to)) return '';
      seenTo.add(o.to);
      const [x, y] = XY[o.to];
      return `<g class="tg" data-opt="${o.id}" tabindex="0" role="button" aria-label="${i + 1}번 자리로 옮기기">
        <circle cx="${x}" cy="${y}" r="5.4" fill="${T.accent}" opacity=".16"/>
        <circle class="tg-ring" cx="${x}" cy="${y}" r="4.4" fill="none" stroke="${T.accent}" stroke-width=".8"/>
        ${options.length > 1 ? `<text x="${x}" y="${y + 1.1}" font-size="3.2" text-anchor="middle" fill="${T.accent}" font-weight="700">${i + 1}</text>` : ''}</g>`;
    }).join('');

    // 말: 칸마다 플레이어별로 묶어 한 개로 그리고, 업힌 수는 숫자로
    const groups = {};
    players.forEach((pl, pi) => pl.nodes.forEach(n => {
      if (!XY[n]) return;
      const g = (groups[n] = groups[n] || {});
      (g[pi] = g[pi] || { pl, count: 0 }).count++;
    }));
    const tokens = Object.keys(groups).map(n => {
      const list = Object.values(groups[n]);
      return list.map((g, i) => {
        const [bx, by] = XY[n];
        const x = bx + (list.length > 1 ? (i - (list.length - 1) / 2) * 6 : 0), y = by;
        const art = opts.pieceArt(g.pl.skin);
        return `<g class="tok"><circle cx="${x}" cy="${y + .5}" r="4.4" fill="#000" opacity=".22"/>
          <circle cx="${x}" cy="${y}" r="4.3" fill="${g.pl.color}" stroke="${T.night ? '#0d1428' : '#2b1d12'}" stroke-width=".45"/>
          <svg x="${x - 3.4}" y="${y - 3.4}" width="6.8" height="6.8" viewBox="0 0 12 12" shape-rendering="crispEdges">${cellRects(art)}</svg>
          ${g.count > 1 ? `<g><circle cx="${x + 3.6}" cy="${y - 3.4}" r="1.9" fill="#2b1d12"/><text x="${x + 3.6}" y="${y - 2.45}" font-size="2.5" text-anchor="middle" fill="#fff4dc" font-weight="700">${g.count}</text></g>` : ''}</g>`;
      }).join('');
    }).join('');

    return `<svg class="board" viewBox="0 0 100 100" role="img" aria-label="윷판"><defs>${defs}</defs>${frame}${lines}${nodes}${startMark}${fromMarks}${tokens}${targets}</svg>`;
  }

  window.Art = { pieceSVG, pieceCells, stickEl, stickFace, boardSVG, THEMES, XY, mix, dark, light };
})();
