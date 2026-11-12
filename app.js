const STATUS = { aguardando: "Sem resposta", interessado: "Interessado", sem_interesse: "Sem interesse", saiu: "Pediu para sair" };
const ENVIO = { "": "Não enviado", enviado: "Enviado", nao_existe: "Número não existe" };
const BASE_AB = ["Inteira", "A", "B"];
const state = {
  pastas: [], estrategia: null, disparos: [], leads: [], bases: {}, inst: [], cz: [], czLeads: [], carregado: {},
  downloads: null, leadsOk: false, czOk: false, podeEditar: true, rota: { tipo: "inicio" },
  busca: "", canal: "", status: "", envio: "", leadsAberto: false, instMes: "",
};
let db = null; let iniciado = false;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const br = (n) => String(n).replace(".", ",");
const fmtData = (s) => { if (!s) return ""; const [y, m, d] = s.slice(0, 10).split("-"); return d ? `${d}/${m}/${y}` : s; };
const hoje = () => new Date().toISOString().slice(0, 10);
const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
const VAZIO = { total: 0, enviados: 0, respostas: 0, interessados: 0, sairam: 0, pedidos: 0, voltaram: 0 };
const carregando = () => `<div class="empty"><i class="ti ti-loader-2" aria-hidden="true"></i>Carregando…</div>`;
const semPermissao = (e) => !!e && (e.code === "permission-denied" || e.code === "invalid_argument");
/* Indicador: [rótulo, valor, linha de apoio, destaque, ícone, medidor 0–100] */
const kpiGrid = (itens) => `<div class="kpis">${itens.map(([l, v, s, h, ic, m]) => `<div class="kpi${h ? " highlight" : ""}">
  <div class="topo">${ic ? `<span class="ico" aria-hidden="true"><i class="ti ${ic}"></i></span>` : ""}<span class="l">${l}</span></div>
  <span class="v">${v}</span>${m != null ? `<div class="medidor" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, m))}%"></span></div>` : ""}<span class="s">${esc(s)}</span></div>`).join("")}</div>`;
const vazio = (ic, titulo, texto) => `<div class="empty"><i class="ti ${ic}" aria-hidden="true"></i><b>${titulo}</b>${texto ? `<span>${texto}</span>` : ""}</div>`;
const secao = (id, ic, titulo, nota, corpo) => `<section aria-labelledby="${id}"><div class="section-head"><h2 id="${id}">${ic ? `<i class="ti ${ic}" aria-hidden="true"></i>` : ""}${titulo}</h2>${nota ? `<span class="note">${nota}</span>` : ""}</div>${corpo}</section>`;
const painel = (id, ic, titulo, nota, corpo, extra = "") => `<section class="painel${extra}" aria-labelledby="${id}"><div class="section-head"><h2 id="${id}">${ic ? `<i class="ti ${ic}" aria-hidden="true"></i>` : ""}${titulo}</h2>${nota ? `<span class="note">${nota}</span>` : ""}</div>${corpo}</section>`;
function cab(titulo, sub) {
  $("titulo").textContent = titulo;
  const s = $("subtitulo"); if (s) { s.textContent = sub || ""; s.hidden = !sub; }
}
/* Funil em barras horizontais: largura relativa à primeira etapa; a porcentagem é sobre a etapa anterior. */
function funil(etapas, cor) {
  const max = Math.max(1, ...etapas.map((e) => e.v || 0));
  return `<div class="funil" style="--cor:${cor || "var(--primaria)"}">${etapas.map((e, i) => {
    const ant = i ? etapas[i - 1].v : null;
    const w = e.v ? Math.max(1.5, (e.v / max) * 100) : 0;
    const p = i === 0 ? "base" : ant ? `${br(pct(e.v, ant))}%` : "—";
    return `<div class="funil-linha" title="${esc(e.nome)}: ${e.v}${i && ant ? ` · ${br(pct(e.v, ant))}% da etapa anterior` : ""}">
      <span class="funil-nome"><i class="ti ${e.icone || "ti-point"}" aria-hidden="true"></i>${e.nome}</span>
      <span class="funil-trilho" aria-hidden="true"><span class="funil-barra" style="width:${w}%"></span></span>
      <span class="funil-v">${e.v}</span><span class="funil-p">${p}</span></div>`;
  }).join("")}<p class="funil-legenda"><span>A porcentagem é sobre a etapa anterior.</span>${etapas.some((e) => e.nota) ? etapas.filter((e) => e.nota).map((e) => `<span>${e.nome}: ${e.nota}</span>`).join("") : ""}</p></div>`;
}
/* Barra de progresso de uma lista: [rótulo, quantidade, classe do segmento] */
function progresso(partes, total) {
  const t = total || partes.reduce((a, p) => a + p[1], 0) || 1;
  return `<div class="progresso"><div class="trilho" role="img" aria-label="${esc(partes.map(([l, v]) => `${l}: ${v}`).join(", "))}">${partes.filter((p) => p[1] > 0).map(([l, v, c]) => `<span class="${c}" style="width:${(v / t) * 100}%" title="${esc(l)}: ${v}"></span>`).join("")}</div>
    <div class="legenda">${partes.map(([l, v, c]) => `<span><i class="${c}" aria-hidden="true"></i>${l} ${v}</span>`).join("")}</div></div>`;
}

/* ---------- métricas (fidelização) ---------- */
function calc(leads, disp) {
  const env = leads.filter((l) => (l.canal === "email" ? !!disp.enviado_em : !!l.enviado));
  const r = { total: leads.length, enviados: env.length, respostas: 0, interessados: 0, sairam: 0, pedidos: 0, voltaram: 0 };
  env.forEach((l) => {
    if (l.status && l.status !== "aguardando") r.respostas++;
    if (l.status === "interessado") r.interessados++;
    if (l.status === "saiu") r.sairam++;
    if (l.pedido_cadastrado) r.pedidos++;
    if (l.voltou_cotar) r.voltaram++;
  });
  return r;
}
function metricasDisparo(d) {
  if (state.leadsOk) {
    const ls = state.leads.filter((l) => l.disparo === d.id);
    return { geral: calc(ls, d), email: calc(ls.filter((l) => l.canal === "email"), d), whatsapp: calc(ls.filter((l) => l.canal === "whatsapp"), d) };
  }
  return d.metricas || { geral: { ...VAZIO, total: d.leads || 0 }, email: VAZIO, whatsapp: VAZIO };
}
function somar(lista) {
  const s = { ...VAZIO };
  lista.forEach((m) => Object.keys(s).forEach((k) => (s[k] += m[k] || 0)));
  return s;
}
function metricasPasta(p) { return somar(state.disparos.filter((d) => d.pasta === p.id).map((d) => metricasDisparo(d).geral)); }

/* ---------- navegação ---------- */
const FRENTE = (r) => (r.tipo === "geral" ? "geral" : r.tipo === "estrategia" ? "estrategia" : ["institucional", "inst", "inst-novo"].includes(r.tipo) ? "institucional" : ["coldzap", "czd"].includes(r.tipo) ? "coldzap" : "fidelizacao");
function hashDe(r) {
  if (r.tipo === "geral") return "";
  if (r.tipo === "inicio") return "fidelizacao";
  if (r.tipo === "institucional" || r.tipo === "coldzap" || r.tipo === "estrategia") return r.tipo;
  if (r.tipo === "inst-novo") return "institucional-novo";
  if (r.tipo === "visao") return "fid-" + r.id;
  return r.id;
}
function ir(rota) {
  state.rota = rota; state.busca = ""; state.canal = ""; state.status = ""; state.envio = ""; state.leadsAberto = false;
  try { const h = hashDe(rota); history.replaceState(null, "", h ? "#" + h : location.pathname); } catch (e) {}
  render(); window.scrollTo(0, 0);
}
function rotaDoHash() {
  const h = decodeURIComponent((location.hash || "").slice(1));
  if (!h) return { tipo: "geral" };
  if (h === "fidelizacao") return { tipo: "inicio" };
  if (h === "estrategia") return { tipo: "estrategia" };
  if (h === "fid-produto" || h === "fid-necessidade") return { tipo: "visao", id: h.slice(4) };
  if (h === "institucional") return { tipo: "institucional" };
  if (h === "institucional-novo") return { tipo: "inst-novo" };
  if (h === "coldzap") return { tipo: "coldzap" };
  if (h.startsWith("in-")) return { tipo: "inst", id: h };
  if (h.startsWith("cz-")) return { tipo: "czd", id: h };
  if (state.disparos.some((d) => d.id === h)) return { tipo: "disparo", id: h };
  if (state.pastas.some((p) => p.id === h)) return { tipo: "pasta", id: h };
  return { tipo: "geral" };
}

function abas() {
  const f = FRENTE(state.rota);
  const r = state.rota;
  const sub = (k) => `<button type="button" class="menu-item menu-sub" data-ir="visao:${k}"${r.tipo === "visao" && r.id === k ? ' aria-current="page"' : ""}><i class="ti ${VISOES[k].ico}" aria-hidden="true"></i>${VISOES[k].nome}</button>`;
  const item = ([k, destino, ico, nome, qtd]) => `<button type="button" class="menu-item" data-ir="${destino}"${f === k && r.tipo !== "visao" ? ' aria-current="page"' : ""}><i class="ti ${ico}" aria-hidden="true"></i>${nome}${iniciado && qtd != null ? `<span class="qtd" aria-label="${qtd} registro(s)">${qtd}</span>` : ""}</button>`;
  $("abas").innerHTML = `<div class="menu-rotulo">Painel</div>` + [
    ["geral", "geral", "ti-layout-dashboard", "Visão geral"],
    ["estrategia", "estrategia", "ti-route", "Estratégia"],
  ].map(item).join("") + `<div class="menu-rotulo">Frentes</div>` + [
    ["fidelizacao", "inicio", "ti-refresh", "Fidelização", state.disparos.length],
  ].map(item).join("") + sub("produto") + sub("necessidade") + [
    ["institucional", "institucional", "ti-building", "Institucional", state.inst.length],
    ["coldzap", "coldzap", "ti-brand-whatsapp", "ColdZap", state.cz.length],
  ].map(item).join("");
}
function crumbs() {
  const c = $("crumbs"); const r = state.rota; const sep = `<i class="ti ti-chevron-right" aria-hidden="true"></i>`;
  let parts = [];
  if (r.tipo === "pasta") parts = [`<button type="button" data-ir="inicio">Fidelização</button>`, `<span aria-current="page">${esc(state.pastas.find((p) => p.id === r.id)?.nome)}</span>`];
  if (r.tipo === "disparo") {
    const d = state.disparos.find((x) => x.id === r.id); const p = state.pastas.find((x) => x.id === d?.pasta);
    parts = [`<button type="button" data-ir="inicio">Fidelização</button>`];
    if (p) parts.push(`<button type="button" data-ir="pasta:${esc(p.id)}">${esc(p.nome)}</button>`);
    parts.push(`<span aria-current="page">${esc(d?.nome)}</span>`);
  }
  if (r.tipo === "visao") parts = [`<button type="button" data-ir="inicio">Fidelização</button>`, `<span aria-current="page">${VISOES[r.id]?.nome || ""}</span>`];
  if (r.tipo === "inst" || r.tipo === "inst-novo") parts = [`<button type="button" data-ir="institucional">Institucional</button>`, `<span aria-current="page">${r.tipo === "inst-novo" ? "Novo disparo" : "Ficha do disparo"}</span>`];
  if (r.tipo === "czd") parts = [`<button type="button" data-ir="coldzap">ColdZap</button>`, `<span aria-current="page">${esc(state.cz.find((x) => x.id === r.id)?.empresa || "Lista")}</span>`];
  c.innerHTML = parts.join(sep);
}

/* ---------- blocos (fidelização) ---------- */
function kpis(m) {
  return kpiGrid([
    ["Enviados", m.enviados, m.enviados < m.total ? `${m.total - m.enviados} aguardando envio` : `${m.total} na base`, false, "ti-send", m.total ? pct(m.enviados, m.total) : null],
    ["Responderam", m.respostas, `${br(pct(m.respostas, m.enviados))}% dos enviados`, false, "ti-message-circle"],
    ["Interessados", m.interessados, `${br(pct(m.interessados, m.enviados))}% dos enviados`, false, "ti-thumb-up"],
    ["Orçamentos gerados", m.pedidos, `${br(pct(m.pedidos, m.respostas))}% das respostas`, true, "ti-file-invoice"],
    ["Pediram para sair", m.sairam, `${br(pct(m.sairam, m.enviados))}% dos enviados`, false, "ti-door-exit"],
  ]);
}
const fidEtapas = (m) => [
  { nome: "Na base", icone: "ti-database", v: m.total }, { nome: "Enviados", icone: "ti-send", v: m.enviados },
  { nome: "Responderam", icone: "ti-message-circle", v: m.respostas }, { nome: "Interessados", icone: "ti-thumb-up", v: m.interessados },
  { nome: "Orçamentos", icone: "ti-file-invoice", v: m.pedidos },
];
function canais(mm) {
  const card = (m, nome, ic, cor) => `<div class="canal" style="--cor:${cor}"><h3><span style="font:inherit;color:inherit;display:inline-flex;gap:8px;align-items:center"><i class="ti ${ic}" aria-hidden="true" style="color:${cor}"></i>${nome}</span><span>${m.enviados} enviados</span></h3>${[["Responderam", m.respostas], ["Interessados", m.interessados], ["Orçamentos", m.pedidos]].map(([l, v]) => {
    const p = pct(v, m.enviados);
    return `<div class="bar"><span>${l}</span><span class="track" aria-hidden="true"><span class="fill" style="width:${Math.min(p, 100)}%"></span></span><span class="pct">${br(p)}%</span></div>`;
  }).join("")}</div>`;
  return `<div class="canais">${card(mm.whatsapp, "WhatsApp", "ti-brand-whatsapp", "var(--f-cz)")}${card(mm.email, "E-mail", "ti-mail", "var(--f-fid)")}</div>`;
}
const situacao = (d) => (d.enviado_em ? `<span class="chip ok">Enviado em ${fmtData(d.enviado_em)}</span>` : `<span class="chip neutro">Preparado, aguardando envio</span>`);

/* As duas visões da Fidelização. Todo disparo tem uma visão (campo "visao"; sem o campo, conta como "produto"). */
const VISOES = {
  produto: { nome: "Por produto", ico: "ti-box", curto: "Outras opções do que o lead cotou",
    texto: "Quem cotou um produto recebe as outras opções desse mesmo produto: tipos, modelos, medidas e materiais. Exemplo: para quem cotou pallet de madeira, apresentamos as opções em plástico, metal, papelão e descartável, em diversas medidas, para compra ou locação.",
    base: "Quem cotou o produto no site.", oferta: "As outras opções do mesmo produto. O tipo que o lead cotou sai da lista." },
  necessidade: { nome: "Por necessidade", ico: "ti-puzzle", curto: "O que o segmento do lead costuma usar",
    texto: "A base é definida por segmento, e a oferta reúne os produtos que esse tipo de empresa costuma comprar. Exemplo: para uma distribuidora ou fábrica de bebidas, apresentamos garrafa PET, câmara fria e filme termoencolhível, itens que esse segmento cota bem acima da média.",
    base: "Todos os leads de um segmento (identificado pelo nome da empresa) que já cotaram no site.", oferta: "Os produtos que o segmento cota acima da média no site, mais os complementos de quem usa o produto." },
};
const visaoDe = (d) => (d.visao === "necessidade" ? "necessidade" : "produto");
const chipVisao = (d) => `<span class="chip info sem-ponto"><i class="ti ${VISOES[visaoDe(d)].ico}" aria-hidden="true" style="font-size:13px"></i>${VISOES[visaoDe(d)].nome}</span>`;

/* Matriz de oferta: um nó (o que o lead cotou, ou o segmento) ligado às linhas do que oferecer. */
function matriz(eyebrow, nome, nota, itens) {
  return `<div class="matriz"><div class="matriz-no"><span class="eyebrow">${eyebrow}</span><b>${esc(nome)}</b>${nota ? `<p>${esc(nota)}</p>` : ""}</div>
    <div class="ofertas">${itens.map((e) => `<div class="oferta${e.evitar ? " nao" : ""}"><div><h3>${e.rotulo ? `<small>${esc(e.rotulo)}</small>` : ""}${esc(e.linha)}</h3><div class="para">${esc(e.oferta || "")}</div></div>${e.dado ? `<div class="dado">${esc(e.dado)}</div>` : ""}</div>`).join("")}</div></div>`;
}
const matrizProduto = (p) => (p.estrategia?.length ? matriz("Se o lead cotou", p.nome, p.estrategia_nota,
  p.estrategia.map((e) => ({ rotulo: "Cotou", linha: e.linha, oferta: e.oferta ? "Apresente: " + e.oferta : "", dado: e.dado }))) : "");
function matrizNecessidade(p) {
  const grupos = p.necessidade || [];
  if (!grupos.length) return "";
  const gerais = grupos.filter((g) => g.geral); const segs = grupos.filter((g) => !g.geral);
  const seg = (g) => `<article class="segmento" aria-label="${esc(g.segmento)}"><div class="seg-topo"><span class="eyebrow">Segmento</span><b>${esc(g.segmento)}</b>${g.nota ? `<p class="note">${esc(g.nota)}</p>` : ""}</div>
    <ul>${(g.itens || []).map((e) => `<li><div><b>${esc(e.linha)}</b><span>${esc(e.oferta || "")}</span></div>${e.dado ? `<span class="dado-seg">${esc(e.dado)}</span>` : ""}</li>`).join("")}</ul>
    ${g.evitar ? `<p class="evitar"><i class="ti ti-ban" aria-hidden="true"></i>${esc(g.evitar)}</p>` : ""}</article>`;
  return `<div class="pilha" style="gap:16px">${gerais.map((g) => matriz(`Quem cotou ${esc(p.nome.toLowerCase())}`, g.segmento, g.nota,
    [...(g.itens || []).map((e) => ({ linha: e.linha, oferta: e.oferta, dado: e.dado })), ...(g.evitar ? [{ evitar: true, rotulo: "Evitar", linha: "Não oferecer", oferta: g.evitar }] : [])])).join("")}
    ${segs.length ? `<div class="segmentos">${segs.map(seg).join("")}</div>` : `<p class="note" style="display:flex;gap:8px;align-items:center"><i class="ti ti-hourglass" aria-hidden="true"></i>As listas por segmento entram aqui depois de aprovadas.</p>`}</div>`;
}
/* Quem recebeu o quê: classes A, B e C dos leads do disparo e quantos ficaram fora. */
function classesBloco(d) {
  if (!state.leadsOk) return "";
  const c = { A: 0, B: 0, C: 0 };
  state.leads.forEach((l) => { if (l.disparo === d.id && c[l.classe] != null) c[l.classe]++; });
  if (!c.A && !c.B && !c.C) return "";
  const fora = +d.fora || 0;
  return painel("h-cl", "ti-users-group", "Quem recebeu o quê", `${c.A + c.B + c.C + fora} leads avaliados`,
    progresso([["Classe A", c.A, "seg-a"], ["Classe B", c.B, "seg-b"], ["Classe C", c.C, "seg-c"], ["Fora", fora, "seg-fora"]]) +
    `<p class="note">A: conta recorrente, recebe WhatsApp personalizado (ou e-mail personalizado sem celular). B e C: carta do grupo por e-mail. Fora: não recebe, com o motivo registrado na base.</p>`);
}
function cardDisparo(d) {
  const m = metricasDisparo(d).geral; const p = state.pastas.find((x) => x.id === d.pasta);
  return `<button type="button" class="card fid" data-ir="disparo:${esc(d.id)}">
    <div class="top"><div><div class="nome">${p ? esc(p.nome) + " · " : ""}${esc(d.nome)}</div><div class="sub">${fmtData(d.enviado_em || d.data)} · ${m.total} leads</div></div>${situacao(d)}</div>
    <div>${chipVisao(d)}</div>
    ${d.carta ? `<div class="sub">${esc(d.carta)}</div>` : ""}
    ${progresso([["Enviados", m.enviados, "seg-ok"], ["Aguardando envio", Math.max(0, m.total - m.enviados), "seg-neutro"]], m.total)}
    <div class="stats"><div class="stat"><b>${m.enviados}/${m.total}</b><span>enviados</span></div><div class="stat"><b>${br(pct(m.respostas, m.enviados))}%</b><span>resposta</span></div><div class="stat"><b>${m.pedidos}</b><span>orçamentos</span></div></div>
    <span class="go">Abrir disparo <i class="ti ti-arrow-right" aria-hidden="true"></i></span></button>`;
}
function cardVisao(k) {
  const v = VISOES[k]; const ds = state.disparos.filter((d) => visaoDe(d) === k); const m = somar(ds.map((d) => metricasDisparo(d).geral));
  return `<section class="frente fid" aria-labelledby="vs-${k}">
    <div class="frente-top"><span class="ico-frente" aria-hidden="true"><i class="ti ${v.ico}"></i></span><div><b id="vs-${k}">${v.nome}</b><span>${v.curto} · ${ds.length} disparo(s)</span></div></div>
    <p class="note" style="font-size:13.5px;color:var(--ink-2)">${v.texto}</p>
    <div class="mini"><div><b>${m.enviados}</b><span>Enviados</span></div><div><b>${m.respostas}</b><span>Responderam</span></div><div><b>${m.interessados}</b><span>Interessados</span></div><div><b>${m.pedidos}</b><span>Orçamentos</span></div></div>
    <button type="button" class="abrir" data-ir="visao:${k}">Abrir ${v.nome.toLowerCase()} <i class="ti ti-arrow-right" aria-hidden="true"></i></button></section>`;
}

/* ---------- telas (fidelização) ---------- */
function telaInicio() {
  cab("Fidelização", "Quem já cotou no site recebe e-mail e WhatsApp com novas ofertas, em duas visões: por produto (outras opções do que cotou) e por necessidade (o que o segmento dele costuma usar).");
  const total = somar(state.disparos.map((d) => metricasDisparo(d).geral));
  const pastas = [...state.pastas].sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
  const rel = state.downloads && window.XLSX ? painel("h-rel", "ti-file-spreadsheet", "Relatório mensal", "", `<p class="note">Disparos enviados no mês, resultados por canal e as respostas recebidas, em Excel.</p>
      <div class="relatorio"><label for="mesRel">Mês <select id="mesRel">${meses().map((m, i) => `<option value="${m}"${i === 0 ? " selected" : ""}>${nomeMes(m)}</option>`).join("")}</select></label>
      <button type="button" class="btn" data-relatorio="1"><i class="ti ti-download" aria-hidden="true"></i>Baixar relatório</button></div><span class="note" id="relMsg"></span>`) : "";
  return `<div class="pilha">
    ${secao("h-tot", "ti-chart-bar", "Todos os disparos", `${state.disparos.length} disparo(s) em ${state.pastas.length} pasta(s)`, kpis(total))}
    ${secao("h-vis", "ti-arrows-split", "As duas visões", "Cada disparo segue uma das duas", `<div class="frentes">${cardVisao("produto")}${cardVisao("necessidade")}</div>`)}
    <div class="grade-2">${painel("h-ff", "ti-filter", "Funil da fidelização", "As duas visões somadas", funil(fidEtapas(total), "var(--f-fid)"))}${rel}</div>
    ${secao("h-pastas", "ti-folders", "Pastas por produto", "Cada pasta tem o que oferecer nas duas visões e os disparos do produto", `<div class="grid-cards">${pastas.map((p) => {
      const m = metricasPasta(p); const ds = state.disparos.filter((d) => d.pasta === p.id);
      return `<button type="button" class="card fid" data-ir="pasta:${esc(p.id)}">
        <div class="top"><div><div class="nome">${esc(p.nome)}</div><div class="sub">${ds.length} disparo(s) · ${m.total} leads</div></div><span class="folder-ico" aria-hidden="true"><i class="ti ti-folder"></i></span></div>
        ${progresso([["Enviados", m.enviados, "seg-ok"], ["Aguardando envio", Math.max(0, m.total - m.enviados), "seg-neutro"]], m.total)}
        <div class="stats"><div class="stat"><b>${br(pct(m.respostas, m.enviados))}%</b><span>resposta</span></div><div class="stat"><b>${m.interessados}</b><span>interessados</span></div><div class="stat"><b>${m.pedidos}</b><span>orçamentos</span></div></div>
        <span class="go">Abrir pasta <i class="ti ti-arrow-right" aria-hidden="true"></i></span></button>`;
    }).join("")}<div class="card nova"><div class="nome">Próximo produto</div><div class="sub">Novas pastas aparecem aqui quando um produto entra no projeto.</div></div></div>`)}
  </div>`;
}
function telaVisao(k) {
  const v = VISOES[k]; if (!v) return telaInicio();
  cab(`Fidelização · ${v.nome}`, v.texto);
  const ds = state.disparos.filter((d) => visaoDe(d) === k).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const m = somar(ds.map((d) => metricasDisparo(d).geral));
  const pastas = [...state.pastas].sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
  const matrizes = pastas.map((p) => (k === "produto" ? matrizProduto(p) : matrizNecessidade(p))).filter(Boolean);
  return `<div class="pilha">
    <dl class="ficha">
      <div><dt>Para quem</dt><dd>${v.base}</dd></div>
      <div><dt>O que oferece</dt><dd>${v.oferta}</dd></div>
      <div><dt>Canais</dt><dd>E-mail com a carta do grupo; WhatsApp personalizado para a classe A</dd></div>
      <div><dt>Como medimos</dt><dd>Respostas, interessados e orçamentos gerados</dd></div>
    </dl>
    ${secao("h-vr", "ti-chart-bar", "Resultado", `${ds.length} disparo(s) ${v.nome.toLowerCase()}`, kpis(m))}
    ${secao("h-vo", "ti-target", "O que oferecer", k === "produto" ? "Para cada tipo cotado, as outras opções do mesmo produto" : "Por produto cotado e por segmento", matrizes.join("") || vazio("ti-list-search", "Nenhuma lista de oferta cadastrada ainda."))}
    ${secao("h-vd", "ti-send", "Disparos", "", ds.length ? `<div class="grid-cards">${ds.map(cardDisparo).join("")}</div>` : vazio("ti-send-off", `Nenhum disparo ${v.nome.toLowerCase()} ainda.`, "O primeiro disparo aparece aqui quando for preparado."))}
  </div>`;
}
function telaPasta(id) {
  const p = state.pastas.find((x) => x.id === id); if (!p) return telaInicio();
  cab(p.nome, p.descricao || "");
  const ds = state.disparos.filter((d) => d.pasta === id).sort((a, b) => (b.numero || 0) - (a.numero || 0));
  return `<div class="pilha">
    ${secao("h-pr", "ti-chart-bar", "Resultado da pasta", "", kpis(metricasPasta(p)))}
    ${p.estrategia?.length ? secao("h-est", VISOES.produto.ico, "Por produto: o que oferecer", "Para cada tipo cotado, as outras opções do mesmo produto", matrizProduto(p)) : ""}
    ${p.necessidade?.length ? secao("h-nec", VISOES.necessidade.ico, "Por necessidade: o que oferecer", "Complementos de quem usa o produto e listas por segmento", matrizNecessidade(p)) : ""}
    ${secao("h-ds", "ti-send", "Disparos", `${ds.length} disparo(s)`, `<div class="grid-cards">${ds.map(cardDisparo).join("") || vazio("ti-send-off", "Nenhum disparo nesta pasta ainda.")}</div>`)}
  </div>`;
}
function telaDisparo(id) {
  const d = state.disparos.find((x) => x.id === id); if (!d) return telaInicio();
  const p = state.pastas.find((x) => x.id === d.pasta) || {};
  cab(`${p.nome ? p.nome + " · " : ""}${d.nome}`, d.produto ? `Produto: ${d.produto}` : "");
  const mm = metricasDisparo(d); const cl = classesBloco(d);
  const fun = painel("h-fg", "ti-filter", "Funil do disparo", "E-mail e WhatsApp juntos", funil(fidEtapas(mm.geral), "var(--f-fid)"));
  return `<div class="pilha">
    <dl class="ficha">
      <div><dt>Situação</dt><dd>${situacao(d)}</dd></div>
      <div><dt>Visão</dt><dd>${chipVisao(d)}</dd></div>
      <div><dt>Período da base</dt><dd>${d.periodo_inicio ? `Cotações de ${fmtData(d.periodo_inicio)} a ${fmtData(d.periodo_fim)}` : esc(d.base || "")}</dd></div>
      ${d.leads_base ? `<div><dt>Leads na base</dt><dd>${d.leads_base} encontrados · ${d.fora || 0} ficaram fora</dd></div>` : ""}
      <div><dt>Canais</dt><dd>${d.email || 0} por e-mail · ${d.whatsapp || 0} por WhatsApp</dd></div>
      <div class="largo"><dt>Cartas</dt><dd>${esc(d.carta || "")}</dd></div>
      ${d.criterio ? `<div class="largo"><dt>Critério</dt><dd>${esc(d.criterio)}</dd></div>` : ""}
    </dl>
    ${state.downloads && window.XLSX ? `<div class="acoes">
      ${d.campanha && window.ExcelJS ? `<button type="button" class="btn" data-campanha="${esc(d.id)}"><i class="ti ti-download" aria-hidden="true"></i>Baixar campanha</button>` : ""}
      ${state.leadsOk ? `<button type="button" class="btn secundario" data-baixar="${esc(d.id)}"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i>Baixar base em Excel</button>` : ""}
      <span class="note" id="dlMsg">Campanha: lista de WhatsApp pronta para enviar, lista de e-mail e textos. Base: critérios, destino de cada lead e respostas até agora.</span></div>` : ""}
    ${secao("h-res", "ti-chart-bar", "Resultado", "", kpis(mm.geral))}
    ${cl ? `<div class="grade-2 igual">${fun}${cl}</div>` : fun}
    ${secao("h-fun", "ti-mail", "Funil do e-mail", "Copie da tela de Analytics do BillionMail: o Success e os percentuais, como aparecem", funilEmail(d, mm.email))}
    ${secao("h-can", "ti-arrows-split-2", "E-mail × WhatsApp", "Percentuais sobre os enviados em cada canal", canais(mm))}
    <section>${blocoLeads(d)}</section></div>`;
}

/* Funil do e-mail: os campos seguem a tela de Analytics do BillionMail (Success em quantidade; Delivered, Opened, Clicked e Bounced em %). */
function funilBm(d) {
  const bm = d.bm || {}; const env = +bm.enviados || 0;
  const q = (p) => (env && bm[p] != null && bm[p] !== "" ? Math.round((env * +bm[p]) / 100) : null);
  return { env, entregues: q("delivered_pct"), abertos: q("opened_pct"), cliques: q("clicked_pct"), bounces: q("bounced_pct") };
}
function funilEmail(d, me) {
  const bm = d.bm || {}; const f = funilBm(d);
  const campo = (k, pctCampo) => state.podeEditar
    ? `<span style="display:inline-flex;gap:4px;align-items:center"><input type="number" min="0" ${pctCampo ? 'max="100" step="0.01"' : 'step="1"'} inputmode="decimal" data-bm="${k}" data-disparo="${esc(d.id)}" id="bm-${k}" value="${bm[k] ?? ""}" placeholder="—" style="width:96px" aria-label="${k}">${pctCampo ? "%" : ""}</span>`
    : bm[k] != null ? `${br(bm[k])}${pctCampo ? "%" : ""}` : "—";
  const n = (x) => (x == null ? "—" : x);
  const ent = f.entregues;
  const linhas = [
    ["Tamanho da base", "", n(d.tamanho_base), "Leads encontrados no período"],
    ["Base limpa", "", n(d.base_limpa_email), "E-mails que foram para o disparo"],
    ["Enviados", campo("enviados"), n(f.env || null), "Send Statistics · Success"],
    ["Entregues", campo("delivered_pct", true), n(ent), "Delivered"],
    ["Abertos", campo("opened_pct", true), n(f.abertos), "Opened · é o % lido"],
    ["Cliques", campo("clicked_pct", true), n(f.cliques), "Clicked"],
    ["Bounce", campo("bounced_pct", true), n(f.bounces), "Bounced · e-mail que voltou"],
    ["Respostas", "", me.respostas, ent ? `Marcadas na lista de leads · ${br(pct(me.respostas, ent))}% dos entregues` : "Marcadas na lista de leads"],
    ["Orçamentos", "", me.pedidos, [ent ? `${br(pct(me.pedidos, ent))}% dos entregues` : "", me.respostas ? `${br(pct(me.pedidos, me.respostas))}% das respostas` : ""].filter(Boolean).join(" · ") || "Orçamentos gerados pelas respostas"],
  ];
  const visual = f.env ? `<div class="painel">${funil([
    { nome: "Enviados", icone: "ti-send", v: f.env }, { nome: "Entregues", icone: "ti-mail-check", v: ent || 0 },
    { nome: "Abertos", icone: "ti-mail-opened", v: f.abertos || 0 }, { nome: "Cliques", icone: "ti-click", v: f.cliques || 0 },
    { nome: "Respostas", icone: "ti-message-circle", v: me.respostas }, { nome: "Orçamentos", icone: "ti-file-invoice", v: me.pedidos },
  ], "var(--f-fid)")}</div>` : "";
  return `<div class="pilha" style="gap:14px">${visual}<div class="tbl-wrap"><table><thead><tr><th>Etapa</th><th>No BillionMail</th><th>Quantidade</th><th>Onde achar / taxa</th></tr></thead><tbody>${linhas.map(([a, b, c, t]) =>
    `<tr><td><b>${a}</b></td><td class="num">${b}</td><td class="num">${c}</td><td class="note">${t}</td></tr>`).join("")}</tbody></table></div></div>`;
}

async function salvarBm(el) {
  const id = el.dataset.disparo; const d = state.disparos.find((x) => x.id === id); if (!d || !db) return;
  const ehPct = el.dataset.bm.endsWith("_pct");
  const v = el.value === "" ? null : ehPct ? Math.min(100, Math.max(0, Math.round(+el.value * 100) / 100)) : Math.max(0, Math.round(+el.value));
  const bm = { ...(d.bm || {}), [el.dataset.bm]: v };
  el.disabled = true;
  try { await db.collection("disparos").doc(id).update({ bm }); d.bm = bm; render(); }
  catch (e) { el.disabled = false; el.setCustomValidity("Não foi possível salvar"); el.reportValidity(); }
}

function blocoLeads(d) {
  if (!state.leadsOk) return `<div class="empty">A lista de leads fica visível só para quem opera os disparos.</div>`;
  const q = state.busca.trim().toLowerCase();
  const todos = state.leads.filter((l) => l.disparo === d.id);
  const ls = todos.filter((l) => (!state.canal || l.canal === state.canal) && (!state.status || (l.status || "aguardando") === state.status) &&
      (!q || [l.empresa, l.nome, l.email].some((v) => (v || "").toLowerCase().includes(q))))
    .sort((a, b) => (a.canal === b.canal ? (a.dia || "").localeCompare(b.dia || "") || (a.empresa || a.nome || "").localeCompare(b.empresa || b.nome || "") : a.canal === "whatsapp" ? -1 : 1));
  const dis = state.podeEditar ? "" : " disabled";
  const linhas = ls.map((l) => {
    const st = l.status || "aguardando";
    return `<tr data-id="${esc(l._id)}">
      <td><div class="who"><b>${esc(l.empresa || l.nome || "Sem nome")}</b><small>${esc(l.empresa ? l.nome : "")}${l.empresa && l.nome ? " · " : ""}${esc(l.email)}</small></div></td>
      <td><span class="tag ${l.canal}">${l.canal === "whatsapp" ? "WhatsApp" : "E-mail"}</span>${l.dia ? `<br><span class="note">${esc(l.dia)}</span>` : ""}${l.classe ? `<br><span class="note">Classe ${esc(l.classe)}${l.carta ? ` · ${esc(l.carta)}` : ""}</span>` : ""}</td>
      <td><div class="pedido">${esc(l.o_que_pediu || "")}</div><span class="note">cotou em ${fmtData(l.cotou_em)}</span></td>
      <td>${l.canal === "whatsapp" ? `<label class="check"><input type="checkbox" data-f="enviado" id="env-${esc(l._id)}"${l.enviado ? " checked" : ""}${dis}> Enviado</label>` : d.enviado_em ? `<span class="note">enviado em ${fmtData(d.enviado_em)}</span>` : `<span class="note">aguardando disparo</span>`}</td>
      <td><select data-f="status" id="st-${esc(l._id)}" class="st-${st}" aria-label="Resposta"${dis}>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${k === st ? " selected" : ""}>${v}</option>`).join("")}</select></td>
      <td><label class="check"><input type="checkbox" data-f="pedido_cadastrado" id="ped-${esc(l._id)}"${l.pedido_cadastrado ? " checked" : ""}${dis}> Sim</label></td>
      <td><input type="text" class="obs" data-f="obs" id="obs-${esc(l._id)}" value="${esc(l.obs || "")}" placeholder="Anotação"${dis}></td></tr>`;
  }).join("");
  return `<details class="leads" id="leadsDet"${state.leadsAberto ? " open" : ""}><summary>Leads do disparo <span class="note" style="font:400 13px var(--body)">${todos.length} leads · marque aqui as respostas</span></summary>
    <div class="leads-body">
      <div class="filters">
        <input type="search" id="busca" value="${esc(state.busca)}" placeholder="Buscar por empresa, nome ou e-mail" aria-label="Buscar lead">
        <select id="fCanal" aria-label="Filtrar canal"><option value="">Todos os canais</option><option value="whatsapp"${state.canal === "whatsapp" ? " selected" : ""}>WhatsApp</option><option value="email"${state.canal === "email" ? " selected" : ""}>E-mail</option></select>
        <select id="fStatus" aria-label="Filtrar resposta"><option value="">Todas as respostas</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${state.status === k ? " selected" : ""}>${v}</option>`).join("")}</select>
      </div>
      <div class="status-line" id="statusLine" role="status"></div>
      ${ls.length ? `<div class="tbl-wrap"><table><thead><tr><th>Lead</th><th>Canal</th><th>O que pediu</th><th>Envio</th><th>Resposta</th><th>Orçamento gerado</th><th>Observação</th></tr></thead><tbody>${linhas}</tbody></table></div>` : `<div class="empty">Nenhum lead com esses filtros.</div>`}
    </div></details>`;
}

/* ---------- Institucional: disparos por segmento, uma linha por disparo ---------- */
function instCalc(d) {
  const bm = d.bm || {}; const env = num(bm.enviados) || 0;
  const q = (k) => (env && num(bm[k]) != null ? Math.round((env * num(bm[k])) / 100) : 0);
  return { env, entregues: q("delivered_pct"), abertos: q("opened_pct"), cliques: q("clicked_pct"), bounces: q("bounced_pct"),
    respostas: num(d.respostas) || 0, orcamentos: num(d.orcamentos) || 0, base: num(d.tamanho_base) || 0, limpa: num(d.base_limpa) || 0 };
}
function instSomar(lista) {
  const s = { n: lista.length, env: 0, entregues: 0, abertos: 0, cliques: 0, bounces: 0, respostas: 0, orcamentos: 0, base: 0, limpa: 0 };
  lista.forEach((d) => { const c = instCalc(d); Object.keys(c).forEach((k) => (s[k] += c[k])); });
  return s;
}
function instKpis(s) {
  return kpiGrid([
    ["Disparos", s.n, `${s.limpa} e-mails na base limpa`, false, "ti-send"],
    ["Entregues", s.entregues, s.env ? `${br(pct(s.entregues, s.env))}% dos ${s.env} enviados` : "lance os números do BillionMail", false, "ti-mail-check", s.env ? pct(s.entregues, s.env) : null],
    ["% lido", `${br(pct(s.abertos, s.entregues))}%`, `${s.abertos} abertos`, false, "ti-mail-opened", s.entregues ? pct(s.abertos, s.entregues) : null],
    ["Cliques no link", s.cliques, `${br(pct(s.cliques, s.entregues))}% dos entregues`, false, "ti-click"],
    ["Respostas", s.respostas, `${br(pct(s.respostas, s.entregues))}% dos entregues`, false, "ti-message-circle"],
    ["Orçamentos", s.orcamentos, `${br(pct(s.orcamentos, s.respostas))}% das respostas (conversão)`, true, "ti-file-invoice"],
  ]);
}
const instEtapas = (s) => [
  { nome: "Base limpa", icone: "ti-database", v: s.limpa }, { nome: "Entregues", icone: "ti-mail-check", v: s.entregues },
  { nome: "Abertos", icone: "ti-mail-opened", v: s.abertos }, { nome: "Cliques", icone: "ti-click", v: s.cliques },
  { nome: "Respostas", icone: "ti-message-circle", v: s.respostas }, { nome: "Orçamentos", icone: "ti-file-invoice", v: s.orcamentos },
];
const linhaInst = (s) => `<td class="num">${s.limpa}</td><td class="num">${s.entregues}</td><td class="num">${br(pct(s.abertos, s.entregues))}%</td><td class="num">${s.cliques}</td><td class="num">${s.respostas}</td><td class="num">${s.orcamentos}</td><td class="num">${br(pct(s.orcamentos, s.respostas))}%</td>`;
function telaInstitucional() {
  cab("Institucional", "Cartas do Soluções Industriais para uma base escolhida por segmento, sem fornecedor específico. Cada disparo é uma linha, com o funil do BillionMail e o retorno.");
  if (!state.carregado.inst) return carregando();
  const mesesInst = [...new Set(state.inst.map((d) => (d.data_disparo || "").slice(0, 7)).filter(Boolean))].sort().reverse();
  const lista = state.inst.filter((d) => !state.instMes || (d.data_disparo || "").startsWith(state.instMes))
    .sort((a, b) => (b.data_disparo || b.data_solicitacao || "").localeCompare(a.data_disparo || a.data_solicitacao || ""));
  const s = instSomar(lista);
  const segs = {}; lista.forEach((d) => (segs[d.segmento || "Sem segmento"] ||= []).push(d));
  const segLinhas = Object.entries(segs).map(([seg, ds]) => [seg, ds.length, instSomar(ds)]).sort((a, b) => b[2].orcamentos - a[2].orcamentos || b[1] - a[1]);
  return `<div class="pilha">
    <div class="acoes">
      ${state.podeEditar ? `<button type="button" class="btn" data-ir="inst-novo"><i class="ti ti-plus" aria-hidden="true"></i>Novo disparo institucional</button>` : ""}
      <label for="instMes" class="note" style="display:flex;gap:8px;align-items:center">Mês do disparo <select id="instMes"><option value="">Todos</option>${mesesInst.map((m) => `<option value="${m}"${state.instMes === m ? " selected" : ""}>${nomeMes(m)}</option>`).join("")}</select></label>
    </div>
    ${secao("h-it", "ti-chart-bar", "Resultado", state.instMes ? nomeMes(state.instMes) : "Todos os meses", instKpis(s))}
    ${lista.length ? `
    ${painel("h-if", "ti-filter", "Funil institucional", "Do e-mail limpo ao orçamento", funil(instEtapas(s), "var(--f-inst)"))}
    ${secao("h-seg", "ti-category", "Por segmento", "Conversão = orçamentos ÷ respostas", `<div class="tbl-wrap"><table><thead><tr><th>Segmento</th><th class="num">Disparos</th><th class="num">Base limpa</th><th class="num">Entregues</th><th class="num">% lido</th><th class="num">Cliques</th><th class="num">Respostas</th><th class="num">Orçamentos</th><th class="num">Conversão</th></tr></thead>
      <tbody>${segLinhas.map(([seg, n, t]) => `<tr><td><b>${esc(seg)}</b></td><td class="num">${n}</td>${linhaInst(t)}</tr>`).join("")}</tbody></table></div>`)}
    ${secao("h-il", "ti-list-details", "Disparos", `${lista.length} disparo(s) · abra um para lançar ou corrigir os números`, `<div class="tbl-wrap"><table><thead><tr><th>Disparo em</th><th>Segmento</th><th>Base</th><th>Solicitante</th><th class="num">Base limpa</th><th class="num">Entregues</th><th class="num">% lido</th><th class="num">Cliques</th><th class="num">Respostas</th><th class="num">Orçamentos</th><th class="num">Conversão</th></tr></thead>
      <tbody>${lista.map((d) => `<tr><td><button type="button" class="linkbtn" data-ir="inst:${esc(d.id)}">${d.data_disparo ? fmtData(d.data_disparo) : "Sem data"}</button></td><td>${esc(d.segmento || "")}</td><td><span class="tag ab">${esc(d.base_ab || "Inteira")}</span></td><td>${esc(d.solicitante || "")}</td>${linhaInst(instSomar([d]))}</tr>`).join("")}</tbody></table></div>`)}`
    : vazio("ti-building", `Nenhum disparo institucional registrado${state.instMes ? " neste mês" : " ainda"}.`, state.podeEditar ? "Use “Novo disparo institucional” para lançar o primeiro: segmento, base e data. Os números do BillionMail e as respostas entram depois do envio." : "Os disparos aparecem aqui assim que forem lançados.")}
  </div>`;
}
function telaInstForm(id) {
  const novo = !id;
  const d = novo ? { base_ab: "Inteira", data_solicitacao: hoje() } : state.inst.find((x) => x.id === id);
  cab(novo ? "Novo disparo institucional" : d ? `${d.segmento || "Disparo"}${d.data_disparo ? " · " + fmtData(d.data_disparo) : ""}` : "Disparo institucional",
    novo ? "Lance o segmento, a base e a data. Os números do BillionMail e as respostas entram depois do envio." : "Ficha do disparo: base, números do BillionMail e retorno.");
  if (!d) return state.carregado.inst ? `<div class="empty">Este disparo não existe mais. <button type="button" class="linkbtn" data-ir="institucional">Voltar para a lista</button></div>` : carregando();
  const bm = d.bm || {}; const dis = state.podeEditar ? "" : " disabled";
  const f = (k, rot, tipo, val, extra = "") => `<label class="campo" for="i_${k}">${rot}<input type="${tipo}" id="i_${k}" value="${esc(val ?? "")}"${extra}${dis}></label>`;
  const segsExist = [...new Set(state.inst.map((x) => x.segmento).filter(Boolean))].sort();
  const c = instCalc(d);
  return `<form id="instForm" class="form" data-id="${esc(id || "")}" novalidate>
    <fieldset><legend>Disparo</legend><div class="campos">
      ${f("segmento", "Segmento", "text", d.segmento, ' list="segList" required autocomplete="off"')}
      <datalist id="segList">${segsExist.map((s) => `<option value="${esc(s)}"></option>`).join("")}</datalist>
      ${f("solicitante", "Solicitante", "text", d.solicitante)}
      ${f("data_solicitacao", "Data da solicitação", "date", d.data_solicitacao)}
      ${f("data_disparo", "Data do disparo", "date", d.data_disparo)}
      <label class="campo" for="i_base_ab">Base utilizada<select id="i_base_ab"${dis}>${BASE_AB.map((v) => `<option value="${v}"${(d.base_ab || "Inteira") === v ? " selected" : ""}>${v === "Inteira" ? "Inteira" : "Metade " + v}</option>`).join("")}</select></label>
      ${f("remetente", "Remetente", "text", d.remetente)}
      ${f("assunto", "Assunto do e-mail", "text", d.assunto)}
      ${f("base_link", "Base de disparo (link ou arquivo)", "text", d.base_link)}
      ${f("tamanho_base", "Tamanho da base", "number", d.tamanho_base, ' min="0" step="1" inputmode="numeric"')}
      ${f("base_limpa", "Base limpa", "number", d.base_limpa, ' min="0" step="1" inputmode="numeric"')}
    </div></fieldset>
    <fieldset><legend>BillionMail</legend><p class="note" style="margin:0">Copie da tela de Analytics: o Success em quantidade e os percentuais como aparecem (aceita vírgula).</p><div class="campos">
      ${f("enviados", "Enviados (Success)", "number", bm.enviados, ' min="0" step="1" inputmode="numeric"')}
      ${f("delivered_pct", "Delivered %", "text", bm.delivered_pct != null ? br(bm.delivered_pct) : "", ' inputmode="decimal" placeholder="ex.: 98,5"')}
      ${f("opened_pct", "Opened % (lido)", "text", bm.opened_pct != null ? br(bm.opened_pct) : "", ' inputmode="decimal"')}
      ${f("clicked_pct", "Clicked %", "text", bm.clicked_pct != null ? br(bm.clicked_pct) : "", ' inputmode="decimal"')}
      ${f("bounced_pct", "Bounced %", "text", bm.bounced_pct != null ? br(bm.bounced_pct) : "", ' inputmode="decimal"')}
    </div></fieldset>
    <fieldset><legend>Retorno</legend><div class="campos">
      ${f("respostas", "Respostas", "number", d.respostas, ' min="0" step="1" inputmode="numeric"')}
      ${f("orcamentos", "Orçamentos", "number", d.orcamentos, ' min="0" step="1" inputmode="numeric"')}
      <label class="campo largo" for="i_obs">Observação<textarea id="i_obs" rows="3"${dis}>${esc(d.obs || "")}</textarea></label>
    </div></fieldset>
    ${novo || !c.env ? "" : `<div class="resumo-funil">Entregues ${c.entregues} · Abertos ${c.abertos} (${br(pct(c.abertos, c.entregues))}% lido) · Cliques ${c.cliques} · Bounce ${c.bounces} · Conversão ${br(pct(c.orcamentos, c.respostas))}%</div>`}
    <div class="acoes">
      ${state.podeEditar ? `<button type="submit" class="btn" id="instSalvar">${novo ? "Registrar disparo" : "Salvar alterações"}</button>` : ""}
      <button type="button" class="btn secundario" data-ir="institucional">Voltar</button>
      ${!novo && state.podeEditar ? `<span id="apagarBox"><button type="button" class="btn secundario" data-apagar="${esc(id)}">Excluir disparo</button></span>` : ""}
      <span class="status-line" id="formMsg" role="status"></span>
    </div>
  </form>`;
}
async function salvarInst(form) {
  if (!db || !state.podeEditar) return;
  const msg = $("formMsg"); const aviso = (t, e) => { msg.textContent = t; msg.classList.toggle("err", !!e); };
  const v = (k) => ($("i_" + k)?.value ?? "").trim();
  const n = (k) => { const x = v(k); return x === "" || isNaN(+x) ? null : Math.max(0, Math.round(+x)); };
  const p = (k) => { const x = v(k).replace("%", "").replace(",", "."); return x === "" || isNaN(+x) ? null : Math.min(100, Math.max(0, Math.round(+x * 100) / 100)); };
  if (!v("segmento")) { aviso("Informe o segmento do disparo.", true); $("i_segmento").focus(); return; }
  const agora = new Date().toISOString();
  const dados = {
    segmento: v("segmento"), solicitante: v("solicitante"), data_solicitacao: v("data_solicitacao"), data_disparo: v("data_disparo"),
    base_ab: v("base_ab") || "Inteira", remetente: v("remetente"), assunto: v("assunto"), base_link: v("base_link"),
    tamanho_base: n("tamanho_base"), base_limpa: n("base_limpa"),
    bm: { enviados: n("enviados"), delivered_pct: p("delivered_pct"), opened_pct: p("opened_pct"), clicked_pct: p("clicked_pct"), bounced_pct: p("bounced_pct") },
    respostas: n("respostas"), orcamentos: n("orcamentos"), obs: v("obs"), atualizado_em: agora,
  };
  const btn = $("instSalvar"); if (btn) btn.disabled = true;
  try {
    if (form.dataset.id) await db.collection("institucional").doc(form.dataset.id).update(dados);
    else await db.collection("institucional").doc("in-" + Date.now().toString(36)).set({ ...dados, criado_em: agora });
    ir({ tipo: "institucional" });
  } catch (e) {
    if (btn) btn.disabled = false;
    aviso(semPermissao(e) ? "Você tem acesso só de leitura a este painel." : "Não foi possível salvar. Tente de novo em alguns segundos.", true);
  }
}
async function apagarInst(id, btn) {
  btn.disabled = true;
  try { await db.collection("institucional").doc(id).delete(); ir({ tipo: "institucional" }); }
  catch (e) { btn.disabled = false; const m = $("formMsg"); if (m) { m.textContent = "Não foi possível excluir agora."; m.classList.add("err"); } }
}

/* ---------- ColdZap: WhatsApp dos disparos de cold mail por fornecedor, lead a lead ---------- */
const CZ_ZERO = { total: 0, pendentes: 0, enviados: 0, nao_existe: 0, respostas: 0, interessados: 0, sairam: 0, orcamentos: 0 };
function czCalc(ls) {
  const r = { ...CZ_ZERO, total: ls.length };
  ls.forEach((l) => {
    if (l.envio === "enviado") {
      r.enviados++;
      if (l.status && l.status !== "aguardando") r.respostas++;
      if (l.status === "interessado") r.interessados++;
      if (l.status === "saiu") r.sairam++;
    } else if (l.envio === "nao_existe") r.nao_existe++;
    else r.pendentes++;
    if (l.orcamento) r.orcamentos++;
  });
  return r;
}
function czMetricas(d) {
  if (state.czOk) return czCalc(state.czLeads.filter((l) => l.disparo === d.id));
  return { ...CZ_ZERO, ...(d.metricas || {}), total: d.metricas?.total ?? d.leads ?? 0 };
}
function czSomar(lista) { const s = { ...CZ_ZERO }; lista.forEach((m) => Object.keys(s).forEach((k) => (s[k] += m[k] || 0))); return s; }
function czKpis(m) {
  return kpiGrid([
    ["Leads separados", m.total, m.pendentes ? `${m.pendentes} ainda sem envio` : "todos tratados", false, "ti-users", m.total ? pct(m.total - m.pendentes, m.total) : null],
    ["Enviados", m.enviados, `${br(pct(m.enviados, m.total))}% da lista`, false, "ti-send"],
    ["Número não existe", m.nao_existe, `${br(pct(m.nao_existe, m.total))}% da lista`, false, "ti-phone-off"],
    ["Responderam", m.respostas, `${br(pct(m.respostas, m.enviados))}% dos enviados`, false, "ti-message-circle"],
    ["Interessados", m.interessados, `${br(pct(m.interessados, m.enviados))}% dos enviados`, false, "ti-thumb-up"],
    ["Orçamentos", m.orcamentos, `${br(pct(m.orcamentos, m.respostas))}% das respostas`, true, "ti-file-invoice"],
  ]);
}
const czEtapas = (m) => [
  { nome: "Separados", icone: "ti-users", v: m.total }, { nome: "Enviados", icone: "ti-send", v: m.enviados },
  { nome: "Responderam", icone: "ti-message-circle", v: m.respostas }, { nome: "Interessados", icone: "ti-thumb-up", v: m.interessados },
  { nome: "Orçamentos", icone: "ti-file-invoice", v: m.orcamentos },
];
const czProgresso = (m) => progresso([["Enviados", m.enviados, "seg-ok"], ["Número não existe", m.nao_existe, "seg-bad"], ["Sem envio", m.pendentes, "seg-neutro"]], m.total);
function telaColdzap() {
  cab("ColdZap", "A parte da base de um cold mail por fornecedor que vai pelo WhatsApp, enviada à mão. Cada lista mostra lead a lead quem recebeu, quem respondeu e quais respostas viraram orçamento.");
  if (!state.carregado.cz) return carregando();
  const ds = [...state.cz].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const tot = czSomar(ds.map(czMetricas));
  return `<div class="pilha">
    ${secao("h-zt", "ti-chart-bar", "Todas as listas", `${ds.length} lista(s) de WhatsApp`, czKpis(tot))}
    <div class="grade-2">
      ${painel("h-zf", "ti-filter", "Funil do ColdZap", "Todas as listas", funil(czEtapas(tot), "var(--f-cz)"))}
      ${painel("h-zp", "ti-progress-check", "Andamento dos envios", `${tot.enviados + tot.nao_existe} de ${tot.total} tratados`, `<div class="cz" style="display:grid;gap:14px">${ds.map((d) => { const m = czMetricas(d);
        return `<div style="display:grid;gap:6px"><div style="display:flex;justify-content:space-between;gap:8px;font-size:13.5px"><button type="button" class="linkbtn" style="text-decoration:none;font-weight:600;color:var(--ink)" data-ir="czd:${esc(d.id)}">${esc(d.empresa)}</button><span class="note">${m.enviados + m.nao_existe}/${m.total}</span></div>${czProgresso(m)}</div>`; }).join("") || `<p class="note">Nenhuma lista ainda.</p>`}</div>`)}
    </div>
    ${secao("h-zl", "ti-list-details", "Listas por fornecedor", "", `<div class="grid-cards">${ds.map((d) => { const m = czMetricas(d); return `<button type="button" class="card cz" data-ir="czd:${esc(d.id)}">
        <div class="top"><div><div class="nome">${esc(d.empresa)}</div><div class="sub">${esc(d.chave || "")}${d.produto ? " · " + esc(d.produto) : ""}</div></div><span class="zap-ico" aria-hidden="true"><i class="ti ti-brand-whatsapp"></i></span></div>
        <div class="sub">Preparada em ${fmtData(d.data)}${d.remetente ? " · envia " + esc(d.remetente) : ""}</div>
        ${czProgresso(m)}
        <div class="stats"><div class="stat"><b>${m.enviados}/${m.total}</b><span>enviados</span></div><div class="stat"><b>${br(pct(m.respostas, m.enviados))}%</b><span>resposta</span></div><div class="stat"><b>${m.orcamentos}</b><span>orçamentos</span></div></div>
        <span class="go">Abrir lista <i class="ti ti-arrow-right" aria-hidden="true"></i></span></button>`; }).join("")}
        <div class="card nova"><div class="nome">Próximo cold mail</div><div class="sub">A lista de WhatsApp entra aqui quando a base de um cold mail é separada.</div></div></div>`)}
  </div>`;
}
function telaCzDisparo(id) {
  const d = state.cz.find((x) => x.id === id);
  if (!d) { cab("ColdZap", ""); return state.carregado.cz ? vazio("ti-list-search", "Esta lista não existe.", `<button type="button" class="linkbtn" data-ir="coldzap">Voltar para o ColdZap</button>`) : carregando(); }
  cab(d.empresa, d.produto || "");
  const m = czMetricas(d);
  return `<div class="pilha">
    <dl class="ficha">
      <div><dt>Fornecedor</dt><dd>${esc(d.empresa)}</dd></div>
      <div><dt>ID do cliente</dt><dd>${esc(d.chave || "")}</dd></div>
      <div><dt>Preparada em</dt><dd>${fmtData(d.data)}</dd></div>
      <div><dt>Quem envia</dt><dd>${esc(d.remetente || "")}</dd></div>
      ${d.base ? `<div><dt>Base</dt><dd>${esc(d.base)}</dd></div>` : ""}
      ${d.solicitante ? `<div><dt>Solicitante</dt><dd>${esc(d.solicitante)}</dd></div>` : ""}
    </dl>
    ${state.downloads && window.XLSX && state.czOk ? `<div class="acoes"><button type="button" class="btn secundario" data-czbaixar="${esc(d.id)}"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i>Baixar lista em Excel</button><span class="note" id="czMsg">Lista com o link de cada conversa e as marcações feitas aqui.</span></div>` : ""}
    ${secao("h-zr", "ti-chart-bar", "Resultado", "", czKpis(m))}
    <div class="grade-2 cz">
      ${painel("h-zf", "ti-filter", "Funil da lista", "", funil(czEtapas(m), "var(--f-cz)"))}
      ${painel("h-zp", "ti-progress-check", "Andamento dos envios", `${m.enviados + m.nao_existe} de ${m.total} tratados`, czProgresso(m))}
    </div>
    <section>${blocoCzLeads(d)}</section></div>`;
}
function blocoCzLeads(d) {
  if (!state.czOk) return `<div class="empty" id="czLeads">A lista de leads fica visível só para quem opera os disparos.</div>`;
  const q = state.busca.trim().toLowerCase();
  const todos = state.czLeads.filter((l) => l.disparo === d.id);
  const ls = todos.filter((l) => (!state.envio || (state.envio === "pendente" ? !l.envio : l.envio === state.envio)) && (!state.status || (l.status || "aguardando") === state.status) &&
      (!q || [l.empresa, l.nome, l.celular, l.email].some((v) => String(v || "").toLowerCase().includes(q))))
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const dis = state.podeEditar ? "" : " disabled";
  const linhas = ls.map((l) => {
    const st = l.status || "aguardando"; const en = l.envio || "";
    const link = l.numero ? `https://wa.me/${encodeURIComponent(l.numero)}?text=${encodeURIComponent(l.mensagem || "")}` : "";
    return `<tr data-cz="${esc(l._id)}">
      <td class="num">${l.ordem || ""}</td>
      <td><div class="who"><b>${esc(l.empresa || l.nome || "Sem nome")}</b><small>${esc(l.empresa ? l.nome : "")}${l.empresa && l.nome ? " · " : ""}${esc(l.celular || "")}</small></div></td>
      <td><div class="pedido">${esc(l.produto_cotado || "")}${l.produto_cotado && l.o_que_pediu ? " · " : ""}${esc(l.o_que_pediu || "")}</div>${l.cotou_em ? `<span class="note">cotou em ${fmtData(l.cotou_em)}</span>` : ""}</td>
      <td>${link ? `<a class="wa" href="${esc(link)}" target="_blank" rel="noopener">Abrir conversa</a>` : `<span class="note">sem celular</span>`}${l.mensagem ? `<details class="msg"><summary>Ver mensagem</summary><div class="msg-txt">${esc(l.mensagem)}</div></details>` : ""}</td>
      <td><select data-cf="envio" id="czenv-${esc(l._id)}" class="env-${en}" aria-label="Envio"${dis}>${Object.entries(ENVIO).map(([k, v]) => `<option value="${k}"${k === en ? " selected" : ""}>${v}</option>`).join("")}</select></td>
      <td><select data-cf="status" id="czst-${esc(l._id)}" class="st-${st}" aria-label="Resposta"${dis}>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${k === st ? " selected" : ""}>${v}</option>`).join("")}</select></td>
      <td><label class="check"><input type="checkbox" data-cf="orcamento" id="czped-${esc(l._id)}"${l.orcamento ? " checked" : ""}${dis}> Sim</label></td>
      <td><input type="text" class="obs" data-cf="obs" id="czobs-${esc(l._id)}" value="${esc(l.obs || "")}" placeholder="Anotação"${dis}></td></tr>`;
  }).join("");
  return `<div class="bloco" id="czLeads">
    <div class="section-head" style="margin:0"><h2>Leads da lista</h2><span class="note">${todos.length} leads · marque o envio, a resposta e o orçamento</span></div>
    <div class="filters">
      <input type="search" id="czbusca" value="${esc(state.busca)}" placeholder="Buscar por empresa, nome ou celular" aria-label="Buscar lead">
      <select id="fEnvio" aria-label="Filtrar envio"><option value="">Todos os envios</option><option value="pendente"${state.envio === "pendente" ? " selected" : ""}>Não enviado</option><option value="enviado"${state.envio === "enviado" ? " selected" : ""}>Enviado</option><option value="nao_existe"${state.envio === "nao_existe" ? " selected" : ""}>Número não existe</option></select>
      <select id="fCzStatus" aria-label="Filtrar resposta"><option value="">Todas as respostas</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${state.status === k ? " selected" : ""}>${v}</option>`).join("")}</select>
    </div>
    <div class="status-line" id="czStatusLine" role="status"></div>
    ${ls.length ? `<div class="tbl-wrap"><table><thead><tr><th class="num">#</th><th>Lead</th><th>O que cotou</th><th>Mensagem</th><th>Envio</th><th>Resposta</th><th>Orçamento</th><th>Observação</th></tr></thead><tbody>${linhas}</tbody></table></div>` : `<div class="empty">Nenhum lead com esses filtros.</div>`}
  </div>`;
}
async function salvarCz(id, campo, valor, el) {
  if (!db) return;
  const linha = $("czStatusLine"); const aviso = (t, e) => { if (linha) { linha.textContent = t; linha.classList.toggle("err", !!e); } };
  el.disabled = true;
  try {
    const agora = new Date().toISOString();
    const extra = campo === "status" ? { respondido_em: valor === "aguardando" ? "" : agora } : campo === "envio" ? { enviado_em: valor === "enviado" ? agora : "" } : {};
    await db.collection("coldzap_leads").doc(id).update({ [campo]: valor, ...extra, atualizado_em: agora });
    const l = state.czLeads.find((x) => x._id === id); if (l) Object.assign(l, { [campo]: valor }, extra);
    aviso("Salvo.");
    if (l) { try { await db.collection("coldzap").doc(l.disparo).update({ metricas: czCalc(state.czLeads.filter((x) => x.disparo === l.disparo)) }); } catch (e) {} }
  } catch (e) {
    if (semPermissao(e)) { state.podeEditar = false; aviso("Você tem acesso só de leitura a este painel.", true); return; }
    aviso("Não foi possível salvar. Tente de novo em alguns segundos.", true);
  } finally { el.disabled = !state.podeEditar; }
}
async function baixarCz(id, btn) {
  const d = state.cz.find((x) => x.id === id); btn.disabled = true;
  const ls = state.czLeads.filter((l) => l.disparo === id).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const wb = XLSX.utils.book_new();
  aba(wb, "WhatsApp", [["Ordem", "Nome", "Empresa", "Celular", "E-mail", "O que cotou", "Data da cotação", "Por que está na lista", "Mensagem", "Abrir conversa", "Envio", "Resposta", "Orçamento", "Observação"],
    ...ls.map((l) => [l.ordem, l.nome, l.empresa, l.celular, l.email, l.produto_cotado || "", fmtData(l.cotou_em), l.o_que_pediu || "", l.mensagem || "",
      l.numero ? `https://wa.me/${l.numero}?text=${encodeURIComponent(l.mensagem || "")}` : "", ENVIO[l.envio || ""], STATUS[l.status || "aguardando"], l.orcamento ? "Sim" : "Não", l.obs || ""])],
    [7, 14, 28, 16, 30, 24, 14, 40, 60, 30, 18, 16, 11, 36]);
  await salvarXlsx(wb, `ColdZap - ${d?.empresa || "lista"} ${d?.chave || ""}.xlsx`.replace(/\s+\.xlsx$/, ".xlsx"), "czMsg");
  btn.disabled = false;
}

/* ---------- render ---------- */
function render() {
  abas(); crumbs();
  const r = state.rota;
  $("view").innerHTML =
    r.tipo === "pasta" ? telaPasta(r.id) : r.tipo === "disparo" ? telaDisparo(r.id)
    : r.tipo === "institucional" ? telaInstitucional() : r.tipo === "inst" ? telaInstForm(r.id) : r.tipo === "inst-novo" ? telaInstForm(null)
    : r.tipo === "coldzap" ? telaColdzap() : r.tipo === "czd" ? telaCzDisparo(r.id)
    : r.tipo === "estrategia" ? telaEstrategia() : r.tipo === "visao" ? telaVisao(r.id)
    : r.tipo === "inicio" ? telaInicio() : telaGeral();
}

/* ---------- as três frentes ---------- */
const FRENTES_INFO = {
  fidelizacao: { cls: "fid", ico: "ti-refresh", nome: "Fidelização", sub: "Por produto e por necessidade", destino: "inicio",
    para_quem: "Quem já cotou no site. Por produto: quem cotou aquele produto. Por necessidade: empresas de um segmento.",
    canal: "E-mail pelo BillionMail para a base e WhatsApp para os leads de maior potencial.",
    mensagem: "Por produto: as outras opções do que o lead cotou. Por necessidade: produtos que o segmento costuma usar. Carta do Soluções por grupo, sem citar fornecedor.",
    quem_envia: "Growth",
    medida: "Respostas, interessados e orçamentos gerados, por canal e por visão." },
  institucional: { cls: "inst", ico: "ti-building", nome: "Institucional", sub: "Cartas por segmento", destino: "institucional",
    para_quem: "Uma base escolhida por segmento de mercado.",
    canal: "E-mail pelo BillionMail, com a base inteira ou dividida em metades A e B.",
    mensagem: "Carta institucional do Soluções, sem fornecedor específico.",
    quem_envia: "Growth, a pedido de um solicitante",
    medida: "% lido, cliques, respostas e orçamentos. Conversão = orçamentos ÷ respostas." },
  coldzap: { cls: "cz", ico: "ti-brand-whatsapp", nome: "ColdZap", sub: "WhatsApp do cold mail", destino: "coldzap",
    para_quem: "Uma parte da base de cada cold mail por fornecedor. O restante recebe o e-mail.",
    canal: "WhatsApp, enviado à mão, lead a lead.",
    mensagem: "Mensagem personalizada sobre o produto do fornecedor.",
    quem_envia: "Maryanna",
    medida: "Enviados, números que não existem, respostas e orçamentos de cada lista." },
};
const PASSOS_PADRAO = [
  { icone: "ti-target", titulo: "Visão e oferta", texto: "Escolher a visão: por produto (outras opções do que o lead cotou) ou por necessidade (o que o segmento costuma usar)." },
  { icone: "ti-database", titulo: "Base", texto: "Puxar quem cotou no período, um registro por lead, sem repetir quem já recebeu." },
  { icone: "ti-filter", titulo: "Limpeza e avaliação", texto: "Ler cada lead, tirar quem não deve receber e classificar o restante." },
  { icone: "ti-message-2", titulo: "Mensagens", texto: "E-mail com uma carta por grupo; WhatsApp personalizado para os leads de maior potencial." },
  { icone: "ti-send", titulo: "Disparo e respostas", texto: "Enviar e marcar cada resposta neste painel." },
  { icone: "ti-chart-line", titulo: "Resultado", texto: "Contar respostas, interessados e orçamentos gerados, por canal e por visão." },
];
const GLOSSARIO = [
  ["ti-send", "Enviados", "No e-mail, conta quando o disparo tem data de envio. No WhatsApp, conta lead a lead, quando o envio é marcado."],
  ["ti-mail-check", "Entregues, abertos e cliques", "Números da tela de Analytics do BillionMail. % lido = abertos ÷ entregues."],
  ["ti-message-circle", "Respostas", "Leads que responderam, marcados no painel: interessado, sem interesse ou pediu para sair."],
  ["ti-thumb-up", "Interessados", "Responderam com interesse em cotar."],
  ["ti-file-invoice", "Orçamentos gerados", "Respostas que viraram orçamento cadastrado para os fornecedores."],
  ["ti-percentage", "Conversão", "Orçamentos ÷ respostas."],
  ["ti-phone-off", "Número não existe", "No ColdZap, celular que não tem WhatsApp."],
];
function totaisFrentes() {
  const f = somar(state.disparos.map((d) => metricasDisparo(d).geral));
  const i = instSomar(state.inst);
  const z = czSomar(state.cz.map(czMetricas));
  return { f, i, z, enviados: f.enviados + i.env + z.enviados, respostas: f.respostas + i.respostas + z.respostas, orcamentos: f.pedidos + i.orcamentos + z.orcamentos };
}
/* O que falta enviar, lançar ou conferir, calculado a partir dos dados. Alertas (números que não fecham) vêm primeiro. */
function pendencias() {
  const p = [];
  state.disparos.filter((d) => !d.enviado_em).forEach((d) => { const pa = state.pastas.find((x) => x.id === d.pasta);
    p.push({ ic: "ti-hourglass", t: `${pa ? pa.nome + " · " : ""}${d.nome}: aguardando envio`, s: `${metricasDisparo(d).geral.total} leads preparados em ${fmtData(d.data)}`, ir: `disparo:${d.id}` }); });
  state.disparos.filter((d) => d.enviado_em && !(d.bm && +d.bm.enviados)).forEach((d) =>
    p.push({ ic: "ti-mail", t: `${d.nome}: lançar os números do BillionMail`, s: "Enviados, entregues, abertos, cliques e bounce", ir: `disparo:${d.id}` }));
  state.cz.forEach((d) => { const m = czMetricas(d);
    if (m.pendentes) p.push({ ic: "ti-brand-whatsapp", t: `${d.empresa}: ${m.pendentes} lead(s) sem envio marcado`, s: `Lista de ${fmtData(d.data)}`, ir: `czd:${d.id}` });
    if (m.orcamentos > m.respostas) p.push({ ic: "ti-alert-triangle", alerta: true, t: `${d.empresa}: ${m.orcamentos} orçamento(s) com ${m.respostas} resposta(s) marcada(s)`, s: "Marque a resposta dos leads que viraram orçamento", ir: `czd:${d.id}` });
  });
  if (state.czOk) {
    const semEnvio = {}; state.czLeads.forEach((l) => { if (l.status && l.status !== "aguardando" && l.envio !== "enviado") semEnvio[l.disparo] = (semEnvio[l.disparo] || 0) + 1; });
    Object.entries(semEnvio).forEach(([id, n]) => { const d = state.cz.find((x) => x.id === id);
      if (d) p.push({ ic: "ti-alert-triangle", alerta: true, t: `${d.empresa}: ${n} resposta(s) em lead sem envio marcado`, s: "Marque o envio para a resposta contar no resultado", ir: `czd:${id}` }); });
  }
  state.inst.filter((d) => d.data_disparo && !(d.bm && +d.bm.enviados)).forEach((d) =>
    p.push({ ic: "ti-building", t: `${d.segmento || "Institucional"}: lançar os números do BillionMail`, s: `Disparo de ${fmtData(d.data_disparo)}`, ir: `inst:${d.id}` }));
  return p.sort((a, b) => (b.alerta ? 1 : 0) - (a.alerta ? 1 : 0));
}
/* Linha do tempo: o que foi preparado e enviado, do mais recente para o mais antigo. */
function atividades() {
  const ev = [];
  state.disparos.forEach((d) => { const pa = state.pastas.find((x) => x.id === d.pasta)?.nome || "Fidelização";
    if (d.enviado_em) ev.push({ data: d.enviado_em, cls: "fid", t: `${pa} · ${d.nome} enviado`, s: `Fidelização · ${metricasDisparo(d).geral.total} leads`, ir: `disparo:${d.id}` });
    if (d.data) ev.push({ data: d.data, cls: "fid", t: `${pa} · ${d.nome} preparado`, s: `Fidelização · ${metricasDisparo(d).geral.total} leads`, ir: `disparo:${d.id}` }); });
  state.cz.forEach((d) => ev.push(d.enviado_em
    ? { data: d.enviado_em, cls: "cz", t: `WhatsApp enviado: ${d.empresa}`, s: `ColdZap · ${czMetricas(d).total} leads`, ir: `czd:${d.id}` }
    : { data: d.data, cls: "cz", t: `Lista separada: ${d.empresa}`, s: `ColdZap · ${czMetricas(d).total} leads aguardando envio`, ir: `czd:${d.id}` }));
  state.inst.forEach((d) => { const dt = d.data_disparo || d.data_solicitacao; if (dt) ev.push({ data: dt, cls: "inst", t: `${d.data_disparo ? "Disparo" : "Pedido"} institucional: ${d.segmento || "sem segmento"}`, s: `Institucional${d.solicitante ? " · " + d.solicitante : ""}`, ir: `inst:${d.id}` }); });
  return ev.filter((e) => e.data).sort((a, b) => b.data.localeCompare(a.data));
}
const linhaTempo = (ev) => ev.length ? `<ol class="linha-tempo">${ev.map((e) => `<li class="${e.cls}"><span class="quando">${fmtData(e.data).slice(0, 5)}</span><span class="ponto" aria-hidden="true"></span>
  <div class="oque"><button type="button" class="linkbtn" style="text-decoration:none;color:var(--ink);font-weight:600" data-ir="${esc(e.ir)}">${esc(e.t)}</button><span>${esc(e.s)}</span></div></li>`).join("")}</ol>` : `<p class="note">Nada registrado ainda.</p>`;

/* ---------- Visão geral ---------- */
function telaGeral() {
  cab("Visão geral", "");
  const t = totaisFrentes(); const { f, i, z } = t;
  const nDisp = state.disparos.length + state.inst.length + state.cz.length;
  const hs = (ic, l, v, s) => `<div class="hero-stat"><span class="l"><i class="ti ${ic}" aria-hidden="true"></i>${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
  const pend = pendencias(); const mostra = pend.slice(0, 6);
  const mini = (itens) => `<div class="mini">${itens.map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>`;
  const frente = (k, n, itens, extra) => { const fi = FRENTES_INFO[k]; return `<section class="frente ${fi.cls}" aria-labelledby="fr-${k}">
    <div class="frente-top"><span class="ico-frente" aria-hidden="true"><i class="ti ${fi.ico}"></i></span><div><b id="fr-${k}">${fi.nome}</b><span>${fi.sub} · ${n}</span></div></div>
    ${mini(itens)}${extra || ""}
    <button type="button" class="abrir" data-ir="${fi.destino}">Abrir ${fi.nome} <i class="ti ti-arrow-right" aria-hidden="true"></i></button></section>`; };
  const passos = PASSOS_PADRAO; /* versão curta; a página Estratégia mostra o texto completo */
  return `<div class="pilha">
    <section class="hero" aria-labelledby="h-hero">
      <div class="hero-txt"><span class="eyebrow"><i class="ti ti-activity" aria-hidden="true"></i>Growth · disparos ao vivo</span>
        <h2 id="h-hero">Reativação de leads e geração de orçamentos para os fornecedores</h2>
        <p>Acompanhamento consolidado das três frentes: Fidelização (leads que já cotaram), Institucional (disparos por segmento) e ColdZap (WhatsApp do cold mail).</p></div>
      <div class="hero-stats">
        ${hs("ti-stack-2", "Disparos e listas", nDisp, `${state.disparos.length} fidelização · ${state.inst.length} institucional · ${state.cz.length} ColdZap`)}
        ${hs("ti-send", "Mensagens enviadas", t.enviados, "e-mail e WhatsApp somados")}
        ${hs("ti-message-circle", "Respostas", t.respostas, `${br(pct(t.respostas, t.enviados))}% das enviadas`)}
        ${hs("ti-file-invoice", "Orçamentos gerados", t.orcamentos, t.respostas ? `${br(pct(t.orcamentos, t.respostas))}% das respostas` : "marcados nas listas")}
      </div>
      <div class="hero-acoes"><button type="button" class="btn claro" data-ir="estrategia"><i class="ti ti-route" aria-hidden="true"></i>Entender a estratégia</button></div>
    </section>
    <div class="grade-2">
      ${painel("h-fc", "ti-filter", "Funil consolidado", "As três frentes somadas", funil([
        { nome: "Enviadas", icone: "ti-send", v: t.enviados }, { nome: "Respostas", icone: "ti-message-circle", v: t.respostas }, { nome: "Orçamentos", icone: "ti-file-invoice", v: t.orcamentos },
      ]) + `<div class="tbl-wrap"><table><thead><tr><th>Frente</th><th class="num">Enviadas</th><th class="num">Respostas</th><th class="num">Orçamentos</th></tr></thead><tbody>
        <tr><td><b>Fidelização</b></td><td class="num">${f.enviados}</td><td class="num">${f.respostas}</td><td class="num">${f.pedidos}</td></tr>
        <tr><td><b>Institucional</b></td><td class="num">${i.env}</td><td class="num">${i.respostas}</td><td class="num">${i.orcamentos}</td></tr>
        <tr><td><b>ColdZap</b></td><td class="num">${z.enviados}</td><td class="num">${z.respostas}</td><td class="num">${z.orcamentos}</td></tr></tbody></table></div>`)}
      ${painel("h-pend", "ti-checklist", "Pendências", pend.length ? `${pend.length} item(ns)` : "", mostra.length ? `<ul class="pendencias">${mostra.map((x) => `<li class="${x.alerta ? "alerta" : ""}"><span class="pi" aria-hidden="true"><i class="ti ${x.ic}"></i></span><div><button type="button" data-ir="${esc(x.ir)}">${esc(x.t)}</button><span>${esc(x.s)}</span></div></li>`).join("")}</ul>${pend.length > mostra.length ? `<p class="note">E mais ${pend.length - mostra.length}.</p>` : ""}`
        : `<p class="note" style="display:flex;gap:8px;align-items:center"><i class="ti ti-circle-check" style="color:var(--ok);font-size:18px" aria-hidden="true"></i>Nada pendente agora.</p>`)}
    </div>
    ${secao("h-fr", "ti-layout-columns", "As três frentes", "Clique numa frente para ver os disparos e marcar as respostas", `<div class="frentes">
      ${frente("fidelizacao", `${state.disparos.length} disparo(s)`, [["Enviados", f.enviados], ["Responderam", f.respostas], ["Interessados", f.interessados], ["Orçamentos", f.pedidos]],
        progresso([["Enviados", f.enviados, "seg-ok"], ["Aguardando envio", Math.max(0, f.total - f.enviados), "seg-neutro"]], f.total))}
      ${frente("institucional", `${state.inst.length} disparo(s)`, [["Entregues", i.entregues], ["% lido", `${br(pct(i.abertos, i.entregues))}%`], ["Respostas", i.respostas], ["Orçamentos", i.orcamentos]])}
      ${frente("coldzap", `${state.cz.length} lista(s)`, [["Enviados", z.enviados], ["Número não existe", z.nao_existe], ["Responderam", z.respostas], ["Orçamentos", z.orcamentos]], czProgresso(z))}
    </div>`)}
    <div class="grade-2 igual">
      ${painel("h-lt", "ti-timeline-event", "Linha do tempo", "Mais recentes primeiro", linhaTempo(atividades().slice(0, 8)))}
      ${painel("h-cf", "ti-route", "Como funciona", "O caminho de cada disparo", `<ol class="pendencias">${passos.map((p, n) => `<li><span class="pi" aria-hidden="true" style="background:var(--primaria-soft);color:var(--primaria)"><i class="ti ${p.icone || "ti-point"}"></i></span><div><b>${n + 1}. ${esc(p.titulo)}</b><span>${esc(p.texto)}</span></div></li>`).join("")}</ol>
        <button type="button" class="btn secundario" style="justify-self:start" data-ir="estrategia"><i class="ti ti-route" aria-hidden="true"></i>Ver a estratégia completa</button>`)}
    </div>
  </div>`;
}

/* ---------- Estratégia: tudo o que orienta os disparos em uma página ----------
   O texto da estratégia (objetivo, números do problema, passos, classes e regras) fica no banco, no documento pastas/_estrategia,
   visível só para quem entra no painel. Aqui fica só a estrutura da página e textos genéricos de reserva. */
function telaEstrategia() {
  cab("Estratégia", "Referência da estratégia de disparos: objetivo, frentes, processo, critérios de oferta e indicadores.");
  const e = state.estrategia || {}; const t = totaisFrentes();
  const comMatriz = [...state.pastas].filter((p) => p.estrategia?.length || p.necessidade?.length).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
  const partes = [["e-porque", "ti-target-arrow", "Objetivo"], ["e-frentes", "ti-layout-columns", "As três frentes"], ["e-visoes", "ti-arrows-split", "As duas visões"], ["e-caminho", "ti-route", "O caminho de um disparo"]];
  if (e.classes?.length) partes.push(["e-classes", "ti-users-group", "Quem recebe o quê"]);
  if (comMatriz.length) partes.push(["e-oferta", "ti-target", "O que oferecer"]);
  if (e.regras?.length) partes.push(["e-regras", "ti-checklist", "Diretrizes"]);
  partes.push(["e-numeros", "ti-book", "Como ler os números"]);
  const agora = {
    fidelizacao: [[t.f.enviados, "enviados"], [t.f.respostas, "respostas"], [t.f.pedidos, "orçamentos"]],
    institucional: [[t.i.n, "disparos"], [t.i.respostas, "respostas"], [t.i.orcamentos, "orçamentos"]],
    coldzap: [[t.z.enviados, "enviados"], [t.z.respostas, "respostas"], [t.z.orcamentos, "orçamentos"]],
  };
  const linhas = [["para_quem", "Para quem"], ["canal", "Canal"], ["mensagem", "Mensagem"], ["quem_envia", "Quem envia"], ["medida", "Como medimos"]];
  const comp = Object.keys(FRENTES_INFO).map((k) => { const fi = { ...FRENTES_INFO[k], ...(e.frentes?.[k] || {}) };
    return `<article class="comp ${fi.cls}" aria-labelledby="cp-${k}"><div class="comp-top"><span class="ico-frente" aria-hidden="true"><i class="ti ${fi.ico}"></i></span><div><b id="cp-${k}">${fi.nome}</b><span>${fi.sub}</span></div></div>
      ${linhas.map(([c, l]) => `<dl style="margin:0"><dt>${l}</dt><dd>${esc(fi[c] || "")}</dd></dl>`).join("")}
      <dl class="agora" style="margin:0"><dt>Agora</dt><dd>${agora[k].map(([v, l]) => `<span><b>${v}</b> ${l}</span>`).join("")}<button type="button" class="abrir" data-ir="${fi.destino}">Abrir <i class="ti ti-arrow-right" aria-hidden="true"></i></button></dd></dl></article>`; }).join("");
  const passos = e.passos?.length ? e.passos : PASSOS_PADRAO;
  let contagem = null; let ref = "";
  if (e.classes?.length && state.leadsOk) {
    const ult = [...state.disparos].sort((a, b) => (b.data || "").localeCompare(a.data || ""))[0];
    if (ult) { contagem = { A: 0, B: 0, C: 0, FORA: +ult.fora || 0 }; state.leads.forEach((l) => { if (l.disparo === ult.id && contagem[l.classe] != null) contagem[l.classe]++; });
      ref = `${ult.nome}${state.pastas.find((p) => p.id === ult.pasta) ? " de " + state.pastas.find((p) => p.id === ult.pasta).nome : ""}`; }
  }
  return `<div class="pilha">
    <nav class="sumario" aria-label="Nesta página">${partes.map(([id, ic, nome]) => `<button type="button" data-rolar="${id}"><i class="ti ${ic}" aria-hidden="true"></i>${nome}</button>`).join("")}</nav>
    <section class="hero" id="e-porque" aria-labelledby="h-porque">
      <div class="hero-txt"><span class="eyebrow"><i class="ti ti-target-arrow" aria-hidden="true"></i>Objetivo</span>
        <h2 id="h-porque">${esc(e.objetivo || "Reativar a base de leads e ampliar o volume de orçamentos gerados para os fornecedores.")}</h2>
        ${e.resumo ? `<p>${esc(e.resumo)}</p>` : ""}</div>
      ${e.problema?.length ? `<div class="hero-stats">${e.problema.map((x) => `<div class="hero-stat"><span class="v">${esc(x.numero)}</span><span class="s">${esc(x.texto)}</span></div>`).join("")}</div>` : ""}
      ${e.metrica ? `<div class="hero-stat" style="grid-template-columns:auto minmax(0,1fr);column-gap:12px;align-items:start"><i class="ti ti-target" aria-hidden="true" style="font-size:22px;color:var(--ciano-claro);grid-row:span 2"></i><span class="l">Indicadores de resultado</span><span style="font-weight:600">${esc(e.metrica)}</span></div>` : ""}
    </section>
    ${secao("e-frentes", "ti-layout-columns", "As três frentes", "Cada frente tem um público, um canal e uma forma de medir", `<div class="comparativo">${comp}</div>`)}
    ${secao("e-visoes", "ti-arrows-split", "As duas visões da Fidelização", "Todo disparo de fidelização segue uma delas", `<div class="frentes">${cardVisao("produto")}${cardVisao("necessidade")}</div>`)}
    ${secao("e-caminho", "ti-route", "O caminho de um disparo", "Da escolha da visão ao resultado", `<div class="painel"><ol class="passos" style="list-style:none;margin:0;padding:0">${passos.map((p, n) => `<li class="passo"><span class="n" aria-hidden="true"><i class="ti ${p.icone || "ti-point"}"></i></span><span class="eyebrow">Passo ${n + 1}</span><h3>${esc(p.titulo)}</h3><p>${esc(p.texto)}</p></li>`).join("")}</ol></div>`)}
    ${e.classes?.length ? secao("e-classes", "ti-users-group", "Quem recebe o quê", "Todo lead é avaliado antes de qualquer mensagem" + (ref ? ` · números do ${ref}` : ""), `<div class="classes">${e.classes.map((c) => { const k = String(c.classe || "").toUpperCase(); const n = contagem ? contagem[k] : null;
      return `<div class="classe cl-${esc(k.toLowerCase())}"><div style="display:flex;gap:12px;align-items:center"><span class="letra" aria-hidden="true"${k.length > 1 ? ' style="font-size:12px"' : ""}>${esc(c.classe)}</span><div><h3>${k.length > 1 ? "" : "Classe " + esc(c.classe) + " · "}${esc(c.nome || "")}</h3>${n != null ? `<span class="qtd-cl">${n} lead(s)</span>` : ""}</div></div>
        <p class="note">${esc(c.quem || "")}</p><div class="canal-cl"><i class="ti ti-send" aria-hidden="true"></i><span>${esc(c.canal || "")}</span></div></div>`; }).join("")}</div>`) : ""}
    ${comMatriz.length ? secao("e-oferta", "ti-target", "O que oferecer", "Por produto e por necessidade, em cada pasta", `<div class="pilha">${comMatriz.map((p) => `${p.estrategia?.length ? `<h3 class="sub-oferta"><i class="ti ${VISOES.produto.ico}" aria-hidden="true"></i>${esc(p.nome)} · por produto</h3>${matrizProduto(p)}` : ""}${p.necessidade?.length ? `<h3 class="sub-oferta"><i class="ti ${VISOES.necessidade.ico}" aria-hidden="true"></i>${esc(p.nome)} · por necessidade</h3>${matrizNecessidade(p)}` : ""}`).join("")}</div>`) : ""}
    ${e.regras?.length ? secao("e-regras", "ti-checklist", "Diretrizes", "Aplicam-se a todos os disparos", `<div class="painel"><ul class="regras">${e.regras.map((r) => `<li><i class="ti ti-circle-check" aria-hidden="true"></i><span>${esc(r)}</span></li>`).join("")}</ul></div>`) : ""}
    ${secao("e-numeros", "ti-book", "Como ler os números", "O que cada indicador do painel quer dizer", `<div class="painel"><dl class="glossario">${GLOSSARIO.map(([ic, termo, def]) => `<div><dt><i class="ti ${ic}" aria-hidden="true"></i>${termo}</dt><dd>${def}</dd></div>`).join("")}</dl></div>`)}
    ${!state.estrategia ? `<p class="note">A descrição completa da estratégia (objetivo, números do problema, classes e regras) ainda não foi cadastrada no banco.</p>` : ""}
  </div>`;
}
function manterFoco(fn) {
  const foco = document.activeElement?.id; const pos = foco && document.activeElement.selectionStart;
  fn();
  if (foco && $(foco)) { $(foco).focus(); try { if (pos != null) $(foco).setSelectionRange(pos, pos); } catch (e) {} }
}
function renderLeadsSomente() {
  const r = state.rota; if (r.tipo !== "disparo") return;
  const d = state.disparos.find((x) => x.id === r.id); const det = $("leadsDet"); if (!d || !det) return render();
  manterFoco(() => { det.outerHTML = blocoLeads(d); });
}
function renderCzLeads() {
  const r = state.rota; if (r.tipo !== "czd") return;
  const d = state.cz.find((x) => x.id === r.id); const box = $("czLeads"); if (!d || !box) return render();
  manterFoco(() => { box.outerHTML = blocoCzLeads(d); });
}
/* Dados novos chegando: não apaga o que alguém está digitando. */
function atualizar() {
  if (!iniciado) return;
  const r = state.rota; const a = document.activeElement?.id || "";
  if ((r.tipo === "inst" || r.tipo === "inst-novo") && $("instForm")) return;
  if (a.startsWith("obs-") || a.startsWith("czobs-")) return;
  if (a === "busca") return renderLeadsSomente();
  if (a === "czbusca") return renderCzLeads();
  render();
}

/* ---------- gravação (fidelização) ---------- */
function avisar(txt, erro) { const s = $("statusLine"); if (s) { s.textContent = txt; s.classList.toggle("err", !!erro); } }
async function salvar(id, campo, valor, el) {
  if (!db) return;
  el.disabled = true;
  try {
    const agora = new Date().toISOString();
    const extra = campo === "status" ? { respondido_em: valor === "aguardando" ? "" : agora } : campo === "enviado" ? { enviado_em: valor ? agora : "" } : {};
    await db.collection("leads").doc(id).update({ [campo]: valor, ...extra, atualizado_em: agora });
    const lx = state.leads.find((x) => x._id === id); if (lx) Object.assign(lx, { [campo]: valor }, extra);
    avisar("Salvo.");
    const l = state.leads.find((x) => x._id === id); const d = l && state.disparos.find((x) => x.id === l.disparo);
    if (d) {
      const ls = state.leads.filter((x) => x.disparo === d.id);
      const metricas = { geral: calc(ls, d), email: calc(ls.filter((x) => x.canal === "email"), d), whatsapp: calc(ls.filter((x) => x.canal === "whatsapp"), d) };
      try { await db.collection("disparos").doc(d.id).update({ metricas }); } catch (e) {}
    }
  } catch (e) {
    if (semPermissao(e)) { state.podeEditar = false; avisar("Você tem acesso só de leitura a este painel.", true); return; }
    avisar("Não foi possível salvar. Tente de novo em alguns segundos.", true);
  } finally { el.disabled = !state.podeEditar; }
}

/* ---------- exportação ---------- */
async function baixar(id, btn) {
  const d = state.disparos.find((x) => x.id === id); const msg = $("dlMsg");
  btn.disabled = true;
  try {
    const wb = XLSX.utils.book_new();
    const base = state.bases[id];
    const crit = base?.criterios?.length ? base.criterios : [["Disparo", d.nome], ["Período da base", d.periodo_inicio ? `${fmtData(d.periodo_inicio)} a ${fmtData(d.periodo_fim)}` : d.base || ""], ["Critério", d.criterio || ""]];
    const w1 = XLSX.utils.aoa_to_sheet([["Campo", "Valor"], ...crit]); w1["!cols"] = [{ wch: 26 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(wb, w1, "Critérios");
    if (base?.linhas?.length) {
      const w2 = XLSX.utils.aoa_to_sheet([["Lead ID", "Nome", "Empresa", "E-mail", "Telefone", "Produto no site", "Data da cotação", "Cotações no período", "Destino", "Motivo (se ficou fora)", "O que pediu"],
        ...base.linhas.map((l) => [l.lead_id, l.nome, l.empresa, l.email, l.telefone, l.produto_site, l.cotou_em, l.cotacoes, l.destino, l.motivo, l.o_que_pediu])]);
      w2["!cols"] = [10, 20, 30, 34, 18, 24, 14, 12, 16, 36, 70].map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, w2, "Base completa");
    }
    const ls = state.leads.filter((l) => l.disparo === id);
    const w3 = XLSX.utils.aoa_to_sheet([["Empresa", "Nome", "E-mail", "Canal", "Dia (WhatsApp)", "Enviado", "Resposta", "Orçamento gerado", "Observação"],
      ...ls.map((l) => [l.empresa, l.nome, l.email, l.canal === "whatsapp" ? "WhatsApp" : "E-mail", l.dia || "", (l.canal === "email" ? !!d.enviado_em : !!l.enviado) ? "Sim" : "Não",
        STATUS[l.status || "aguardando"], l.pedido_cadastrado ? "Sim" : "Não", l.obs || ""])]);
    w3["!cols"] = [30, 18, 34, 10, 14, 10, 16, 16, 40].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, w3, "Respostas");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const pasta = state.pastas.find((p) => p.id === d.pasta)?.nome || "Disparo";
    await state.downloads.save({ filename: `${pasta} - ${d.nome} - base.xlsx`, data: new Blob([buf]) });
    if (msg) msg.textContent = "Arquivo salvo.";
  } catch (e) {
    if (msg) msg.textContent = e?.code === "declined" ? "Download cancelado." : e?.code === "rate_limited" ? "Já existe um download aguardando confirmação." : "Não foi possível gerar o arquivo agora.";
  } finally { btn.disabled = false; }
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (m) => { const [y, mm] = m.split("-"); return `${MESES[+mm - 1][0].toUpperCase()}${MESES[+mm - 1].slice(1)} de ${y}`; };
function meses() {
  const set = new Set([new Date().toISOString().slice(0, 7)]);
  state.disparos.forEach((d) => { if (d.enviado_em) set.add(d.enviado_em.slice(0, 7)); if (d.data) set.add(d.data.slice(0, 7)); });
  state.leads.forEach((l) => { if (l.respondido_em) set.add(l.respondido_em.slice(0, 7)); });
  return [...set].sort().reverse();
}
const linhaM = (m) => [m.enviados, m.respostas, `${br(pct(m.respostas, m.enviados))}%`, m.interessados, `${br(pct(m.interessados, m.enviados))}%`, m.pedidos, m.sairam];
const CAB_M = ["Enviados", "Responderam", "% resposta", "Interessados", "% interesse", "Orçamentos gerados", "Pediram para sair"];
async function salvarXlsx(wb, nome, msgId) {
  const msg = $(msgId);
  try {
    await state.downloads.save({ filename: nome, data: new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })]) });
    if (msg) msg.textContent = "Arquivo salvo.";
  } catch (e) {
    if (msg) msg.textContent = e?.code === "declined" ? "Download cancelado." : e?.code === "rate_limited" ? "Já existe um download aguardando confirmação." : "Não foi possível gerar o arquivo agora.";
  }
}
function aba(wb, nome, linhas, larguras) {
  const ws = XLSX.utils.aoa_to_sheet(linhas); if (larguras) ws["!cols"] = larguras.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, nome);
}

async function relatorioMensal(btn) {
  const mes = $("mesRel").value; btn.disabled = true;
  const doMes = state.disparos.filter((d) => (d.enviado_em || "").startsWith(mes));
  const mm = doMes.map((d) => ({ d, m: metricasDisparo(d) }));
  const tot = { geral: somar(mm.map((x) => x.m.geral)), email: somar(mm.map((x) => x.m.email)), whatsapp: somar(mm.map((x) => x.m.whatsapp)) };
  const resp = state.leads.filter((l) => (l.respondido_em || "").startsWith(mes));
  const wb = XLSX.utils.book_new();
  aba(wb, "Resumo", [
    [`Relatório de fidelização · ${nomeMes(mes)}`], [`Gerado em ${new Date().toLocaleDateString("pt-BR")}`], [],
    ["Disparos enviados no mês", doMes.length], ["Respostas marcadas no mês", state.leadsOk ? resp.length : "visível só para quem opera"], [],
    ["Canal", ...CAB_M], ["Total", ...linhaM(tot.geral)], ["E-mail", ...linhaM(tot.email)], ["WhatsApp", ...linhaM(tot.whatsapp)], [],
    ["Funil do e-mail (BillionMail)", "Quantidade", "Taxa"],
    ...(() => {
      const fs = doMes.map(funilBm); const s = (k) => fs.reduce((a, f) => a + (f[k] || 0), 0);
      const tb = doMes.reduce((a, d) => a + (+d.tamanho_base || 0), 0), bl = doMes.reduce((a, d) => a + (+d.base_limpa_email || 0), 0);
      const env = s("env"), ent = s("entregues"), ab = s("abertos"), cl = s("cliques"), bo = s("bounces"), re = tot.email.respostas, orc = tot.email.pedidos;
      return [["Tamanho da base", tb, ""], ["Base limpa (e-mail)", bl, ""], ["Enviados (Success)", env, ""], ["Entregues", ent, env ? `${br(pct(ent, env))}% delivered` : ""],
        ["Abertos", ab, ent ? `${br(pct(ab, ent))}% lido` : ""], ["Cliques", cl, ent ? `${br(pct(cl, ent))}% dos entregues` : ""], ["Bounce", bo, env ? `${br(pct(bo, env))}% bounced` : ""],
        ["Respostas", re, ent ? `${br(pct(re, ent))}% dos entregues` : ""], ["Orçamentos", orc, [ent ? `${br(pct(orc, ent))}% dos entregues` : "", re ? `${br(pct(orc, re))}% das respostas` : ""].filter(Boolean).join(" · ")]];
    })(), [],
    ["Visões dos disparos do mês", [...new Set(doMes.map((d) => VISOES[visaoDe(d)].nome))].join(" e ") || "—"],
  ], [44, 14, 14, 12, 14, 12, 18, 16, 16, 12]);
  aba(wb, "Por disparo", [["Pasta", "Disparo", "Visão", "Enviado em", "Canal", ...CAB_M],
    ...mm.flatMap(({ d, m }) => { const p = state.pastas.find((x) => x.id === d.pasta)?.nome || "";
      const v = VISOES[visaoDe(d)].nome; const e = fmtData(d.enviado_em);
      return [[p, d.nome, v, e, "Total", ...linhaM(m.geral)], [p, d.nome, v, e, "E-mail", ...linhaM(m.email)], [p, d.nome, v, e, "WhatsApp", ...linhaM(m.whatsapp)]]; })],
    [16, 16, 16, 12, 10, 10, 12, 10, 12, 10, 16, 14]);
  if (state.leadsOk) aba(wb, "Respostas do mês", [["Data da resposta", "Pasta", "Disparo", "Empresa", "Nome", "E-mail", "Canal", "Resposta", "Orçamento gerado", "Observação"],
    ...resp.sort((a, b) => a.respondido_em.localeCompare(b.respondido_em)).map((l) => { const d = state.disparos.find((x) => x.id === l.disparo) || {};
      return [fmtData(l.respondido_em), state.pastas.find((p) => p.id === d.pasta)?.nome || "", d.nome || "", l.empresa, l.nome, l.email, l.canal === "whatsapp" ? "WhatsApp" : "E-mail", STATUS[l.status], l.pedido_cadastrado ? "Sim" : "Não", l.obs || ""]; })],
    [14, 12, 12, 30, 16, 32, 10, 16, 16, 40]);
  await salvarXlsx(wb, `Relatório de fidelização - ${nomeMes(mes)}.xlsx`, "relMsg");
  btn.disabled = false;
}

/* Planilha da campanha no formato padrão do time: aba WhatsApp igual ao modelo (Dia, Nome, Empresa, Celular, O que pediu,
   Mensagem, Abrir conversa, Enviado?, Respondeu?, Orçamento?, Enviado), depois E-mail, E-mail personalizado, Campanha e Textos. */
async function baixarCampanha(id, btn) {
  const d = state.disparos.find((x) => x.id === id); const c = d.campanha || {}; const msg = $("dlMsg"); btn.disabled = true;
  const p = state.pastas.find((x) => x.id === d.pasta)?.nome || "";
  try {
    const wb = new ExcelJS.Workbook();
    const larguras = (ws, ls) => ls.forEach((w, i) => { if (w) ws.getColumn(i + 1).width = w; });
    const cabecalho = (ws) => { ws.getRow(1).font = { bold: true }; ws.views = [{ state: "frozen", ySplit: 1 }]; };
    const doDisparo = state.leads.filter((l) => l.disparo === id);
    if (state.leadsOk) {
      const wa = doDisparo.filter((l) => l.canal === "whatsapp").sort((a, b) => (a.dia || "").localeCompare(b.dia || ""));
      const ws = wb.addWorksheet("WhatsApp");
      ws.addRow(["Dia", "Nome", "Empresa", "Celular", "O que pediu", "Mensagem", "Abrir conversa", "Enviado?", "Respondeu?", "Orçamento?", "Enviado"]);
      cabecalho(ws); larguras(ws, [null, null, 15.6, 14.5, 27.2, 33, 18.4, 13.8, 16.6, 16.2]);
      wa.forEach((l) => {
        const texto = l.whatsapp_msg || "";
        const r = ws.addRow([l.dia || "", l.nome_whatsapp ?? l.nome ?? "", l.empresa_whatsapp || l.empresa || "", l.celular || "", l.pedido_curto || "", texto,
          { text: "Abrir conversa", hyperlink: `https://wa.me/${l.numero_whatsapp || ""}?text=${encodeURIComponent(texto)}` }, null, null, null, null]);
        r.height = 22.5;
        r.getCell(6).alignment = { wrapText: true, vertical: "top" };
        r.getCell(7).font = { color: { argb: "FF1A73E8" }, underline: true };
        r.getCell(1).dataValidation = { type: "list", allowBlank: true, formulae: ['"Dia 1,Dia 2"'] };
        [8, 9, 10].forEach((k) => { r.getCell(k).dataValidation = { type: "list", allowBlank: true, formulae: ['"Sim,Não"'] }; });
      });
      const em = wb.addWorksheet("E-mail");
      em.addRow(["Nome", "Empresa", "E-mail", "Carta", "Classe"]); cabecalho(em); larguras(em, [16, 34, 40, 26, 8]);
      doDisparo.filter((l) => l.canal === "email" && l.carta !== "E-mail personalizado").sort((a, b) => (a.carta || "").localeCompare(b.carta || ""))
        .forEach((l) => em.addRow([l.nome || "", l.empresa || "", l.email || "", l.carta || "", l.classe || ""]));
      const pers = doDisparo.filter((l) => l.carta === "E-mail personalizado");
      if (pers.length) {
        const ep = wb.addWorksheet("E-mail personalizado");
        ep.addRow(["Nome", "Empresa", "E-mail", "Assunto", "Texto", "Enviado?"]); cabecalho(ep); larguras(ep, [14, 24, 34, 40, 90, 11]);
        pers.forEach((l) => { const r = ep.addRow([l.nome || "", l.empresa || "", l.email || "", l.email_assunto || "", l.email_texto || "", null]);
          r.getCell(5).alignment = { wrapText: true, vertical: "top" }; r.getCell(6).dataValidation = { type: "list", allowBlank: true, formulae: ['"Sim,Não"'] }; });
      }
    }
    const ca = wb.addWorksheet("Campanha"); larguras(ca, [26, 110]);
    [["Campo", "Conteúdo"], ["Pasta", p], ["Disparo", d.nome], ["Carta", d.carta || ""], ["Situação", d.enviado_em ? `Enviado em ${fmtData(d.enviado_em)}` : "Preparado, aguardando envio"],
      ["Período da base", d.periodo_inicio ? `${fmtData(d.periodo_inicio)} a ${fmtData(d.periodo_fim)}` : ""], ["Leads", `${d.email || 0} por e-mail · ${d.whatsapp || 0} por WhatsApp`],
      ["Remetente do e-mail", c.remetente_email || ""], ["Quem assina o WhatsApp", c.remetente_whatsapp || ""], ["Variáveis", c.variaveis || ""]].forEach((r) => ca.addRow(r));
    ca.getRow(1).font = { bold: true };
    const tx = wb.addWorksheet("Textos"); larguras(tx, [34, 110]);
    [["Peça", "Texto"], ["Assunto do e-mail", c.assunto || ""], ["E-mail", c.email_texto || ""], ...(c.whatsapp_variantes || []).map((t, i) => [`WhatsApp · modelo ${i + 1}`, t]),
      ["WhatsApp · segunda mensagem (resposta sim)", c.segunda_mensagem || ""], ["WhatsApp · resposta ao não", c.resposta_nao || ""]]
      .forEach((r) => { const row = tx.addRow(r); row.getCell(2).alignment = { wrapText: true, vertical: "top" }; });
    tx.getRow(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    await state.downloads.save({ filename: `${p} - ${d.nome} - campanha.xlsx`, data: new Blob([buf]) });
    if (msg) msg.textContent = "Arquivo salvo.";
  } catch (e) {
    if (msg) msg.textContent = e?.code === "declined" ? "Download cancelado." : e?.code === "rate_limited" ? "Já existe um download aguardando confirmação." : "Não foi possível gerar o arquivo agora.";
  } finally { btn.disabled = false; }
}

/* ---------- modo claro e escuro (a escolha fica guardada neste navegador) ---------- */
const CHAVE_TEMA = "painel-tema";
const temaAtual = () => document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
function rotuloTema() {
  const escuro = temaAtual() === "dark";
  document.querySelectorAll("[data-tema]").forEach((b) => {
    b.innerHTML = `<i class="ti ${escuro ? "ti-sun" : "ti-moon"}" aria-hidden="true"></i><span>${escuro ? "Modo claro" : "Modo escuro"}</span>`;
    b.setAttribute("aria-label", escuro ? "Ativar modo claro" : "Ativar modo escuro");
  });
}
function trocarTema() {
  const novo = temaAtual() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", novo);
  try { localStorage.setItem(CHAVE_TEMA, novo); } catch (e) {}
  rotuloTema();
}
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", rotuloTema); } catch (e) {}
rotuloTema();

/* ---------- eventos ---------- */
document.addEventListener("click", (ev) => {
  if (ev.target.closest("[data-tema]")) return trocarTema();
  const dl = ev.target.closest("[data-baixar]"); if (dl) return baixar(dl.dataset.baixar, dl);
  const cp = ev.target.closest("[data-campanha]"); if (cp) return baixarCampanha(cp.dataset.campanha, cp);
  const rl = ev.target.closest("[data-relatorio]"); if (rl) return relatorioMensal(rl);
  const zb = ev.target.closest("[data-czbaixar]"); if (zb) return baixarCz(zb.dataset.czbaixar, zb);
  const ro = ev.target.closest("[data-rolar]");
  if (ro) { const alvo = document.getElementById(ro.dataset.rolar); if (alvo) alvo.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); return; }
  const ap = ev.target.closest("[data-apagar]");
  if (ap) { $("apagarBox").innerHTML = `<button type="button" class="btn perigo" data-apagar-ok="${esc(ap.dataset.apagar)}">Confirmar exclusão</button> <button type="button" class="btn secundario" data-apagar-nao="${esc(ap.dataset.apagar)}">Manter</button>`; return; }
  const apn = ev.target.closest("[data-apagar-nao]");
  if (apn) { $("apagarBox").innerHTML = `<button type="button" class="btn secundario" data-apagar="${esc(apn.dataset.apagarNao)}">Excluir disparo</button>`; return; }
  const apok = ev.target.closest("[data-apagar-ok]"); if (apok) return apagarInst(apok.dataset.apagarOk, apok);
  const b = ev.target.closest("[data-ir]"); if (!b) return;
  const i = b.dataset.ir.indexOf(":");
  ir(i < 0 ? { tipo: b.dataset.ir } : { tipo: b.dataset.ir.slice(0, i), id: b.dataset.ir.slice(i + 1) });
});
document.addEventListener("submit", (ev) => { if (ev.target.id === "instForm") { ev.preventDefault(); salvarInst(ev.target); } });
document.addEventListener("toggle", (ev) => { if (ev.target.id === "leadsDet") state.leadsAberto = ev.target.open; }, true);
document.addEventListener("input", (ev) => {
  if (ev.target.id === "busca") { state.busca = ev.target.value; renderLeadsSomente(); }
  if (ev.target.id === "czbusca") { state.busca = ev.target.value; renderCzLeads(); }
});
document.addEventListener("change", (ev) => {
  const el = ev.target;
  if (el.id === "fCanal") { state.canal = el.value; return renderLeadsSomente(); }
  if (el.id === "fStatus") { state.status = el.value; return renderLeadsSomente(); }
  if (el.id === "fEnvio") { state.envio = el.value; return renderCzLeads(); }
  if (el.id === "fCzStatus") { state.status = el.value; return renderCzLeads(); }
  if (el.id === "instMes") { state.instMes = el.value; return render(); }
  if (el.dataset.bm) return salvarBm(el);
  const trz = el.closest("tr[data-cz]");
  if (trz && el.dataset.cf && el.dataset.cf !== "obs") {
    const valor = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.cf === "status") el.className = "st-" + valor;
    if (el.dataset.cf === "envio") el.className = "env-" + valor;
    return salvarCz(trz.dataset.cz, el.dataset.cf, valor, el);
  }
  const tr = el.closest("tr[data-id]"); if (!tr || !el.dataset.f || el.dataset.f === "obs") return;
  const valor = el.type === "checkbox" ? el.checked : el.value;
  if (el.dataset.f === "status") el.className = "st-" + valor;
  salvar(tr.dataset.id, el.dataset.f, valor, el);
});
document.addEventListener("focusout", (ev) => {
  const el = ev.target;
  if (el.dataset?.cf === "obs") {
    const tr = el.closest("tr[data-cz]"); const l = tr && state.czLeads.find((x) => x._id === tr.dataset.cz);
    if (l && (l.obs || "") !== el.value) salvarCz(tr.dataset.cz, "obs", el.value, el);
    return;
  }
  if (el.dataset?.f !== "obs") return;
  const tr = el.closest("tr[data-id]"); const l = state.leads.find((x) => x._id === tr.dataset.id);
  if (l && (l.obs || "") !== el.value) salvar(tr.dataset.id, "obs", el.value, el);
});
window.addEventListener("hashchange", () => { if (!iniciado) return; const r = rotaDoHash(); if (hashDe(r) !== hashDe(state.rota)) { state.rota = r; render(); } });

/* ---------- login e dados (Firebase) ----------
   O time entra com o e-mail da empresa (conta Microsoft): recebe um link de acesso no Outlook.
   A dona do projeto entra com a conta Google. Quem está na coleção "operadores" vê os leads e marca as
   respostas; o resto da empresa vê só os números. As mesmas regras valem no banco (firestore.rules). */
const downloadLocal = {
  save: async ({ filename, data }) => {
    const url = URL.createObjectURL(data); const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};
const CHAVE_EMAIL = "painel-email-login";
const lerEmail = () => { try { return localStorage.getItem(CHAVE_EMAIL) || ""; } catch (e) { return ""; } };
const guardarEmail = (v) => { try { if (v) localStorage.setItem(CHAVE_EMAIL, v); else localStorage.removeItem(CHAVE_EMAIL); } catch (e) {} };
const limparUrl = () => { try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {} };
let assinaturas = []; let avisoLogin = "";
const ladoLogin = () => `<div class="login-lado">
    <div class="marca"><span class="logo" aria-hidden="true"><i class="ti ti-radar-2"></i></span><div><b>Soluções Industriais</b><span>Growth · Disparos</span></div></div>
    <div style="display:grid;gap:8px"><h1>Painel de Fidelização</h1><p>Os disparos do Growth em um só lugar: a estratégia, os resultados de cada frente e a marcação das respostas, ao vivo.</p></div>
    <ul>
      <li><i class="ti ti-refresh" aria-hidden="true"></i><span><b>Fidelização</b>Quem já cotou, chamado de volta</span></li>
      <li><i class="ti ti-building" aria-hidden="true"></i><span><b>Institucional</b>Cartas por segmento</span></li>
      <li><i class="ti ti-brand-whatsapp" aria-hidden="true"></i><span><b>ColdZap</b>WhatsApp do cold mail</span></li>
    </ul></div>`;
function telaLogin(msg, ok) {
  const dominio = String(window.DOMINIO_EMPRESA || "");
  document.body.classList.add("sem-menu");
  cab("Painel de Fidelização", ""); $("abas").innerHTML = ""; $("crumbs").innerHTML = ""; $("conta").hidden = true; $("aovivo").hidden = true;
  $("view").innerHTML = `<div class="login">${ladoLogin()}
    <div class="login-form-lado">
      <div style="display:grid;gap:6px"><h2 style="font-size:20px">Entrar</h2>
      <p class="note" style="font-size:14px">Digite o seu e-mail da empresa. Você recebe um link de acesso no Outlook: abra o link neste mesmo computador e pronto.</p></div>
      <form id="formLink" class="login-form" novalidate>
        <label class="campo" for="loginEmail">E-mail da empresa<input type="email" id="loginEmail" autocomplete="email" placeholder="nome@${esc(dominio)}" value="${esc(lerEmail())}"></label>
        <button type="submit" class="btn" id="enviarLink"><i class="ti ti-mail-forward" aria-hidden="true"></i>Receber link de acesso</button>
      </form>
      ${msg ? `<p class="status-line${ok ? "" : " err"}" role="${ok ? "status" : "alert"}">${esc(msg)}</p>` : ""}
      <div class="ou">ou</div>
      <p class="note">Administração do painel: <button type="button" class="linkbtn" id="entrarGoogle">entrar com Google</button></p>
      <button type="button" class="linkbtn tema-login" data-tema aria-label="Alternar entre modo claro e escuro"></button>
    </div></div>`;
  rotuloTema();
}
function telaConfirmarEmail(msg) {
  document.body.classList.add("sem-menu");
  cab("Painel de Fidelização", ""); $("abas").innerHTML = ""; $("crumbs").innerHTML = ""; $("conta").hidden = true; $("aovivo").hidden = true;
  $("view").innerHTML = `<div class="login">${ladoLogin()}
    <div class="login-form-lado">
      <div style="display:grid;gap:6px"><h2 style="font-size:20px">Confirme o seu e-mail</h2>
      <p class="note" style="font-size:14px">O link foi aberto num navegador diferente do que pediu o acesso. Digite o mesmo e-mail que recebeu o link para terminar.</p></div>
      <form id="formConfirma" class="login-form" novalidate>
        <label class="campo" for="confEmail">E-mail<input type="email" id="confEmail" autocomplete="email"></label>
        <button type="submit" class="btn">Entrar</button>
      </form>
      ${msg ? `<p class="status-line err" role="alert">${esc(msg)}</p>` : ""}
    </div></div>`;
}
function limparDados() {
  assinaturas.forEach((parar) => { try { parar(); } catch (e) {} }); assinaturas = [];
  iniciado = false;
  Object.assign(state, { pastas: [], estrategia: null, disparos: [], leads: [], bases: {}, inst: [], cz: [], czLeads: [], carregado: {}, leadsOk: false, czOk: false, podeEditar: false });
}
(function () {
  const cfg = window.FIREBASE_CONFIG || {};
  if (!window.firebase || !cfg.projectId) {
    $("view").innerHTML = `<div class="empty">O painel ainda não está ligado ao banco de dados. Preencha o arquivo firebase-config.js, como explica o README.</div>`;
    return;
  }
  firebase.initializeApp(cfg);
  const auth = firebase.auth(); db = firebase.firestore();
  state.downloads = downloadLocal;
  const dominio = String(window.DOMINIO_EMPRESA || "").toLowerCase();

  /* Login pelo link que chega no e-mail */
  let linkPendente = auth.isSignInWithEmailLink(location.href);
  const erroLink = (e) => (e && (e.code === "auth/invalid-action-code" || e.code === "auth/expired-action-code") ? "Este link já foi usado ou expirou. Peça um novo abaixo."
    : e && e.code === "auth/invalid-email" ? "Esse não é o e-mail que recebeu o link." : "Não foi possível entrar com esse link. Peça um novo abaixo.");
  async function concluirLink(email) {
    $("view").innerHTML = `<div class="empty">Entrando…</div>`;
    try { await auth.signInWithEmailLink(email, location.href); guardarEmail(email); linkPendente = false; limparUrl(); }
    catch (e) { if (e && e.code === "auth/invalid-email") return telaConfirmarEmail(erroLink(e)); linkPendente = false; limparUrl(); telaLogin(erroLink(e)); }
  }

  document.addEventListener("submit", async (ev) => {
    if (ev.target.id === "formLink") {
      ev.preventDefault();
      const email = $("loginEmail").value.trim().toLowerCase();
      if (!email.endsWith("@" + dominio)) return telaLogin(`Use o seu e-mail @${dominio}.`);
      const btn = $("enviarLink"); btn.disabled = true;
      try {
        await auth.sendSignInLinkToEmail(email, { url: location.origin + location.pathname, handleCodeInApp: true });
        guardarEmail(email);
        telaLogin(`Enviamos o link para ${email}. Abra o e-mail no Outlook e clique em entrar. Se não aparecer em alguns minutos, olhe a caixa de spam.`, true);
      } catch (e) {
        telaLogin(e && e.code === "auth/quota-exceeded" ? "O limite de links de acesso de hoje acabou. Tente amanhã ou fale com a responsável pelo painel."
          : e && e.code === "auth/unauthorized-continue-uri" ? "Este endereço do painel ainda não foi autorizado no Firebase. Avise a responsável pelo painel."
          : "Não foi possível enviar o link agora. Tente de novo em alguns minutos.");
      }
    }
    if (ev.target.id === "formConfirma") {
      ev.preventDefault();
      const email = $("confEmail").value.trim().toLowerCase();
      if (email) concluirLink(email);
    }
  });

  document.addEventListener("click", async (ev) => {
    if (ev.target.closest("#entrarGoogle")) {
      const prov = new firebase.auth.GoogleAuthProvider();
      prov.setCustomParameters({ prompt: "select_account" });
      try { await auth.signInWithPopup(prov); }
      catch (e) {
        if (e && (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request")) return;
        telaLogin(e && e.code === "auth/popup-blocked" ? "O navegador bloqueou a janela de login. Libere pop-ups para este site e tente de novo." : "Não foi possível entrar. Tente de novo.");
      }
    }
    if (ev.target.closest("#sair")) auth.signOut();
  });

  auth.onAuthStateChanged(async (u) => {
    limparDados();
    if (!u) {
      if (linkPendente) { const guardado = lerEmail(); return guardado ? concluirLink(guardado) : telaConfirmarEmail(); }
      const m = avisoLogin; avisoLogin = ""; return telaLogin(m);
    }
    const email = String(u.email || "").toLowerCase();
    $("view").innerHTML = `<div class="empty">Carregando o painel…</div>`;
    let operador = false;
    try { operador = (await db.collection("operadores").doc(email).get()).exists; } catch (e) { operador = false; }
    const daEmpresa = !!dominio && email.endsWith("@" + dominio) && u.emailVerified;
    if (!daEmpresa && !operador) {
      avisoLogin = `A conta ${email} não tem acesso a este painel. Entre com o seu e-mail @${dominio}.`;
      return auth.signOut();
    }
    state.podeEditar = operador;
    document.body.classList.remove("sem-menu");
    $("conta").hidden = false; $("contaEmail").textContent = email;
    $("contaPapel").textContent = operador ? "Operação · vê e marca" : "Leitura · vê os números";
    $("contaAvatar").textContent = (email.split("@")[0].match(/[a-z]/gi) || ["?"]).slice(0, 2).join("").toUpperCase();
    abas();

    const limite = setTimeout(() => { if (!iniciado) $("view").innerHTML = `<div class="empty">Os dados do painel não carregaram. Recarregue a página para tentar de novo.</div>`; }, 10000);
    const chegou = (k) => {
      state.carregado[k] = true;
      $("aovivo").hidden = false;
      $("aovivoTxt").textContent = `Ao vivo · atualizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
      if (!iniciado && state.carregado.pastas && state.carregado.disparos) { iniciado = true; clearTimeout(limite); state.rota = rotaDoHash(); render(); }
      else atualizar();
    };
    const ouvir = (col, ok, erro) => assinaturas.push(db.collection(col).onSnapshot(ok, erro));
    ouvir("bases", (s) => { state.bases = Object.fromEntries(s.docs.map((d) => [d.id, d.data()])); }, () => {});
    /* Documentos com id iniciado por "_" guardam configuração (ex.: _estrategia) e não são pastas de produto. */
    ouvir("pastas", (s) => {
      const docs = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.pastas = docs.filter((p) => !p.id.startsWith("_"));
      state.estrategia = docs.find((p) => p.id === "_estrategia") || null;
      chegou("pastas");
    }, () => chegou("pastas"));
    ouvir("disparos", (s) => { state.disparos = s.docs.map((d) => ({ id: d.id, ...d.data() })); chegou("disparos"); }, () => chegou("disparos"));
    ouvir("leads", (s) => { state.leads = s.docs.map((d) => ({ _id: d.id, ...d.data() })); state.leadsOk = state.leads.length > 0; chegou("leads"); }, () => { state.leadsOk = false; chegou("leads"); });
    ouvir("institucional", (s) => { state.inst = s.docs.map((d) => ({ id: d.id, ...d.data() })); chegou("inst"); }, () => chegou("inst"));
    ouvir("coldzap", (s) => { state.cz = s.docs.map((d) => ({ id: d.id, ...d.data() })); chegou("cz"); }, () => chegou("cz"));
    ouvir("coldzap_leads", (s) => { state.czLeads = s.docs.map((d) => ({ _id: d.id, ...d.data() })); state.czOk = true; chegou("czl"); }, () => { state.czOk = false; chegou("czl"); });
  });
})();
