/* Tavla UI: hot-seat backgammon on an SVG board. Rules live in engine.js (window.BG).
   Interaction: tap the dice to roll / hand over; drag or tap checkers to move. */
(function () {
  'use strict';
  var BG = window.BG;

  // ---- geometry (board units; the "wide" board is 1040 x 700) ----
  var W = 1040, H = 700, F = 24, PW = 70, R = 30, TRI_H = 280, STACK = 300;
  var BAR_L = 444, BAR_R = 514, FIELD_R = 934, TRAY_L = 950, TRAY_R = 1016;
  var MID = H / 2, BX = (BAR_L + BAR_R) / 2;
  var LEFT_CX = (F + BAR_L) / 2, RIGHT_CX = (BAR_R + FIELD_R) / 2;
  var DIE = 54, DIE_STEP = 66;
  var NAMES = ['White', 'Black'];
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function pointX(i) {
    var c;
    if (i < 12) { c = i; return c < 6 ? FIELD_R - PW / 2 - c * PW : BAR_L - PW / 2 - (c - 6) * PW; }
    c = i - 12; return c < 6 ? F + PW / 2 + c * PW : BAR_R + PW / 2 + (c - 6) * PW;
  }
  function isTop(i) { return i >= 12; }
  function spacing(n, len) { return n <= 1 ? 0 : Math.min(2 * R, (len - 2 * R) / (n - 1)); }
  function checkerY(i, k, n) { var sp = spacing(n, STACK); return isTop(i) ? F + R + k * sp : H - F - R - k * sp; }
  function barY(p, k, n) { var sp = spacing(n, 260); return p === BG.WHITE ? MID - R - 10 - k * sp : MID + R + 10 + k * sp; }
  function slabY(p, k) { return p === BG.WHITE ? H - F - 8 - (k + 1) * 13 : F + 8 + k * 13; }
  function locPos(loc, p, k, n) {
    if (loc === 'bar') return { x: BX, y: barY(p, k, n) };
    if (loc === 'off') return { x: (TRAY_L + TRAY_R) / 2, y: slabY(p, k) + 5.5 };
    return { x: pointX(loc), y: checkerY(loc, k, n) };
  }
  function countAt(s, loc, p) { return loc === 'bar' ? s.bar[p] : loc === 'off' ? s.off[p] : Math.abs(s.points[loc]); }
  function topPos(s, loc, p) { var n = countAt(s, loc, p); return locPos(loc, p, Math.max(n - 1, 0), Math.max(n, 1)); }
  function topKey(loc, p) { return loc === 'bar' ? 'bar' + p : loc === 'off' ? 'off' + p : 'p' + loc; }
  function diceSide(p) { return p === BG.WHITE ? RIGHT_CX : LEFT_CX; }

  // ---- dice & haptics ----
  function rng() {
    if (window.crypto && window.crypto.getRandomValues) {
      var a = new Uint32Array(1); window.crypto.getRandomValues(a); return a[0] / 4294967296;
    }
    return Math.random();
  }
  function roll() { return BG.rollDie(rng); }
  function haptic(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* unsupported */ } }

  // ---- game state ----
  var g, score = [0, 0], anim = null;

  function newGame() {
    g = {
      phase: 'opening',      // opening | roll | move | over
      state: BG.initialState(),
      turnStart: null,
      dice: null,
      played: [],
      selected: null,
      opening: null,         // last opening roll {w, b}, shown after a tie
      result: null,
      msg: 'Tap the dice. The higher roll starts.'
    };
    anim = null;
    render();
  }

  function legal() { return g.phase === 'move' ? BG.nextMoves(g.turnStart, g.dice, g.played) : []; }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function sources() { return uniq(legal().map(function (m) { return m.from; })); }
  function isSource(loc) { return sources().indexOf(loc) >= 0; }

  function remainingDice() {
    if (!g.dice) return [];
    var vals = g.dice[0] === g.dice[1] ? [g.dice[0], g.dice[0], g.dice[0], g.dice[0]] : g.dice.slice();
    var used = {};
    g.played.forEach(function (m) { used[m.die] = (used[m.die] || 0) + 1; });
    return vals.map(function (v) { var u = used[v] > 0; if (u) used[v]--; return { v: v, used: u }; });
  }

  // All destinations for the checker at `src` this turn, including multi-die moves of the same checker.
  // Returns [{to, path}], preferring the fewest steps, then the smallest dice (keeps big dice for later).
  function pathsFrom(src) {
    var best = {}, frontier = [{ at: src, path: [] }];
    while (frontier.length) {
      var next = [];
      frontier.forEach(function (f) {
        BG.nextMoves(g.turnStart, g.dice, g.played.concat(f.path)).forEach(function (m) {
          if (m.from !== f.at) return;
          var path = f.path.concat([m]), key = String(m.to), cur = best[key];
          var sum = path.reduce(function (a, x) { return a + x.die; }, 0);
          if (!cur || path.length < cur.path.length || (path.length === cur.path.length && sum < cur.sum)) {
            best[key] = { to: m.to, path: path, sum: sum };
          }
          if (m.to !== 'off') next.push({ at: m.to, path: path });
        });
      });
      frontier = next;
    }
    return Object.keys(best).map(function (k) { return best[k]; });
  }
  function pathTo(src, to) {
    var r = pathsFrom(src).filter(function (p) { return p.to === to; });
    return r.length ? r[0].path : null;
  }

  function setHint(prefix) {
    var t;
    if (g.phase !== 'move') t = '';
    else if (legal().length) t = 'Drag or tap a checker.';
    else if (!g.played.length) t = 'No possible move. Tap the dice to pass.';
    else if (remainingDice().some(function (d) { return !d.used; })) t = 'No further move possible. Tap the dice to hand over.';
    else t = 'Tap the dice to hand over.';
    g.msg = (prefix ? prefix + ' ' : '') + t;
  }

  function autoSelect() {
    var s = sources();
    g.selected = s.length === 1 ? s[0] : null;
  }

  // ---- actions ----
  function rollAction() {
    if (g.phase === 'opening') {
      var w = roll(), b = roll();
      g.opening = { w: w, b: b };
      anim = { dice: true };
      haptic(12);
      if (w === b) { g.msg = 'Both rolled ' + w + '. Tap to roll again.'; render(); return; }
      var start = w > b ? BG.WHITE : BG.BLACK;
      if (g.state.turn !== start) g.state = BG.endTurn(g.state);
      g.opening = null;
      startTurn([w, b], NAMES[start] + ' starts.');
    } else if (g.phase === 'roll') {
      haptic(12);
      startTurn([roll(), roll()], '');
    }
  }

  function startTurn(dice, prefix) {
    g.phase = 'move';
    g.dice = dice;
    g.turnStart = g.state;
    g.played = [];
    anim = { dice: true };
    autoSelect();
    setHint(prefix);
    render();
  }

  function execute(path, origin) {
    var p = g.state.turn, src = path[0].from;
    var from = origin || topPos(g.state, src, p);
    var hit = null;
    path.forEach(function (m) {
      if (typeof m.to === 'number' && g.state.points[m.to] === (p === BG.WHITE ? -1 : 1)) hit = locPos(m.to, 1 - p, 0, 1);
      g.played.push(m);
      g.state = BG.applyMove(g.state, m);
    });
    anim = { move: { key: topKey(path[path.length - 1].to, p), from: from, hitFrom: hit, hitKey: 'bar' + (1 - p) } };
    haptic(hit ? [8, 40, 14] : 8);
    var w = BG.winner(g.state);
    if (w) {
      g.phase = 'over';
      g.result = w;
      g.selected = null;
      score[w.player] += w.kind;
      render();
      return;
    }
    autoSelect();
    setHint('');
    render();
  }

  function undo() {
    if (g.phase !== 'move' || !g.played.length) return;
    g.played.pop();
    var s = g.turnStart;
    g.played.forEach(function (m) { s = BG.applyMove(s, m); });
    g.state = s;
    autoSelect();
    setHint('');
    render();
  }

  function handOver() {
    g.state = BG.endTurn(g.state);
    g.phase = 'roll';
    g.dice = null;
    g.played = [];
    g.selected = null;
    g.msg = NAMES[g.state.turn] + ': tap the dice to roll.';
    haptic(6);
    render();
  }

  function diceTap() {
    if (g.phase === 'opening' || g.phase === 'roll') rollAction();
    else if (g.phase === 'move') {
      if (!legal().length) handOver();
      else { anim = { shake: true }; render(); }
    }
  }

  function tap(h) {
    if (h === 'dice') { diceTap(); return; }
    if (g.phase !== 'move') return;
    if (g.selected !== null) {
      var path = pathTo(g.selected, h);
      if (path) { execute(path, null); return; }
      if (h === g.selected) { g.selected = null; render(); return; }
    }
    if (isSource(h)) {
      var ts = pathsFrom(h);
      if (ts.length === 1) { execute(ts[0].path, null); return; }   // only one place to go: just go
      g.selected = h;
      render();
      return;
    }
    g.selected = null;
    render();
  }

  // ---- SVG pieces ----
  var DEFS = [
    '<defs>',
    '<linearGradient id="frameG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a2c15"/><stop offset=".5" stop-color="#341709"/><stop offset="1" stop-color="#4d2410"/></linearGradient>',
    '<linearGradient id="fieldG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c99250"/><stop offset="1" stop-color="#a5692f"/></linearGradient>',
    '<linearGradient id="triDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#86231a"/><stop offset="1" stop-color="#4c110c"/></linearGradient>',
    '<linearGradient id="triLight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3e6c3"/><stop offset="1" stop-color="#cdb582"/></linearGradient>',
    '<linearGradient id="brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6d988"/><stop offset=".5" stop-color="#c0902f"/><stop offset="1" stop-color="#7a5516"/></linearGradient>',
    '<linearGradient id="pearl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf8f0"/><stop offset=".45" stop-color="#d6e6ec"/><stop offset=".75" stop-color="#f1dff0"/><stop offset="1" stop-color="#e9efe0"/></linearGradient>',
    '<radialGradient id="chk0" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fffdf6"/><stop offset=".55" stop-color="#efe3c6"/><stop offset="1" stop-color="#bfa878"/></radialGradient>',
    '<radialGradient id="chk1" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#74412b"/><stop offset=".6" stop-color="#3a1b10"/><stop offset="1" stop-color="#150804"/></radialGradient>',
    '<radialGradient id="lamp" cx=".5" cy=".45" r=".65"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>',
    '<filter id="grain" x="0" y="0" width="100%" height="100%">',
    '<feTurbulence type="fractalNoise" baseFrequency="0.006 0.16" numOctaves="3" seed="11" result="n"/>',
    '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.18  0 0 0 0 0.08  0 0 0 0 0.02  0 0 0 1.1 -0.25"/>',
    '<feComposite in2="SourceGraphic" operator="in"/></filter>',
    '<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#000" flood-opacity=".55"/></filter>',
    '<filter id="lift" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="10" stdDeviation="7" flood-color="#000" flood-opacity=".5"/></filter>',
    '<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
    '</defs>'
  ].join('');

  function wood(x, y, w, h, fill, rx) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (rx || 0) + '" fill="' + fill + '"/>' +
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (rx || 0) + '" fill="#000" filter="url(#grain)" opacity=".55"/>';
  }
  function diamond(cx, cy, w, h, fill) {
    return '<polygon points="' + cx + ',' + (cy - h) + ' ' + (cx + w) + ',' + cy + ' ' + cx + ',' + (cy + h) + ' ' + (cx - w) + ',' + cy + '" fill="' + fill + '"/>';
  }
  function triangle(i, fill, extra) {
    var x = pointX(i), b = isTop(i) ? F : H - F, tip = isTop(i) ? F + TRI_H : H - F - TRI_H;
    return '<polygon points="' + (x - PW / 2 + 2) + ',' + b + ' ' + (x + PW / 2 - 2) + ',' + b + ' ' + x + ',' + tip + '" fill="' + fill + '" ' + (extra || '') + '/>';
  }
  function checker(pos, p, ring, key) {
    var cx = pos.x, cy = pos.y;
    var edge = p === 0 ? '#8a7650' : '#0b0604', groove = p === 0 ? '#a8956a' : '#6b4630';
    var s = '<g class="ck"' + (key ? ' data-top="' + key + '" data-x="' + cx + '" data-y="' + cy + '"' : '') + '>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="url(#chk' + p + ')" stroke="' + edge + '" stroke-width="1.5" filter="url(#shadow)"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.7) + '" fill="none" stroke="' + groove + '" stroke-width="1.5" opacity=".7"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.22) + '" fill="none" stroke="' + groove + '" stroke-width="1.2" opacity=".6"/>';
    if (ring === 'selected') s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R + 3) + '" fill="none" stroke="#f6d988" stroke-width="4" filter="url(#glow)"/>';
    else if (ring === 'movable') s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R + 1) + '" fill="none" stroke="#f6d988" stroke-width="2" opacity=".75"/>';
    return s + '</g>';
  }

  var PIPS = {
    1: [[0, 0]], 2: [[1, -1], [-1, 1]], 3: [[1, -1], [0, 0], [-1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]
  };
  function die(cx, cy, v, p, used) {
    var body = p === 0 ? '#f7efdc' : '#2b140b', pip = p === 0 ? '#2b140b' : '#f3e6c8';
    var s = '<g class="die' + (used ? ' used' : '') + '" opacity="' + (used ? 0.3 : 1) + '" filter="url(#shadow)">' +
      '<rect x="' + (cx - DIE / 2) + '" y="' + (cy - DIE / 2) + '" width="' + DIE + '" height="' + DIE + '" rx="10" fill="' + body + '" stroke="' + (p === 0 ? '#bfa878' : '#6b4630') + '" stroke-width="1.5"/>';
    PIPS[v].forEach(function (o) { s += '<circle cx="' + (cx + o[0] * 14) + '" cy="' + (cy + o[1] * 14) + '" r="5" fill="' + pip + '"/>'; });
    return s + '</g>';
  }
  function ghostDie(cx, cy) {
    return '<g class="die ghost"><rect x="' + (cx - DIE / 2) + '" y="' + (cy - DIE / 2) + '" width="' + DIE + '" height="' + DIE + '" rx="10" fill="#f6d988" fill-opacity=".12" stroke="#f6d988" stroke-width="2" stroke-dasharray="7 5"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="#f6d988" opacity=".55"/></g>';
  }
  function rowXs(cx, n) { var xs = []; for (var k = 0; k < n; k++) xs.push(cx + (k - (n - 1) / 2) * DIE_STEP); return xs; }
  function diceHit(cx, n) {
    var w = (n - 1) * DIE_STEP + DIE + 24;
    return '<rect data-hit="dice" x="' + (cx - w / 2) + '" y="' + (MID - DIE / 2 - 12) + '" width="' + w + '" height="' + (DIE + 24) + '" rx="16" fill="transparent"/>';
  }

  // ---- layout: 'wide' board, or 'upright' (rotated 90° for tall screens such as phones) ----
  var layoutPref = 'auto';
  try { layoutPref = window.localStorage.getItem('tavla-layout') || 'auto'; } catch (e) { /* storage unavailable */ }
  var upright = false;
  function computeUpright() {
    if (layoutPref === 'wide') return false;
    if (layoutPref === 'upright') return true;
    return window.innerHeight > window.innerWidth * 1.05;
  }
  function T(x, y) { return upright ? { x: H - y, y: x } : { x: x, y: y }; }

  var svg = document.getElementById('board');

  function render() {
    upright = computeUpright();
    document.body.classList.toggle('upright', upright);
    document.body.classList.toggle('wide', !upright);

    var s = g.state, out = '', top = '', i, k, n;
    var l = legal();
    var srcs = uniq(l.map(function (m) { return m.from; }));
    var targets = g.selected === null ? [] : pathsFrom(g.selected);

    // frame, fields, tray, bar
    out += wood(0, 0, W, H, 'url(#frameG)', 18);
    out += '<rect x="5" y="5" width="' + (W - 10) + '" height="' + (H - 10) + '" rx="14" fill="none" stroke="url(#brass)" stroke-width="2" opacity=".7"/>';
    out += wood(F, F, BAR_L - F, H - 2 * F, 'url(#fieldG)');
    out += wood(BAR_R, F, FIELD_R - BAR_R, H - 2 * F, 'url(#fieldG)');
    out += '<rect x="' + TRAY_L + '" y="' + F + '" width="' + (TRAY_R - TRAY_L) + '" height="' + (H - 2 * F) + '" rx="6" fill="#1e0c05" stroke="#000" stroke-opacity=".6"/>';
    out += '<line x1="' + TRAY_L + '" y1="' + MID + '" x2="' + TRAY_R + '" y2="' + MID + '" stroke="url(#brass)" stroke-width="2" opacity=".6"/>';
    for (i = 0; i < 24; i++) out += triangle(i, i % 2 === 0 ? 'url(#triDark)' : 'url(#triLight)', 'stroke="#c0902f" stroke-opacity=".45" stroke-width="1"');
    out += '<rect x="' + F + '" y="' + F + '" width="' + (BAR_L - F) + '" height="' + (H - 2 * F) + '" fill="none" stroke="#2a1208" stroke-width="2"/>';
    out += '<rect x="' + BAR_R + '" y="' + F + '" width="' + (FIELD_R - BAR_R) + '" height="' + (H - 2 * F) + '" fill="none" stroke="#2a1208" stroke-width="2"/>';
    out += '<rect x="' + F + '" y="' + F + '" width="' + (FIELD_R - F) + '" height="' + (H - 2 * F) + '" fill="url(#lamp)" pointer-events="none"/>';
    out += '<rect x="' + (BAR_L + 6) + '" y="' + F + '" width="' + (BAR_R - BAR_L - 12) + '" height="' + (H - 2 * F) + '" fill="#000" opacity=".18"/>';
    for (k = 0; k < 7; k++) {
      var dy = F + 40 + k * ((H - 2 * F - 80) / 6);
      if (Math.abs(dy - MID) < 20) continue;
      out += diamond(BX, dy, 9, 15, 'url(#pearl)');
    }
    out += diamond(BX, MID, 12, 20, 'url(#pearl)');
    out += '<rect x="' + (BAR_L + 4) + '" y="' + (MID - 152) + '" width="' + (BAR_R - BAR_L - 8) + '" height="14" rx="3" fill="url(#brass)"/>';
    out += '<rect x="' + (BAR_L + 4) + '" y="' + (MID + 138) + '" width="' + (BAR_R - BAR_L - 8) + '" height="14" rx="3" fill="url(#brass)"/>';
    [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]].forEach(function (c) {
      var x = c[0], y = c[1], sx = c[2], sy = c[3];
      out += '<path d="M' + x + ' ' + (y + sy * 52) + ' L' + x + ' ' + y + ' L' + (x + sx * 52) + ' ' + y +
        ' L' + (x + sx * 52) + ' ' + (y + sy * 10) + ' L' + (x + sx * 10) + ' ' + (y + sy * 10) + ' L' + (x + sx * 10) + ' ' + (y + sy * 52) + ' Z" fill="url(#brass)"/>';
    });

    // point numbers, from the view of the player to move (screen space, so they stay upright)
    for (i = 0; i < 24; i++) {
      var num = s.turn === BG.WHITE ? i + 1 : 24 - i;
      var lp = T(pointX(i), isTop(i) ? F / 2 : H - F / 2);
      top += '<text x="' + lp.x + '" y="' + lp.y + '" text-anchor="middle" dominant-baseline="central" font-family="Marcellus, serif" font-size="' + (upright ? 17 : 13) + '" fill="#e2c27a" opacity=".85" pointer-events="none">' + num + '</text>';
    }

    // target highlights (under the checkers)
    targets.forEach(function (t) {
      var faint = t.path.length > 1 ? ' opacity=".6"' : '';
      if (t.to === 'off') {
        var ty = s.turn === BG.WHITE ? MID : F;
        out += '<rect class="pulse" x="' + TRAY_L + '" y="' + ty + '" width="' + (TRAY_R - TRAY_L) + '" height="' + (MID - F) + '" rx="6" fill="#f6d988"' + faint + '/>';
      } else {
        out += '<g' + faint + '>' + triangle(t.to, '#f6d988', 'class="pulse"') + '</g>';
      }
    });

    // checkers
    for (i = 0; i < 24; i++) {
      n = Math.abs(s.points[i]);
      if (!n) continue;
      var owner = s.points[i] > 0 ? 0 : 1;
      for (k = 0; k < n; k++) {
        var ring = null, isTopK = k === n - 1;
        if (isTopK && owner === s.turn && g.phase === 'move') ring = g.selected === i ? 'selected' : (g.selected === null && srcs.indexOf(i) >= 0 ? 'movable' : null);
        out += checker(locPos(i, owner, k, n), owner, ring, isTopK ? 'p' + i : null);
      }
    }
    [0, 1].forEach(function (p) {
      n = s.bar[p];
      for (k = 0; k < n; k++) {
        var ring = null, isTopK = k === n - 1;
        if (isTopK && p === s.turn && srcs.indexOf('bar') >= 0) ring = g.selected === 'bar' ? 'selected' : 'movable';
        out += checker(locPos('bar', p, k, n), p, ring, isTopK ? 'bar' + p : null);
      }
    });
    [0, 1].forEach(function (p) {
      for (k = 0; k < s.off[p]; k++) {
        var y = slabY(p, k), isTopK = k === s.off[p] - 1;
        out += '<rect' + (isTopK ? ' data-top="off' + p + '" data-x="' + (TRAY_L + TRAY_R) / 2 + '" data-y="' + (y + 5.5) + '"' : '') +
          ' x="' + (TRAY_L + 6) + '" y="' + y + '" width="' + (TRAY_R - TRAY_L - 12) + '" height="11" rx="3" fill="' + (p === 0 ? '#ecdfbf' : '#3a1b10') + '" stroke="' + (p === 0 ? '#a8956a' : '#0b0604') + '"/>';
      }
    });

    // landing markers
    targets.forEach(function (t) {
      if (t.to === 'off') return;
      var cnt = Math.abs(s.points[t.to]);
      var mine = cnt && (s.points[t.to] > 0 ? 0 : 1) === s.turn;
      var kk = mine ? cnt : 0;
      out += '<circle cx="' + pointX(t.to) + '" cy="' + checkerY(t.to, kk, mine ? cnt + 1 : 1) + '" r="' + (R - 2) + '" fill="#f6d988" fill-opacity=".25" stroke="#f6d988" stroke-width="2.5" stroke-dasharray="6 5"' + (t.path.length > 1 ? ' opacity=".6"' : '') + '/>';
    });

    // hit areas for points, bar and tray
    if (g.phase === 'move') {
      for (i = 0; i < 24; i++) {
        out += '<rect data-hit="' + i + '" x="' + (pointX(i) - PW / 2) + '" y="' + (isTop(i) ? F : MID) + '" width="' + PW + '" height="' + (MID - F) + '" fill="transparent"/>';
      }
      out += '<rect data-hit="bar" x="' + BAR_L + '" y="' + F + '" width="' + (BAR_R - BAR_L) + '" height="' + (H - 2 * F) + '" fill="transparent"/>';
      out += '<rect data-hit="off" x="' + TRAY_L + '" y="' + F + '" width="' + (TRAY_R - TRAY_L) + '" height="' + (H - 2 * F) + '" fill="transparent"/>';
    }

    // dice (above the hit areas, so tapping them always works)
    var diceLabel = 'Roll dice';
    if (g.phase === 'opening') {
      [0, 1].forEach(function (p) {
        var cx = diceSide(p);
        out += g.opening ? die(cx, MID, p === 0 ? g.opening.w : g.opening.b, p, false) : ghostDie(cx, MID);
        out += diceHit(cx, 1);
      });
    } else if (g.phase === 'roll') {
      var rx = diceSide(s.turn);
      rowXs(rx, 2).forEach(function (x) { out += ghostDie(x, MID); });
      out += diceHit(rx, 2);
    } else if (g.dice) {
      var cx = diceSide(s.turn), list = remainingDice(), xs = rowXs(cx, list.length);
      list.forEach(function (d, j) { out += die(xs[j], MID, d.v, s.turn, d.used); });
      if (g.phase === 'move') {
        out += diceHit(cx, list.length);
        if (!l.length) {
          diceLabel = g.played.length ? 'Hand over to ' + NAMES[1 - s.turn] : 'Pass';
          var bp = T(xs[xs.length - 1] + DIE / 2 + 30, MID);
          top += '<g data-hit="dice" class="badge-pop"><circle cx="' + bp.x + '" cy="' + bp.y + '" r="' + (upright ? 27 : 21) + '" fill="url(#brass)" stroke="#5a3d0e" stroke-width="1.5" filter="url(#shadow)"/>' +
            '<path d="M' + (bp.x - 8) + ' ' + bp.y + ' l5.5 6 l10.5 -12" fill="none" stroke="#2a1208" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></g>';
        } else {
          diceLabel = 'Dice';
        }
      }
    }

    svg.setAttribute('viewBox', upright ? '0 0 ' + H + ' ' + W : '0 0 ' + W + ' ' + H);
    svg.innerHTML = DEFS + '<g id="layer"' + (upright ? ' transform="translate(' + H + ' 0) rotate(90)"' : '') + '>' + out + '</g>' + top;
    svg.setAttribute('aria-label', 'Backgammon board. ' + g.msg);
    var dh = svg.querySelectorAll ? svg.querySelectorAll('[data-hit="dice"]') : [];
    for (k = 0; k < dh.length; k++) { dh[k].setAttribute('role', 'button'); dh[k].setAttribute('aria-label', diceLabel); }

    renderPanel();
    renderLayoutButton();
    runAnim();
  }

  // ---- motion ----
  function runAnim() {
    var a = anim; anim = null;
    if (!a || reduceMotion || typeof svg.querySelector !== 'function') return;
    var ease = 'cubic-bezier(.2,.8,.2,1)';
    function slide(el, from, ms) {
      if (!el || !el.animate || !from) return;
      var dx = from.x - parseFloat(el.getAttribute('data-x')), dy = from.y - parseFloat(el.getAttribute('data-y'));
      el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }], { duration: ms, easing: ease });
    }
    if (a.dice) {
      var ds = svg.querySelectorAll('.die');
      for (var i = 0; i < ds.length; i++) {
        if (!ds[i].animate) continue;
        ds[i].animate([
          { transform: 'rotate(' + (i % 2 ? 140 : -140) + 'deg) scale(.3)', opacity: 0 },
          { transform: 'rotate(' + (i % 2 ? -12 : 12) + 'deg) scale(1.08)', opacity: 1, offset: 0.7 },
          { transform: 'rotate(0) scale(1)', opacity: 1 }
        ], { duration: 420, delay: i * 50, easing: ease, fill: 'backwards' });
      }
    }
    if (a.move) {
      slide(svg.querySelector('[data-top="' + a.move.key + '"]'), a.move.from, 260);
      if (a.move.hitFrom) slide(svg.querySelector('[data-top="' + a.move.hitKey + '"]'), a.move.hitFrom, 380);
    }
    if (a.shake) {
      var dd = svg.querySelectorAll('.die');
      for (var j = 0; j < dd.length; j++) {
        if (dd[j].animate) dd[j].animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 280 });
      }
    }
  }

  // ---- drag & drop ----
  var drag = null, suppressClick = false;
  function toBoard(cx, cy) {
    var layer = document.getElementById('layer');
    var pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    return pt.matrixTransform(layer.getScreenCTM().inverse());
  }
  function hitAt(cx, cy) {
    var els = document.elementsFromPoint(cx, cy);
    for (var i = 0; i < els.length; i++) {
      var h = els[i].getAttribute && els[i].getAttribute('data-hit');
      if (h !== null && h !== undefined) return parseHit(h);
    }
    return null;
  }
  function parseHit(h) { return /^\d+$/.test(h) ? parseInt(h, 10) : h; }

  svg.addEventListener('pointerdown', function (e) {
    suppressClick = false;
    if (g.phase !== 'move' || (e.button !== undefined && e.button > 0)) return;
    var el = e.target.closest && e.target.closest('[data-hit]');
    if (!el) return;
    var h = parseHit(el.getAttribute('data-hit'));
    if (!isSource(h)) return;
    drag = { src: h, x0: e.clientX, y0: e.clientY, id: e.pointerId, active: false };
  });
  window.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.active) {
      if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) < 8) return;
      g.selected = drag.src;
      render();
      var el = svg.querySelector('[data-top="' + topKey(drag.src, g.state.turn) + '"]');
      if (!el) { drag = null; return; }
      drag.active = true;
      drag.el = el;
      drag.home = { x: parseFloat(el.getAttribute('data-x')), y: parseFloat(el.getAttribute('data-y')) };
      drag.p0 = toBoard(drag.x0, drag.y0);
      el.parentNode.appendChild(el);              // draw above everything else
      el.style.pointerEvents = 'none';
      el.setAttribute('filter', 'url(#lift)');
    }
    var p = toBoard(e.clientX, e.clientY);
    drag.dx = p.x - drag.p0.x; drag.dy = p.y - drag.p0.y;
    drag.el.style.transform = 'translate(' + drag.dx + 'px,' + drag.dy + 'px) scale(1.06)';
    drag.el.style.transformBox = 'fill-box';
    drag.el.style.transformOrigin = 'center';
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag; drag = null;
    if (!d.active) return;
    suppressClick = true;
    var dropAt = { x: d.home.x + (d.dx || 0), y: d.home.y + (d.dy || 0) };
    var target = cancelled ? null : hitAt(e.clientX, e.clientY);
    var path = target === null || target === d.src ? null : pathTo(d.src, target);
    if (path) { execute(path, dropAt); return; }
    // snap back
    render();
    if (!reduceMotion) {
      var el = svg.querySelector('[data-top="' + topKey(d.src, g.state.turn) + '"]');
      if (el && el.animate) el.animate([{ transform: 'translate(' + (d.dx || 0) + 'px,' + (d.dy || 0) + 'px)' }, { transform: 'translate(0,0)' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
  window.addEventListener('pointerup', function (e) { endDrag(e, false); });
  window.addEventListener('pointercancel', function (e) { endDrag(e, true); });

  svg.addEventListener('click', function (e) {
    if (suppressClick) { suppressClick = false; return; }
    var el = e.target.closest('[data-hit]');
    if (!el) { if (g.phase === 'move' && g.selected !== null) { g.selected = null; render(); } return; }
    tap(parseHit(el.getAttribute('data-hit')));
  });

  // ---- panel ----
  var $ = function (id) { return document.getElementById(id); };

  function renderPanel() {
    var s = g.state;
    [0, 1].forEach(function (p) {
      var extra = (s.bar[p] ? ' · ' + s.bar[p] + ' on bar' : '') + (s.off[p] ? ' · ' + s.off[p] + ' off' : '');
      $('stats' + p).textContent = BG.pipCount(s, p) + ' pips' + extra;
      $('score' + p).textContent = score[p] ? score[p] : '';
      $('score' + p).hidden = !score[p];
      $('card' + p).classList.toggle('active', g.phase !== 'opening' && g.phase !== 'over' && s.turn === p);
    });
    $('msg').textContent = g.msg;
    $('undo').disabled = !(g.phase === 'move' && g.played.length);

    var ov = $('overlay');
    if (g.phase === 'over') {
      var kinds = ['', 'wins', 'wins with a gammon', 'wins with a backgammon'];
      $('overlay-title').textContent = NAMES[g.result.player] + ' ' + kinds[g.result.kind];
      $('overlay-sub').textContent = '+' + g.result.kind + (g.result.kind === 1 ? ' point' : ' points') +
        ' · White ' + score[0] + ', Black ' + score[1];
      ov.hidden = false;
    } else {
      ov.hidden = true;
    }
  }

  var LAYOUT_NAMES = { auto: 'Auto', wide: 'Wide', upright: 'Upright' };
  var LAYOUT_NEXT = { auto: 'wide', wide: 'upright', upright: 'auto' };
  function renderLayoutButton() {
    var r = $('layout-rect');
    if (upright) { r.setAttribute('x', 6); r.setAttribute('y', 3); r.setAttribute('width', 12); r.setAttribute('height', 18); }
    else { r.setAttribute('x', 3); r.setAttribute('y', 6); r.setAttribute('width', 18); r.setAttribute('height', 12); }
    $('layout-badge').hidden = layoutPref !== 'auto';
    var b = $('layout');
    b.title = 'Board: ' + LAYOUT_NAMES[layoutPref] + ' (switch to ' + LAYOUT_NAMES[LAYOUT_NEXT[layoutPref]] + ')';
    b.setAttribute('aria-label', b.title);
  }
  function cycleLayout() {
    layoutPref = LAYOUT_NEXT[layoutPref];
    try { window.localStorage.setItem('tavla-layout', layoutPref); } catch (e) { /* ignore */ }
    render();
  }

  // ---- menu & keys ----
  var newArmed = false, newTimer = null, msgBeforeArm = '';
  function disarmNew() {
    if (!newArmed) return;
    newArmed = false;
    clearTimeout(newTimer);
    $('newgame').classList.remove('armed');
    $('newgame').setAttribute('aria-label', 'New game');
  }
  $('newgame').addEventListener('click', function () {
    var inProgress = g.phase === 'move' || g.phase === 'roll';
    if (inProgress && !newArmed) {
      newArmed = true;
      this.classList.add('armed');
      this.setAttribute('aria-label', 'Tap again to start a new game');
      msgBeforeArm = g.msg;
      g.msg = 'Tap again to start a new game.';
      renderPanel();
      newTimer = setTimeout(function () { disarmNew(); g.msg = msgBeforeArm; renderPanel(); }, 3000);
      return;
    }
    disarmNew();
    newGame();
  });
  $('overlay-new').addEventListener('click', newGame);
  $('undo').addEventListener('click', undo);
  $('layout').addEventListener('click', cycleLayout);
  $('rules-btn').addEventListener('click', function () {
    var d = $('rules');
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  });
  var lastUpright = null;
  window.addEventListener('resize', function () {
    var u = computeUpright();
    if (u !== lastUpright) { lastUpright = u; render(); }
  });
  document.addEventListener('keydown', function (e) {
    if ($('rules').open) return;
    if (e.target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
    var k = e.key.toLowerCase();
    if (k === ' ' || k === 'r' || k === 'enter') { e.preventDefault(); diceTap(); }
    else if (k === 'u' || k === 'backspace') { e.preventDefault(); undo(); }
    else if (k === 'escape' && g.selected !== null) { g.selected = null; render(); }
  });

  newGame();
})();
