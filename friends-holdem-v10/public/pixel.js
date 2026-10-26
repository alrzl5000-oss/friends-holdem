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
  constructor(canvas, paletteEl) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.px = new Array(256).fill(0);
    this.color = 1;
    this.tool = 'pen';
    this.mirror = false;
    this.undo = [];
    this.drawing = false;
    this.buildPalette(paletteEl);
    const at = e => {
      const r = this.c.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / r.width * 16);
      const y = Math.floor((e.clientY - r.top) / r.height * 16);
      return x >= 0 && x < 16 && y >= 0 && y < 16 ? [x, y] : null;
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
    this.px = /^[0-9a-f]{256}$/.test(str || '') ? [...str].map(h => parseInt(h, 16)) : new Array(256).fill(0);
    this.undo = [];
    this.draw();
  }
  value() { return this.px.map(v => v.toString(16)).join(''); }
  set(x, y) {
    this.px[y * 16 + x] = this.color;
    if (this.mirror) this.px[y * 16 + (15 - x)] = this.color;
  }
  paint(x, y) { this.set(x, y); this.draw(); }
  fill(x, y) {
    const target = this.px[y * 16 + x];
    if (target === this.color) return;
    const st = [[x, y]];
    while (st.length) {
      const [a, b] = st.pop();
      if (a < 0 || a > 15 || b < 0 || b > 15 || this.px[b * 16 + a] !== target) continue;
      this.px[b * 16 + a] = this.color;
      st.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
    }
    this.draw();
  }
  back() { if (this.undo.length) { this.px = this.undo.pop(); this.draw(); } }
  clear() { this.undo.push(this.px.slice()); this.px.fill(0); this.draw(); }
  draw() {
    const g = this.g, s = this.c.width / 16;
    g.clearRect(0, 0, this.c.width, this.c.height);
    for (let i = 0; i < 256; i++) {
      const x = (i % 16) * s, y = Math.floor(i / 16) * s;
      const col = PIXEL_PALETTE[this.px[i]];
      if (col) { g.fillStyle = col; g.fillRect(x, y, s, s); }
      else { g.fillStyle = ((i % 16) + Math.floor(i / 16)) % 2 ? '#20302a' : '#1a2822'; g.fillRect(x, y, s, s); }
    }
    g.strokeStyle = 'rgba(255,255,255,.06)';
    g.lineWidth = 1;
    for (let k = 1; k < 16; k++) {
      g.beginPath(); g.moveTo(k * s + .5, 0); g.lineTo(k * s + .5, this.c.height); g.stroke();
      g.beginPath(); g.moveTo(0, k * s + .5); g.lineTo(this.c.width, k * s + .5); g.stroke();
    }
    if (this.mirror) {
      g.strokeStyle = 'rgba(231,194,106,.5)';
      g.beginPath(); g.moveTo(this.c.width / 2, 0); g.lineTo(this.c.width / 2, this.c.height); g.stroke();
    }
  }
}
