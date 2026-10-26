// 텍사스 홀덤 테이블 엔진 (서버에서만 카드를 섞고 관리)
const crypto = require('crypto');
const { bestHand, compareScore } = require('./public/poker.js');

const STAGE_NAMES = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버', showdown: '쇼다운' };

function newDeck() {
  const deck = [];
  for (const s of ['s', 'h', 'd', 'c']) for (let r = 2; r <= 14; r++) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

class Table {
  // hooks: emit(), log(text), blinds() -> {sb,bb}, beforeHand() -> bool, handEnd(), seatRemoved(seat)
  constructor(opts) {
    this.opts = Object.assign({
      maxSeats: 8, sb: 10, bb: 20, turnMs: 30000, awayMs: 8000,
      nextHandMs: 6500, runoutMs: 1400, dealDisconnected: false,
    }, opts);
    this.hooks = opts.hooks;
    this.seats = new Array(this.opts.maxSeats).fill(null);
    this.sb = this.opts.sb;
    this.bb = this.opts.bb;
    this.running = false;
    this.stage = 'waiting';
    this.dealer = -1;
    this.deck = [];
    this.community = [];
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.turn = -1;
    this.turnDeadline = 0;
    this.handNo = 0;
    this.turnSeq = 0;
    this.result = null;
    this.timer = null;
    this.runoutTimer = null;
    this.nextHandTimer = null;
  }

  // ---------- 유틸 ----------
  emit() { this.hooks.emit(); }
  log(t) { this.hooks.log(t); }
  get max() { return this.opts.maxSeats; }
  seatOf(id) { return this.seats.findIndex(s => s && s.id === id); }
  seat(id) { return this.seats[this.seatOf(id)] || null; }
  inBetting() { return ['preflop', 'flop', 'turn', 'river'].includes(this.stage); }
  canAct(s) { return s && s.inHand && !s.folded && !s.allIn; }
  needsAct(s) { return this.canAct(s) && (!s.acted || s.bet < this.currentBet); }
  live() { return this.seats.map((s, i) => i).filter(i => this.seats[i] && this.seats[i].inHand && !this.seats[i].folded); }
  pot() { return this.seats.reduce((sum, s) => sum + (s ? s.total : 0), 0); }
  eligible(s) { return s && s.chips > 0 && !s.leaving && (this.opts.dealDisconnected || s.connected); }
  readyCount() { return this.seats.filter(s => this.eligible(s)).length; }
  nextIdx(from, pred) {
    for (let k = 1; k <= this.max; k++) {
      const j = (((from + k) % this.max) + this.max) % this.max;
      if (this.seats[j] && pred(this.seats[j])) return j;
    }
    return -1;
  }
  clearTimers() {
    clearTimeout(this.timer); this.timer = null;
    clearTimeout(this.runoutTimer); this.runoutTimer = null;
  }
  destroy() {
    this.clearTimers();
    clearTimeout(this.nextHandTimer); this.nextHandTimer = null;
    this.running = false;
  }
  dropSeat(i) {
    const s = this.seats[i];
    this.seats[i] = null;
    if (s && this.hooks.seatRemoved) this.hooks.seatRemoved(s);
  }

  // ---------- 좌석 ----------
  addPlayer(user, socketId, chips, extra = {}) {
    const i = this.seats.findIndex(s => !s);
    if (i < 0) return { error: '자리가 꽉 찼어요 (최대 8명)' };
    this.seats[i] = Object.assign({
      id: user.id, name: user.username, avatar: user.avatar, socketId, chips,
      hand: [], bet: 0, total: 0, inHand: false, folded: true, allIn: false, acted: false,
      connected: true, leaving: false, lastAction: '', revealed: false, bestName: '', won: 0,
      awaySince: 0,
    }, extra);
    this.maybeAutoStart();
    return { seat: i };
  }

  removePlayer(id) {
    const i = this.seatOf(id);
    if (i < 0) return;
    const s = this.seats[i];
    if (this.stage !== 'waiting' && s.inHand) {
      s.leaving = true;
      if (this.inBetting() && !s.folded && !s.allIn) this.foldOut(i);
    } else {
      this.dropSeat(i);
    }
    this.emit();
  }

  setConnected(id, socketId, connected) {
    const i = this.seatOf(id);
    if (i < 0) return;
    const s = this.seats[i];
    if (!connected && s.socketId !== socketId) return;
    s.connected = connected;
    s.awaySince = connected ? 0 : Date.now();
    if (connected) s.socketId = socketId;
    if (!connected && i === this.turn && this.turnDeadline - Date.now() > this.opts.awayMs) this.startTimer();
    if (connected) this.maybeAutoStart();
    this.emit();
  }

  maybeAutoStart() {
    if (this.running && this.stage === 'waiting' && !this.nextHandTimer && this.readyCount() >= 2) {
      this.nextHandTimer = setTimeout(() => {
        this.nextHandTimer = null;
        if (this.stage === 'waiting') this.startHand();
      }, 2500);
    }
  }

  // ---------- 핸드 진행 ----------
  startHand() {
    this.clearTimers();
    clearTimeout(this.nextHandTimer); this.nextHandTimer = null;
    this.seats.forEach((s, i) => { if (s && s.leaving) this.dropSeat(i); });

    const goWaiting = () => {
      this.stage = 'waiting';
      this.turn = -1;
      this.community = [];
      this.seats.forEach(s => { if (s) Object.assign(s, { inHand: false, folded: true, hand: [], bet: 0, total: 0, won: 0, revealed: false, bestName: '', lastAction: '' }); });
      this.emit();
    };
    if (!this.running) return goWaiting();
    if (this.hooks.beforeHand && this.hooks.beforeHand() === false) return goWaiting();
    if (this.hooks.blinds) { const b = this.hooks.blinds(); this.sb = b.sb; this.bb = b.bb; }

    const ready = [];
    this.seats.forEach((s, i) => {
      if (!s) return;
      Object.assign(s, { hand: [], bet: 0, total: 0, allIn: false, acted: false, lastAction: '', revealed: false, bestName: '', won: 0 });
      s.inHand = this.eligible(s);
      s.folded = !s.inHand;
      if (s.inHand) ready.push(i);
    });
    if (ready.length < 2) return goWaiting();

    this.handNo++;
    this.runout = false;
    this.result = null;
    this.deck = newDeck();
    this.community = [];
    this.stage = 'preflop';

    const inHand = s => s.inHand;
    this.dealer = this.nextIdx(this.dealer, inHand);
    let sbIdx, bbIdx;
    if (ready.length === 2) {
      sbIdx = this.dealer;
      bbIdx = this.nextIdx(this.dealer, inHand);
    } else {
      sbIdx = this.nextIdx(this.dealer, inHand);
      bbIdx = this.nextIdx(sbIdx, inHand);
    }
    this.sbIdx = sbIdx;
    this.bbIdx = bbIdx;
    this.postBlind(sbIdx, this.sb, 'SB');
    this.postBlind(bbIdx, this.bb, 'BB');
    this.currentBet = this.bb;
    this.minRaise = this.bb;

    for (let round = 0; round < 2; round++) {
      let i = sbIdx;
      do {
        this.seats[i].hand.push(this.deck.pop());
        i = this.nextIdx(i, inHand);
      } while (i !== sbIdx);
    }

    this.log(`── 핸드 #${this.handNo} ──`);
    this.turn = this.nextIdx(bbIdx, s => this.needsAct(s));
    if (this.turn < 0) return this.endRound();
    this.startTimer();
    this.emit();
  }

  postBlind(i, amount, label) {
    const s = this.seats[i];
    this.put(s, Math.min(amount, s.chips));
    s.lastAction = s.allIn ? '올인' : label;
  }

  put(s, x) {
    s.chips -= x;
    s.bet += x;
    s.total += x;
    if (s.chips === 0) s.allIn = true;
  }

  startTimer() {
    clearTimeout(this.timer);
    const s = this.seats[this.turn];
    const ms = s.connected ? this.opts.turnMs : this.opts.awayMs;
    this.turnDeadline = Date.now() + ms;
    const seq = ++this.turnSeq;
    this.timer = setTimeout(() => {
      if (seq !== this.turnSeq || !this.inBetting()) return;
      const cur = this.seats[this.turn];
      if (!cur) return;
      this.act(cur.id, this.currentBet - cur.bet > 0 ? 'fold' : 'check', 0, true);
    }, ms);
  }

  act(id, type, amount, auto = false) {
    if (!this.inBetting() || this.turn < 0) return { error: '지금은 행동할 수 없어요' };
    const i = this.turn;
    const s = this.seats[i];
    if (!s || s.id !== id) return { error: '내 차례가 아니에요' };
    const toCall = this.currentBet - s.bet;

    if (type === 'call' && toCall <= 0) type = 'check';
    if (type === 'check' && toCall > 0) return { error: '체크할 수 없어요 (콜 또는 폴드)' };
    if (type === 'raise') {
      amount = Math.floor(Number(amount));
      if (!Number.isFinite(amount)) return { error: '금액이 올바르지 않아요' };
      if (amount >= s.bet + s.chips) type = 'allin';
      else if (amount < this.currentBet + this.minRaise) return { error: '최소 레이즈 금액보다 작아요' };
    }

    let msg;
    switch (type) {
      case 'fold':
        s.folded = true; s.lastAction = '폴드'; msg = '폴드';
        break;
      case 'check':
        s.lastAction = '체크'; msg = '체크';
        break;
      case 'call': {
        const x = Math.min(toCall, s.chips);
        this.put(s, x);
        s.lastAction = s.allIn ? '올인' : '콜';
        msg = s.allIn ? '올인' : '콜';
        break;
      }
      case 'raise': {
        const label = this.currentBet === 0 ? '벳' : '레이즈';
        this.put(s, amount - s.bet);
        this.raiseTo(i, amount);
        s.lastAction = label; msg = label;
        break;
      }
      case 'allin': {
        const total = s.bet + s.chips;
        this.put(s, s.chips);
        if (total > this.currentBet) this.raiseTo(i, total);
        s.lastAction = '올인'; msg = '올인';
        break;
      }
      default:
        return { error: '알 수 없는 행동이에요' };
    }
    s.acted = true;
    this.log(`${s.name} ${msg}${auto ? ' (시간초과)' : ''}`);
    this.afterAction();
    return { ok: true };
  }

  raiseTo(i, amount) {
    this.minRaise = Math.max(this.minRaise, amount - this.currentBet);
    this.currentBet = amount;
    this.seats.forEach((s, j) => { if (s && j !== i && this.canAct(s)) s.acted = false; });
  }

  foldOut(i) {
    const s = this.seats[i];
    s.folded = true;
    s.lastAction = '폴드';
    if (i === this.turn) return this.afterAction();
    const live = this.live();
    if (live.length === 1) { this.clearTimers(); return this.winUncontested(live[0]); }
  }

  afterAction() {
    clearTimeout(this.timer);
    this.turnSeq++;
    const live = this.live();
    if (live.length === 1) return this.winUncontested(live[0]);
    const next = this.nextIdx(this.turn, s => this.needsAct(s));
    if (next < 0) return this.endRound();
    this.turn = next;
    this.startTimer();
    this.emit();
  }

  endRound() {
    this.clearTimers();
    this.turnSeq++;
    this.turn = -1;
    this.seats.forEach(s => {
      if (!s) return;
      s.bet = 0;
      s.acted = false;
      if (s.inHand && !s.folded && !s.allIn) s.lastAction = '';
    });
    this.currentBet = 0;
    this.minRaise = this.bb;

    if (this.stage === 'river') return this.showdown();

    // 더 베팅할 사람이 없으면(올인): 먼저 패를 모두 오픈하고, 보드를 한 장씩 깐다
    const h = this.handNo;
    const next = ms => {
      this.runoutTimer = setTimeout(() => {
        if (this.handNo === h && this.inBetting()) this.endRound();
      }, ms);
    };
    if (!this.runout && this.seats.filter(s => this.canAct(s)).length < 2) {
      this.runout = true;
      this.live().forEach(i => { this.seats[i].revealed = true; });
      this.log('🃏 올인 쇼다운 — 패 오픈');
      this.emit();
      return next(this.opts.runoutMs * 1.6);
    }

    this.deck.pop();
    if (this.stage === 'preflop') {
      this.community.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      this.stage = 'flop';
    } else if (this.stage === 'flop') {
      this.community.push(this.deck.pop());
      this.stage = 'turn';
    } else {
      this.community.push(this.deck.pop());
      this.stage = 'river';
    }

    if (this.runout) {
      this.emit();
      return next(this.opts.runoutMs);
    }
    this.turn = this.nextIdx(this.dealer, s => this.canAct(s));
    this.startTimer();
    this.emit();
  }

  winUncontested(i) {
    this.clearTimers();
    const s = this.seats[i];
    const pot = this.pot();
    s.chips += pot;
    s.won = pot;
    this.stage = 'showdown';
    this.turn = -1;
    this.result = { lines: [{ names: s.name, amount: pot, hand: '' }] };
    this.log(`🏆 ${s.name} 승리 (모두 폴드)`);
    this.scheduleNextHand();
  }

  buildPots() {
    const live = this.live().map(i => this.seats[i]);
    const contributors = this.seats.filter(s => s && s.total > 0);
    const levels = [...new Set(live.map(s => s.total))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const lvl of levels) {
      let amount = 0;
      for (const s of contributors) amount += Math.min(s.total, lvl) - Math.min(s.total, prev);
      const eligible = this.live().filter(i => this.seats[i].total >= lvl);
      if (amount > 0) pots.push({ amount, eligible });
      prev = lvl;
    }
    const total = this.pot();
    const distributed = pots.reduce((a, p) => a + p.amount, 0);
    if (total > distributed && pots.length) pots[pots.length - 1].amount += total - distributed;
    return pots;
  }

  showdown() {
    this.clearTimers();
    this.stage = 'showdown';
    this.turn = -1;
    const scores = {};
    for (const i of this.live()) {
      const s = this.seats[i];
      const best = bestHand([...s.hand, ...this.community]);
      scores[i] = best.score;
      s.revealed = true;
      s.bestName = best.name;
      s.bestCards = best.cards;
    }
    const order = [];
    for (let k = 1; k <= this.max; k++) order.push((this.dealer + k) % this.max);

    const pots = this.buildPots();
    const lines = [];
    pots.forEach((pot, pi) => {
      const elig = order.filter(i => pot.eligible.includes(i));
      let top = null;
      for (const i of elig) if (!top || compareScore(scores[i], top) > 0) top = scores[i];
      const winners = elig.filter(i => compareScore(scores[i], top) === 0);
      const share = Math.floor(pot.amount / winners.length);
      let rem = pot.amount - share * winners.length;
      for (const i of winners) {
        const w = this.seats[i];
        const amt = share + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
        w.chips += amt;
        w.won += amt;
      }
      const label = pots.length > 1 ? (pi === 0 ? '메인팟' : `사이드팟${pi}`) : '';
      const names = winners.map(i => this.seats[i].name).join(', ');
      const hand = this.seats[winners[0]].bestName;
      lines.push({ label, names, amount: pot.amount, hand, split: winners.length > 1 });
      this.log(`🏆 ${label ? label + ' ' : ''}${names} ${winners.length > 1 ? '나눠 가짐' : '승리'} — ${hand}`);
    });
    this.result = { lines };
    this.scheduleNextHand();
  }

  scheduleNextHand() {
    if (this.hooks.handEnd) this.hooks.handEnd();
    this.emit();
    clearTimeout(this.nextHandTimer);
    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      this.startHand();
    }, this.opts.nextHandMs);
  }

  // ---------- 화면 데이터 (남의 카드는 숨김) ----------
  viewFor(id) {
    const me = this.seatOf(id);
    return {
      stage: this.stage,
      stageName: (this.runout && this.inBetting() ? '올인 쇼다운 · ' : '') + (STAGE_NAMES[this.stage] || ''),
      runout: !!this.runout && this.inBetting(),
      handNo: this.handNo,
      community: this.community,
      pot: this.pot(),
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      sb: this.sb,
      bb: this.bb,
      turn: this.turn,
      turnDeadline: this.turnDeadline,
      turnMs: this.opts.turnMs,
      now: Date.now(),
      dealer: this.dealer,
      sbSeat: this.stage === 'waiting' ? -1 : this.sbIdx,
      bbSeat: this.stage === 'waiting' ? -1 : this.bbIdx,
      me,
      result: this.stage === 'showdown' ? this.result : null,
      seats: this.seats.map((s, i) => s && {
        uid: s.id,
        name: s.name,
        avatar: s.avatar,
        chips: s.chips,
        bet: s.bet,
        inHand: s.inHand,
        folded: s.folded,
        allIn: s.allIn,
        connected: s.connected,
        lastAction: s.lastAction,
        hasCards: s.inHand && s.hand.length > 0,
        cards: (i === me || s.revealed) ? s.hand : null,
        bestName: this.stage === 'showdown' && s.revealed ? s.bestName : '',
        bestCards: this.stage === 'showdown' && s.revealed ? s.bestCards : null,
        won: this.stage === 'showdown' ? s.won : 0,
        tStatus: s.tStatus || null,
        place: s.place || 0,
        rebuys: s.rebuys || 0,
        shame: s.shame || 0,
      }),
    };
  }
}

module.exports = { Table };
