/*
 * Cache dos arquivos estáticos para abrir offline depois do primeiro acesso.
 * Ao mudar qualquer arquivo listado, suba a VERSAO: o cache antigo é apagado
 * na ativação e o novo é baixado inteiro.
 */

const VERSAO = "nutrijm-v1";

const ARQUIVOS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/style.css",
  "./assets/js/app.js",
  "./assets/js/storage.js",
  "./assets/js/calculations.js",
  "./data/default-data.js"
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(VERSAO).then((cache) => cache.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) => Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))))
  );
  self.clients.claim();
});

/* Rede primeiro (sempre a versão mais nova quando há internet); sem rede, o cache. */
self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET") return;
  evento.respondWith(
    fetch(evento.request)
      .then((resposta) => {
        const copia = resposta.clone();
        if (resposta.ok && new URL(evento.request.url).origin === self.location.origin) {
          caches.open(VERSAO).then((cache) => cache.put(evento.request, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(evento.request).then((r) => r || caches.match("./index.html")))
  );
});
