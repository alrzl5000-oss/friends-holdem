// 도트 프로필 (16x16, 16색)
const PIXEL_PALETTE = [
  null, '#141414', '#ffffff', '#e23b3b', '#ff8a3d', '#ffd23f', '#3fbf5f', '#2a9df4',
  '#7a4fd6', '#ff6fae', '#8b5a2b', '#f2c79b', '#9aa3ad', '#1f3b73', '#5de0d1', '#fdfdf0',
];

const avatarCache = new Map();
function avatarURL(str) {
  str = /^[0-9a-f]{256}$/.test(str || '') ? str : '0'.repeat(256);
  if (avatarCache.has(str)) return avatarCache.get(str);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 256; i++) {
    const col = PIXEL_PALETTE[parseInt(str[i], 16)];
    if (!col) continue;
    g.fillStyle = col;
    g.fillRect((i % 16) * 4, Math.floor(i / 16) * 4, 4, 4);
  }
  const url = c.toDataURL();
  avatarCache.set(str, url);
  return url;
}

class PixelEditor {
  // opts: { size: 칸 수(기본 16), mask: (x, y) => 칠할 수 있는 칸이면 true }
  constructor(canvas, paletteEl, opts = {}) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.n = opts.size || 16;
    this.mask = opts.mask || null;
    this.under = opts.under || null; // { img, x0, size } — 칸 단위로 밑에 깔 그림 (프로필)
    this.px = new Array(this.n * this.n).fill(0);
    this.color = 1;
    this.tool = 'pen';
    this.mirror = false;
    this.undo = [];
    this.drawing = false;
    this.buildPalette(paletteEl);
    const at = e => {
      const r = this.c.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / r.width * this.n);
      const y = Math.floor((e.clientY - r.top) / r.height * this.n);
      return x >= 0 && x < this.n && y >= 0 && y < this.n ? [x, y] : null;
    };
    this.c.addEventListener('pointerdown', e => {
      e.preventDefault();
      const p = at(e); if (!p) return;
      this.undo.push(this.px.slice());
      if (this.undo.length > 50) this.undo.shift();
      if (this.tool === 'fill') { this.fill(p[0], p[1]); return; }
      this.drawing = true;
      this.c.setPointerCapture(e.pointerId);
      this.paint(p[0], p[1]);
    });
    this.c.addEventListener('pointermove', e => {
      if (!this.drawing) return;
      const p = at(e); if (p) this.paint(p[0], p[1]);
    });
    const stop = () => { this.drawing = false; };
    this.c.addEventListener('pointerup', stop);
    this.c.addEventListener('pointercancel', stop);
  }
  ok(x, y) { return !this.mask || this.mask(x, y); }
  buildPalette(el) {
    el.innerHTML = '';
    PIXEL_PALETTE.forEach((col, i) => {
      const b = document.createElement('button');
      b.className = 'sw' + (i === this.color ? ' on' : '') + (col ? '' : ' eraser');
      if (col) b.style.background = col;
      b.title = col ? col : '지우개';
      b.onclick = () => {
        this.color = i;
        el.querySelectorAll('.sw').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      };
      el.appendChild(b);
    });
  }
  load(str) {
    const len = this.n * this.n;
    this.px = new RegExp('^[0-9a-f]{' + len + '}$').test(str || '') ? [...str].map(h => parseInt(h, 16)) : new Array(len).fill(0);
    this.undo = [];
    this.draw();
  }
  value() { return this.px.map(v => v.toString(16)).join(''); }
  set(x, y) {
    if (this.ok(x, y)) this.px[y * this.n + x] = this.color;
    const mx = this.n - 1 - x;
    if (this.mirror && this.ok(mx, y)) this.px[y * this.n + mx] = this.color;
  }
  paint(x, y) { this.set(x, y); this.draw(); }
  fill(x, y) {
    if (!this.ok(x, y)) return;
    const n = this.n, target = this.px[y * n + x];
    if (target === this.color) return;
    const st = [[x, y]];
    while (st.length) {
      const [a, b] = st.pop();
      if (a < 0 || a >= n || b < 0 || b >= n || !this.ok(a, b) || this.px[b * n + a] !== target) continue;
      this.px[b * n + a] = this.color;
      st.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
    }
    this.draw();
  }
  back() { if (this.undo.length) { this.px = this.undo.pop(); this.draw(); } }
  clear() { this.undo.push(this.px.slice()); this.px.fill(0); this.draw(); }
  draw() {
    const g = this.g, n = this.n, s = this.c.width / n;
    g.clearRect(0, 0, this.c.width, this.c.height);
    const u = this.under;
    const inU = (cx, cy) => u && cx >= u.x0 && cx < u.x0 + u.size && cy >= u.x0 && cy < u.x0 + u.size;
    if (u) { g.fillStyle = '#15231d'; g.fillRect(u.x0 * s, u.x0 * s, u.size * s, u.size * s); if (u.img.complete) { g.imageSmoothingEnabled = false; g.drawImage(u.img, u.x0 * s, u.x0 * s, u.size * s, u.size * s); } }
    for (let i = 0; i < n * n; i++) {
      const cx = i % n, cy = Math.floor(i / n), x = cx * s, y = cy * s;
      if (!this.ok(cx, cy)) { g.fillStyle = inU(cx, cy) ? 'rgba(0,0,0,.35)' : '#070d0a'; g.fillRect(x, y, s, s); continue; }
      const col = PIXEL_PALETTE[this.px[i]];
      if (col) { g.fillStyle = col; g.fillRect(x, y, s, s); }
      else if (!inU(cx, cy)) { g.fillStyle = (cx + cy) % 2 ? '#20302a' : '#1a2822'; g.fillRect(x, y, s, s); }
    }
    g.strokeStyle = 'rgba(255,255,255,.06)';
    g.lineWidth = 1;
    for (let k = 1; k < n; k++) {
      g.beginPath(); g.moveTo(k * s + .5, 0); g.lineTo(k * s + .5, this.c.height); g.stroke();
      g.beginPath(); g.moveTo(0, k * s + .5); g.lineTo(this.c.width, k * s + .5); g.stroke();
    }
    if (this.mirror) {
      g.strokeStyle = 'rgba(233,196,106,.5)';
      g.beginPath(); g.moveTo(this.c.width / 2, 0); g.lineTo(this.c.width / 2, this.c.height); g.stroke();
    }
  }
}

// ===== 도트 테두리: 32x32 네모 판 =====
// 가운데 22x22(5~26칸)에 프로필이 들어가고, 그 위에 테두리 그림을 덮어 그림
// 커스텀 테두리는 얼굴 부분(가운데 16x16, 8~23칸)만 빼고 어디든 칠할 수 있음
const FRAME_N = 32;
const AV_WIN = [5, 26];
function frameMask(x, y) { return !(x >= 8 && x <= 23 && y >= 8 && y <= 23); }
function spriteURL(frames) {
  const n = FRAME_N, S = 4;
  const c = document.createElement('canvas');
  c.width = n * S; c.height = n * S * frames.length;
  const g = c.getContext('2d');
  frames.forEach((px, f) => {
    for (let i = 0; i < n * n; i++) {
      if (!px[i]) continue;
      g.fillStyle = px[i];
      g.fillRect((i % n) * S, (Math.floor(i / n) + f * n) * S, S, S);
    }
  });
  return c.toDataURL();
}
const frameCache = new Map();
function frameURL(str) {
  if (!/^[0-9a-f]{1024}$/.test(str || '')) return '';
  if (frameCache.has(str)) return frameCache.get(str);
  const px = [...str].map((h, i) => frameMask(i % FRAME_N, Math.floor(i / FRAME_N)) ? PIXEL_PALETTE[parseInt(h, 16)] : null);
  const url = spriteURL([px]);
  frameCache.set(str, url);
  return url;
}

// ----- 그리기 도구 -----
const PF = (() => {
  const N = FRAME_N;
  const grid = () => new Array(N * N).fill(null);
  const set = (g, x, y, c) => { if (x >= 0 && x < N && y >= 0 && y < N && c) g[y * N + x] = c; };
  const rect = (g, x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(g, x, y, c); };
  const depth = (x, y) => Math.min(x, y, N - 1 - x, N - 1 - y);
  // 네모 띠: 바깥에서 d0~d1 칸 깊이, fn(x, y, d) 가 색을 돌려줌
  const band = (g, d0, d1, fn) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const d = depth(x, y); if (d >= d0 && d <= d1) set(g, x, y, typeof fn === 'function' ? fn(x, y, d) : fn); } };
  // 문자 그림: rows 의 글자를 pal 색으로 (점은 빈칸)
  const spr = (g, x0, y0, rows, pal) => rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) set(g, x0 + x, y0 + y, pal[ch]); }));
  const copy = g => g.slice();
  const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;
  // 대각선 빛줄기: f번째 장(전체 n장)에서 칠해진 칸 중 줄기 위치를 밝게
  const shine = (g, f, n, col = '#ffffff') => {
    const out = g.slice(), pos = -8 + f * (80 / n);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const k = x + y - pos;
      if (g[y * N + x] && k >= 0 && k < 3) out[y * N + x] = k === 1 ? col : '#fff6d0';
    }
    return out;
  };
  return { N, grid, set, rect, depth, band, spr, copy, hsl, shine };
})();

const PF_SUIT = {
  s: ['..x..', '.xxx.', 'xxxxx', 'xxxxx', '..x..'],
  h: ['.x.x.', 'xxxxx', 'xxxxx', '.xxx.', '..x..'],
  d: ['..x..', '.xxx.', 'xxxxx', '.xxx.', '..x..'],
  c: ['.xxx.', '.xxx.', 'xxxxx', 'xxxxx', '..x..'],
};

// 테두리 디자인: id → 프레임 배열 (1~2장, 2장이면 번갈아 깜빡임)
const PIXEL_FRAMES = {
  // 황제: 입체 금테 + 모서리 보석 장식 + 큰 왕관
  a_emperor() {
    const g = PF.grid();
    const lit = (x, y) => x + y < 31; // 위·왼쪽은 밝게, 아래·오른쪽은 어둡게
    PF.band(g, 0, 5, (x, y, d) => d === 0 || d === 5 ? '#4a3000' : (lit(x, y) ? ['', '#fff6d0', '#ffe08a', '#e9c46a', '#c99a2e'] : ['', '#e9c46a', '#c99a2e', '#a8770f', '#7a560a'])[d]);
    PF.band(g, 2, 2, (x, y) => ((x + y) % 3 === 0 ? '#fffbe8' : null));
    const corner = (x0, y0) => {
      PF.rect(g, x0, y0, x0 + 6, y0 + 6, '#4a3000');
      PF.rect(g, x0 + 1, y0 + 1, x0 + 5, y0 + 5, '#ffd23f');
      PF.spr(g, x0 + 1, y0 + 1, ['..R..', '.RRR.', 'RRWRR', '.RRR.', '..R..'], { R: '#c81d25', W: '#ffffff' });
    };
    corner(0, 0); corner(25, 0); corner(0, 25); corner(25, 25);
    for (const [x, y, c] of [[2, 15, '#2a9df4'], [29, 15, '#2a9df4'], [15, 29, '#3fbf5f'], [16, 29, '#3fbf5f']]) { PF.rect(g, x - 1, y - 1, x + 1, y + 2, '#4a3000'); PF.set(g, x, y, c); PF.set(g, x, y + 1, c); }
    PF.spr(g, 7, 0, [
      '..W.....W.....W..',
      '.WYW...WYW...WYW.',
      '.KYK..KYYK..KYK..',
      '.KYYKKYYYYKKYYK..',
      '.KYYYYYYYYYYYYK..',
      '.KYRYYYBYYYRYYK..',
      '.KKKKKKKKKKKKKK..',
    ].map(r => r.slice(0, 17)), { K: '#4a3000', Y: '#ffd23f', R: '#e23b3b', B: '#2a9df4', W: '#fffbe8' });
    return [0, 1, 2, 3, 4, 5, 6, 7].map(f => {
      const fr = PF.shine(g, f, 8);
      if (f % 2) for (const [x, y] of [[9, 0], [15, 0], [21, 0], [3, 3], [28, 28], [3, 28], [28, 3]]) PF.set(fr, x, y, '#ffffff');
      return fr;
    });
  },
  // 용: 붉은 비늘 + 큰 뿔 + 눈 + 아래에서 타오르는 불꽃
  a_dragon() {
    const base = () => {
      const g = PF.grid();
      PF.band(g, 1, 4, (x, y, d) => d === 1 ? '#2a0400' : ((x * 2 + y) % 5 === 0 ? '#ffb300' : (x + y * 2) % 3 === 0 ? '#ff5a1f' : '#9e1a08'));
      PF.band(g, 5, 5, '#2a0400');
      // 뿔: 모서리에서 바깥쪽으로 굵게
      for (let k = 0; k < 7; k++) {
        const x = 7 - k, y = 7 - k, c = k > 4 ? '#fdfdf0' : k > 2 ? '#f2c79b' : '#c99a6b';
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) { PF.set(g, x + dx, y + dy, c); PF.set(g, 31 - x - dx, y + dy, c); }
      }
      // 눈
      for (const x0 of [10, 18]) PF.spr(g, x0, 1, ['YYYY', 'YKKY', 'YYYY'], { Y: '#ffd23f', K: '#141414' });
      return g;
    };
    const fire = (g, off) => {
      for (let x = 0; x < 32; x++) {
        const h = 3 + [0, 2, 4, 1, 3, 5, 2, 0, 3, 1][(x + off * 3) % 10];
        for (let k = 0; k < h; k++) PF.set(g, x, 31 - k, k >= h - 1 ? '#fff3a0' : k >= h - 2 ? '#ffd23f' : k > 1 ? '#ff8a1f' : '#ff3b0b');
      }
    };
    return [0, 1, 2, 3].map(f => {
      const g = base(); fire(g, f);
      if (f === 3) for (const x0 of [10, 18]) PF.rect(g, x0, 1, x0 + 3, 3, '#9e1a08'), PF.rect(g, x0, 2, x0 + 3, 2, '#2a0400');
      return g;
    });
  },
  // 반반: 왼쪽 흰색, 오른쪽 검정 + 위아래 태극
  a_half() {
    const g = PF.grid();
    PF.band(g, 0, 4, (x, y, d) => d === 0 ? '#5a5f66' : (x < 16 ? ((x + y) % 6 === 0 ? '#c8ccd2' : '#ffffff') : ((x + y) % 6 === 0 ? '#3a3a3a' : '#141414')));
    PF.band(g, 5, 5, '#5a5f66');
    const yy = ['..KKWW..', '.KKKWWW.', 'KKWKWWKW', 'KKKKWWWW', 'KKKKWWWW', 'KWKKWWKW', '.KKKWWW.', '..KKWW..'].map(r => r.split('').reverse().join(''));
    PF.spr(g, 12, 0, yy, { K: '#141414', W: '#ffffff' });
    PF.spr(g, 12, 24, yy.slice().reverse(), { K: '#141414', W: '#ffffff' });
    return [g];
  },
  // 시즌2 챔피언: 무지개 띠 + 별 + 월계수
  s2_champ() {
    const make = shift => {
      const g = PF.grid();
      PF.band(g, 1, 4, (x, y, d) => d === 1 ? '#1f1440' : PF.hsl((Math.atan2(y - 15.5, x - 15.5) * 180 / Math.PI + 360 + shift) % 360, 85, d === 2 ? 72 : d === 3 ? 60 : 48));
      PF.spr(g, 13, 0, ['...Y...', '..YYY..', 'YYYWYYY', '.YYYYY.', '.YY.YY.', 'Y.....Y'].map(r => r.slice(0, 7)), { Y: '#ffd23f', W: '#ffffff' });
      // 월계수 (양옆)
      for (let k = 0; k < 6; k++) {
        const y = 9 + k * 3;
        for (const [x, c] of [[0, '#2fb874'], [1, '#3fbf5f']]) { PF.set(g, x, y, c); PF.set(g, 31 - x, y, c); }
        PF.set(g, 1, y + 1, '#1d8a54'); PF.set(g, 30, y + 1, '#1d8a54');
      }
      return g;
    };
    return [0, 1, 2, 3, 4, 5].map(f => {
      const fr = PF.shine(make(f * 60), f, 6);
      for (const [x, y] of [[2, 2], [29, 29], [29, 2], [2, 29]]) if ((f + x) % 2) PF.set(fr, x, y, '#ffffff');
      PF.set(fr, 16, 2, f % 2 ? '#ffffff' : '#ffd23f');
      return fr;
    });
  },
  // 에이스: 카드 테두리 + 네 무늬
  a_aceframe() {
    const g = PF.grid();
    PF.band(g, 0, 4, (x, y, d) => d === 0 ? '#141414' : d === 4 ? '#c8c6c4' : '#fdfdf0');
    const A = ['.x.', 'x.x', 'xxx', 'x.x'];
    PF.spr(g, 1, 1, A, { x: '#e23b3b' }); PF.spr(g, 28, 1, A, { x: '#141414' });
    PF.spr(g, 1, 27, A, { x: '#141414' }); PF.spr(g, 28, 27, A, { x: '#e23b3b' });
    const suits = [[13, 0, 's', '#141414'], [27, 13, 'h', '#e23b3b'], [13, 27, 'd', '#e23b3b'], [0, 13, 'c', '#141414']];
    return [0, 1, 2, 3].map(f => {
      const fr = PF.copy(g);
      suits.forEach(([x, y, k, c], i) => PF.spr(fr, x, y, PF_SUIT[k], { x: i === f ? '#ffd23f' : c }));
      return PF.shine(fr, f, 4, '#fff3a0');
    });
  },
  // 역전: 아래는 어둡고 위로 갈수록 금빛 + 올라가는 화살표
  a_upframe() {
    const make = off => {
      const g = PF.grid();
      const ramp = ['#2b2f33', '#3d4247', '#5a5f45', '#8b7a2c', '#c99a2e', '#e9c46a', '#ffe08a', '#fff3c4'];
      PF.band(g, 1, 4, (x, y, d) => d === 1 ? '#141414' : ramp[Math.min(7, Math.floor((31 - y) / 4))]);
      for (let k = -1; k < 5; k++) {
        const y = 24 - k * 6 - off;
        for (const x0 of [1, 27]) PF.spr(g, x0, y, ['..x..', '.xxx.', 'x.x.x', '..x..'], { x: '#3fbf5f' });
      }
      return g;
    };
    return [0, 1, 2, 3, 4, 5].map(make);
  },
  // 누더기: 해진 갈색 천 + 덧댄 천 조각 + 바느질
  a_rags() {
    const g = PF.grid();
    PF.band(g, 1, 4, (x, y, d) => ((x * 13 + y * 7) % 11 === 0 ? null : d === 1 ? '#3b2412' : ((x * 3 + y * 5) % 7 === 0 ? '#6b4423' : '#8b5a2b')));
    const patch = (x0, y0, x1, y1, c) => {
      PF.rect(g, x0, y0, x1, y1, c);
      for (let x = x0; x <= x1; x += 2) { PF.set(g, x, y0, '#fdfdf0'); PF.set(g, x, y1, '#fdfdf0'); }
      for (let y = y0; y <= y1; y += 2) { PF.set(g, x0, y, '#fdfdf0'); PF.set(g, x1, y, '#fdfdf0'); }
    };
    patch(0, 0, 6, 5, '#2a9df4'); patch(24, 26, 31, 31, '#ff6fae'); patch(26, 9, 31, 14, '#3fbf5f');
    // 구멍 + 실밥
    for (const [x, y] of [[14, 1], [15, 2], [16, 1], [3, 20], [4, 21]]) PF.set(g, x, y, null);
    for (const [x, y] of [[13, 0], [17, 0], [2, 19], [5, 22]]) PF.set(g, x, y, '#c8c6c4');
    return [g];
  },
  // ----- 상점 테두리 -----
  // 원목 액자
  f_wood() {
    const g = PF.grid();
    PF.band(g, 0, 4, (x, y, d) => d === 0 ? '#2b1608' : d === 4 ? '#3b2412' : ((d === 1 || (x * 7 + y * 3) % 9 === 0) ? '#6b4423' : (x + y) % 5 === 0 ? '#a0703c' : '#8b5a2b'));
    PF.band(g, 5, 5, '#2b1608');
    for (const [x, y] of [[2, 2], [29, 2], [2, 29], [29, 29]]) { PF.set(g, x, y, '#ffd23f'); PF.set(g, x + 1, y + 1, '#8a6412'); }
    return [g];
  },
  // 네온 사인
  f_neon() {
    const g = PF.grid();
    PF.band(g, 0, 5, (x, y, d) => d === 1 ? '#ff6fae' : d === 2 ? '#ffd0e6' : d === 4 ? '#5de0d1' : '#0b0b14');
    for (const [x, y] of [[8, 1], [9, 1], [22, 30], [23, 30], [1, 20], [30, 11]]) PF.set(g, x, y, '#0b0b14'); // 끊긴 네온관
    return [g];
  },
  // 벚꽃
  f_sakura() {
    const g = PF.grid();
    PF.band(g, 0, 4, (x, y, d) => d === 0 ? '#c2577f' : ((x * 5 + y * 3) % 7 === 0 ? '#ffd6e7' : '#ffb3d1'));
    PF.band(g, 5, 5, '#c2577f');
    const flower = (x, y) => { PF.spr(g, x - 1, y - 1, ['.P.', 'PYP', '.P.'], { P: '#ffffff', Y: '#ffd23f' }); };
    for (const [x, y] of [[3, 2], [11, 2], [20, 3], [28, 2], [2, 10], [29, 13], [3, 21], [28, 24], [8, 29], [17, 28], [25, 29]]) flower(x, y);
    PF.spr(g, 0, 0, ['BB....', 'B.B...', '...B..'], { B: '#6b4423' });
    return [g];
  },
  // 얼음 결정 + 고드름
  f_ice() {
    const g = PF.grid();
    PF.band(g, 0, 4, (x, y, d) => d === 0 ? '#3d7be0' : d === 1 ? '#bfefff' : ((x + y) % 4 === 0 ? '#ffffff' : '#8fd3f0'));
    for (const [x, h] of [[7, 3], [10, 5], [14, 2], [18, 4], [22, 6], [25, 3]]) for (let k = 0; k < h; k++) PF.set(g, x, 5 + k, k === h - 1 ? '#ffffff' : '#bfefff');
    const flake = (x, y) => PF.spr(g, x - 2, y - 2, ['W.W.W', '.WWW.', 'WWBWW', '.WWW.', 'W.W.W'], { W: '#ffffff', B: '#3d7be0' });
    flake(3, 3); flake(28, 28); flake(28, 3); flake(3, 28);
    return [g];
  },
  // 칩 스택
  f_chips() {
    const g = PF.grid();
    PF.band(g, 0, 4, (x, y, d) => d === 0 || d === 4 ? '#5a0b17' : (Math.floor((x + y) / 3) % 2 ? '#e23b3b' : '#ffffff'));
    const stack = (x0, y0, c) => { for (let k = 0; k < 3; k++) PF.spr(g, x0, y0 + k * 2, ['KCCCCK', 'KCWCWK'], { K: '#141414', C: c, W: '#ffffff' }); };
    stack(0, 0, '#2a9df4'); stack(26, 0, '#3fbf5f'); stack(0, 25, '#141414'); stack(26, 25, '#7a4fd6');
    return [g];
  },
  // 고양이
  f_cat() {
    const g = PF.grid();
    PF.band(g, 1, 4, (x, y, d) => d === 1 ? '#141414' : '#2b2f33');
    PF.band(g, 5, 5, '#141414');
    const ear = ['K........', 'KK.......', 'KPK......', 'KPPK.....', 'KPPPK....', 'KPPPPK...', 'KPPPPPK..', 'KKKKKKKK.'];
    PF.spr(g, 1, 0, ear, { K: '#141414', P: '#ff6fae' });
    PF.spr(g, 22, 0, ear.map(r => r.split('').reverse().join('')), { K: '#141414', P: '#ff6fae' });
    for (const y of [16, 19]) { PF.rect(g, 0, y, 3, y, '#fdfdf0'); PF.rect(g, 28, y, 31, y, '#fdfdf0'); }
    PF.spr(g, 14, 28, ['.KK.', 'KPPK', '.KK.'], { K: '#141414', P: '#ff6fae' });
    return [g];
  },
};
const pfCache = new Map();
function pixelFrame(id) {
  if (!PIXEL_FRAMES[id]) return null;
  if (!pfCache.has(id)) { const fr = PIXEL_FRAMES[id](); pfCache.set(id, { url: spriteURL(fr), n: fr.length }); }
  return pfCache.get(id);
}
