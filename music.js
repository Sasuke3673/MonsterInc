// Nhạc nền tự tổng hợp bằng Web Audio (không dùng file nhạc, không vướng bản quyền).
// Hai bài: "home" (nhẹ nhàng, dùng ở mọi tab) và "battle" (nhanh, có trống, dùng ở tab Chiến đấu).
// Trình duyệt chỉ cho phát âm thanh sau khi người chơi chạm/bấm, nên nhạc bắt đầu ở lần tương tác đầu tiên.
(function () {
  var LS = "xqv-music";
  var prefs = { on: true, vol: 0.5 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(LS)) || {}); } catch (e) {}
  function savePrefs() { try { localStorage.setItem(LS, JSON.stringify(prefs)); } catch (e) {} }

  var A4 = 440, mtof = function (m) { return A4 * Math.pow(2, (m - 69) / 12); };
  var _ = null; // nghỉ

  // Mỗi bài: tempo, mỗi ô nhịp 8 phách móc đơn; ch = hợp âm (MIDI), mel = giai điệu 8 nốt
  var SONGS = {
    home: {
      bpm: 92, drums: false, lead: "triangle",
      bars: [
        { ch: [48, 52, 55], mel: [76, _, 79, _, 81, 79, 76, _] },
        { ch: [45, 48, 52], mel: [72, _, 76, _, 74, _, 72, _] },
        { ch: [41, 45, 48], mel: [69, _, 72, _, 74, 72, 69, _] },
        { ch: [43, 47, 50], mel: [67, _, _, _, 74, _, _, _] },
        { ch: [48, 52, 55], mel: [76, _, 79, _, 84, _, 81, 79] },
        { ch: [45, 48, 52], mel: [81, _, 79, 76, 74, _, 76, _] },
        { ch: [41, 45, 48], mel: [72, 74, 76, _, 74, _, 71, _], ch2: [43, 47, 50] },
        { ch: [48, 52, 55], mel: [72, _, _, _, _, _, _, _] }
      ]
    },
    battle: {
      bpm: 140, drums: true, lead: "square",
      bars: [
        { ch: [45, 48, 52], mel: [69, _, 72, 74, 76, _, 74, 72] },
        { ch: [41, 45, 48], mel: [72, _, 69, _, 72, 74, _, _] },
        { ch: [48, 52, 55], mel: [76, _, 79, _, 76, 74, 72, _] },
        { ch: [43, 47, 50], mel: [74, _, _, 71, 74, _, _, _] },
        { ch: [45, 48, 52], mel: [81, _, 79, 76, 79, _, 76, 74] },
        { ch: [41, 45, 48], mel: [72, _, 74, 76, _, _, 72, _] },
        { ch: [48, 52, 55], mel: [76, 79, 81, _, 79, 76, 74, _] },
        { ch: [43, 47, 50], mel: [76, _, 74, _, 71, _, _, _] }
      ]
    }
  };

  var ctx = null, master = null, noiseBuf = null, timer = null;
  var song = "home", wanted = "home", step = 0, nextT = 0, started = false;

  function vol() { return prefs.vol * 0.35; }

  function init() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0;
    // lọc bớt âm cao cho dịu tai
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5200;
    master.connect(lp); lp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function tone(freq, t, dur, type, peak) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(t, dur, peak, hp) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = "highpass"; f.frequency.value = hp;
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }
  function kick(t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.2);
  }

  function playStep(t) {
    var S = SONGS[song], beat = 60 / S.bpm / 2;
    var bar = S.bars[Math.floor(step / 8) % S.bars.length], i = step % 8;
    var ch = bar.ch2 && i >= 4 ? bar.ch2 : bar.ch;
    // giai điệu
    var m = bar.mel[i];
    if (m != null) {
      var len = 1; while (i + len < 8 && bar.mel[i + len] === null && len < 3) len++;
      tone(mtof(m), t, beat * len * 0.95, S.lead, S.drums ? 0.05 : 0.09);
    }
    // rải hợp âm (nốt cao 1 quãng tám, nhỏ)
    var arp = [0, 1, 2, 1];
    tone(mtof(ch[arp[i % 4]] + 12), t, beat * 0.9, "sine", S.drums ? 0.03 : 0.045);
    // bè trầm
    if (S.drums) tone(mtof(ch[0] - 12 + (i % 2 ? 12 : 0)), t, beat * 0.8, "triangle", 0.12);
    else if (i === 0 || i === 4) tone(mtof(ch[0] - 12), t, beat * 3.6, "sine", 0.14);
    // trống cho bài chiến đấu
    if (S.drums) {
      if (i === 0 || i === 4) kick(t);
      if (i === 2 || i === 6) noise(t, 0.12, 0.12, 1800);
      noise(t, 0.03, 0.025, 7000);
    }
  }

  function tick() {
    if (nextT < ctx.currentTime - 0.1) nextT = ctx.currentTime + 0.05; // bị trễ thì bắt nhịp lại, không phát dồn
    while (nextT < ctx.currentTime + 0.15) {
      // chỉ đổi bài ở đầu ô nhịp để chuyển cho mượt
      if (step % 8 === 0 && wanted !== song) { song = wanted; step = 0; }
      playStep(nextT);
      nextT += 60 / SONGS[song].bpm / 2;
      step++;
    }
  }

  function fadeTo(v, sec) {
    var now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(v, now + sec);
  }

  function start() {
    if (!prefs.on || document.hidden || !init()) return;
    if (ctx.state === "suspended") ctx.resume();
    if (!started) { started = true; step = 0; nextT = ctx.currentTime + 0.05; timer = setInterval(tick, 30); }
    fadeTo(vol(), 1.2);
  }
  function stop(suspend) {
    if (!ctx) return;
    fadeTo(0, 0.4);
    if (suspend) setTimeout(function () { if (!prefs.on || document.hidden) ctx.suspend(); }, 450);
  }

  function sceneFromTab() {
    wanted = document.body && document.body.dataset.tab === "battle" ? "battle" : "home";
  }

  function refreshButton() {
    var b = document.getElementById("musicBtn"); if (!b) return;
    b.setAttribute("aria-pressed", prefs.on);
    b.setAttribute("aria-label", prefs.on ? "Tắt nhạc nền" : "Bật nhạc nền");
    b.title = prefs.on ? "Tắt nhạc nền" : "Bật nhạc nền";
    var r = document.getElementById("musicVol"); if (r) r.value = Math.round(prefs.vol * 100);
  }

  function setup() {
    sceneFromTab();
    new MutationObserver(sceneFromTab).observe(document.body, { attributes: true, attributeFilter: ["data-tab"] });
    var b = document.getElementById("musicBtn");
    if (b) b.addEventListener("click", function (e) {
      e.stopPropagation();
      prefs.on = !prefs.on; savePrefs(); refreshButton();
      if (prefs.on) start(); else stop(true);
    });
    var r = document.getElementById("musicVol");
    if (r) r.addEventListener("input", function () {
      prefs.vol = (+r.value) / 100; savePrefs();
      if (prefs.vol > 0 && !prefs.on) { prefs.on = true; refreshButton(); }
      if (prefs.on) start();
    });
    refreshButton();
    // Lần chạm/bấm/gõ phím đầu tiên trên trang sẽ mở âm thanh
    var first = function () { if (prefs.on) start(); };
    ["pointerdown", "keydown", "touchstart"].forEach(function (ev) { document.addEventListener(ev, first, { passive: true }); });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(true); else if (started && prefs.on) start();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup); else setup();
  window.xqvMusic = { state: function () { return { on: prefs.on, vol: prefs.vol, song: song, wanted: wanted, running: !!ctx && ctx.state === "running", gain: master ? master.gain.value : 0 }; } };
})();
