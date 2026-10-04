// Chặn /play khi chưa đăng nhập và đồng bộ tiến trình game với tài khoản (bảng public.game_saves).
// Game tự lưu vào localStorage[KEY] mỗi 5 giây; file này tải bản lưu từ Supabase trước khi game chạy,
// rồi định kỳ đẩy bản trong localStorage lên lại. Cần nạp sau supabase-js, /supabase-config.js, /auth.js.
(function () {
  var KEY = "xuong-quai-vat-demo-v3", LEGACY = "xuong-quai-vat-demo-v2", META = "xqv-cloud-meta";
  var SYNC_MS = 15000;
  var sb = window.xqvAuth && window.xqvAuth.client, cfg = window.XQV_SUPABASE || {};
  if (!sb) { location.replace("/"); return; }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function readMeta() { try { return JSON.parse(lsGet(META)) || {}; } catch (e) { return {}; } }

  // Chọn bản lưu dùng khi mở game.
  // meta.owner: tài khoản sở hữu bản lưu trên máy; meta.at: updated_at của lần đồng bộ thành công gần nhất.
  // Bản lưu chưa có chủ (chơi trước khi có tài khoản) được nhận về cho tài khoản đầu tiên đăng nhập.
  function decide(localRaw, meta, cloud, uid) {
    var mine = !!localRaw && (!meta.owner || meta.owner === uid);
    if (cloud && (!mine || Date.parse(cloud.updated_at) > (meta.at || 0))) return "cloud";
    return mine ? "local" : "fresh";
  }
  window.xqvDecideSave = decide; // để kiểm thử

  var userId = null, token = null, syncOn = false, lastSent = null, sending = false;

  function domReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn();
  }
  function startGame() {
    domReady(function () {
      var src = document.getElementById("game-src");
      var s = document.createElement("script");
      s.textContent = src.textContent;
      src.parentNode.insertBefore(s, src.nextSibling);
      var g = document.getElementById("auth-gate"); if (g) g.remove();
    });
  }
  function showError(text) {
    domReady(function () {
      var g = document.getElementById("auth-gate"); if (g) g.remove();
      document.body.innerHTML =
        '<div style="max-width:420px;margin:15vh auto;padding:24px 16px;text-align:center;font:15px/1.6 system-ui,sans-serif">' +
        "<p>" + text + "</p>" +
        '<p><button type="button" onclick="location.reload()" style="font:600 15px system-ui;padding:10px 18px;border-radius:10px;border:0;background:#ffb000;cursor:pointer">Thử lại</button> ' +
        '<a href="/" style="margin-left:8px">Về trang chủ</a></p></div>';
    });
  }

  async function push() {
    if (!syncOn || sending) return;
    var raw = lsGet(KEY);
    if (!raw || raw === lastSent) return;
    var data; try { data = JSON.parse(raw); } catch (e) { return; }
    sending = true;
    try {
      var r = await sb.from("game_saves").upsert({ user_id: userId, data: data }).select("updated_at").single();
      if (!r.error) {
        lastSent = raw;
        lsSet(META, JSON.stringify({ owner: userId, at: Date.parse(r.data.updated_at) }));
      }
    } catch (e) {}
    sending = false;
  }

  // Khi rời trang: gửi nốt bằng fetch keepalive (vẫn chạy sau khi tab đóng).
  function flush() {
    var raw = lsGet(KEY);
    if (!syncOn || !token || !raw || raw === lastSent) return;
    try {
      fetch(cfg.url + "/rest/v1/game_saves?on_conflict=user_id", {
        method: "POST", keepalive: true,
        headers: {
          apikey: cfg.anonKey, Authorization: "Bearer " + token, "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify({ user_id: userId, data: JSON.parse(raw) })
      }).then(function (r) { if (r.ok) lastSent = raw; }, function () {});
    } catch (e) {}
  }

  sb.auth.onAuthStateChange(function (event, session) {
    if (event === "SIGNED_OUT") { syncOn = false; location.replace("/"); return; }
    if (session) token = session.access_token;
  });

  (async function boot() {
    var r;
    try { r = await sb.auth.getSession(); } catch (e) { location.replace("/"); return; }
    var session = r.data && r.data.session;
    if (!session) { location.replace("/?next=play"); return; }
    userId = session.user.id; token = session.access_token;

    var meta = readMeta();
    var localRaw = lsGet(KEY) || lsGet(LEGACY);
    var mine = !!localRaw && (!meta.owner || meta.owner === userId);

    var res;
    try { res = await sb.from("game_saves").select("data,updated_at").eq("user_id", userId).maybeSingle(); }
    catch (e) { res = { error: e }; }

    if (res.error) {
      // Không tải được bản lưu trên mạng: chỉ cho chơi tiếp bản trên máy nếu đúng của tài khoản này,
      // và không đẩy lên để tránh ghi đè bản lưu trên mạng.
      if (mine) { startGame(); return; }
      showError("Không tải được tiến trình của bạn. Kiểm tra kết nối mạng rồi thử lại.");
      return;
    }

    var choice = decide(localRaw, meta, res.data, userId);
    if (!mine) { lsDel(KEY); lsDel(LEGACY); }
    if (choice === "cloud") {
      lastSent = JSON.stringify(res.data.data);
      lsSet(KEY, lastSent);
      lsSet(META, JSON.stringify({ owner: userId, at: Date.parse(res.data.updated_at) }));
    } else {
      lsSet(META, JSON.stringify({ owner: userId, at: meta.owner === userId ? (meta.at || 0) : 0 }));
    }
    syncOn = true;
    startGame();
    push();
    setInterval(push, SYNC_MS);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
    window.addEventListener("pagehide", flush);
  })();
})();
