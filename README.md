# Nutri JM

Dieta, macronutrientes, composição corporal e lista de compras — no navegador, sem login.
Os dados ficam só no aparelho de quem usa (`localStorage`). Endereço: **nutri.jm.dev.br**.

> As informações apresentadas pelo aplicativo são registros e estimativas. Elas não
> substituem avaliação de nutricionista, médico ou outro profissional de saúde.

## Estado

**Fases 1 a 5 entregues:** estrutura, navegação, armazenamento, configurações, primeira
execução, TMB, GCD/TDEE, objetivo, metas de macronutrientes, IMC, banco de alimentos, pesquisa,
calculadora nutricional, refeições, subtotais e resumo diário (e o consumido × meta no painel
Hoje), bioimpedância, histórico corporal e avatar. Mais o menu **Medicação** (controle de
canetas GLP-1 / GIP), fora das fases da especificação original. Compras aparece na navegação e
diz que chega na fase 6.

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
data/foods.js            597 alimentos da TACO (GERADO — ver "Alimentos")
assets/js/foods.js       pesquisa, unidades e calculadora, sem DOM — testadas
assets/js/tela-alimentos.js  tela da aba Alimentos
scripts/gerar-alimentos.mjs  gera data/foods.js
assets/js/catalogo.js    TACO + alimentos cadastrados: fonte única para todas as telas
assets/js/diet.js        refeições, subtotais e resumo do dia, sem DOM — testadas
assets/js/tela-dieta.js  tela da aba Dieta
assets/js/body.js        medições, histórico, IMC e avatar, sem DOM — testadas
assets/js/tela-corpo.js  tela da aba Corpo
assets/js/meds.js        medicação: estoque, aplicações, rodízio, alertas e sintomas, sem DOM — testadas
assets/js/tela-medicacao.js  tela da aba Medicação (#medicacao, /estoque, /diario, /ajuda)
assets/icons/            ícones do app (32, 192, 512, apple-touch) e a arte original
favicon.ico              16, 32 e 48 px
tests/                   node --test
```

### Ícone

`assets/icons/nutri-jm-original.png` (1254 px) é a arte original. O `favicon.ico` guarda os
quadros de 16, 32 e 48 px do `.ico` original, copiados sem reamostrar. `icon-192.png` e
`icon-512.png` saem da arte original. O `apple-touch-icon.png` (180 px) tem fundo opaco no verde
da moldura, porque o iPhone ignora a transparência e aplica a própria máscara. Ao trocar a arte,
gere os ícones de novo, suba o `?v=` nos links (`index.html`, manifest e service worker) e a `VERSAO` do `service-worker.js` — o navegador guarda o ícone por site e só busca outro quando o endereço muda.

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

## Alimentos

**Fonte:** TACO — Tabela Brasileira de Composição de Alimentos, 4ª ed. ampliada e revisada
(NEPA/UNICAMP, 2011), por 100 g de parte comestível. A publicação permite reprodução citando a
fonte. **Medidas caseiras** (unidade, fatia, colher, copo…): IBGE, POF 2008–2009, *Tabela de
Medidas Referidas para os Alimentos Consumidos no Brasil*, para 204 dos 597 alimentos.

Os dados vieram do pacote npm `taco-br-mcp@0.2.0`, que os tira de `brolesi/taco` (commit
`b800c910`) e foi conferido célula a célula contra o PDF oficial. `scripts/gerar-alimentos.mjs`
transforma os dois JSON do pacote em `data/foods.js`; o cabeçalho do arquivo diz isso.

- **Nada é estimado.** Valor que a TACO não publica fica `null` e aparece como "—" (o leite
  integral, por exemplo, não tem calorias nem proteína publicadas). "Tr" (traço) aparece como
  "traço". Nenhum dos dois vira zero.
- O que o script decide é só **classificação**: a categoria do app vem da categoria da TACO
  (carnes, pescados, ovos e leguminosas → proteína; cereais → carboidrato; tubérculos como
  batata e mandioca → carboidrato, embora a TACO os ponha entre as hortaliças), e o tipo de
  proteína vem da origem (animal ou vegetal). Preparações e industrializados ficam sem tipo de
  proteína, em vez de um palpite.
- **Mililitro não é oferecido** como unidade: a TACO é por 100 g e converter volume exigiria
  densidade, que a fonte não dá. Copos e xícaras entram pelas medidas do IBGE, que já estão em
  gramas.
- **Diferenças da especificação:** o ovo médio pesa 45 g no IBGE (a especificação supunha 50 g);
  a TACO não tem macarrão cozido, canela nem tilápia, e suplementos (creatina, hipercalórico)
  não estão em tabela nenhuma — para esses, a pessoa cadastra o alimento com os valores do
  rótulo, e ele fica só no navegador dela.

## Dieta

- Começa com as 8 refeições da especificação, vazias. Dá para criar, renomear, mudar horário,
  subir/descer e remover refeição; adicionar alimento (pela mesma pesquisa da aba Alimentos),
  mudar quantidade e unidade, e remover.
- **Trocar a unidade mantém o peso:** 250 g de arroz viram 2,5 conchas, não 250 conchas.
- Cada refeição tem subtotal: proteína animal, vegetal e total, carboidrato, gordura e kcal.
  Proteína de alimento sem tipo (preparações, café) aparece como "sem tipo", não é dividida
  por palpite.
- **Resumo do dia:** consumido, meta, diferença, % da meta e por kg, como a tabela do item 7 da
  especificação, mais os totais por refeição. O painel Hoje mostra a mesma comparação em barras,
  com o estado **escrito** (abaixo, próximo, atingido, acima), não só na cor. As faixas (85%,
  97%, 103%) são convenção do app, em `PROGRESSO` (`data/default-data.js`).
- Nas somas, traço conta como zero; valor que a fonte não publica fica de fora e o total é
  marcado como **parcial**, com o nome do alimento.
- "Preencher com um dia de exemplo" monta um dia fictício só com alimentos da TACO. Não é
  recomendação nem o plano de ninguém. O plano alimentar da especificação traz o nome de uma
  pessoa real e por isso não entrou no app.

## Corpo

- **Medição:** data e peso obrigatórios; altura, gordura corporal (%), músculo esquelético (%),
  gordura visceral, TMB medida e idade corporal opcionais. O que não foi medido aparece como
  "—". São registros de medição, não diagnóstico, e a tela diz isso.
- **IMC** sai do peso e da altura da medição (ou do perfil, avisando), com a classificação e o
  aviso de que não diferencia músculo de gordura. Gordura e músculo aparecem separados.
- **Histórico** em tabela, da mais recente para a mais antiga, com editar e remover; a última
  medição mostra a variação para a anterior.
- **Atualizar o perfil:** ao salvar, uma caixa (marcada por padrão na medição mais recente) leva
  peso, altura e TMB medida para o perfil, e o painel Hoje passa a usar esses valores. A fonte da
  TMB em uso (medida ou calculada) continua sendo escolhida em Configurações.
- **Avatar** em pixel art, desenhado pelo próprio código (SVG, sem imagem de terceiro), em 8
  estágios por faixa de IMC (`ESTAGIOS_AVATAR`). Só número e faixa, sem nome: é lúdico e não
  rotula ninguém. Pode ser escondido, e a escolha fica salva.
- O "registro inicial" da especificação traz medidas de uma pessoa real e não entrou. O perfil de
  demonstração tem "Preencher com medições de exemplo", com três medições fictícias.

## Medicação (GLP-1 / GIP)

Menu à parte, a partir de uma segunda especificação (controle de canetas como as de
tirzepatida e semaglutida). Quatro seções, cada uma com endereço próprio:

- **Início:** contagem para a próxima aplicação, resumo do estoque ("Restam 2 doses / 1,0 mL")
  com alertas, **registrar aplicação** (data e hora, inclusive retroativa; local num mapa de
  rodízio que sugere o local usado há mais tempo) e as últimas aplicações.
- **Estoque:** canetas e frascos com volume total, dose (mg) e volume por aplicação (mL). Saldo
  = volume total − Σ aplicações; doses restantes = ⌊saldo ÷ volume por aplicação⌋. Uma caneta
  "em uso" por vez, que é a descontada. Alertas de última dose, de até quando o estoque dura
  (doses × intervalo), do prazo fora da geladeira (abertura + dias da bula) e da validade.
- **Diário:** check-in de sintomas e a evolução dose × peso, com o peso das medições da aba Corpo
  (sem interpolar). O gráfico fica para depois.
- **Ajuda:** perguntas frequentes e o link do VigiMed (Anvisa) para relatar evento adverso.

Decisões, todas para não induzir erro de dose:

- **O app só registra.** Dose, volume, intervalo e prazo fora da geladeira são digitados pela
  pessoa, da caixa, da bula ou da prescrição. Sem intervalo configurado, não há contagem — o app
  não supõe "semanal". Nenhum texto sugere dose, e a tela diz para nunca mudar a dose sem
  orientação médica.
- **Sem catálogo de marcas.** A lista da especificação veio de uma resposta de IA (o próprio
  arquivo avisa) e traz nomes que não puderam ser conferidos numa fonte oficial (a consulta da
  Anvisa não estava acessível na sessão). Um catálogo errado causaria o erro de dose que ele
  promete evitar. Para trazer um, a fonte tem que ser a base de dados aberta da Anvisa.
- **Sem os contatos de exemplo** (WhatsApp e e-mail fictícios da especificação). Só o link
  oficial do VigiMed.
- Tudo fica no navegador, como o resto do app.

## Segurança

`vercel.json` publica os cabeçalhos de segurança. A política de conteúdo (CSP) é a mais fechada
possível porque o app não precisa de nada de fora: script, estilo, imagem, manifest e service
worker só do próprio site; nenhuma conexão externa; nenhum script ou estilo dentro do HTML;
`frame-ancestors 'none'` (nenhum site pode abrir o app num iframe). Também `nosniff`,
`Referrer-Policy`, `Permissions-Policy` (câmera, microfone e localização desligados) e HSTS.
O `service-worker.js` vai com `Cache-Control: no-cache`, para a versão nova chegar logo.

**Ao acrescentar algo que venha de fora** (fonte, CDN, API), a CSP bloqueia — é o esperado.
Libere só aquele endereço, na diretiva certa, e nunca com `'unsafe-inline'` ou `*`.

Os dados ficam no `localStorage` do aparelho. Não há servidor, login nem envio de dado.
