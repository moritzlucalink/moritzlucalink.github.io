/* Tavla UI: hot-seat backgammon on an SVG board. Rules live in engine.js (window.BG). */
(function () {
  'use strict';
  var BG = window.BG;

  // ---- geometry (SVG units) ----
  var W = 1040, H = 700, F = 24, PW = 70, R = 30, TRI_H = 280, STACK = 300;
  var BAR_L = 444, BAR_R = 514, FIELD_R = 934, TRAY_L = 950, TRAY_R = 1016;
  var MID = H / 2;
  var NAMES = ['White', 'Black'];

  function pointX(i) {
    var c;
    if (i < 12) { c = i; return c < 6 ? FIELD_R - PW / 2 - c * PW : BAR_L - PW / 2 - (c - 6) * PW; }
    c = i - 12; return c < 6 ? F + PW / 2 + c * PW : BAR_R + PW / 2 + (c - 6) * PW;
  }
  function isTop(i) { return i >= 12; }
  function spacing(n, len) { return n <= 1 ? 0 : Math.min(2 * R, (len - 2 * R) / (n - 1)); }
  function checkerY(i, k, n) {
    var sp = spacing(n, STACK);
    return isTop(i) ? F + R + k * sp : H - F - R - k * sp;
  }
  function barY(p, k, n) {
    var sp = spacing(n, 260);
    return p === BG.WHITE ? MID - R - 10 - k * sp : MID + R + 10 + k * sp;
  }

  // ---- fair dice ----
  function rng() {
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296;
    }
    return Math.random();
  }
  function roll() { return BG.rollDie(rng); }

  // ---- game state ----
  var g, score = [0, 0];

  function newGame() {
    g = {
      phase: 'opening',      // opening | roll | move | over
      state: BG.initialState(),
      turnStart: null,
      dice: null,
      played: [],
      selected: null,
      opening: null,         // {w, b} last opening roll
      result: null,
      msg: 'Each player rolls one die. The higher die starts.'
    };
    render();
  }

  function legal() {
    return g.phase === 'move' ? BG.nextMoves(g.turnStart, g.dice, g.played) : [];
  }

  function rollAction() {
    if (g.phase === 'opening') {
      var w = roll(), b = roll();
      g.opening = { w: w, b: b };
      if (w === b) { g.msg = 'Both rolled ' + w + '. Roll again.'; render(); return; }
      var start = w > b ? BG.WHITE : BG.BLACK;
      if (g.state.turn !== start) g.state = BG.endTurn(g.state);
      g.opening = null;
      startTurn([w, b], NAMES[start] + ' starts with ' + Math.max(w, b) + '–' + Math.min(w, b) + '.');
    } else if (g.phase === 'roll') {
      var d1 = roll(), d2 = roll();
      startTurn([d1, d2], NAMES[g.state.turn] + ' rolled ' + d1 + '–' + d2 + (d1 === d2 ? ' (doubles).' : '.'));
    }
  }

  function startTurn(dice, msg) {
    g.phase = 'move';
    g.dice = dice;
    g.turnStart = g.state;
    g.played = [];
    g.selected = null;
    g.msg = msg;
    var l = legal();
    if (!l.length) g.msg += ' No legal move. Press Pass.';
    autoSelect(l);
    render();
  }

  function autoSelect(l) {
    var froms = uniq(l.map(function (m) { return m.from; }));
    g.selected = froms.length === 1 ? froms[0] : null;
  }

  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  function play(m) {
    g.played.push(m);
    g.state = BG.applyMove(g.state, m);
    var w = BG.winner(g.state);
    if (w) {
      g.phase = 'over';
      g.result = w;
      score[w.player] += w.kind;
      g.selected = null;
      render();
      return;
    }
    var l = legal();
    if (!l.length) {
      g.msg = g.played.length < (g.dice[0] === g.dice[1] ? 4 : 2) && hasUnused()
        ? 'No further move possible. Press Done.'
        : 'Turn complete. Press Done, or Undo.';
    }
    autoSelect(l);
    render();
  }

  function hasUnused() { return remainingDice().some(function (d) { return !d.used; }); }

  function undo() {
    if (g.phase !== 'move' || !g.played.length) return;
    g.played.pop();
    var s = g.turnStart;
    g.played.forEach(function (m) { s = BG.applyMove(s, m); });
    g.state = s;
    g.msg = NAMES[g.state.turn] + ' to move.';
    autoSelect(legal());
    render();
  }

  function done() {
    if (g.phase !== 'move' || legal().length) return;
    g.state = BG.endTurn(g.state);
    g.phase = 'roll';
    g.dice = null;
    g.played = [];
    g.selected = null;
    g.msg = NAMES[g.state.turn] + ' to roll.';
    render();
  }

  function clickHit(target) {
    if (target === 'roll') { rollAction(); return; }
    if (g.phase !== 'move') return;
    var l = legal();
    if (g.selected !== null) {
      var cands = l.filter(function (m) { return m.from === g.selected && m.to === target; });
      if (cands.length) {
        // Same from/to with different dice (bearing off): use the smallest die, keep the big one.
        cands.sort(function (a, b) { return a.die - b.die; });
        play(cands[0]);
        return;
      }
    }
    var isSource = l.some(function (m) { return m.from === target; });
    g.selected = isSource ? target : null;
    render();
  }

  // dice with used flags, in display order
  function remainingDice() {
    if (!g.dice) return [];
    var vals = g.dice[0] === g.dice[1] ? [g.dice[0], g.dice[0], g.dice[0], g.dice[0]] : g.dice.slice();
    var usedCount = {};
    g.played.forEach(function (m) { usedCount[m.die] = (usedCount[m.die] || 0) + 1; });
    return vals.map(function (v) {
      var used = usedCount[v] > 0;
      if (used) usedCount[v]--;
      return { v: v, used: used };
    });
  }

  // ---- SVG rendering ----
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

  function checker(cx, cy, p, ring) {
    var edge = p === 0 ? '#8a7650' : '#0b0604';
    var groove = p === 0 ? '#a8956a' : '#6b4630';
    var s = '<g filter="url(#shadow)">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="url(#chk' + p + ')" stroke="' + edge + '" stroke-width="1.5"/>' +
      '</g>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.7) + '" fill="none" stroke="' + groove + '" stroke-width="1.5" opacity=".7"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.22) + '" fill="none" stroke="' + groove + '" stroke-width="1.2" opacity=".6"/>';
    if (ring === 'selected') {
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R + 3) + '" fill="none" stroke="#f6d988" stroke-width="4" filter="url(#glow)"/>';
    } else if (ring === 'movable') {
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R + 1) + '" fill="none" stroke="#f6d988" stroke-width="2" opacity=".75"/>';
    }
    return s;
  }

  var PIPS = {
    1: [[0, 0]], 2: [[1, -1], [-1, 1]], 3: [[1, -1], [0, 0], [-1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]
  };
  function die(cx, cy, v, p, used) {
    var S = 54, body = p === 0 ? '#f7efdc' : '#2b140b', pip = p === 0 ? '#2b140b' : '#f3e6c8';
    var s = '<g opacity="' + (used ? 0.3 : 1) + '" filter="url(#shadow)">' +
      '<rect x="' + (cx - S / 2) + '" y="' + (cy - S / 2) + '" width="' + S + '" height="' + S + '" rx="10" fill="' + body + '" stroke="' + (p === 0 ? '#bfa878' : '#6b4630') + '" stroke-width="1.5"/>';
    PIPS[v].forEach(function (o) { s += '<circle cx="' + (cx + o[0] * 14) + '" cy="' + (cy + o[1] * 14) + '" r="5" fill="' + pip + '"/>'; });
    return s + '</g>';
  }
  function diceRow(cx, list, p) {
    var s = '';
    list.forEach(function (d, k) { s += die(cx + (k - (list.length - 1) / 2) * 66, MID, d.v, p, d.used); });
    return s;
  }
  var LEFT_CX = (F + BAR_L) / 2, RIGHT_CX = (BAR_R + FIELD_R) / 2;
  function diceSide(p) { return p === BG.WHITE ? RIGHT_CX : LEFT_CX; }

  var svg = document.getElementById('board');

  // ---- layout: 'wide' board, or 'upright' (rotated 90° for tall screens such as phones) ----
  var layoutPref = 'auto';
  try { layoutPref = localStorage.getItem('tavla-layout') || 'auto'; } catch (e) { /* storage unavailable */ }
  var upright = false;
  function computeUpright() {
    if (layoutPref === 'wide') return false;
    if (layoutPref === 'upright') return true;
    return window.innerHeight > window.innerWidth * 1.05;
  }
  // board coordinates -> screen coordinates (upright: rotate 90° clockwise)
  function T(x, y) { return upright ? { x: H - y, y: x } : { x: x, y: y }; }

  function render() {
    upright = computeUpright();
    document.body.classList.toggle('upright', upright);
    document.body.classList.toggle('wide', !upright);
    var s = g.state, out = '', top = '', i, k, n;
    var l = legal();
    var sources = uniq(l.map(function (m) { return m.from; }));
    var targets = g.selected === null ? [] : uniq(l.filter(function (m) { return m.from === g.selected; }).map(function (m) { return m.to; }));

    // frame, fields, tray, bar
    out += wood(0, 0, W, H, 'url(#frameG)', 18);
    out += '<rect x="5" y="5" width="' + (W - 10) + '" height="' + (H - 10) + '" rx="14" fill="none" stroke="url(#brass)" stroke-width="2" opacity=".7"/>';
    out += wood(F, F, BAR_L - F, H - 2 * F, 'url(#fieldG)');
    out += wood(BAR_R, F, FIELD_R - BAR_R, H - 2 * F, 'url(#fieldG)');
    out += '<rect x="' + TRAY_L + '" y="' + F + '" width="' + (TRAY_R - TRAY_L) + '" height="' + (H - 2 * F) + '" rx="6" fill="#1e0c05" stroke="#000" stroke-opacity=".6"/>';
    out += '<line x1="' + TRAY_L + '" y1="' + MID + '" x2="' + TRAY_R + '" y2="' + MID + '" stroke="url(#brass)" stroke-width="2" opacity=".6"/>';

    // triangles
    for (i = 0; i < 24; i++) out += triangle(i, i % 2 === 0 ? 'url(#triDark)' : 'url(#triLight)', 'stroke="#c0902f" stroke-opacity=".45" stroke-width="1"');

    // field inner edges and lamp light
    out += '<rect x="' + F + '" y="' + F + '" width="' + (BAR_L - F) + '" height="' + (H - 2 * F) + '" fill="none" stroke="#2a1208" stroke-width="2"/>';
    out += '<rect x="' + BAR_R + '" y="' + F + '" width="' + (FIELD_R - BAR_R) + '" height="' + (H - 2 * F) + '" fill="none" stroke="#2a1208" stroke-width="2"/>';
    out += '<rect x="' + F + '" y="' + F + '" width="' + (FIELD_R - F) + '" height="' + (H - 2 * F) + '" fill="url(#lamp)" pointer-events="none"/>';

    // bar with mother-of-pearl inlay and brass hinges
    out += '<rect x="' + (BAR_L + 6) + '" y="' + F + '" width="' + (BAR_R - BAR_L - 12) + '" height="' + (H - 2 * F) + '" fill="#000" opacity=".18"/>';
    var bx = (BAR_L + BAR_R) / 2;
    for (k = 0; k < 7; k++) {
      var dy = F + 40 + k * ((H - 2 * F - 80) / 6);
      if (Math.abs(dy - MID) < 20) continue;
      out += diamond(bx, dy, 9, 15, 'url(#pearl)');
    }
    out += diamond(bx, MID, 12, 20, 'url(#pearl)');
    out += '<rect x="' + (BAR_L + 4) + '" y="' + (MID - 152) + '" width="' + (BAR_R - BAR_L - 8) + '" height="14" rx="3" fill="url(#brass)"/>';
    out += '<rect x="' + (BAR_L + 4) + '" y="' + (MID + 138) + '" width="' + (BAR_R - BAR_L - 8) + '" height="14" rx="3" fill="url(#brass)"/>';

    // brass corners
    [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]].forEach(function (c) {
      var x = c[0], y = c[1], sx = c[2], sy = c[3];
      out += '<path d="M' + x + ' ' + (y + sy * 52) + ' L' + x + ' ' + y + ' L' + (x + sx * 52) + ' ' + y +
        ' L' + (x + sx * 52) + ' ' + (y + sy * 10) + ' L' + (x + sx * 10) + ' ' + (y + sy * 10) + ' L' + (x + sx * 10) + ' ' + (y + sy * 52) + ' Z" fill="url(#brass)"/>';
    });

    // point numbers from the view of the player to move
    var view = s.turn;
    for (i = 0; i < 24; i++) {
      var num = view === BG.WHITE ? i + 1 : 24 - i;
      var lp = T(pointX(i), isTop(i) ? F / 2 : H - F / 2);
      top += '<text x="' + lp.x + '" y="' + lp.y + '" text-anchor="middle" dominant-baseline="central" font-family="Marcellus, serif" font-size="' + (upright ? 17 : 13) + '" fill="#e2c27a" opacity=".85" pointer-events="none">' + num + '</text>';
    }

    // target highlights under checkers
    targets.forEach(function (t) {
      if (t === 'off') {
        var ty = s.turn === BG.WHITE ? MID : F;
        out += '<rect class="pulse" x="' + TRAY_L + '" y="' + ty + '" width="' + (TRAY_R - TRAY_L) + '" height="' + (MID - F) + '" rx="6" fill="#f6d988"/>';
      } else {
        out += triangle(t, '#f6d988', 'class="pulse"');
      }
    });

    // checkers on points
    for (i = 0; i < 24; i++) {
      n = Math.abs(s.points[i]);
      if (!n) continue;
      var p = s.points[i] > 0 ? 0 : 1;
      for (k = 0; k < n; k++) {
        var ring = null;
        if (k === n - 1 && p === s.turn) ring = g.selected === i ? 'selected' : (g.selected === null && sources.indexOf(i) >= 0 ? 'movable' : null);
        out += checker(pointX(i), checkerY(i, k, n), p, ring);
      }
    }
    // bar checkers
    [0, 1].forEach(function (p) {
      n = s.bar[p];
      for (k = 0; k < n; k++) {
        var ring = null;
        if (k === n - 1 && p === s.turn && sources.indexOf('bar') >= 0) ring = g.selected === 'bar' ? 'selected' : 'movable';
        out += checker(bx, barY(p, k, n), p, ring);
      }
    });
    // borne-off checkers as slabs
    [0, 1].forEach(function (p) {
      for (k = 0; k < s.off[p]; k++) {
        var y = p === BG.WHITE ? H - F - 8 - (k + 1) * 13 : F + 8 + k * 13;
        out += '<rect x="' + (TRAY_L + 6) + '" y="' + y + '" width="' + (TRAY_R - TRAY_L - 12) + '" height="11" rx="3" fill="' + (p === 0 ? '#ecdfbf' : '#3a1b10') + '" stroke="' + (p === 0 ? '#a8956a' : '#0b0604') + '"/>';
      }
    });

    // landing markers for targets
    targets.forEach(function (t) {
      if (t === 'off') return;
      var cnt = Math.abs(s.points[t]);
      var mine = cnt && (s.points[t] > 0 ? 0 : 1) === s.turn;
      var kk = mine ? cnt : 0;
      out += '<circle cx="' + pointX(t) + '" cy="' + checkerY(t, kk, Math.max(kk + 1, mine ? cnt + 1 : 1)) + '" r="' + (R - 2) + '" fill="#f6d988" fill-opacity=".25" stroke="#f6d988" stroke-width="2.5" stroke-dasharray="6 5"/>';
    });

    // dice
    if (g.phase === 'opening' && g.opening) {
      out += die(diceSide(0), MID, g.opening.w, 0, false) + die(diceSide(1), MID, g.opening.b, 1, false);
    } else if ((g.phase === 'move' || g.phase === 'over') && g.dice) {
      out += diceRow(diceSide(s.turn), remainingDice(), s.turn);
    } else if (g.phase === 'roll' || g.phase === 'opening') {
      // Roll prompt, drawn upright in screen space. Upright boards get a round button that fits the centre gap.
      var c = T(g.phase === 'roll' ? diceSide(s.turn) : RIGHT_CX, MID);
      var label = g.phase === 'roll' ? (upright ? 'Roll' : NAMES[s.turn] + ': roll') : (upright ? 'Start' : 'Roll for start');
      var shape = upright
        ? '<circle cx="' + c.x + '" cy="' + c.y + '" r="44"'
        : '<rect x="' + (c.x - 90) + '" y="' + (c.y - 28) + '" width="180" height="56" rx="28"';
      top += '<g data-hit="roll" role="button" aria-label="Roll dice">' + shape + ' fill="#2a1208" fill-opacity=".7" stroke="#f6d988" stroke-width="2" stroke-dasharray="7 6"/>' +
        '<text x="' + c.x + '" y="' + c.y + '" text-anchor="middle" dominant-baseline="central" font-family="Marcellus, serif" font-size="' + (upright ? 26 : 20) + '" fill="#f6d988" letter-spacing="1.5">' + label + '</text></g>';
    }

    // invisible hit areas (on top)
    if (g.phase === 'move') {
      for (i = 0; i < 24; i++) {
        out += '<rect data-hit="' + i + '" x="' + (pointX(i) - PW / 2) + '" y="' + (isTop(i) ? F : MID) + '" width="' + PW + '" height="' + (MID - F) + '" fill="transparent"/>';
      }
      out += '<rect data-hit="bar" x="' + BAR_L + '" y="' + F + '" width="' + (BAR_R - BAR_L) + '" height="' + (H - 2 * F) + '" fill="transparent"/>';
      out += '<rect data-hit="off" x="' + TRAY_L + '" y="' + F + '" width="' + (TRAY_R - TRAY_L) + '" height="' + (H - 2 * F) + '" fill="transparent"/>';
    }

    svg.setAttribute('viewBox', upright ? '0 0 ' + H + ' ' + W : '0 0 ' + W + ' ' + H);
    svg.innerHTML = DEFS + '<g' + (upright ? ' transform="translate(' + H + ' 0) rotate(90)"' : '') + '>' + out + '</g>' + top;
    renderPanel(l);
    renderLayoutButton();
  }

  // ---- side panel ----
  var $ = function (id) { return document.getElementById(id); };

  function renderPanel(l) {
    var s = g.state;
    [0, 1].forEach(function (p) {
      $('stats' + p).textContent = 'Pips ' + BG.pipCount(s, p) + ' · Off ' + s.off[p] + (s.bar[p] ? ' · Bar ' + s.bar[p] : '');
      $('score' + p).textContent = score[p];
      $('card' + p).classList.toggle('active', g.phase !== 'opening' && g.phase !== 'over' && s.turn === p);
    });
    $('msg').textContent = g.msg;
    $('roll').disabled = !(g.phase === 'roll' || g.phase === 'opening');
    $('roll').textContent = g.phase === 'opening' ? 'Roll for start' : 'Roll';
    $('undo').disabled = !(g.phase === 'move' && g.played.length);
    $('done').disabled = !(g.phase === 'move' && !l.length);
    $('done').textContent = g.phase === 'move' && !g.played.length && !l.length ? 'Pass' : 'Done';

    var ov = $('overlay');
    if (g.phase === 'over') {
      var kinds = ['', 'wins', 'wins with a gammon', 'wins with a backgammon'];
      $('overlay-title').textContent = NAMES[g.result.player] + ' ' + kinds[g.result.kind];
      $('overlay-sub').textContent = '+' + g.result.kind + (g.result.kind === 1 ? ' point' : ' points') +
        '. Session: White ' + score[0] + ', Black ' + score[1] + '.';
      ov.hidden = false;
    } else {
      ov.hidden = true;
    }
  }

  var LAYOUT_NAMES = { auto: 'Auto', wide: 'Wide', upright: 'Upright' };
  var LAYOUT_NEXT = { auto: 'wide', wide: 'upright', upright: 'auto' };
  function renderLayoutButton() {
    $('layout-label').textContent = LAYOUT_NAMES[layoutPref];
    var r = $('layout-rect');
    if (upright) { r.setAttribute('x', 6); r.setAttribute('y', 3); r.setAttribute('width', 12); r.setAttribute('height', 18); }
    else { r.setAttribute('x', 3); r.setAttribute('y', 6); r.setAttribute('width', 18); r.setAttribute('height', 12); }
    var b = $('layout');
    b.title = 'Board: ' + LAYOUT_NAMES[layoutPref] + ' (tap to switch to ' + LAYOUT_NAMES[LAYOUT_NEXT[layoutPref]] + ')';
    b.setAttribute('aria-label', b.title);
  }
  function cycleLayout() {
    layoutPref = LAYOUT_NEXT[layoutPref];
    try { localStorage.setItem('tavla-layout', layoutPref); } catch (e) { /* ignore */ }
    render();
  }

  // ---- events ----
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
  svg.addEventListener('click', function (e) {
    var el = e.target.closest('[data-hit]');
    if (!el) { if (g.phase === 'move' && g.selected !== null) { g.selected = null; render(); } return; }
    var h = el.getAttribute('data-hit');
    clickHit(/^\d+$/.test(h) ? parseInt(h, 10) : h);
  });
  $('roll').addEventListener('click', rollAction);
  $('undo').addEventListener('click', undo);
  $('done').addEventListener('click', done);
  $('newgame').addEventListener('click', newGame);
  $('overlay-new').addEventListener('click', newGame);
  document.addEventListener('keydown', function (e) {
    if ($('rules').open) return;
    if (e.target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
    var k = e.key.toLowerCase();
    if (k === 'r' || k === ' ') { e.preventDefault(); rollAction(); }
    else if (k === 'u' || k === 'backspace') { e.preventDefault(); undo(); }
    else if (k === 'enter') { e.preventDefault(); done(); }
    else if (k === 'escape' && g.selected !== null) { g.selected = null; render(); }
  });

  newGame();
})();
