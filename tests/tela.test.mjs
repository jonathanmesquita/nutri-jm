/*
 * Conferência de tela: abre o app de verdade no Chromium, com os mesmos cabeçalhos
 * de produção (vercel.json), e confere cada rota. Roda com `npm run test:tela`
 * e em todo pull request (.github/workflows/ci.yml).
 *
 * O que guarda: nenhuma rota dá erro no console, nem recurso bloqueado pela CSP, nem
 * resposta 4xx; não há rolagem horizontal de 320 a 1440 px; cada tela tem seu <h1>;
 * o axe não acha violação WCAG A/AA; e o app abre offline depois do primeiro acesso.
 * Também confere que o service worker lista todo arquivo do app (e só os que existem).
 *
 * Os testes de lógica (`npm test`) não precisam de navegador; este precisa.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const AXE = fs.readFileSync(path.join(RAIZ, "node_modules/axe-core/axe.min.js"), "utf8");
const CABECALHOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "vercel.json"), "utf8")).headers;

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json"
};

/* Servidor estático que manda os cabeçalhos do vercel.json, como a Vercel. */
function servir() {
  return http.createServer((req, res) => {
    const caminho = new URL(req.url, "http://x").pathname;
    const arquivo = path.join(RAIZ, caminho === "/" ? "index.html" : caminho);
    if (!arquivo.startsWith(RAIZ) || arquivo.includes("node_modules") || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
      res.writeHead(404);
      return res.end("não encontrado");
    }
    const cabecalhos = { "Content-Type": TIPOS[path.extname(arquivo)] ?? "application/octet-stream" };
    for (const regra of CABECALHOS) {
      const origem = regra.source === "/(.*)" ? /.*/ : new RegExp(`^${regra.source}$`);
      if (origem.test(caminho)) for (const h of regra.headers) cabecalhos[h.key] = h.value;
    }
    res.writeHead(200, cabecalhos);
    fs.createReadStream(arquivo).pipe(res);
  });
}

let servidor;
let navegador;
let base;

before(async () => {
  servidor = servir();
  /* "localhost", não 127.0.0.1: o app só registra o service worker em https ou em localhost. */
  await new Promise((ok) => servidor.listen(0, ok));
  base = `http://localhost:${servidor.address().port}`;
  navegador = await chromium.launch();
});

after(async () => {
  await navegador?.close();
  await new Promise((ok) => (servidor ? servidor.close(ok) : ok()));
});

const ROTAS = [
  "hoje",
  "alimentos",
  "dieta",
  "corpo",
  "compras",
  "medicacao",
  "medicacao/estoque",
  "medicacao/diario",
  "medicacao/ajuda",
  "configuracoes",
  "glossario"
];

const TELAS = [
  { nome: "celular pequeno", width: 320, height: 640 },
  { nome: "celular", width: 390, height: 844 },
  { nome: "desktop", width: 1440, height: 900 }
];

/* Abre uma página e junta os erros de verdade. */
async function abrir(rota, { viewport, context: contextoPronto } = {}) {
  const context = contextoPronto ?? (await navegador.newContext({ viewport }));
  await context.addInitScript(() =>
    document.addEventListener("securitypolicyviolation", (e) =>
      console.error(`CSP bloqueou ${e.violatedDirective} ${e.blockedURI}`)
    )
  );
  const page = await context.newPage();
  const erros = [];
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("response", (r) => r.status() >= 400 && erros.push(`${r.status()} ${r.url()}`));
  await page.goto(`${base}/#${rota}`);
  await page.waitForSelector("#conteudo h1");
  return { page, context, erros };
}

async function violacoesAxe(page) {
  await page.evaluate(AXE);
  return page.evaluate(async () => {
    const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  });
}

for (const tela of TELAS) {
  for (const rota of ROTAS) {
    test(`#${rota} em ${tela.nome} (${tela.width}px): sem erro, sem rolagem lateral, com <h1> e sem violação do axe`, async () => {
      const { page, context, erros } = await abrir(rota, { viewport: { width: tela.width, height: tela.height } });
      try {
        const titulo = (await page.locator("#conteudo h1").first().textContent())?.trim();
        assert.ok(titulo, "a tela precisa de um <h1> com texto");

        const largura = await page.evaluate(() => ({
          pagina: document.documentElement.scrollWidth,
          janela: document.documentElement.clientWidth
        }));
        assert.ok(largura.pagina <= largura.janela, `rolagem lateral: página ${largura.pagina}px em janela de ${largura.janela}px`);

        assert.deepEqual(await violacoesAxe(page), [], "violações de acessibilidade");
        assert.deepEqual(erros, [], "erros no console, na CSP ou na rede");
      } finally {
        await context.close();
      }
    });
  }
}

test("abre offline depois do primeiro acesso", async () => {
  const context = await navegador.newContext({ viewport: { width: 390, height: 844 } });
  const { page, erros } = await abrir("hoje", { context });
  try {
    /* Espera o service worker assumir a página e o cache terminar de encher. */
    await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then((r) => r?.active?.state === "activated"), null, {
      timeout: 10000
    });
    await page.reload(); /* na recarga o worker já controla a página */
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 });

    await context.setOffline(true);
    await page.goto(`${base}/#dieta`);
    await page.reload();
    await page.waitForSelector("#conteudo h1");
    assert.match(await page.locator("#conteudo h1").first().textContent(), /\S/);

    /* Outras rotas também abrem sem rede (todos os módulos vêm do cache). */
    for (const rota of ["alimentos", "corpo", "compras", "medicacao"]) {
      await page.evaluate((r) => (location.hash = r), rota);
      await page.waitForFunction((r) => document.title.length > 0 && location.hash === `#${r}`, rota);
      assert.ok(await page.locator("#conteudo h1").count(), `#${rota} sem <h1> offline`);
    }
    assert.deepEqual(erros.filter((e) => !/net::ERR_INTERNET_DISCONNECTED/.test(e)), []);
  } finally {
    await context.close();
  }
});

test("o service worker lista todo arquivo do app e só os que existem", () => {
  const fonte = fs.readFileSync(path.join(RAIZ, "service-worker.js"), "utf8");
  const bloco = fonte.slice(fonte.indexOf("const ARQUIVOS"), fonte.indexOf("];"));
  const listados = [...bloco.matchAll(/"\.\/([^"?]*)(?:\?[^"]*)?"/g)].map((m) => m[1]).filter(Boolean);

  const inexistentes = listados.filter((arquivo) => !fs.existsSync(path.join(RAIZ, arquivo)));
  assert.deepEqual(inexistentes, [], "arquivo no cache que não existe");

  /* Todo .js e .css do app tem que estar na lista, senão o app quebra offline. */
  const doApp = [];
  for (const pasta of ["assets/js", "assets/css", "data"]) {
    for (const nome of fs.readdirSync(path.join(RAIZ, pasta))) doApp.push(`${pasta}/${nome}`);
  }
  assert.deepEqual(doApp.filter((a) => !listados.includes(a)), [], "arquivo do app fora do cache offline");
});
