# Nutri JM

Dieta, macronutrientes, composição corporal e lista de compras — no navegador, sem login.
Os dados ficam só no aparelho de quem usa (`localStorage`). Endereço: **nutri.jm.dev.br**.

> As informações apresentadas pelo aplicativo são registros e estimativas. Elas não
> substituem avaliação de nutricionista, médico ou outro profissional de saúde.

## Estado

**Fases 1 e 2 entregues:** estrutura, navegação, armazenamento, configurações, primeira
execução, TMB, GCD/TDEE, objetivo, metas de macronutrientes e IMC. Dieta, Alimentos, Corpo e
Compras aparecem na navegação e dizem em que fase chegam (3 a 6).

## Rodar

Não há build nem dependência. Qualquer servidor estático serve:

```bash
python3 -m http.server 8000
```

Testes dos cálculos (Node 20+):

```bash
npm test
```

## Estrutura

```
index.html               casca: topo, <main>, abas
manifest.webmanifest     PWA
service-worker.js        cache dos arquivos para abrir offline (suba VERSAO ao mudar arquivo)
assets/css/style.css     paleta e layout (mobile primeiro)
assets/js/app.js         telas e roteamento por hash (#hoje, #configuracoes…)
assets/js/calculations.js  fórmulas puras, sem DOM — testadas
assets/js/storage.js     única porta para o localStorage (prefixo nutrijm:)
data/default-data.js     configuração central: fatores, objetivos, macros, faixas de IMC
assets/icons/            ícones do app (192, 512, apple-touch) e a arte original
favicon.ico              16, 32 e 48 px
tests/                   node --test
```

### Ícone

`assets/icons/nutri-jm-original.png` (1254 px) é a arte original. O `favicon.ico` guarda os
quadros de 16, 32 e 48 px do `.ico` original, copiados sem reamostrar. `icon-192.png` e
`icon-512.png` saem da arte original. O `apple-touch-icon.png` (180 px) tem fundo opaco no verde
da moldura, porque o iPhone ignora a transparência e aplica a própria máscara. Ao trocar a arte,
gere os três de novo e suba `VERSAO` no `service-worker.js`.

## Decisões e limites

- **Perfil de demonstração fictício.** O código e o site são públicos; o perfil de exemplo é
  inventado. Dado real só existe no navegador de quem usa.
- **TMB calculada só pela forma masculina de Harris-Benedict** (66,47 + 13,75·peso + 5·altura −
  6,8·idade), a fórmula definida na especificação. A tela diz isso e aceita a TMB medida
  (bioimpedância), que tem prioridade quando escolhida.
- **Carboidrato = o que sobra da meta** depois de proteína e gordura. Com o exemplo da
  especificação (77 kg, meta 2.913 kcal, 2 g/kg e 1 g/kg) a conta dá **401 g**; a especificação
  cita 390 g. O app segue a conta. Se proteína e gordura passam da meta, o carboidrato fica em
  zero e a tela avisa.
- **Nenhum valor nutricional é inventado.** Campo sem dado mostra "—".
- Números aceitam vírgula ("77,1"): os campos são texto com teclado decimal, porque
  `type="number"` recusa a vírgula.
- Todo texto entra na página por `textContent`.
