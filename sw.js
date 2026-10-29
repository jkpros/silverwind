// 銀風巡弋 Service Worker：把網頁、照片、語音快取在裝置上，沒有網路也能開
// 有網路時一律先抓最新版並更新快取；沒網路才用快取
const CACHE = "silverwind-v1";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png",
  "./img/drops.jpg", "./img/pill.jpg", "./img/tag.jpg",
  "./audio/drops.mp3", "./audio/pill.mp3", "./audio/tag.mp3"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// 音訊播放會帶 Range 標頭，離線時要自己切出 206 回應
async function rangeResponse(req, range) {
  const cache = await caches.open(CACHE);
  let res = await cache.match(req.url);
  if (!res) {
    try { res = await fetch(req.url); if (res.ok) cache.put(req.url, res.clone()); }
    catch { return new Response("", { status: 504 }); }
  }
  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  const start = m[1] ? parseInt(m[1], 10) : 0;
  const end = m[2] ? Math.min(parseInt(m[2], 10), buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": "bytes " + start + "-" + end + "/" + buf.byteLength,
      "Content-Length": String(end - start + 1)
    }
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const range = req.headers.get("range");
  if (range) { e.respondWith(rangeResponse(req, range)); return; }
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html")))
  );
});
