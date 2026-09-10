/* Global Demand Eye · 工具页共享逻辑
   - Comtrade 公共预览接口不发 CORS 头，浏览器需走代理链
   - World Bank API 直连（Access-Control-Allow-Origin: *）
*/
const CT_BASE = "https://comtradeapi.un.org";

// 代理链：依次尝试，直连放首位（万一将来官方放开 CORS）
const CT_PROXIES = [
  u => u,
  u => "https://api.cors.lol/?url=" + encodeURIComponent(u),
  u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  u => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u),
];

async function comtradeGet(path, statusEl) {
  const url = CT_BASE + path;
  let lastErr = null;
  for (let i = 0; i < CT_PROXIES.length; i++) {
    try {
      if (statusEl) statusEl(`连接数据源（通道 ${i + 1}/${CT_PROXIES.length}）…`);
      const r = await fetch(CT_PROXIES[i](url), { headers: { "Accept": "application/json" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = JSON.parse(await r.text());
      if (d && d.error) throw new Error(String(d.error));
      return d;
    } catch (e) { lastErr = e; }
  }
  throw new Error("所有数据通道均失败（" + (lastErr ? lastErr.message : "unknown") + "）。UN Comtrade 免费接口限速约 1 次/秒，请稍等几秒重试。");
}

// 国家代码映射（M49 → 名称），代理获取 + localStorage 缓存 7 天
let _cmapPromise = null;
function countryMap(statusEl) {
  if (_cmapPromise) return _cmapPromise;
  _cmapPromise = (async () => {
    const KEY = "gde_cmap_v1";
    try {
      const c = JSON.parse(localStorage.getItem(KEY) || "null");
      if (c && Date.now() - c.t < 7 * 864e5) return c.m;
    } catch (e) {}
    const d = await comtradeGet("/files/v1/app/reference/partnerAreas.json", statusEl);
    const m = {};
    for (const a of (d.results || [])) {
      if (a.isGroup) continue;
      m[+a.PartnerCode] = { name: a.PartnerDesc, iso3: a.PartnerCodeIsoAlpha3 || "" };
    }
    try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), m })); } catch (e) {}
    return m;
  })();
  return _cmapPromise;
}

// 一国多条记录（拆运输方式/口径）时取 primaryValue 最大的一条
function bestPerKey(rows, keyField) {
  const best = {};
  for (const r of rows) {
    const k = r[keyField];
    if (k === null || k === undefined) continue;
    if (!(k in best) || (r.primaryValue || 0) > (best[k].primaryValue || 0)) best[k] = r;
  }
  return best;
}

function fmt$(v) {
  if (v == null) return "—";
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
  return "$" + v;
}
function fmtNum(v) { return v == null ? "—" : v.toLocaleString("en-US"); }

function downloadCSV(filename, head, lines) {
  const blob = new Blob(["\ufeff" + head + "\n" + lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// 导航下拉（移动端点击展开）
document.querySelectorAll(".dropbtn").forEach(b => {
  b.addEventListener("click", e => {
    e.preventDefault();
    b.parentElement.classList.toggle("open");
  });
});
