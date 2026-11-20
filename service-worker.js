/*
 * Cache dos arquivos estáticos para abrir offline depois do primeiro acesso.
 * Ao mudar qualquer arquivo listado, suba a VERSAO: o cache antigo é apagado
 * na ativação e o novo é baixado inteiro.
 */

const VERSAO = "nutrijm-v7";

const ARQUIVOS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.ico",
  "./favicon.ico?v=2",
  "./assets/icons/icon-32.png?v=2",
  "./assets/icons/icon-192.png?v=2",
  "./assets/icons/icon-512.png?v=2",
  "./assets/icons/apple-touch-icon.png?v=2",
  "./assets/css/style.css",
  "./assets/js/app.js",
  "./assets/js/storage.js",
  "./assets/js/calculations.js",
  "./assets/js/foods.js",
  "./assets/js/tela-alimentos.js",
  "./assets/js/catalogo.js",
  "./assets/js/diet.js",
  "./assets/js/tela-dieta.js",
  "./assets/js/body.js",
  "./assets/js/tela-corpo.js",
  "./assets/js/meds.js",
  "./assets/js/tela-medicacao.js",
  "./data/foods.js",
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
