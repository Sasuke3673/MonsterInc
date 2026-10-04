// Khởi tạo Supabase client dùng chung cho trang chủ (/) và game (/play).
// Cần nạp trước: supabase-js (CDN) và /supabase-config.js
(function () {
  var cfg = window.XQV_SUPABASE || {};
  var configured = !!(cfg.url && cfg.anonKey && cfg.url.indexOf("YOUR_") !== 0 && cfg.anonKey.indexOf("YOUR_") !== 0);
  var client = null, error = null;
  if (!configured) error = "not-configured";
  else if (!window.supabase || !window.supabase.createClient) error = "sdk-missing";
  else {
    try {
      client = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } catch (e) { error = "init-failed"; }
  }
  window.xqvAuth = { client: client, error: error };
})();
