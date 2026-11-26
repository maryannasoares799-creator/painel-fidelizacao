const STATUS = { aguardando: "Sem resposta", interessado: "Interessado", sem_interesse: "Sem interesse", saiu: "Pediu para sair" };
const ENVIO = { "": "Não enviado", enviado: "Enviado", nao_existe: "Número não existe" };
const BASE_AB = ["Inteira", "A", "B"];
const state = {
  pastas: [], estrategia: null, disparos: [], leads: [], bases: {}, inst: [], cm: [], cz: [], czLeads: [], carregado: {}, czSel: new Set(), fidSel: new Set(),
  downloads: null, leadsOk: false, czOk: false, orcs: [], orcOk: false, orcErro: false, podeEditar: true, rota: { tipo: "inicio" }, vista: "caixas",
  busca: "", canal: "", status: "", envio: "", leadsAberto: false, instMes: "", geralMes: "", cmMes: "", czMes: "", fidMes: "", cmBusca: "", czBuscaLista: "", instBusca: "",
};
let db = null; let iniciado = false;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const br = (n) => String(n).replace(".", ",");
const fmtData = (s) => { if (!s) return ""; const [y, m, d] = s.slice(0, 10).split("-"); return d ? `${d}/${m}/${y}` : s; };
const hoje = () => new Date().toISOString().slice(0, 10);
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
const VAZIO = { total: 0, enviados: 0, respostas: 0, interessados: 0, sairam: 0, pedidos: 0, voltaram: 0 };
const carregando = () => `<div class="empty"><i class="ti ti-loader-2" aria-hidden="true"></i>Carregando…</div>`;
const semPermissao = (e) => !!e && (e.code === "permission-denied" || e.code === "invalid_argument");
/* Indicador: [rótulo, valor, linha de apoio, destaque, ícone, medidor 0–100] */
const kpiGrid = (itens, cls = "") => `<div class="kpis${cls ? " " + cls : ""}">${itens.map(([l, v, s, h, ic, m]) => `<div class="kpi${h ? " highlight" : ""}">
  <div class="topo">${ic ? `<span class="ico" aria-hidden="true"><i class="ti ${ic}"></i></span>` : ""}<span class="l">${l}</span></div>
  <span class="v">${v}</span>${m != null ? `<div class="medidor" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, m))}%"></span></div>` : ""}<span class="s">${esc(s)}</span></div>`).join("")}</div>`;
/* Seletor de Período (mês) das telas das frentes; mes vazio = todos os meses. */
const periodoSel = (id, mes, ms, explicacao) => `<div class="acoes periodo"><label for="${id}" class="note" style="display:flex;gap:8px;align-items:center"><i class="ti ti-calendar-month" aria-hidden="true" style="font-size:17px"></i>Período <select id="${id}"><option value="">Todos os meses</option>${ms.map((m) => `<option value="${m}"${mes === m ? " selected" : ""}>${nomeMes(m)}</option>`).join("")}</select></label>${ajuda(explicacao)}</div>`;
/* "+120 vs outubro" para a linha de apoio do cartão da base (vazio quando é "Todos os meses"). */
const vsMes = (mes, atual, anterior) => { if (!mes) return ""; const nomeAnt = MESES[+mesAnterior(mes).slice(5) - 1]; if (anterior == null) return `sem envios em ${nomeAnt}`; const d = atual - anterior; return d === 0 ? `igual a ${nomeAnt}` : `${d > 0 ? "+" : ""}${d} vs ${nomeAnt}`; };
const mesesDe = (datas) => [...new Set(datas.map((x) => String(x || "").slice(0, 7)).filter(Boolean))].sort().reverse();
const vazio = (ic, titulo, texto) => `<div class="empty"><i class="ti ${ic}" aria-hidden="true"></i><b>${titulo}</b>${texto ? `<span>${texto}</span>` : ""}</div>`;
const secao = (id, ic, titulo, nota, corpo, acao = "") => `<section aria-labelledby="${id}"><div class="section-head"><h2 id="${id}">${ic ? `<i class="ti ${ic}" aria-hidden="true"></i>` : ""}${titulo}</h2>${acao ? `<div class="cab-dir">${nota ? `<span class="note">${nota}</span>` : ""}${acao}</div>` : nota ? `<span class="note">${nota}</span>` : ""}</div>${corpo}</section>`;
/* Modo de ver os fornecedores (Cold mail e ColdZap): "caixas" (cartões) ou "lista" (fileiras). Fica guardado neste navegador. */
const CHAVE_VISTA = "painel-vista";
const lerVista = () => { try { return localStorage.getItem(CHAVE_VISTA) === "lista" ? "lista" : "caixas"; } catch (e) { return "caixas"; } };
const seletorVista = () => `<div class="vista" role="group" aria-label="Modo de ver">${[["caixas", "ti-layout-grid", "Caixas"], ["lista", "ti-list", "Lista"]].map(([k, ic, nome]) =>
  `<button type="button" data-vista="${k}" aria-pressed="${state.vista === k}"><i class="ti ${ic}" aria-hidden="true"></i><span>${nome}</span></button>`).join("")}</div>`;
/* Fileira compacta: nome e detalhe, situação, até 3 números e a seta. */
const fileira = (cls, ir, nome, sub, sit, nums) => `<button type="button" class="linha ${cls}" data-ir="${ir}">
  <span class="l-nome"><b>${nome}</b><small>${sub}</small></span><span class="l-sit">${sit}</span>
  ${nums.map(([v, l]) => `<span class="l-num"><b>${v}</b><small>${l}</small></span>`).join("")}<i class="ti ti-chevron-right" aria-hidden="true"></i></button>`;
const painel = (id, ic, titulo, nota, corpo, extra = "") => `<section class="painel${extra}" aria-labelledby="${id}"><div class="section-head"><h2 id="${id}">${ic ? `<i class="ti ${ic}" aria-hidden="true"></i>` : ""}${titulo}</h2>${nota ? `<span class="note">${nota}</span>` : ""}</div>${corpo}</section>`;
function cab(titulo, sub) {
  $("titulo").textContent = titulo;
  const s = $("subtitulo"); if (s) { s.textContent = sub || ""; s.hidden = !sub; }
}
/* Explicação que aparece ao passar o mouse ou tocar no "?" (no lugar de texto fixo na tela). dir = abre para a esquerda. */
const ajuda = (txt, dir) => `<span class="ajuda${dir ? " dir" : ""}" tabindex="0" role="img" aria-label="${esc(txt)}" data-tip="${esc(txt)}"><i class="ti ti-help-circle" aria-hidden="true"></i></span>`;
/* Funil em barras horizontais: largura relativa à primeira etapa. A conversão (% da etapa anterior) aparece numa etiqueta
   e a última etapa (orçamentos) fica em destaque, para o resultado não sumir quando a barra é pequena. */
function funil(etapas, cor) {
  const max = Math.max(1, ...etapas.map((e) => e.v || 0)); const ult = etapas.length - 1;
  return `<div class="funil" style="--cor:${cor || "var(--primaria)"}"><div class="funil-cab" aria-hidden="true"><span></span><span></span><span>Total</span><span>Conversão</span></div>${etapas.map((e, i) => {
    const ant = i ? etapas[i - 1].v : null;
    const w = e.v ? Math.max(2.5, (e.v / max) * 100) : 0;
    const seta = e.v > ant ? "ti-arrow-up-right" : e.v === ant ? "ti-arrow-right" : "ti-arrow-down-right";
    const p = i === 0 ? `<span class="funil-p">base</span>`
      : ant ? `<span class="funil-p conv"><i class="ti ${seta}" aria-hidden="true"></i>${br(pct(e.v, ant))}%</span>` : `<span class="funil-p">—</span>`;
    return `<div class="funil-linha${i === ult && i ? " fim" : ""}" title="${esc(e.nome)}: ${e.v}${i && ant ? ` · ${br(pct(e.v, ant))}% da etapa anterior (${esc(etapas[i - 1].nome)})` : ""}">
      <span class="funil-nome"><i class="ti ${e.icone || "ti-point"}" aria-hidden="true"></i>${e.nome}</span>
      <span class="funil-trilho" aria-hidden="true"><span class="funil-barra" style="width:${w}%"></span></span>
      <span class="funil-v">${e.v}</span>${p}</div>`;
  }).join("")}${etapas.some((e) => e.nota) ? `<p class="funil-legenda">${etapas.filter((e) => e.nota).map((e) => `<span>${e.nome}: ${e.nota}</span>`).join("")}</p>` : ""}</div>`;
}
/* Barra de progresso de uma lista: [rótulo, quantidade, classe do segmento] */
function progresso(partes, total) {
  const t = total || partes.reduce((a, p) => a + p[1], 0) || 1;
  return `<div class="progresso"><div class="trilho" role="img" aria-label="${esc(partes.map(([l, v]) => `${l}: ${v}`).join(", "))}">${partes.filter((p) => p[1] > 0).map(([l, v, c]) => `<span class="${c}" style="width:${(v / t) * 100}%" title="${esc(l)}: ${v}"></span>`).join("")}</div>
    <div class="legenda">${partes.map(([l, v, c]) => `<span><i class="${c}" aria-hidden="true"></i>${l} ${v}</span>`).join("")}</div></div>`;
}

/* ---------- métricas (reativação) ---------- */
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
/* Disparo lançado no painel ("manual"): os números vêm do formulário Novo disparo, não da lista de leads.
   E-mail: enviados = Success do BillionMail (ou a base limpa, se o Success ainda não foi lançado). WhatsApp: o que foi digitado. */
function fidManual(d) {
  const r = d.retorno || {}; const e = r.email || {}; const w = r.whatsapp || {};
  const enviou = !!dataEnvio(d); const limpa = num(d.base_limpa_email); const succ = num(d.bm?.enviados);
  const emEnv = enviou ? succ ?? limpa ?? 0 : 0; const emTotal = enviou ? emEnv : limpa ?? 0;
  const canal = (total, env, x) => ({ total, enviados: env, respostas: num(x.respostas) || 0, interessados: num(x.interessados) || 0, sairam: num(x.sairam) || 0, pedidos: num(x.pedidos) || 0, voltaram: 0 });
  const email = canal(emTotal, emEnv, e); const wEnv = num(w.enviados) || 0; const whatsapp = canal(Math.max(num(w.total) || 0, wEnv), wEnv, w);
  return { geral: somar([email, whatsapp]), email, whatsapp };
}
/* Data em que o disparo saiu: na lista de leads é o "Envio do e-mail"; no disparo lançado é a data do disparo, se já chegou. */
const dataEnvio = (d) => (d.manual ? (d.data && d.data <= hojeLocal() ? d.data : "") : d.enviado_em || "");
function metricasDisparo(d) {
  if (d.manual) return fidManual(d);
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
const FRENTE = (r) => (r.tipo === "geral" ? "geral" : r.tipo === "estrategia" ? "estrategia" : ["coldmail", "cmf", "cm", "cm-novo"].includes(r.tipo) ? "coldmail" : ["institucional", "inst", "inst-novo"].includes(r.tipo) ? "institucional" : ["coldzap", "czd", "cz-nova", "cz-editar"].includes(r.tipo) ? "coldzap" : "fidelizacao");
function hashDe(r) {
  if (r.tipo === "geral") return "";
  if (r.tipo === "inicio") return "fidelizacao";
  if (r.tipo === "institucional" || r.tipo === "coldzap" || r.tipo === "estrategia") return r.tipo;
  if (r.tipo === "inst-novo") return "institucional-novo";
  if (r.tipo === "coldmail") return "coldmail";
  if (r.tipo === "cm-novo") return "coldmail-novo";
  if (r.tipo === "cmf") return "cmf-" + encodeURIComponent(r.id);
  if (r.tipo === "cz-nova") return "coldzap-nova" + (r.id ? "-" + encodeURIComponent(r.id) : "");
  if (r.tipo === "cz-editar") return "coldzap-editar-" + r.id;
  if (r.tipo === "fid-novo") return "fidelizacao-novo-" + r.id;
  if (r.tipo === "fid-editar") return "editar-" + r.id;
  if (r.tipo === "visao") return "fid-" + r.id;
  return r.id;
}
/* Prepara o estado para mostrar uma rota (limpa buscas, filtros e seleções da tela anterior). */
function prepararRota(rota) {
  state.rota = rota; state.busca = ""; state.canal = ""; state.status = ""; state.envio = ""; state.leadsAberto = false; state.czSel = new Set(); state.fidSel = new Set(); state.verAnalise = false; state.czUp = null; if (FRENTE(rota) !== "coldmail") state.cmBusca = ""; if (FRENTE(rota) !== "coldzap") state.czBuscaLista = ""; if (FRENTE(rota) !== "institucional") state.instBusca = "";
}
/* Abre uma tela. Cada tela vira um passo no histórico do navegador, então o Voltar (do navegador ou do celular) volta tela
   por tela, e não sai do painel. substituir = true troca o passo atual (usado depois de salvar ou excluir, para o Voltar
   não reabrir o formulário nem um item excluído). A posição da rolagem fica guardada para o Voltar devolver no mesmo lugar. */
function ir(rota, substituir) {
  const antes = hashDe(state.rota);
  prepararRota(rota);
  try {
    const h = hashDe(rota); const url = h ? "#" + h : location.pathname;
    if (substituir || h === antes) history.replaceState({ y: 0 }, "", url);
    else { history.replaceState({ ...(history.state || {}), y: window.scrollY }, ""); history.pushState({ y: 0 }, "", url); }
  } catch (e) {}
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
  if (h === "coldmail") return { tipo: "coldmail" };
  if (h === "coldmail-novo") return { tipo: "cm-novo" };
  if (h.startsWith("cmf-")) return { tipo: "cmf", id: h.slice(4) };
  if (h.startsWith("cm-")) return { tipo: "cm", id: h };
  if (h === "coldzap") return { tipo: "coldzap" };
  if (h === "coldzap-nova") return { tipo: "cz-nova" };
  if (h.startsWith("coldzap-nova-")) return { tipo: "cz-nova", id: h.slice(13) };
  if (h.startsWith("coldzap-editar-")) return { tipo: "cz-editar", id: h.slice(15) };
  if (h.startsWith("in-")) return { tipo: "inst", id: h };
  if (h.startsWith("cz-")) return { tipo: "czd", id: h };
  if (h.startsWith("fidelizacao-novo-")) return { tipo: "fid-novo", id: h.slice(17) === "necessidade" ? "necessidade" : "produto" };
  if (h.startsWith("editar-")) return { tipo: "fid-editar", id: h.slice(7) };
  if (state.disparos.some((d) => d.id === h)) return { tipo: "disparo", id: h };
  if (state.pastas.some((p) => p.id === h)) return { tipo: "pasta", id: h };
  return { tipo: "geral" };
}

function abas() {
  const f = FRENTE(state.rota);
  const r = state.rota;
  const sub = (k) => `<button type="button" class="menu-item menu-sub" data-ir="visao:${k}"${(r.tipo === "visao" || r.tipo === "fid-novo") && r.id === k ? ' aria-current="page"' : ""}><i class="ti ${VISOES[k].ico}" aria-hidden="true"></i>${VISOES[k].nome}</button>`;
  const item = ([k, destino, ico, nome, qtd]) => `<button type="button" class="menu-item" data-ir="${destino}"${f === k && r.tipo !== "visao" && r.tipo !== "fid-novo" ? ' aria-current="page"' : ""}><i class="ti ${ico}" aria-hidden="true"></i>${nome}${iniciado && qtd != null ? `<span class="qtd" aria-label="${qtd} registro(s)">${qtd}</span>` : ""}</button>`;
  /* cada opção num bloco, com uma linha fina entre os blocos; a Reativação leva as duas visões no mesmo bloco */
  const grupo = (html) => `<div class="menu-grupo">${html}</div>`;
  $("abas").innerHTML = `<div class="menu-rotulo">Painel</div>` + [
    ["geral", "geral", "ti-layout-dashboard", "Visão geral"],
    ["estrategia", "estrategia", "ti-route", "Estratégia"],
  ].map((x) => grupo(item(x))).join("") + `<div class="menu-rotulo">Frentes</div>`
    + grupo(item(["fidelizacao", "inicio", "ti-refresh", "Reativação", state.disparos.length]) + sub("produto") + sub("necessidade")) + [
    ["institucional", "institucional", "ti-building", "Institucional", state.inst.length],
    ["coldmail", "coldmail", "ti-mail-forward", "Cold mail", cmFornecedores().length],
    ["coldzap", "coldzap", "ti-brand-whatsapp", "ColdZap", state.cz.length],
  ].map((x) => grupo(item(x))).join("");
}
function crumbs() {
  const c = $("crumbs"); const r = state.rota; const sep = `<i class="ti ti-chevron-right" aria-hidden="true"></i>`;
  let parts = [];
  if (r.tipo === "pasta") parts = [`<button type="button" data-ir="inicio">Reativação</button>`, `<span aria-current="page">${esc(state.pastas.find((p) => p.id === r.id)?.nome)}</span>`];
  if (r.tipo === "disparo") {
    const d = state.disparos.find((x) => x.id === r.id); const p = state.pastas.find((x) => x.id === d?.pasta);
    parts = [`<button type="button" data-ir="inicio">Reativação</button>`];
    if (p) parts.push(`<button type="button" data-ir="pasta:${esc(p.id)}">${esc(p.nome)}</button>`);
    parts.push(`<span aria-current="page">${esc(d?.nome)}</span>`);
  }
  if (r.tipo === "visao") parts = [`<button type="button" data-ir="inicio">Reativação</button>`, `<span aria-current="page">${VISOES[r.id]?.nome || ""}</span>`];
  if (r.tipo === "fid-novo") parts = [`<button type="button" data-ir="inicio">Reativação</button>`, `<button type="button" data-ir="visao:${esc(r.id)}">${VISOES[r.id]?.nome || ""}</button>`, `<span aria-current="page">Novo disparo</span>`];
  if (r.tipo === "fid-editar") { const d = state.disparos.find((x) => x.id === r.id);
    parts = [`<button type="button" data-ir="inicio">Reativação</button>`, ...(d ? [`<button type="button" data-ir="disparo:${esc(d.id)}">${esc(d.nome)}</button>`] : []), `<span aria-current="page">Editar disparo</span>`]; }
  if (r.tipo === "cmf") parts = [`<button type="button" data-ir="coldmail">Cold mail</button>`, `<span aria-current="page">${esc(cmFornecedores().find((x) => x.k === r.id)?.empresa || "Fornecedor")}</span>`];
  if (r.tipo === "cm" || r.tipo === "cm-novo") { const d = r.tipo === "cm" ? state.cm.find((x) => x.id === r.id) : null; const k = d ? normChave(d.chave) || "sem-id:" + String(d.empresa || "").trim().toLowerCase() : r.id; const fo = k ? cmFornecedores().find((x) => x.k === k) : null;
    parts = [`<button type="button" data-ir="coldmail">Cold mail</button>`, ...(fo ? [`<button type="button" data-ir="cmf:${esc(fo.k)}">${esc(fo.empresa)}</button>`] : []), `<span aria-current="page">${r.tipo === "cm" ? "Editar envio" : "Novo envio"}</span>`]; }
  if (r.tipo === "inst" || r.tipo === "inst-novo") parts = [`<button type="button" data-ir="institucional">Institucional</button>`, `<span aria-current="page">${r.tipo === "inst-novo" ? "Novo disparo" : "Ficha do disparo"}</span>`];
  if (r.tipo === "cz-nova") parts = [`<button type="button" data-ir="coldzap">ColdZap</button>`, `<span aria-current="page">Nova lista</span>`];
  if (r.tipo === "cz-editar") parts = [`<button type="button" data-ir="coldzap">ColdZap</button>`, `<button type="button" data-ir="czd:${esc(r.id)}">${esc(state.cz.find((x) => x.id === r.id)?.empresa || "Lista")}</button>`, `<span aria-current="page">Editar lista</span>`];
  if (r.tipo === "czd") parts = [`<button type="button" data-ir="coldzap">ColdZap</button>`, `<span aria-current="page">${esc(state.cz.find((x) => x.id === r.id)?.empresa || "Lista")}</span>`];
  c.innerHTML = parts.join(sep);
}

/* ---------- blocos (reativação) ---------- */
function kpis(m, base) {
  return kpiGrid([
    ...(base ? [["Tamanho da base", m.total, base.sub, false, "ti-users-group"]] : []),
    ["Enviados", m.enviados, m.enviados < m.total ? `${m.total - m.enviados} aguardando envio` : base ? "toda a base enviada" : `${m.total} na base`, false, "ti-send", m.total ? pct(m.enviados, m.total) : null],
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
function situacao(d) {
  if (!d.manual) return d.enviado_em ? `<span class="chip ok">Enviado em ${fmtData(d.enviado_em)}</span>` : `<span class="chip neutro">Preparado, aguardando envio</span>`;
  if (!d.data) return `<span class="chip neutro">Sem data de disparo</span>`;
  if (d.data > hojeLocal()) return `<span class="chip info sem-ponto"><i class="ti ti-calendar-event" aria-hidden="true"></i>Programado para ${fmtData(d.data)}</span>`;
  const temNum = num(d.bm?.enviados) || num(d.retorno?.whatsapp?.enviados);
  return temNum ? `<span class="chip ok">Enviado em ${fmtData(d.data)}</span>` : `<span class="chip neutro">Enviado em ${fmtData(d.data)} · sem números</span>`;
}

/* As duas visões da Reativação. Todo disparo tem uma visão (campo "visao"; sem o campo, conta como "produto"). */
const VISOES = {
  produto: { nome: "Por produto", ico: "ti-box", curto: "Outras opções do que o lead cotou",
    texto: "Quem cotou um produto recebe as outras opções desse mesmo produto: tipos, modelos, medidas e materiais. Exemplo: para quem cotou pallet de madeira, apresentamos as opções em plástico, metal, papelão e descartável, em diversas medidas, para compra ou locação.",
    base: "Quem cotou o produto na plataforma.", oferta: "As outras opções do mesmo produto. O tipo que o lead cotou sai da lista." },
  necessidade: { nome: "Por segmento", ico: "ti-puzzle", curto: "O que o segmento do lead costuma usar",
    texto: "A base é definida por segmento, e a oferta reúne os produtos que esse tipo de empresa costuma comprar. Exemplo: para uma distribuidora ou fábrica de bebidas, apresentamos garrafa PET, câmara fria e filme termoencolhível, itens que esse segmento cota bem acima da média.",
    base: "Todos os leads de um segmento (identificado pelo nome da empresa) que já cotaram na plataforma.", oferta: "Os produtos que o segmento cota acima da média na plataforma, mais os complementos de quem usa o produto." },
};
const visaoDe = (d) => (d.visao === "necessidade" ? "necessidade" : "produto");
const chipVisao = (d) => `<span class="chip info sem-ponto"><i class="ti ${VISOES[visaoDe(d)].ico}" aria-hidden="true" style="font-size:13px"></i>${VISOES[visaoDe(d)].nome}</span>`;

/* Listas de oferta, no formato curto para o time: o que o lead cotou e o que oferecer.
   Os números da análise (lift, quantidade de leads, base) ficam escondidos atrás do botão "Ver os números da análise",
   para quem planeja o disparo. Elementos .so-analise só aparecem com o bloco aberto; .sem-analise só com ele fechado. */
const maiuscula = (t) => { const x = String(t || "").trim(); return x ? x[0].toUpperCase() + x.slice(1) : ""; };
const rotuloAnalise = () => (state.verAnalise ? `<i class="ti ti-eye-off" aria-hidden="true"></i>Esconder os números da análise` : `<i class="ti ti-chart-dots" aria-hidden="true"></i>Ver os números da análise`);
/* Período e fonte da análise da pasta (campo analise_periodo), mostrado junto com os números. */
const fonteAnalise = (p) => (p && p.analise_periodo ? `<span class="fonte-analise"><i class="ti ti-calendar-stats" aria-hidden="true"></i>${esc(p.analise_periodo)}</span>` : "");
const barraAnalise = (legenda, p) => `<div class="analise-barra"><span class="note so-analise">${fonteAnalise(p)}${legenda}</span><button type="button" class="btn secundario" data-analise="1" aria-pressed="${state.verAnalise ? "true" : "false"}">${rotuloAnalise()}</button></div>`;
const blocoOferta = (corpo) => `<div class="oferta-bloco${state.verAnalise ? " com-analise" : ""}">${corpo}</div>`;
const matrizProduto = (p) => (p.estrategia?.length ? blocoOferta(`${barraAnalise("Por que essas ofertas: as regras e a afinidade medida na plataforma.", p)}
    ${p.estrategia_nota ? `<p class="analise-nota so-analise"><i class="ti ti-info-circle" aria-hidden="true"></i>${esc(p.estrategia_nota)}</p>` : ""}
    <div class="de-para">
    <div class="de-para-cab" aria-hidden="true"><span>Se o lead cotou ${esc(p.nome.toLowerCase())}</span><span>Oferecer</span></div>
    ${p.estrategia.map((e) => `<div class="de-para-linha"><b>${esc(e.linha)}</b><span>${esc(maiuscula(e.oferta))}${e.dado ? `<small class="so-analise">${esc(e.dado)}</small>` : ""}</span></div>`).join("")}</div>`) : "");
function matrizNecessidade(p) {
  const grupos = p.necessidade || [];
  if (!grupos.length) return "";
  const curto = (t) => String(t || "").split(":")[0].trim();
  const igual = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  const card = (g) => `<article class="segmento${g.geral ? " geral" : ""}" aria-label="${esc(g.segmento)}"><div class="seg-topo"><span class="eyebrow">${g.geral ? `Quem cotou ${esc(p.nome.toLowerCase())}` : "Segmento"}</span><b>${esc(g.segmento)}</b>${g.nota ? `<p class="note so-analise">${esc(g.nota)}</p>` : ""}</div>
    <ul>${(g.itens || []).map((e) => `<li><div><b>${esc(e.linha)}</b>${e.oferta && !igual(e.oferta, e.linha) ? `<span>${esc(e.oferta)}</span>` : ""}${e.dado && g.geral ? `<small class="so-analise">${esc(e.dado)}</small>` : ""}</div>${e.dado && !g.geral ? `<span class="dado-seg so-analise">${esc(e.dado)}</span>` : ""}</li>`).join("")}</ul>
    ${g.evitar ? `<p class="evitar"><i class="ti ti-ban" aria-hidden="true"></i><span class="sem-analise">Não oferecer: ${esc(curto(g.evitar))}</span><span class="so-analise">Não oferecer: ${esc(g.evitar)}</span></p>` : ""}</article>`;
  const ordem = [...grupos.filter((g) => g.geral), ...grupos.filter((g) => !g.geral)];
  return blocoOferta(`${barraAnalise("“x” = quantas vezes mais o segmento cota o produto do que um lead qualquer da plataforma · leads = quantos já cotaram (poucos leads pedem cautela)", p)}
    <div class="segmentos">${ordem.map(card).join("")}</div>`);
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
/* Envio do e-mail: o e-mail do disparo só conta como enviado quando o disparo tem a data de envio (enviado_em).
   Só quem opera vê este bloco; ao salvar, as métricas guardadas no disparo são recalculadas. */
function blocoEnvioEmail(d, mm) {
  const n = mm.email.total || d.email || 0; const max = hojeLocal();
  const data = (v) => `<label class="note" for="dataEnvio" style="display:flex;gap:8px;align-items:center">Data do envio <input type="date" id="dataEnvio" value="${esc(v)}" max="${max}"></label>`;
  const corpo = d.enviado_em
    ? `<div class="acoes">${data(d.enviado_em.slice(0, 10))}<button type="button" class="btn secundario" data-enviar-email="${esc(d.id)}"><i class="ti ti-device-floppy" aria-hidden="true"></i>Salvar data</button>
        <span id="desmarcarBox"><button type="button" class="linkbtn" data-desmarcar-envio="${esc(d.id)}">Desmarcar envio</button></span></div>`
    : `<div class="acoes">${data(max)}<button type="button" class="btn" data-enviar-email="${esc(d.id)}"><i class="ti ti-mail-check" aria-hidden="true"></i>Marcar e-mail como enviado</button></div>`;
  return painel("h-env", "ti-mail-check", "Envio do e-mail", d.enviado_em ? `Enviado em ${fmtData(d.enviado_em)}` : "Ainda não marcado",
    `<p class="note">${d.enviado_em ? `Os ${n} e-mails deste disparo contam como enviados desde ${fmtData(d.enviado_em)}. Se a data estiver errada, corrija aqui.`
      : `Depois de disparar pelo BillionMail, marque aqui a data do envio. Os ${n} e-mails deste disparo passam a contar como enviados; o WhatsApp continua sendo marcado lead a lead.`}</p>${corpo}<span class="status-line" id="envioMsg" role="status"></span>`);
}
async function salvarEnvioEmail(id, data, btn, desmarcar = false) {
  const d = state.disparos.find((x) => x.id === id); const msg = $("envioMsg"); if (!d || !db) return;
  const aviso = (t) => { if (msg) { msg.textContent = t; msg.classList.add("err"); } };
  if (!desmarcar && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return aviso("Escolha a data do envio.");
  if (data > hojeLocal()) return aviso("A data do envio não pode ser depois de hoje.");
  btn.disabled = true;
  try {
    const d2 = { ...d, enviado_em: data }; const upd = { enviado_em: data };
    if (state.leadsOk) { const ls = state.leads.filter((l) => l.disparo === id);
      upd.metricas = { geral: calc(ls, d2), email: calc(ls.filter((l) => l.canal === "email"), d2), whatsapp: calc(ls.filter((l) => l.canal === "whatsapp"), d2) }; }
    await db.collection("disparos").doc(id).update(upd);
    Object.assign(d, upd); render();
  } catch (e) { btn.disabled = false; aviso(semPermissao(e) ? "Você tem acesso só de leitura a este painel." : "Não foi possível salvar. Tente de novo em alguns segundos."); }
}
function cardDisparo(d) {
  const m = metricasDisparo(d).geral; const p = state.pastas.find((x) => x.id === d.pasta);
  return `<button type="button" class="card fid" data-ir="disparo:${esc(d.id)}">
    <div class="top"><div><div class="nome">${p ? esc(p.nome) + " · " : ""}${esc(d.nome)}</div><div class="sub">${d.segmento ? esc(d.segmento) + " · " : ""}${fmtData(d.enviado_em || d.data)} · ${m.total} leads</div></div>${situacao(d)}</div>
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

/* ---------- telas (reativação) ---------- */
/* Reativação por período: mês do envio, ou a data planejada do disparo ainda não enviado. */
const mesFid = (d) => dataEnvio(d) || d.data || "";
const fidDoMes = (ds, mes) => ds.filter((d) => !mes || mesFid(d).startsWith(mes));
const baseFid = (ds, mes, m, universo) => { const ant = mes ? fidDoMes(universo, mesAnterior(mes)) : [];
  return { sub: [`${ds.length} disparo(s)`, vsMes(mes, m.total, ant.length ? somar(ant.map((d) => metricasDisparo(d).geral)).total : null)].filter(Boolean).join(" · ") }; };
function telaInicio() {
  cab("Reativação", "Quem já cotou na plataforma recebe e-mail e WhatsApp com novas ofertas, em duas visões: por produto (outras opções do que cotou) e por segmento (o que o segmento dele costuma usar).");
  const mesesFid = mesesDe(state.disparos.map(mesFid)); const mes = mesesFid.includes(state.fidMes) ? state.fidMes : "";
  const dsMes = fidDoMes(state.disparos, mes);
  const total = somar(dsMes.map((d) => metricasDisparo(d).geral));
  const pastas = [...state.pastas].sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
  const rel = state.downloads && window.XLSX ? painel("h-rel", "ti-file-spreadsheet", "Relatório mensal", "", `<p class="note">Disparos enviados no mês, resultados por canal e as respostas recebidas, em Excel.</p>
      <div class="relatorio"><label for="mesRel">Mês <select id="mesRel">${meses().map((m, i) => `<option value="${m}"${i === 0 ? " selected" : ""}>${nomeMes(m)}</option>`).join("")}</select></label>
      <button type="button" class="btn" data-relatorio="1"><i class="ti ti-download" aria-hidden="true"></i>Baixar relatório</button></div><span class="note" id="relMsg"></span>`) : "";
  return `<div class="pilha">
    ${state.disparos.length ? periodoSel("fidMes", mes, mesesFid, "Mostra só os disparos do mês escolhido (mês do envio, ou a data planejada de quem ainda não enviou): tamanho da base, envios, respostas e orçamentos, e o funil. As visões e as pastas continuam com todos os disparos.") : ""}
    ${secao("h-tot", "ti-chart-bar", mes ? "Disparos do período" : "Todos os disparos", `${mes ? nomeMes(mes) + " · " : ""}${dsMes.length} disparo(s)${mes ? "" : ` em ${state.pastas.length} pasta(s)`}`, kpis(total, baseFid(dsMes, mes, total, state.disparos)))}
    ${secao("h-vis", "ti-arrows-split", "As duas visões", "Cada disparo segue uma das duas", `<div class="frentes">${cardVisao("produto")}${cardVisao("necessidade")}</div>`)}
    <div class="grade-2">${painel("h-ff", "ti-filter", "Funil da reativação", mes ? `As duas visões · ${nomeMes(mes)}` : "As duas visões somadas", funil(fidEtapas(total), "var(--f-fid)"))}${rel}</div>
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
  cab(`Reativação · ${v.nome}`, v.texto);
  const todosV = state.disparos.filter((d) => visaoDe(d) === k);
  const mesesV = mesesDe(todosV.map(mesFid)); const mes = mesesV.includes(state.fidMes) ? state.fidMes : "";
  const ds = fidDoMes(todosV, mes).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const m = somar(ds.map((d) => metricasDisparo(d).geral));
  const pastas = [...state.pastas].sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
  const matrizes = pastas.map((p) => (k === "produto" ? matrizProduto(p) : matrizNecessidade(p))).filter(Boolean);
  const novoBtn = state.podeEditar ? `<button type="button" class="btn" data-ir="fid-novo:${k}"><i class="ti ti-plus" aria-hidden="true"></i>Novo disparo</button>` : "";
  return `<div class="pilha">
    ${novoBtn ? `<div class="acoes">${novoBtn}${ds.length ? `<button type="button" class="btn secundario" data-rolar="h-vd"><i class="ti ti-list" aria-hidden="true"></i>Ver os disparos (${ds.length})</button>` : ""}<span class="note">Registre aqui cada disparo, com a data, a base e os números.</span></div>` : ""}
    ${todosV.length ? periodoSel("fidMes", mes, mesesV, "Mostra só os disparos do mês escolhido (mês do envio, ou a data planejada de quem ainda não enviou): tamanho da base, envios, respostas, orçamentos e a lista de disparos.") : ""}
    ${secao("h-vr", "ti-chart-bar", "Resultado", `${mes ? nomeMes(mes) + " · " : ""}${ds.length} disparo(s) ${v.nome.toLowerCase()}`, kpis(m, baseFid(ds, mes, m, todosV)))}
    ${secao("h-vd", "ti-send", "Disparos", ds.length ? `${ds.length} disparo(s) · abra um para ver ou atualizar os números` : "", ds.length ? `<div class="grid-cards">${ds.map(cardDisparo).join("")}</div>` : vazio("ti-send-off", `Nenhum disparo ${v.nome.toLowerCase()} ainda.`, state.podeEditar ? "Use “Novo disparo” para registrar o primeiro." : "O primeiro disparo aparece aqui quando for registrado."), novoBtn)}
    ${secao("h-vo", "ti-target", "O que oferecer", k === "produto" ? "O tipo que o lead cotou sai da oferta" : "Por segmento da empresa", matrizes.join("") || vazio("ti-list-search", "Nenhuma lista de oferta cadastrada ainda."))}
  </div>`;
}
function telaPasta(id) {
  const p = state.pastas.find((x) => x.id === id); if (!p) return telaInicio();
  cab(p.nome, p.descricao || "");
  const ds = state.disparos.filter((d) => d.pasta === id).sort((a, b) => (b.data || "").localeCompare(a.data || "") || (b.numero || 0) - (a.numero || 0));
  return `<div class="pilha">
    ${secao("h-pr", "ti-chart-bar", "Resultado da pasta", "", kpis(metricasPasta(p)))}
    ${p.estrategia?.length ? secao("h-est", VISOES.produto.ico, "Por produto: o que oferecer", "O tipo que o lead cotou sai da oferta", matrizProduto(p)) : ""}
    ${p.necessidade?.length ? secao("h-nec", VISOES.necessidade.ico, "Por segmento: o que oferecer", "Por segmento da empresa", matrizNecessidade(p)) : ""}
    ${secao("h-ds", "ti-send", "Disparos", `${ds.length} disparo(s)`, `<div class="grid-cards">${ds.map(cardDisparo).join("") || vazio("ti-send-off", "Nenhum disparo nesta pasta ainda.")}</div>`)}
  </div>`;
}
function telaDisparo(id) {
  const d = state.disparos.find((x) => x.id === id); if (!d) return telaInicio();
  const p = state.pastas.find((x) => x.id === d.pasta) || {};
  if (d.manual) return telaFidManual(d, p);
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
    ${state.podeEditar && (mm.email.total || d.email) ? blocoEnvioEmail(d, mm) : ""}
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

/* Ficha de um disparo lançado no painel: os números vêm do formulário (não há lista de leads). */
function telaFidManual(d, p) {
  cab(`${p.nome ? p.nome + " · " : ""}${d.nome}`, d.segmento ? `Segmento: ${d.segmento}` : d.carta || "");
  const mm = metricasDisparo(d); const w = d.retorno?.whatsapp || {};
  return `<div class="pilha">
    <dl class="ficha">
      <div><dt>Situação</dt><dd>${situacao(d)}</dd></div>
      <div><dt>Visão</dt><dd>${chipVisao(d)}</dd></div>
      ${d.segmento ? `<div><dt>Segmento</dt><dd>${esc(d.segmento)}</dd></div>` : ""}
      <div><dt>Data do disparo</dt><dd>${d.data ? fmtData(d.data) : "Sem data"}</dd></div>
      ${d.remetente ? `<div><dt>Remetente</dt><dd>${esc(d.remetente)}</dd></div>` : ""}
      <div><dt>Canais</dt><dd>${num(d.base_limpa_email) ?? 0} por e-mail · ${num(w.total) ?? num(w.enviados) ?? 0} por WhatsApp</dd></div>
      ${d.carta ? `<div class="largo"><dt>Carta</dt><dd>${esc(d.carta)}</dd></div>` : ""}
      ${d.obs ? `<div class="largo"><dt>Observação</dt><dd>${esc(d.obs)}</dd></div>` : ""}
    </dl>
    ${state.podeEditar ? `<div class="acoes"><button type="button" class="btn" data-ir="fid-editar:${esc(d.id)}"><i class="ti ti-pencil" aria-hidden="true"></i>Editar disparo e números</button><span class="note">Os números mudam com o tempo: volte aqui para atualizar as respostas e os orçamentos.</span></div>` : ""}
    ${secao("h-res", "ti-chart-bar", "Resultado", "E-mail e WhatsApp juntos", kpis(mm.geral))}
    ${painel("h-fg", "ti-filter", "Funil do disparo", "E-mail e WhatsApp juntos", funil(fidEtapas(mm.geral), "var(--f-fid)"))}
    ${secao("h-fun", "ti-mail", "Funil do e-mail", "Copie da tela de Analytics do BillionMail: o Success e os percentuais, como aparecem", funilEmail(d, mm.email))}
    ${secao("h-can", "ti-arrows-split-2", "E-mail × WhatsApp", "Percentuais sobre os enviados em cada canal", canais(mm))}
  </div>`;
}
/* Novo disparo / editar: tudo o que o disparo lançado no painel guarda. */
function telaFidForm(id, visaoPre) {
  const novo = !id;
  const pastas = [...state.pastas].sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
  const d = novo ? { manual: true, visao: visaoPre === "necessidade" ? "necessidade" : "produto", pasta: pastas[0]?.id || "" } : state.disparos.find((x) => x.id === id);
  if (!d) { cab("Disparo", ""); return `<div class="empty">Este disparo não existe mais. <button type="button" class="linkbtn" data-ir="inicio">Voltar para a Reativação</button></div>`; }
  if (!d.manual) { cab(d.nome, ""); return `<div class="empty">Este disparo tem a lista de leads: o envio, as respostas e os orçamentos são marcados na ficha dele. <button type="button" class="linkbtn" data-ir="disparo:${esc(d.id)}">Abrir o disparo</button></div>`; }
  const vs = visaoDe(d);
  if (novo) d.nome = `Disparo ${state.disparos.filter((x) => x.pasta === d.pasta).length + 1}`;
  cab(novo ? "Novo disparo" : `Editar · ${d.nome}`, novo ? "Registre o disparo e os números. Se ele ainda não saiu, lance só a data e a base; os números entram depois, em Editar disparo." : "Atualize a base, os números do BillionMail e o retorno de cada canal.");
  const bm = d.bm || {}; const e = d.retorno?.email || {}; const w = d.retorno?.whatsapp || {};
  const dis = state.podeEditar ? "" : " disabled"; const nI = ' min="0" step="1" inputmode="numeric"';
  const f = (k, rot, tipo, val, extra = "", cls = "") => `<label class="campo${cls}" for="f_${k}">${rot}<input type="${tipo}" id="f_${k}" value="${esc(val ?? "")}"${extra}${dis}></label>`;
  const pc = (k, rot) => f(k, rot, "text", bm[k] != null ? br(bm[k]) : "", ' inputmode="decimal" placeholder="ex.: 98,5"');
  const segs = [...new Set([...state.pastas.flatMap((x) => (x.necessidade || []).map((g) => (g.geral ? "Qualquer segmento" : g.segmento))), ...state.disparos.map((x) => x.segmento)].filter(Boolean))].sort();
  return `<form id="fidForm" class="form" data-id="${esc(id || "")}" novalidate>
    <fieldset><legend>Disparo</legend><div class="campos">
      <label class="campo" for="f_visao">Visão<select id="f_visao"${dis}>${Object.entries(VISOES).map(([k, v]) => `<option value="${k}"${vs === k ? " selected" : ""}>${v.nome}</option>`).join("")}</select></label>
      <label class="campo" for="f_pasta">Produto<select id="f_pasta"${dis}>${pastas.map((x) => `<option value="${esc(x.id)}"${d.pasta === x.id ? " selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></label>
      <label class="campo" for="f_segmento" id="campoSeg"${vs === "necessidade" ? "" : " hidden"}>Segmento<input type="text" id="f_segmento" list="fidSegList" value="${esc(d.segmento || "")}" autocomplete="off" placeholder="ex.: Bebidas"${dis}></label>
      <datalist id="fidSegList">${segs.map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>
      ${f("nome", "Nome do disparo", "text", d.nome, ' required autocomplete="off"')}
      ${f("data", "Data do disparo", "date", d.data)}
      ${f("remetente", "Remetente", "text", d.remetente)}
      ${f("tamanho_base", "Tamanho da base", "number", d.tamanho_base, nI)}
      ${f("base_limpa_email", "Base limpa (e-mails)", "number", d.base_limpa_email, nI)}
      ${f("carta", "Carta ou assunto do e-mail", "text", d.carta, "", " largo")}
      <label class="campo largo" for="f_obs">Observação<textarea id="f_obs" rows="2"${dis}>${esc(d.obs || "")}</textarea></label>
    </div></fieldset>
    <fieldset><legend>E-mail · BillionMail</legend><p class="note" style="margin:0">Copie da tela de Analytics: o Success em quantidade e os percentuais como aparecem (aceita vírgula). Se o e-mail ainda não saiu, deixe em branco.</p><div class="campos">
      ${f("enviados", "Enviados (Success)", "number", bm.enviados, nI)}
      ${pc("delivered_pct", "Delivered %")}${pc("opened_pct", "Opened % (lido)")}${pc("clicked_pct", "Clicked %")}${pc("bounced_pct", "Bounced %")}
    </div></fieldset>
    <fieldset><legend>Retorno do e-mail</legend><div class="campos">
      ${f("e_respostas", "Respostas", "number", e.respostas, nI)}${f("e_interessados", "Interessados", "number", e.interessados, nI)}
      ${f("e_pedidos", "Orçamentos gerados", "number", e.pedidos, nI)}${f("e_sairam", "Pediram para sair", "number", e.sairam, nI)}
    </div></fieldset>
    <fieldset><legend>WhatsApp</legend><p class="note" style="margin:0">Se o disparo não teve WhatsApp, deixe em branco.</p><div class="campos">
      ${f("w_total", "Leads separados para o WhatsApp", "number", w.total, nI)}${f("w_enviados", "Enviados", "number", w.enviados, nI)}
      ${f("w_respostas", "Respostas", "number", w.respostas, nI)}${f("w_interessados", "Interessados", "number", w.interessados, nI)}
      ${f("w_pedidos", "Orçamentos gerados", "number", w.pedidos, nI)}${f("w_sairam", "Pediram para sair", "number", w.sairam, nI)}
    </div></fieldset>
    <div class="acoes">
      ${state.podeEditar ? `<button type="submit" class="btn" id="fidSalvar"><i class="ti ti-device-floppy" aria-hidden="true"></i>${novo ? "Registrar disparo" : "Salvar alterações"}</button>` : ""}
      <button type="button" class="btn secundario" data-ir="${novo ? `visao:${vs}` : `disparo:${esc(id)}`}">Voltar</button>
      ${!novo && state.podeEditar ? `<span id="fidApagarBox"><button type="button" class="btn secundario" data-fid-apagar="${esc(id)}">Excluir disparo</button></span>` : ""}
      <span class="status-line" id="formMsg" role="status"></span>
    </div>
  </form>`;
}
async function salvarFid(form) {
  if (!db || !state.podeEditar) return;
  const msg = $("formMsg"); const aviso = (t, e) => { msg.textContent = t; msg.classList.toggle("err", !!e); };
  const v = (k) => ($("f_" + k)?.value ?? "").trim();
  const n = (k) => { const x = v(k); return x === "" || isNaN(+x) ? null : Math.max(0, Math.round(+x)); };
  const pc = (k) => { const x = v(k).replace("%", "").replace(",", "."); return x === "" || isNaN(+x) ? null : Math.min(100, Math.max(0, Math.round(+x * 100) / 100)); };
  const visao = v("visao") === "necessidade" ? "necessidade" : "produto";
  if (!v("pasta")) return aviso("Escolha o produto do disparo.", true);
  if (!v("nome")) { aviso("Dê um nome ao disparo (ex.: Disparo 2).", true); $("f_nome").focus(); return; }
  if (visao === "necessidade" && !v("segmento")) { aviso("Informe o segmento da base.", true); $("f_segmento").focus(); return; }
  const agora = new Date().toISOString();
  const dados = {
    manual: true, visao, pasta: v("pasta"), segmento: visao === "necessidade" ? v("segmento") : "", nome: v("nome"), data: v("data"),
    remetente: v("remetente"), carta: v("carta"), obs: v("obs"), tamanho_base: n("tamanho_base"), base_limpa_email: n("base_limpa_email"),
    bm: { enviados: n("enviados"), delivered_pct: pc("delivered_pct"), opened_pct: pc("opened_pct"), clicked_pct: pc("clicked_pct"), bounced_pct: pc("bounced_pct") },
    retorno: {
      email: { respostas: n("e_respostas"), interessados: n("e_interessados"), pedidos: n("e_pedidos"), sairam: n("e_sairam") },
      whatsapp: { total: n("w_total"), enviados: n("w_enviados"), respostas: n("w_respostas"), interessados: n("w_interessados"), pedidos: n("w_pedidos"), sairam: n("w_sairam") },
    },
    atualizado_em: agora,
  };
  const btn = $("fidSalvar"); if (btn) btn.disabled = true;
  try {
    let did = form.dataset.id;
    if (did) await db.collection("disparos").doc(did).update(dados);
    else { did = "fd-" + Date.now().toString(36); await db.collection("disparos").doc(did).set({ ...dados, criado_em: agora }); }
    const ex = state.disparos.find((x) => x.id === did);
    if (ex) Object.assign(ex, dados); else state.disparos.push({ id: did, ...dados, criado_em: agora });
    ir({ tipo: "disparo", id: did }, true);
  } catch (e) {
    if (btn) btn.disabled = false;
    aviso(semPermissao(e) ? "Você tem acesso só de leitura a este painel." : "Não foi possível salvar. Tente de novo em alguns segundos.", true);
  }
}
async function apagarFid(id, btn) {
  const d = state.disparos.find((x) => x.id === id); if (!d || !d.manual || !db) return;
  btn.disabled = true;
  try { await db.collection("disparos").doc(id).delete(); state.disparos = state.disparos.filter((x) => x.id !== id); ir({ tipo: "visao", id: visaoDe(d) }, true); }
  catch (e) { btn.disabled = false; const m = $("formMsg"); if (m) { m.textContent = "Não foi possível excluir agora."; m.classList.add("err"); } }
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
    ["Respostas", "", me.respostas, (d.manual ? "Lançadas em Editar disparo" : "Marcadas na lista de leads") + (ent ? ` · ${br(pct(me.respostas, ent))}% dos entregues` : "")],
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

/* Leads do disparo com os filtros da tela (busca, canal e resposta): WhatsApp primeiro, por dia e empresa. */
function fidFiltrados(id) {
  const q = state.busca.trim().toLowerCase();
  return state.leads.filter((l) => l.disparo === id && (!state.canal || l.canal === state.canal) && (!state.status || (l.status || "aguardando") === state.status) &&
      (!q || [l.empresa, l.nome, l.email].some((v) => (v || "").toLowerCase().includes(q))))
    .sort((a, b) => (a.canal === b.canal ? (a.dia || "").localeCompare(b.dia || "") || (a.empresa || a.nome || "").localeCompare(b.empresa || b.nome || "") : a.canal === "whatsapp" ? -1 : 1));
}
/* Seleção em massa: só os leads do WhatsApp têm envio lead a lead (o e-mail é marcado de uma vez no "Envio do e-mail"). */
const fidWhats = (ls) => ls.filter((l) => l.canal === "whatsapp").map((l) => l._id);
function barraFidSel(ls) {
  const ws = fidWhats(ls); const n = ws.filter((id) => state.fidSel.has(id)).length;
  return `<label class="check sel-todos"><input type="checkbox" id="fidSelTodos"${ws.length && n === ws.length ? " checked" : ""}> Selecionar todos do WhatsApp (${ws.length})</label>
    ${n ? `<span class="note"><b>${n}</b> selecionado(s)</span>
      <button type="button" class="btn" data-fid-sel="1"><i class="ti ti-send" aria-hidden="true"></i>Marcar como enviados</button>
      <button type="button" class="btn secundario" data-fid-sel="0"><i class="ti ti-arrow-back-up" aria-hidden="true"></i>Não enviado</button>`
      : ajuda("Marque os leads do WhatsApp na primeira coluna, ou selecione todos, para marcar o envio de uma vez. O e-mail é marcado no Envio do e-mail, no topo da página.")}`;
}
function atualizarFidSel() {
  const r = state.rota; if (r.tipo !== "disparo") return;
  const ls = fidFiltrados(r.id); const ws = fidWhats(ls); const n = ws.filter((id) => state.fidSel.has(id)).length;
  const bar = $("fidSelBar"); if (bar) bar.innerHTML = barraFidSel(ls);
  ["fidSelTh", "fidSelTodos"].forEach((k) => { const c = $(k); if (c) { c.checked = ws.length > 0 && n === ws.length; c.indeterminate = n > 0 && n < ws.length; } });
  document.querySelectorAll("[data-fidsel]").forEach((c) => { c.checked = state.fidSel.has(c.dataset.fidsel); });
}
async function aplicarFidSel(enviado) {
  const r = state.rota; if (!db || r.tipo !== "disparo") return;
  const id = r.id;
  const alvo = fidFiltrados(id).filter((l) => l.canal === "whatsapp" && state.fidSel.has(l._id) && !!l.enviado !== enviado);
  if (!alvo.length) { state.fidSel.clear(); renderLeadsSomente(); return avisar("Os leads selecionados já estavam assim."); }
  document.querySelectorAll("[data-fid-sel]").forEach((b) => { b.disabled = true; });
  const agora = new Date().toISOString();
  try {
    const lote = db.batch();
    alvo.forEach((l) => lote.update(db.collection("leads").doc(l._id), { enviado, enviado_em: enviado ? agora : "", atualizado_em: agora }));
    await lote.commit();
    alvo.forEach((l) => Object.assign(l, { enviado, enviado_em: enviado ? agora : "" }));
    const d = state.disparos.find((x) => x.id === id);
    if (d) { try { await db.collection("disparos").doc(id).update({ metricas: metricasDisparo(d) }); } catch (e) {} }
    state.fidSel.clear(); render(); avisar(`${alvo.length} lead(s) do WhatsApp marcados como ${enviado ? "enviados" : "não enviados"}.`);
  } catch (e) {
    document.querySelectorAll("[data-fid-sel]").forEach((b) => { b.disabled = false; });
    if (semPermissao(e)) { state.podeEditar = false; return avisar("Você tem acesso só de leitura a este painel.", true); }
    avisar("Não foi possível salvar. Tente de novo em alguns segundos.", true);
  }
}

function blocoLeads(d) {
  if (!state.leadsOk) return `<div class="empty">A lista de leads fica visível só para quem opera os disparos.</div>`;
  const todos = state.leads.filter((l) => l.disparo === d.id);
  const ls = fidFiltrados(d.id); const ed = state.podeEditar; const ws = fidWhats(ls);
  const sel = ed && ws.length; const nSel = ws.filter((x) => state.fidSel.has(x)).length;
  const dis = state.podeEditar ? "" : " disabled";
  const linhas = ls.map((l) => {
    const st = l.status || "aguardando";
    return `<tr data-id="${esc(l._id)}">
      ${sel ? `<td class="sel">${l.canal === "whatsapp" ? `<input type="checkbox" data-fidsel="${esc(l._id)}" aria-label="Selecionar ${esc(l.empresa || l.nome || "lead")}"${state.fidSel.has(l._id) ? " checked" : ""}>` : ""}</td>` : ""}
      <td><div class="who"><b>${esc(l.empresa || l.nome || "Sem nome")}</b><small>${esc(l.empresa ? l.nome : "")}${l.empresa && l.nome ? " · " : ""}${esc(l.email)}</small></div></td>
      <td><span class="tag ${l.canal}">${l.canal === "whatsapp" ? "WhatsApp" : "E-mail"}</span>${l.dia ? `<br><span class="note">${esc(l.dia)}</span>` : ""}${l.classe ? `<br><span class="note">Classe ${esc(l.classe)}${l.carta ? ` · ${esc(l.carta)}` : ""}</span>` : ""}</td>
      <td><div class="pedido" title="${esc(l.o_que_pediu || "")}">${esc(l.o_que_pediu || "")}</div><span class="note">cotou em ${fmtData(l.cotou_em)}</span></td>
      <td>${l.canal === "whatsapp" ? `<label class="check"><input type="checkbox" data-f="enviado" id="env-${esc(l._id)}"${l.enviado ? " checked" : ""}${dis}> Enviado</label>` : d.enviado_em ? `<span class="note">enviado em ${fmtData(d.enviado_em)}</span>` : `<span class="note">aguardando disparo</span>`}</td>
      <td><select data-f="status" id="st-${esc(l._id)}" class="st-${st}" aria-label="Resposta"${dis}>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${k === st ? " selected" : ""}>${v}</option>`).join("")}</select></td>
      <td><label class="check"><input type="checkbox" data-f="pedido_cadastrado" id="ped-${esc(l._id)}"${l.pedido_cadastrado ? " checked" : ""}${dis}> Sim</label></td>
      <td><input type="text" class="obs" data-f="obs" id="obs-${esc(l._id)}" value="${esc(l.obs || "")}" placeholder="Anotação"${dis}></td></tr>`;
  }).join("");
  return `<details class="leads" id="leadsDet"${state.leadsAberto ? " open" : ""}><summary>Leads do disparo <span class="note" style="font:400 13px var(--body)">${todos.length} leads · marque aqui as respostas</span></summary>
    <div class="leads-body">
      ${sel ? `<div class="selecao" id="fidSelBar">${barraFidSel(ls)}</div>` : ""}
      <div class="filters">
        <input type="search" id="busca" value="${esc(state.busca)}" placeholder="Buscar por empresa, nome ou e-mail" aria-label="Buscar lead">
        <select id="fCanal" aria-label="Filtrar canal"><option value="">Todos os canais</option><option value="whatsapp"${state.canal === "whatsapp" ? " selected" : ""}>WhatsApp</option><option value="email"${state.canal === "email" ? " selected" : ""}>E-mail</option></select>
        <select id="fStatus" aria-label="Filtrar resposta"><option value="">Todas as respostas</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${state.status === k ? " selected" : ""}>${v}</option>`).join("")}</select>
      </div>
      <div class="status-line" id="statusLine" role="status"></div>
      ${ls.length ? `<div class="tbl-wrap"><table><thead><tr>${sel ? `<th class="sel"><input type="checkbox" id="fidSelTh" aria-label="Selecionar todos os leads do WhatsApp"${nSel && nSel === ws.length ? " checked" : ""}></th>` : ""}<th>Lead</th><th>Canal</th><th>O que pediu</th><th>Envio</th><th>Resposta</th><th>Orçamento gerado</th><th>Observação</th></tr></thead><tbody>${linhas}</tbody></table></div>` : `<div class="empty">Nenhum lead com esses filtros.</div>`}
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
function instKpis(s, base) {
  return kpiGrid([
    ["Disparos", s.n, base ? (s.env ? `${s.env} e-mails enviados` : "sem números do BillionMail ainda") : `${s.limpa} e-mails na base limpa`, false, "ti-send"],
    ...(base ? [["Tamanho da base", base.tamanho, base.sub, false, "ti-users-group"],
      ["Base limpa", base.limpa, base.tamanho ? `${br(pct(base.limpa, base.tamanho))}% do tamanho da base` : "sem base no período", false, "ti-database", base.tamanho ? pct(base.limpa, base.tamanho) : null]] : []),
    ["Entregues", s.entregues, s.env ? `${br(pct(s.entregues, s.env))}% dos ${s.env} enviados` : "lance os números do BillionMail", false, "ti-mail-check", s.env ? pct(s.entregues, s.env) : null],
    ["% lido", `${br(pct(s.abertos, s.entregues))}%`, `${s.abertos} abertos`, false, "ti-mail-opened", s.entregues ? pct(s.abertos, s.entregues) : null],
    ["Cliques no link", s.cliques, `${br(pct(s.cliques, s.entregues))}% dos entregues`, false, "ti-click"],
    ["Respostas", s.respostas, `${br(pct(s.respostas, s.entregues))}% dos entregues`, false, "ti-message-circle"],
    ["Orçamentos", s.orcamentos, `${br(pct(s.orcamentos, s.respostas))}% das respostas (conversão)`, true, "ti-file-invoice"],
  ], base ? "k4" : "");
}
const instEtapas = (s) => [
  { nome: "Base limpa", icone: "ti-database", v: s.limpa }, { nome: "Entregues", icone: "ti-mail-check", v: s.entregues },
  { nome: "Abertos", icone: "ti-mail-opened", v: s.abertos }, { nome: "Cliques", icone: "ti-click", v: s.cliques },
  { nome: "Respostas", icone: "ti-message-circle", v: s.respostas }, { nome: "Orçamentos", icone: "ti-file-invoice", v: s.orcamentos },
];
const linhaInst = (s) => `<td class="num">${s.limpa}</td><td class="num">${s.entregues}</td><td class="num">${br(pct(s.abertos, s.entregues))}%</td><td class="num">${s.cliques}</td><td class="num">${s.respostas}</td><td class="num">${s.orcamentos}</td><td class="num">${br(pct(s.orcamentos, s.respostas))}%</td>`;
/* Disparos institucionais do mês escolhido, mais recentes primeiro; a busca filtra só a tabela "Disparos". */
const instDoMes = () => state.inst.filter((d) => !state.instMes || (d.data_disparo || "").startsWith(state.instMes))
  .sort((a, b) => (b.data_disparo || b.data_solicitacao || "").localeCompare(a.data_disparo || a.data_solicitacao || ""));
const instBate = (d) => bateBusca(state.instBusca, [d.segmento, d.solicitante, d.remetente, d.assunto, d.base_ab, fmtData(d.data_disparo)]);
const instContagem = (lista) => (state.instBusca.trim() ? `${lista.filter(instBate).length} de ${lista.length} disparo(s)` : `${lista.length} disparo(s)`);
function instTabelaHtml(lista) {
  const ls = lista.filter(instBate);
  if (!ls.length) return vazio("ti-search-off", "Nenhum disparo encontrado.", `Nada com “${esc(state.instBusca.trim())}”${state.instMes ? " neste mês" : ""}.`);
  return `<div class="tbl-wrap"><table><thead><tr><th>Disparo em</th><th>Segmento</th><th>Base</th><th>Solicitante</th><th class="num">Base limpa</th><th class="num">Entregues</th><th class="num">% lido</th><th class="num">Cliques</th><th class="num">Respostas</th><th class="num">Orçamentos</th><th class="num">Conversão</th></tr></thead>
      <tbody>${ls.map((d) => `<tr><td><button type="button" class="linkbtn" data-ir="inst:${esc(d.id)}">${d.data_disparo ? fmtData(d.data_disparo) : "Sem data"}</button></td><td>${esc(d.segmento || "")}</td><td><span class="tag ab">${esc(d.base_ab || "Inteira")}</span></td><td>${esc(d.solicitante || "")}</td>${linhaInst(instSomar([d]))}</tr>`).join("")}</tbody></table></div>`;
}
function renderInstLista() {
  const l = $("instLista"); if (!l) return render();
  const lista = instDoMes(); l.innerHTML = instTabelaHtml(lista);
  const c = $("instBuscaCont"); if (c) c.textContent = instContagem(lista);
}
function telaInstitucional() {
  cab("Institucional", "Cartas do Soluções Industriais para uma base escolhida por segmento, sem fornecedor específico. Cada disparo é uma linha, com o funil do BillionMail e o retorno.");
  if (!state.carregado.inst) return carregando();
  const mesesInst = mesesDe(state.inst.map((d) => d.data_disparo));
  const lista = instDoMes();
  const s = instSomar(lista);
  /* Tamanho da base do período, com a comparação com o mês anterior. */
  const mes = state.instMes; const listaAnt = mes ? state.inst.filter((d) => (d.data_disparo || "").startsWith(mesAnterior(mes))) : [];
  const prog = lista.filter((d) => d.data_disparo > hojeLocal()).length;
  const base = { tamanho: s.base, limpa: s.limpa, sub: [`${lista.length} disparo(s)${prog ? `, ${prog} programado(s)` : ""}`, vsMes(mes, s.base, listaAnt.length ? instSomar(listaAnt).base : null)].filter(Boolean).join(" · ") };
  const segs = {}; lista.forEach((d) => (segs[d.segmento || "Sem segmento"] ||= []).push(d));
  const segLinhas = Object.entries(segs).map(([seg, ds]) => [seg, ds.length, instSomar(ds)]).sort((a, b) => b[2].orcamentos - a[2].orcamentos || b[1] - a[1]);
  return `<div class="pilha">
    ${state.podeEditar ? `<div class="acoes"><button type="button" class="btn" data-ir="inst-novo"><i class="ti ti-plus" aria-hidden="true"></i>Novo disparo institucional</button></div>` : ""}
    ${state.inst.length ? periodoSel("instMes", state.instMes, mesesInst, "Mostra só os disparos com data no mês escolhido: tamanho da base, números do BillionMail, respostas, orçamentos, a tabela por segmento e a lista de disparos.") : ""}
    ${secao("h-it", "ti-chart-bar", "Resultado", state.instMes ? nomeMes(state.instMes) : "Todos os meses", instKpis(s, base))}
    ${lista.length ? `
    ${painel("h-if", "ti-filter", "Funil institucional", "Do e-mail limpo ao orçamento", funil(instEtapas(s), "var(--f-inst)"))}
    ${secao("h-seg", "ti-category", "Por segmento", "Conversão = orçamentos ÷ respostas", `<div class="tbl-wrap"><table><thead><tr><th>Segmento</th><th class="num">Disparos</th><th class="num">Base limpa</th><th class="num">Entregues</th><th class="num">% lido</th><th class="num">Cliques</th><th class="num">Respostas</th><th class="num">Orçamentos</th><th class="num">Conversão</th></tr></thead>
      <tbody>${segLinhas.map(([seg, n, t]) => `<tr><td><b>${esc(seg)}</b></td><td class="num">${n}</td>${linhaInst(t)}</tr>`).join("")}</tbody></table></div>`)}
    ${secao("h-il", "ti-list-details", "Disparos", "abra um para lançar ou corrigir os números", `${barraBusca("instBusca", state.instBusca, "Buscar por segmento, solicitante ou assunto", instContagem(lista))}<div id="instLista">${instTabelaHtml(lista)}</div>`)}`
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
    ir({ tipo: "institucional" }, true);
  } catch (e) {
    if (btn) btn.disabled = false;
    aviso(semPermissao(e) ? "Você tem acesso só de leitura a este painel." : "Não foi possível salvar. Tente de novo em alguns segundos.", true);
  }
}
async function apagarInst(id, btn) {
  btn.disabled = true;
  try { await db.collection("institucional").doc(id).delete(); ir({ tipo: "institucional" }, true); }
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
function czKpis(m, extra) {
  return kpiGrid([
    ["Leads separados", m.total, [m.pendentes ? `${m.pendentes} ainda sem envio` : "todos tratados", extra].filter(Boolean).join(" · "), false, "ti-users", m.total ? pct(m.total - m.pendentes, m.total) : null],
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
/* Situação da lista: a data ("data") é o dia do disparo. Atrasado = a data já passou e ainda há lead sem envio marcado. */
function czSituacao(d, m = czMetricas(d)) {
  const hj = hojeLocal(); const dt = String(d.data || "").slice(0, 10);
  if (m.total && !m.pendentes) return { k: "disparado", chip: `<span class="chip ok">Disparado em ${fmtData(dt)}</span>` };
  if (!dt) return { k: "sem_data", chip: `<span class="chip neutro">Sem data · ${m.pendentes} sem envio</span>` };
  if (dt > hj) return { k: "programado", chip: `<span class="chip info sem-ponto"><i class="ti ti-calendar-event" aria-hidden="true"></i>Programado para ${fmtData(dt)}</span>` };
  if (dt === hj) return { k: "hoje", chip: `<span class="chip info">Disparo hoje · ${m.pendentes} sem envio</span>` };
  return { k: "atrasado", chip: `<span class="chip bad">Atrasado · ${m.pendentes} sem envio</span>` };
}
const czProgresso = (m) => progresso([["Enviados", m.enviados, "seg-ok"], ["Número não existe", m.nao_existe, "seg-bad"], ["Sem envio", m.pendentes, "seg-neutro"]], m.total);
/* Lista do ColdZap com a busca (fornecedor, ID, produto, quem envia ou data). Os números do topo continuam sendo de todas as listas. */
function czFiltradasLista() {
  const todas = [...state.cz].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  return { todas, ds: todas.filter((d) => bateBusca(state.czBuscaLista, [d.empresa, d.chave, d.produto, d.remetente, d.solicitante, fmtData(d.data)])) };
}
const czContagemLista = ({ todas, ds }) => (state.czBuscaLista.trim() ? `${ds.length} de ${todas.length} lista(s)` : `${todas.length} lista(s) · mais recentes primeiro`);
function czListaHtml({ ds }) {
  if (!ds.length) return vazio("ti-search-off", "Nenhuma lista encontrada.", `Nada com “${esc(state.czBuscaLista.trim())}”. Confira o nome ou busque pelo ID do cliente.`);
  if (state.vista === "lista") return `<div class="linhas">${ds.map((d) => { const m = czMetricas(d); return fileira("cz", `czd:${esc(d.id)}`, esc(d.empresa), `${esc(d.chave || "")}${d.produto ? " · " + esc(d.produto) : ""}`,
      czSituacao(d, m).chip,
      [[`${m.enviados}/${m.total}`, "enviados"], [`${br(pct(m.respostas, m.enviados))}%`, "resposta"], [m.orcamentos, "orçamentos"]]); }).join("")}</div>`;
  return `<div class="grid-cards">${ds.map((d) => { const m = czMetricas(d); return `<button type="button" class="card cz" data-ir="czd:${esc(d.id)}">
      <div class="top"><div><div class="nome">${esc(d.empresa)}</div><div class="sub">${esc(d.chave || "")}${d.produto ? " · " + esc(d.produto) : ""}</div></div><span class="zap-ico" aria-hidden="true"><i class="ti ti-brand-whatsapp"></i></span></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${czSituacao(d, m).chip}</div>${d.remetente ? `<div class="sub">Envia ${esc(d.remetente)}</div>` : ""}
      ${czProgresso(m)}
      <div class="stats"><div class="stat"><b>${m.enviados}/${m.total}</b><span>enviados</span></div><div class="stat"><b>${br(pct(m.respostas, m.enviados))}%</b><span>resposta</span></div><div class="stat"><b>${m.orcamentos}</b><span>orçamentos</span></div></div>
      <span class="go">Abrir lista <i class="ti ti-arrow-right" aria-hidden="true"></i></span></button>`; }).join("")}${state.czBuscaLista.trim() ? "" : czNovaCard()}</div>`;
}
function renderCzLista() {
  const l = $("czLista"); if (!l) return render();
  const fl = czFiltradasLista(); l.innerHTML = czListaHtml(fl);
  const c = $("czBuscaListaCont"); if (c) c.textContent = czContagemLista(fl);
}
function telaColdzap() {
  cab("ColdZap", "A parte da base de um cold mail por fornecedor que vai pelo WhatsApp, enviada à mão. Cada lista mostra lead a lead quem recebeu, quem respondeu e quais respostas viraram orçamento.");
  if (!state.carregado.cz) return carregando();
  const ds = [...state.cz].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  /* Período: resultado, funil e andamento só com as listas do mês; a lista por fornecedor continua com todas. */
  const mes = state.czMes; const doMes = (m) => ds.filter((d) => !m || (d.data || "").startsWith(m));
  const dsMes = doMes(mes); const tot = czSomar(dsMes.map(czMetricas));
  const antL = mes ? doMes(mesAnterior(mes)) : [];
  const extra = vsMes(mes, tot.total, antL.length ? czSomar(antL.map(czMetricas)).total : null);
  return `<div class="pilha">
    ${czPodeCriar() ? `<div class="acoes"><button type="button" class="btn" data-ir="cz-nova"><i class="ti ti-plus" aria-hidden="true"></i>Nova lista</button><span class="note">Suba a planilha com os leads do WhatsApp e o painel monta a lista.</span></div>` : ""}
    ${ds.length ? periodoSel("czMes", mes, mesesDe(ds.map((d) => d.data)), "Mostra só as listas com data no mês escolhido. A base de cada lista são os leads separados para o WhatsApp. A lista por fornecedor continua com todas.") : ""}
    ${secao("h-zt", "ti-chart-bar", mes ? "Listas do período" : "Todas as listas", `${mes ? nomeMes(mes) + " · " : ""}${dsMes.length} lista(s) de WhatsApp`, czKpis(tot, extra))}
    <div class="grade-2">
      ${painel("h-zf", "ti-filter", "Funil do ColdZap", mes ? nomeMes(mes) : "Todas as listas", funil(czEtapas(tot), "var(--f-cz)"))}
      ${painel("h-zp", "ti-progress-check", "Andamento dos envios", `${tot.enviados + tot.nao_existe} de ${tot.total} tratados`, `<div class="cz" style="display:grid;gap:14px">${dsMes.map((d) => { const m = czMetricas(d);
        return `<div style="display:grid;gap:6px"><div style="display:flex;justify-content:space-between;gap:8px;font-size:13.5px"><button type="button" class="linkbtn" style="text-decoration:none;font-weight:600;color:var(--ink)" data-ir="czd:${esc(d.id)}">${esc(d.empresa)}</button><span class="note">${m.enviados + m.nao_existe}/${m.total}</span></div>${czProgresso(m)}</div>`; }).join("") || `<p class="note">Nenhuma lista ainda.</p>`}</div>`)}
    </div>
    ${secao("h-zl", "ti-list-details", "Listas por fornecedor", "", ds.length ? (() => { const fl = czFiltradasLista(); return `${barraBusca("czBuscaLista", state.czBuscaLista, "Buscar por fornecedor, ID do cliente ou produto", czContagemLista(fl))}<div id="czLista">${czListaHtml(fl)}</div>`; })()
      : `<div class="grid-cards">${czNovaCard()}</div>`, ds.length ? seletorVista() : "")}
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
      <div><dt>Data do disparo</dt><dd>${fmtData(d.data)}</dd></div>
      <div><dt>Situação</dt><dd>${czSituacao(d, m).chip}</dd></div>
      <div><dt>Quem envia</dt><dd>${esc(d.remetente || "")}</dd></div>
      ${d.base ? `<div><dt>Base</dt><dd>${esc(d.base)}</dd></div>` : ""}
      ${d.solicitante ? `<div><dt>Solicitante</dt><dd>${esc(d.solicitante)}</dd></div>` : ""}
    </dl>
    ${czPodeCriar() || (state.downloads && window.XLSX && state.czOk) ? `<div class="acoes">${czPodeCriar() ? `<button type="button" class="btn secundario" data-ir="cz-editar:${esc(d.id)}"><i class="ti ti-pencil" aria-hidden="true"></i>Editar lista ou acrescentar leads</button>` : ""}${state.downloads && window.XLSX && state.czOk ? `<button type="button" class="btn secundario" data-czbaixar="${esc(d.id)}"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i>Baixar lista em Excel</button>${ajuda("A planilha traz o link de cada conversa e as marcações feitas aqui.")}<span class="note" id="czMsg"></span>` : ""}</div>` : ""}
    ${secao("h-zr", "ti-chart-bar", "Resultado", "", czKpis(m))}
    <div class="grade-2 cz">
      ${painel("h-zf", "ti-filter", "Funil da lista", "", funil(czEtapas(m), "var(--f-cz)"))}
      ${painel("h-zp", "ti-progress-check", "Andamento dos envios", `${m.enviados + m.nao_existe} de ${m.total} tratados`, czProgresso(m))}
    </div>
    <section>${blocoCzLeads(d)}</section></div>`;
}
/* Leads da lista com os filtros da tela (busca, envio e resposta), na ordem da planilha. */
function czFiltrados(id) {
  const q = state.busca.trim().toLowerCase();
  return state.czLeads.filter((l) => l.disparo === id && (!state.envio || (state.envio === "pendente" ? !l.envio : l.envio === state.envio)) && (!state.status || (l.status || "aguardando") === state.status) &&
      (!q || [l.empresa, l.nome, l.celular, l.email].some((v) => String(v || "").toLowerCase().includes(q))))
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
}
/* Seleção em massa: caixinha "Selecionar todos" no topo e uma por lead; as ações mudam o envio de todos os selecionados. */
function barraSel(ls) {
  const vis = ls.map((l) => l._id); const n = vis.filter((id) => state.czSel.has(id)).length;
  return `<label class="check sel-todos"><input type="checkbox" id="czSelTodos"${vis.length && n === vis.length ? " checked" : ""}> Selecionar todos (${vis.length})</label>
    ${n ? `<span class="note"><b>${n}</b> selecionado(s)</span>
      <button type="button" class="btn" data-cz-sel="enviado"><i class="ti ti-send" aria-hidden="true"></i>Marcar como enviados</button>
      <button type="button" class="btn secundario" data-cz-sel="nao_existe"><i class="ti ti-phone-off" aria-hidden="true"></i>Número não existe</button>
      <button type="button" class="btn secundario" data-cz-sel=""><i class="ti ti-arrow-back-up" aria-hidden="true"></i>Não enviado</button>`
      : ajuda("Marque os leads na primeira coluna, ou selecione todos, para mudar o envio de uma vez.")}`;
}
function atualizarSel() {
  const r = state.rota; if (r.tipo !== "czd") return;
  const ls = czFiltrados(r.id); const vis = ls.map((l) => l._id); const n = vis.filter((id) => state.czSel.has(id)).length;
  const bar = $("czSelBar"); if (bar) bar.innerHTML = barraSel(ls);
  ["czSelTh", "czSelTodos"].forEach((k) => { const c = $(k); if (c) { c.checked = vis.length > 0 && n === vis.length; c.indeterminate = n > 0 && n < vis.length; } });
  document.querySelectorAll("[data-czsel]").forEach((c) => { c.checked = state.czSel.has(c.dataset.czsel); });
}
async function aplicarCzSel(valor, btn) {
  const r = state.rota; if (!db || r.tipo !== "czd") return;
  const id = r.id; const aviso = (t, e) => { const l = $("czStatusLine"); if (l) { l.textContent = t; l.classList.toggle("err", !!e); } };
  const alvo = czFiltrados(id).filter((l) => state.czSel.has(l._id) && (l.envio || "") !== valor);
  if (!alvo.length) { state.czSel.clear(); renderCzLeads(); return aviso("Os leads selecionados já estavam assim."); }
  document.querySelectorAll("[data-cz-sel]").forEach((b) => { b.disabled = true; });
  const agora = new Date().toISOString();
  try {
    const lote = db.batch();
    alvo.forEach((l) => lote.update(db.collection("coldzap_leads").doc(l._id), { envio: valor, enviado_em: valor === "enviado" ? agora : "", atualizado_em: agora }));
    await lote.commit();
    alvo.forEach((l) => Object.assign(l, { envio: valor, enviado_em: valor === "enviado" ? agora : "" }));
    const d = state.cz.find((x) => x.id === id); const extra = {};
    try { await db.collection("coldzap").doc(id).update({ metricas: czCalc(state.czLeads.filter((x) => x.disparo === id)), ...extra }); if (d) Object.assign(d, extra); } catch (e) {}
    state.czSel.clear(); render(); aviso(`${alvo.length} lead(s) marcados como "${ENVIO[valor]}".`);
  } catch (e) {
    document.querySelectorAll("[data-cz-sel]").forEach((b) => { b.disabled = false; });
    if (semPermissao(e)) { state.podeEditar = false; return aviso("Você tem acesso só de leitura a este painel.", true); }
    aviso("Não foi possível salvar. Tente de novo em alguns segundos.", true);
  }
}
function blocoCzLeads(d) {
  if (!state.czOk) return `<div class="empty" id="czLeads">A lista de leads fica visível só para quem opera os disparos.</div>`;
  const todos = state.czLeads.filter((l) => l.disparo === d.id);
  const ls = czFiltrados(d.id); const ed = state.podeEditar;
  const nSel = ls.filter((l) => state.czSel.has(l._id)).length;
  const dis = state.podeEditar ? "" : " disabled";
  const linhas = ls.map((l) => {
    const st = l.status || "aguardando"; const en = l.envio || "";
    const link = l.numero ? `https://wa.me/${encodeURIComponent(l.numero)}?text=${encodeURIComponent(l.mensagem || "")}` : "";
    return `<tr data-cz="${esc(l._id)}">
      ${ed ? `<td class="sel"><input type="checkbox" data-czsel="${esc(l._id)}" aria-label="Selecionar ${esc(l.empresa || l.nome || "lead")}"${state.czSel.has(l._id) ? " checked" : ""}></td>` : ""}
      <td class="num">${l.ordem || ""}</td>
      <td><div class="who"><b>${esc(l.empresa || l.nome || "Sem nome")}</b><small>${esc(l.empresa ? l.nome : "")}${l.empresa && l.nome ? " · " : ""}${esc(l.celular || "")}</small></div></td>
      <td><div class="pedido" title="${esc(l.produto_cotado || "")}${l.produto_cotado && l.o_que_pediu ? " · " : ""}${esc(l.o_que_pediu || "")}">${esc(l.produto_cotado || "")}${l.produto_cotado && l.o_que_pediu ? " · " : ""}${esc(l.o_que_pediu || "")}</div>${l.cotou_em ? `<span class="note">cotou em ${fmtData(l.cotou_em)}</span>` : ""}</td>
      <td>${link ? `<a class="wa" href="${esc(link)}" target="_blank" rel="noopener">Abrir conversa</a>` : `<span class="note">sem celular</span>`}${l.mensagem ? `<details class="msg"><summary>Ver mensagem</summary><div class="msg-txt">${esc(l.mensagem)}</div></details>` : ""}</td>
      <td><select data-cf="envio" id="czenv-${esc(l._id)}" class="env-${en}" aria-label="Envio"${dis}>${Object.entries(ENVIO).map(([k, v]) => `<option value="${k}"${k === en ? " selected" : ""}>${v}</option>`).join("")}</select></td>
      <td><select data-cf="status" id="czst-${esc(l._id)}" class="st-${st}" aria-label="Resposta"${dis}>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${k === st ? " selected" : ""}>${v}</option>`).join("")}</select></td>
      <td><label class="check"><input type="checkbox" data-cf="orcamento" id="czped-${esc(l._id)}"${l.orcamento ? " checked" : ""}${dis}> Sim</label></td>
      <td><input type="text" class="obs" data-cf="obs" id="czobs-${esc(l._id)}" value="${esc(l.obs || "")}" placeholder="Anotação"${dis}></td></tr>`;
  }).join("");
  return `<div class="bloco" id="czLeads">
    <div class="section-head" style="margin:0"><h2>Leads da lista ${ajuda("Marque o envio, a resposta e o orçamento de cada lead. O texto de \"O que cotou\" aparece inteiro ao passar o mouse.")}</h2><span class="note">${todos.length} leads</span></div>
    ${ed && ls.length ? `<div class="selecao" id="czSelBar">${barraSel(ls)}</div>` : ""}
    <div class="filters">
      <input type="search" id="czbusca" value="${esc(state.busca)}" placeholder="Buscar por empresa, nome ou celular" aria-label="Buscar lead">
      <select id="fEnvio" aria-label="Filtrar envio"><option value="">Todos os envios</option><option value="pendente"${state.envio === "pendente" ? " selected" : ""}>Não enviado</option><option value="enviado"${state.envio === "enviado" ? " selected" : ""}>Enviado</option><option value="nao_existe"${state.envio === "nao_existe" ? " selected" : ""}>Número não existe</option></select>
      <select id="fCzStatus" aria-label="Filtrar resposta"><option value="">Todas as respostas</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${state.status === k ? " selected" : ""}>${v}</option>`).join("")}</select>
    </div>
    <div class="status-line" id="czStatusLine" role="status"></div>
    ${ls.length ? `<div class="tbl-wrap"><table><thead><tr>${ed ? `<th class="sel"><input type="checkbox" id="czSelTh" aria-label="Selecionar todos os leads"${nSel && nSel === ls.length ? " checked" : ""}></th>` : ""}<th class="num">#</th><th>Lead</th><th>O que cotou</th><th>Mensagem</th><th>Envio</th><th>Resposta</th><th>Orçamento</th><th>Observação</th></tr></thead><tbody>${linhas}</tbody></table></div>` : `<div class="empty">Nenhum lead com esses filtros.</div>`}
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

/* ---------- ColdZap: nova lista e base por planilha ----------
   Quem opera cria a lista sem depender de ninguém: preenche o fornecedor e sobe a planilha do WhatsApp (Excel ou CSV).
   O painel reconhece as colunas pelo nome (dá para trocar), limpa o celular, deixa de fora quem está sem celular ou repetido
   e grava um lead por linha, na ordem da planilha. Na edição, a planilha acrescenta leads no fim da lista. */
const czPodeCriar = () => state.podeEditar && state.czOk;
const czNovaCard = () => (czPodeCriar()
  ? `<button type="button" class="card nova pode" data-ir="cz-nova"><div class="nome"><i class="ti ti-plus" aria-hidden="true"></i>Nova lista</div><div class="sub">Suba a planilha com os leads que vão pelo WhatsApp. O painel monta a lista com o link de cada conversa.</div></button>`
  : `<div class="card nova"><div class="nome">Próximo cold mail</div><div class="sub">A lista de WhatsApp entra aqui quando a base de um cold mail é separada.</div></div>`);
/* Cada informação do lead e os nomes de coluna que o painel procura (sem acento e sem maiúscula). */
const CZ_CAMPOS = [
  ["empresa", "Empresa", ["empresa", "razao social", "cliente"]],
  ["nome", "Nome do contato", ["nome", "contato", "responsavel"]],
  ["celular", "Celular / WhatsApp", ["celular", "whatsapp", "telefone", "fone", "numero"]],
  ["link", "Link da conversa (wa.me)", ["abrir conversa", "link", "wa.me"]],
  ["mensagem", "Mensagem", ["mensagem", "texto"]],
  ["produto_cotado", "O que cotou", ["produto cotado", "o que cotou", "ultima cotacao", "produto"]],
  ["cotou_em", "Data da cotação", ["data da cotacao", "cotou em", "data", "quando"]],
  ["o_que_pediu", "Por que está na lista", ["por que esta na lista", "motivo", "o que pediu"]],
  ["pedido_original", "Pedido original", ["pedido original", "pedido"]],
  ["email", "E-mail", ["e-mail", "email"]],
];
/* Ordem da procura: o link vem antes da mensagem porque o título dele costuma citar a mensagem ("Abrir conversa (mensagem já preenchida)"). */
const CZ_PRIORIDADE = ["link", "mensagem", "cotou_em", "o_que_pediu", "pedido_original", "produto_cotado", "email", "celular", "empresa", "nome"];
function czDetectar(cab, cols) {
  const h = cab.map(semAcento); const usado = new Set(); const mapa = {};
  CZ_PRIORIDADE.forEach((campo) => {
    mapa[campo] = "";
    for (const p of CZ_CAMPOS.find((c) => c[0] === campo)[2]) {
      const i = cols.find((j) => !usado.has(j) && (p === "nome" ? h[j] === "nome" || h[j].startsWith("nome ") : h[j].includes(p)));
      if (i != null) { mapa[campo] = String(i); usado.add(i); return; }
    }
  });
  return mapa;
}
/* Celular no formato do wa.me: 55 + DDD + número. Aceita máscara, +55, zero na frente e dois números na mesma célula (fica o celular). */
function czNumero(v) {
  let achado = "";
  for (const p of String(v ?? "").split(/[\/,;|]|\s+e\s+|\s+ou\s+/i)) {
    let d = p.replace(/\D/g, "").replace(/^0+/, "");
    if (d.length === 10 || d.length === 11) d = "55" + d;
    if (/^55\d{10,11}$/.test(d)) { if (d.length === 13) return d; achado ||= d; }
  }
  return achado;
}
const czCelular = (n) => (n.length === 13 ? `(${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}` : `(${n.slice(2, 4)}) ${n.slice(4, 8)}-${n.slice(8)}`);
function czDoLink(v) {
  const s = String(v ?? "");
  const m = s.match(/wa\.me\/\+?(\d{8,15})(?:\/?\?text=([^\s"]*))?/i) || s.match(/whatsapp\.com\/send\/?\?phone=\+?(\d{8,15})(?:&text=([^\s"&]*))?/i);
  if (!m) return { numero: "", mensagem: "" };
  let t = ""; try { t = m[2] ? decodeURIComponent(m[2]) : ""; } catch (e) { t = ""; }
  return { numero: czNumero(m[1]), mensagem: t };
}
/* Data da cotação: número de data do Excel, dd/mm/aaaa ou aaaa-mm-dd. */
function czData(v) {
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const s = String(v ?? "").trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/))) {
    const a = m[3].length === 2 ? "20" + m[3] : m[3]; const mes = +m[2]; const dia = +m[1];
    if (a.length === 4 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) return `${a}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }
  return "";
}
const czPrimeiroNome = (n) => { const p = String(n || "").trim().split(/\s+/)[0] || ""; return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ""; };
const czPreencher = (t, l) => t.replace(/\{\s*nome\s*\}/gi, czPrimeiroNome(l.nome)).replace(/\{\s*empresa\s*\}/gi, l.empresa || "").replace(/\{\s*produto\s*\}/gi, l.produto_cotado || "")
  .replace(/[ \t]+,/g, ",").replace(/,(\s*,)+/g, ",").replace(/[ \t]{2,}/g, " ");
/* Linhas da aba, com o número da linha no Excel. O link pode estar no texto, no hyperlink da célula ou numa fórmula HYPERLINK. */
function czLinhasDaFolha(ws) {
  if (!ws || !ws["!ref"]) return [];
  const r = XLSX.utils.decode_range(ws["!ref"]); const out = []; const wa = /wa\.me|whatsapp\.com/i;
  const ultC = Math.min(r.e.c, r.s.c + 59); const ultR = Math.min(r.e.r, r.s.r + 5000);
  for (let R = r.s.r; R <= ultR; R++) {
    const c = [];
    for (let C = r.s.c; C <= ultC; C++) {
      const x = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!x) { c.push(""); continue; }
      const v = x.v ?? ""; const fl = x.f && String(x.f).match(/HYPERLINK\(\s*"([^"]+)"/i);
      c.push(!wa.test(String(v)) && x.l?.Target && wa.test(x.l.Target) ? x.l.Target : !wa.test(String(v)) && fl && wa.test(fl[1]) ? fl[1] : v);
    }
    out.push({ n: R + 1, c });
  }
  return out;
}
function czCarregarFolha() {
  const u = state.czUp; const linhas = czLinhasDaFolha(u.wb.Sheets[u.folha]);
  const temValor = (x) => String(x ?? "").trim() !== "";
  const h = linhas.findIndex((r, i) => i < 15 && r.c.filter((x) => typeof x === "string" && x.trim() !== "").length >= 2);
  if (h < 0) { Object.assign(u, { cab: [], cols: [], linhas: [], mapa: {} }); return; }
  u.cab = linhas[h].c.map((x, i) => String(x ?? "").trim() || `Coluna ${i + 1}`);
  u.linhas = linhas.slice(h + 1).filter((r) => r.c.some(temValor));
  u.cols = u.cab.map((_, i) => i).filter((i) => temValor(linhas[h].c[i]) || u.linhas.some((r) => temValor(r.c[i])));
  u.mapa = czDetectar(u.cab, u.cols);
}
async function czLerArquivo(file) {
  if (!file) return;
  const padrao = state.czUp?.padrao || "";
  if (!window.XLSX) state.czUp = { erro: "O leitor de planilhas não carregou. Recarregue a página e tente de novo.", padrao };
  else if (file.size > 15 * 1024 * 1024) state.czUp = { erro: "A planilha passa de 15 MB. Deixe só a aba com os leads do WhatsApp e tente de novo.", padrao };
  else {
    try {
      const buf = await file.arrayBuffer(); let wb;
      if (/\.(csv|txt)$/i.test(file.name)) {
        let txt; try { txt = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (e) { txt = new TextDecoder("windows-1252").decode(buf); }
        wb = XLSX.read(txt.replace(/^﻿/, ""), { type: "string", raw: true });
      } else wb = XLSX.read(buf, { type: "array", sheetStubs: true }); /* sheetStubs: guarda a fórmula HYPERLINK mesmo sem valor salvo */
      const folhas = wb.SheetNames;
      state.czUp = { arquivo: file.name, wb, folhas, folha: folhas.find((n) => /whats|zap/i.test(n)) || folhas[0], padrao };
      czCarregarFolha();
    } catch (e) { state.czUp = { erro: "Não consegui ler este arquivo. Salve a planilha como Excel (.xlsx) ou CSV e tente de novo.", padrao }; }
  }
  const b = $("czPrevia"); if (b) b.innerHTML = czPreviaHtml();
}
/* Leads que a planilha vai gerar com as colunas escolhidas. Ficam de fora: sem celular válido, repetidos e (na edição) quem já está na lista. */
function czMontar() {
  const u = state.czUp; if (!u || !u.linhas) return { ok: [], fora: [] };
  const r = state.rota; const listaId = r.tipo === "cz-editar" ? r.id : "";
  const jaNaLista = new Set(listaId ? state.czLeads.filter((l) => l.disparo === listaId).map((l) => l.numero).filter(Boolean) : []);
  const val = (row, k) => { const i = u.mapa[k]; return i === "" || i == null ? "" : row.c[+i] ?? ""; };
  const txt = (row, k) => String(val(row, k)).replace(/\r\n?/g, "\n").trim();
  const vistos = new Set(); const ok = []; const fora = [];
  u.linhas.forEach((row) => {
    const lk = czDoLink(val(row, "link"));
    const numero = czNumero(val(row, "celular")) || lk.numero;
    const l = { linha: row.n, nome: txt(row, "nome"), empresa: txt(row, "empresa"), numero, celular: numero ? czCelular(numero) : txt(row, "celular"), email: txt(row, "email"),
      produto_cotado: txt(row, "produto_cotado"), cotou_em: czData(val(row, "cotou_em")), o_que_pediu: txt(row, "o_que_pediu"), pedido_original: txt(row, "pedido_original") };
    const daPlanilha = txt(row, "mensagem") || lk.mensagem.replace(/\r\n?/g, "\n").trim();
    l.mensagem = daPlanilha || (u.padrao.trim() ? czPreencher(u.padrao.trim(), l) : "");
    l.msgDe = daPlanilha ? "planilha" : l.mensagem ? "padrao" : "";
    if (!numero) fora.push({ ...l, motivo: txt(row, "celular") ? "celular inválido" : "sem celular" });
    else if (jaNaLista.has(numero)) fora.push({ ...l, motivo: "já está na lista" });
    else if (vistos.has(numero)) fora.push({ ...l, motivo: "número repetido na planilha" });
    else { vistos.add(numero); ok.push(l); }
  });
  return { ok, fora };
}
const czMapeados = (u) => CZ_CAMPOS.filter(([k]) => (u.mapa[k] ?? "") !== "").length;
const czSemContato = (u) => (u.mapa.celular ?? "") === "" && (u.mapa.link ?? "") === "";
function czPreviaHtml() {
  const u = state.czUp; if (!u) return "";
  if (u.erro) return `<p class="cz-alerta">${esc(u.erro)}</p>`;
  const opcoes = (sel) => `<option value="">Não usar</option>${u.cols.map((i) => `<option value="${i}"${String(i) === String(sel) ? " selected" : ""}>${esc(u.cab[i])}</option>`).join("")}`;
  const semMsg = czMontar().ok.some((l) => l.msgDe !== "planilha");
  return `<div class="cz-arq"><span class="chip ok sem-ponto"><i class="ti ti-file-check" aria-hidden="true"></i>${esc(u.arquivo)}</span>
      ${u.folhas.length > 1 ? `<label class="campo-inline" for="z_folha">Aba<select id="z_folha">${u.folhas.map((n) => `<option value="${esc(n)}"${n === u.folha ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label>` : ""}
      <span class="note">${u.linhas.length} linha(s) com dados · para trocar, escolha outro arquivo</span></div>
    ${u.cab.length ? `<details class="cz-mapa"${czSemContato(u) ? " open" : ""}><summary id="czMapaSum">Colunas reconhecidas: ${czMapeados(u)} de ${CZ_CAMPOS.length} · conferir</summary>
      <p class="note">O painel ligou cada informação a uma coluna da planilha pelo nome do título. Se alguma estiver errada, troque aqui.</p>
      <div class="campos">${CZ_CAMPOS.map(([k, rot]) => `<label class="campo" for="zm_${k}">${rot}<select id="zm_${k}" data-czmap="${k}">${opcoes(u.mapa[k])}</select></label>`).join("")}</div></details>
    <details class="cz-mapa"${semMsg ? " open" : ""}><summary>Mensagem padrão (para quem está sem mensagem na planilha)</summary>
      <label class="campo largo" for="z_padrao"><span class="note">Use {nome} para o primeiro nome, {empresa} para a empresa e {produto} para o que ela cotou. Quem já tem mensagem na planilha fica com a dela.</span>
      <textarea id="z_padrao" rows="6" placeholder="Olá, {nome}, tudo bem?">${esc(u.padrao)}</textarea></label></details>` : ""}
    <div id="czResumo">${czResumoHtml()}</div>`;
}
function czResumoHtml() {
  const u = state.czUp; if (!u || u.erro) return "";
  if (!u.cab.length) return `<p class="cz-alerta">Não achei os títulos das colunas nesta aba. A primeira linha precisa ter os nomes (Nome, Empresa, Celular…).</p>`;
  if (czSemContato(u)) return `<p class="cz-alerta">Não achei a coluna do celular. Em “Colunas reconhecidas”, escolha a coluna com o celular ou com o link do WhatsApp.</p>`;
  const { ok, fora } = czMontar(); const semMsg = ok.filter((l) => !l.mensagem).length; const MAX = 60;
  const linha = (l, i) => `<tr><td class="num">${i + 1}</td><td><div class="who"><b>${esc(l.empresa || l.nome || "Sem nome")}</b>${l.empresa && l.nome ? `<small>${esc(l.nome)}</small>` : ""}</div></td>
    <td class="nowrap">${esc(l.celular)}</td><td>${esc(l.produto_cotado || "—")}${l.cotou_em ? `<small class="note"> · ${fmtData(l.cotou_em)}</small>` : ""}</td>
    <td>${l.msgDe === "planilha" ? `<span class="chip ok">Da planilha</span>` : l.msgDe === "padrao" ? `<span class="chip info">Padrão</span>` : `<span class="chip neutro">Sem mensagem</span>`}</td></tr>`;
  return `<div class="cz-resumo"><span><b>${ok.length}</b> lead(s) entram na lista</span>${fora.length ? `<span><b>${fora.length}</b> fica(m) de fora</span>` : ""}${semMsg ? `<span><b>${semMsg}</b> sem mensagem</span>` : ""}</div>
    ${ok.length > 60 ? `<p class="cz-alerta atencao">O ColdZap costuma ter de 20 a 30 leads, e esta planilha tem ${ok.length}. Confira se é só a parte da base que vai pelo WhatsApp.</p>` : ""}
    ${semMsg ? `<p class="note">Sem mensagem, o link abre a conversa em branco. Se quiser, escreva a mensagem padrão acima.</p>` : ""}
    ${ok.length ? `<div class="tbl-wrap"><table><thead><tr><th class="num">#</th><th>Lead</th><th>Celular</th><th>O que cotou</th><th>Mensagem</th></tr></thead><tbody>${ok.slice(0, MAX).map(linha).join("")}</tbody></table></div>${ok.length > MAX ? `<p class="note">Mostrando os ${MAX} primeiros de ${ok.length}.</p>` : ""}` : ""}
    ${ok[0]?.mensagem ? `<details class="msg"><summary>Ver a mensagem do 1º lead</summary><div class="msg-txt">${esc(ok[0].mensagem)}</div></details>` : ""}
    ${fora.length ? `<details class="cz-fora"${ok.length ? "" : " open"}><summary>Ficam de fora (${fora.length})</summary><ul>${fora.slice(0, 100).map((l) => `<li>Linha ${l.linha}: ${esc(l.empresa || l.nome || "sem nome")} · ${l.motivo}</li>`).join("")}</ul></details>` : ""}`;
}
function czRenderResumo() {
  const u = state.czUp; const b = $("czResumo"); if (!b) return;
  b.innerHTML = czResumoHtml(); const s = $("czMapaSum"); if (s && u?.mapa) s.textContent = `Colunas reconhecidas: ${czMapeados(u)} de ${CZ_CAMPOS.length} · conferir`;
}
function czNovoId(chave) {
  const base = "cz-" + (String(chave || "").toLowerCase().replace(/\.0$/, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || Date.now().toString(36));
  let id = base; let n = 2; while (state.cz.some((x) => x.id === id)) id = `${base}-${n++}`;
  return id;
}
function telaCzForm(id, chavePre) {
  const novo = !id; const d0 = novo ? null : state.cz.find((x) => x.id === id);
  const voltar = novo ? (chavePre ? `cmf:${esc(chavePre)}` : "coldzap") : `czd:${esc(id)}`;
  if (!state.carregado.cz || !state.carregado.czl) { cab("ColdZap", ""); return carregando(); }
  if (!czPodeCriar()) { cab("ColdZap", ""); return vazio("ti-lock", "Só quem opera os disparos cria e edita listas do ColdZap.", `<button type="button" class="linkbtn" data-ir="coldzap">Voltar para o ColdZap</button>`); }
  if (!novo && !d0) { cab("ColdZap", ""); return vazio("ti-list-search", "Esta lista não existe.", `<button type="button" class="linkbtn" data-ir="coldzap">Voltar para o ColdZap</button>`); }
  const semLista = cmFornecedores().filter((f) => !f.cz);
  const fo = novo && chavePre ? cmFornecedores().find((x) => x.k === chavePre) : null;
  const d = novo ? { empresa: fo?.empresa || "", chave: fo?.chave || "", produto: fo?.produto || "", solicitante: fo?.solicitante || "", data: "", remetente: "", base: "" } : d0;
  const nAtuais = novo ? 0 : state.czLeads.filter((l) => l.disparo === id).length;
  cab(novo ? "Nova lista do ColdZap" : `Editar lista · ${d.empresa}`, novo
    ? "Preencha o fornecedor e suba a planilha com os leads que vão pelo WhatsApp. O painel monta um lead por linha, com o link da conversa e a mensagem."
    : "Corrija os dados da lista ou acrescente leads de outra planilha. Os leads e as marcações que já estão aqui continuam.");
  const f = (k, rot, tipo, val, extra = "") => `<label class="campo" for="z_${k}">${rot}<input type="${tipo}" id="z_${k}" value="${esc(val ?? "")}"${extra}></label>`;
  return `<form id="czForm" class="form" data-id="${esc(id || "")}" data-voltar="${voltar}" novalidate>
    <fieldset><legend>1. Fornecedor e disparo</legend>
      ${novo && semLista.length ? `<label class="campo largo" for="z_cm">Puxar os dados de um fornecedor do Cold mail<select id="z_cm"><option value="">Escolha o fornecedor (opcional)</option>${semLista.map((x) => `<option value="${esc(x.k)}"${fo && fo.k === x.k ? " selected" : ""}>${esc(x.empresa || "Sem nome")}${x.chave ? " · " + esc(x.chave) : ""}</option>`).join("")}</select></label>` : ""}
      <div class="campos">
      ${f("empresa", "Fornecedor", "text", String(d.empresa || "").trim(), ' required autocomplete="off"')}
      ${f("chave", "ID do cliente", "text", String(d.chave || "").replace(/\.0$/, ""), ' placeholder="ex.: 26-40549-1"')}
      ${f("produto", "Produto", "text", d.produto)}
      ${f("data", "Data do disparo do WhatsApp", "date", String(d.data || "").slice(0, 10))}
      ${f("remetente", "Quem envia", "text", d.remetente)}
      ${f("solicitante", "Solicitante", "text", d.solicitante)}
      <label class="campo largo" for="z_base">Sobre a base (opcional)<input type="text" id="z_base" value="${esc(d.base || "")}" placeholder="ex.: 20 leads no WhatsApp; 300 receberam o e-mail pelo BillionMail"></label>
    </div></fieldset>
    <fieldset><legend>2. ${novo ? "Planilha com os leads" : "Acrescentar leads (opcional)"}</legend>
      <p class="note" style="margin:0">${novo ? "A primeira linha da planilha precisa ter os títulos das colunas: Nome, Empresa, Celular, Mensagem… A planilha do WhatsApp que já usamos entra direto." : `A lista tem ${nAtuais} lead(s). Os da planilha entram no fim, e quem já está na lista (mesmo celular) fica de fora.`}</p>
      <label class="arquivo" id="czDrop" for="z_arquivo"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i><span><b>Escolher a planilha</b> ou arrastar o arquivo para cá</span><small>Excel (.xlsx ou .xls) ou CSV</small>
        <input type="file" id="z_arquivo" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"></label>
      <div id="czPrevia" class="cz-previa">${czPreviaHtml()}</div>
    </fieldset>
    <div class="acoes">
      <button type="submit" class="btn" id="czSalvar"><i class="ti ti-device-floppy" aria-hidden="true"></i>${novo ? "Criar lista" : "Salvar alterações"}</button>
      <button type="button" class="btn secundario" data-ir="${voltar}">Voltar</button>
      ${!novo ? `<span id="czApagarBox"><button type="button" class="btn secundario" data-cz-apagar="${esc(id)}">Excluir lista</button></span>` : ""}
      <span class="status-line" id="czFormMsg" role="status"></span>
    </div>
  </form>`;
}
async function salvarCzForm(form) {
  if (!db || !czPodeCriar()) return;
  const msg = $("czFormMsg"); const aviso = (t, e) => { msg.textContent = t; msg.classList.toggle("err", !!e); };
  const v = (k) => ($("z_" + k)?.value ?? "").trim();
  if (!v("empresa")) { aviso("Informe o fornecedor.", true); $("z_empresa").focus(); return; }
  const id0 = form.dataset.id; const novo = !id0;
  if (state.czUp?.erro) { aviso("A planilha não foi lida. Escolha o arquivo de novo.", true); return; }
  if (state.czUp && czSemContato(state.czUp)) { aviso("Escolha a coluna do celular antes de salvar.", true); return; }
  const { ok } = czMontar();
  if (novo && !ok.length) { aviso(state.czUp ? "A planilha não tem nenhum lead com celular válido." : "Suba a planilha com os leads do WhatsApp.", true); return; }
  const agora = new Date().toISOString();
  const id = id0 || czNovoId(v("chave"));
  const atuais = state.czLeads.filter((l) => l.disparo === id);
  const idsUsados = new Set(state.czLeads.map((l) => l._id));
  let ordem = atuais.reduce((a, l) => Math.max(a, +l.ordem || 0), 0);
  const novos = ok.map((l) => {
    ordem++; let lid = `${id}-${String(ordem).padStart(2, "0")}`; while (idsUsados.has(lid)) lid += "b"; idsUsados.add(lid);
    return { _id: lid, disparo: id, ordem, nome: l.nome, empresa: l.empresa, celular: l.celular, numero: l.numero, email: l.email, produto_cotado: l.produto_cotado, cotou_em: l.cotou_em,
      o_que_pediu: l.o_que_pediu, pedido_original: l.pedido_original, mensagem: l.mensagem, envio: "", status: "aguardando", orcamento: false, obs: "", enviado_em: "", respondido_em: "",
      origem: "planilha", criado_em: agora, atualizado_em: agora };
  });
  const todos = [...atuais, ...novos];
  const dados = { empresa: v("empresa"), chave: v("chave"), produto: v("produto"), data: v("data"), remetente: v("remetente"), solicitante: v("solicitante"), base: v("base"),
    leads: todos.length, metricas: czCalc(todos), atualizado_em: agora };
  const btn = $("czSalvar"); if (btn) btn.disabled = true;
  aviso(novos.length ? `Gravando ${novos.length} lead(s)…` : "Salvando…");
  try {
    const listaRef = db.collection("coldzap").doc(id);
    const ops = novos.map((l) => { const { _id, ...x } = l; return [db.collection("coldzap_leads").doc(_id), x]; });
    let i = 0;
    do {
      const lote = db.batch(); ops.slice(i, i + 400).forEach(([ref, x]) => lote.set(ref, x)); i += 400;
      if (i >= ops.length) { if (novo) lote.set(listaRef, { ...dados, origem: "painel", criado_em: agora }); else lote.update(listaRef, dados); }
      await lote.commit();
    } while (i < ops.length);
    const lst = state.cz.find((x) => x.id === id);
    if (lst) Object.assign(lst, dados); else state.cz.push({ id, ...dados, origem: "painel", criado_em: agora });
    novos.forEach((l) => { if (!state.czLeads.some((x) => x._id === l._id)) state.czLeads.push(l); });
    ir({ tipo: "czd", id }, true);
  } catch (e) {
    if (btn) btn.disabled = false;
    aviso(semPermissao(e) ? "Você tem acesso só de leitura a este painel." : "Não foi possível salvar. Tente de novo em alguns segundos.", true);
  }
}
async function apagarCzLista(id, btn) {
  if (!db || !czPodeCriar()) return;
  btn.disabled = true;
  const refs = [...state.czLeads.filter((l) => l.disparo === id).map((l) => db.collection("coldzap_leads").doc(l._id)), db.collection("coldzap").doc(id)];
  try {
    for (let i = 0; i < refs.length; i += 400) { const lote = db.batch(); refs.slice(i, i + 400).forEach((r) => lote.delete(r)); await lote.commit(); }
    state.czLeads = state.czLeads.filter((l) => l.disparo !== id); state.cz = state.cz.filter((x) => x.id !== id);
    ir({ tipo: "coldzap" }, true);
  } catch (e) {
    btn.disabled = false; const m = $("czFormMsg");
    if (m) { m.textContent = semPermissao(e) ? "Você tem acesso só de leitura a este painel." : "Não foi possível excluir agora."; m.classList.add("err"); }
  }
}

/* ---------- Cold mail: carta por fornecedor, pelo BillionMail ----------
   Cada documento é um envio (base inteira, metade A ou metade B) e fica na coleção "institucional" com frente: "coldmail"
   (mesmas regras de acesso: a empresa vê, quem opera edita). Os envios do mesmo fornecedor são agrupados pelo ID do cliente.
   Canais separados: aqui ficam só os números do e-mail. Os 20 a 30 leads da mesma base que vão pelo WhatsApp ficam no ColdZap. */
const normChave = (c) => String(c ?? "").replace(/\.0$/, "").trim().toLowerCase();
const temMetrica = (d) => num(d.bm?.delivered_pct) != null || num(d.bm?.opened_pct) != null || num(d.bm?.enviados) != null;
const cmEnviado = (d) => !!d.data_disparo && d.data_disparo <= hojeLocal();
function cmSituacao(d) {
  if (!d.data_disparo) return { k: "sem_data", chip: `<span class="chip neutro">E-mail sem data de disparo</span>` };
  if (d.data_disparo === hojeLocal() && !temMetrica(d)) return { k: "hoje", chip: `<span class="chip info">E-mail: disparo hoje</span>` };
  if (d.data_disparo > hojeLocal()) return { k: "programado", chip: `<span class="chip info sem-ponto"><i class="ti ti-calendar-event" aria-hidden="true"></i>E-mail programado para ${fmtData(d.data_disparo)}</span>` };
  if (!temMetrica(d)) return { k: "sem_metricas", chip: `<span class="chip neutro">E-mail enviado em ${fmtData(d.data_disparo)} · sem métricas</span>` };
  return { k: "ok", chip: `<span class="chip ok">E-mail enviado em ${fmtData(d.data_disparo)}</span>` };
}
const baseNome = (d) => (d.base_ab === "A" || d.base_ab === "B" ? `Base ${d.base_ab}` : "Base inteira");
/* Fornecedores: envios agrupados pelo ID do cliente (ou pelo nome, se faltar o ID). */
function cmFornecedores(lista = state.cm) {
  const g = {};
  lista.forEach((d) => { const k = normChave(d.chave) || "sem-id:" + String(d.empresa || "").trim().toLowerCase(); (g[k] ||= { k, envios: [] }).envios.push(d); });
  return Object.values(g).map((f) => {
    f.envios.sort((a, b) => (a.data_disparo || "").localeCompare(b.data_disparo || "") || (a.base_ab || "").localeCompare(b.base_ab || ""));
    const ref = f.envios[f.envios.length - 1];
    f.empresa = String(ref.empresa || "").trim(); f.chave = String(ref.chave || "").replace(/\.0$/, "").trim(); f.produto = ref.produto || ""; f.solicitante = ref.solicitante || "";
    f.ultima = f.envios.reduce((m, d) => (d.data_disparo > m ? d.data_disparo : m), "");
    f.programados = f.envios.filter((d) => cmSituacao(d).k === "programado");
    f.semMetricas = f.envios.filter((d) => cmSituacao(d).k === "sem_metricas");
    f.s = instSomar(f.envios.filter(cmEnviado));
    f.resp = f.envios.reduce((a, d) => a + (num(d.respostas) || 0), 0); f.orc = f.envios.reduce((a, d) => a + (num(d.orcamentos) || 0), 0);
    f.cz = state.cz.find((z) => normChave(z.chave) === f.k) || null;
    return f;
  }).sort((a, b) => (b.ultima || "").localeCompare(a.ultima || ""));
}
const cmTotais = (lista = state.cm) => { const s = instSomar(lista.filter((d) => cmEnviado(d) && temMetrica(d))); s.respostas = lista.reduce((a, d) => a + (num(d.respostas) || 0), 0); s.orcamentos = lista.reduce((a, d) => a + (num(d.orcamentos) || 0), 0); return s; };
function cmKpis(s, nForn, base) {
  const itens = [
    ["Fornecedores", nForn, `${s.n} envio(s) com números do BillionMail`, false, "ti-building-store"],
    ...(base ? [["Tamanho da base", base.tamanho, base.sub, false, "ti-users-group"],
      ["Base limpa", base.limpa, base.tamanho ? `${br(pct(base.limpa, base.tamanho))}% do tamanho · todos os envios` : "sem base no período", false, "ti-database", base.tamanho ? pct(base.limpa, base.tamanho) : null]] : []),
    ["Entregues", s.entregues, s.env ? `${br(pct(s.entregues, s.env))}% dos ${s.env} enviados` : "lance os números do BillionMail", false, "ti-mail-check", s.env ? pct(s.entregues, s.env) : null],
    ["% lido", `${br(pct(s.abertos, s.entregues))}%`, `${s.abertos} abertos`, false, "ti-mail-opened", s.entregues ? pct(s.abertos, s.entregues) : null],
    ["Cliques no link", s.cliques, `${br(pct(s.cliques, s.entregues))}% dos entregues`, false, "ti-click"],
    ["Respostas", s.respostas, "pelo e-mail", false, "ti-message-circle"],
    ["Orçamentos", s.orcamentos, `${br(pct(s.orcamentos, s.respostas))}% das respostas (conversão)`, true, "ti-file-invoice"],
  ];
  return kpiGrid(nForn == null ? itens.slice(1) : itens, base ? "k4" : "");
}
const linhaCm = (d) => { const s = instSomar([d]); const temNum = temMetrica(d); const tr = (v) => (temNum ? v : "—");
  return `<td class="num">${num(d.base_limpa) ?? "—"}</td><td class="num">${tr(s.entregues)}</td><td class="num">${tr(br(pct(s.abertos, s.entregues)) + "%")}</td><td class="num">${tr(s.cliques)}</td><td class="num">${num(d.respostas) ?? "—"}</td><td class="num">${num(d.orcamentos) ?? "—"}</td>`; };

/* Situação do fornecedor: o envio de hoje, o próximo programado, o que falta lançar ou o último enviado. */
const cmSitForn = (f) => { const hojeE = f.envios.find((d) => cmSituacao(d).k === "hoje"); return hojeE ? cmSituacao(hojeE) : f.programados.length ? cmSituacao(f.programados[0]) : f.semMetricas.length ? cmSituacao(f.semMetricas[0]) : cmSituacao(f.envios[f.envios.length - 1]); };
const cmCardForn = (f) => { const sit = cmSitForn(f);
    return `<button type="button" class="card cm" data-ir="cmf:${esc(f.k)}">
      <div class="top"><div><div class="nome">${esc(f.empresa || "Sem nome")}</div><div class="sub">${esc(f.chave || "sem ID")}${f.produto ? " · " + esc(f.produto) : ""}</div></div><span class="ico-frente" aria-hidden="true"><i class="ti ti-mail-forward"></i></span></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${sit.chip}${f.envios.length > 1 ? `<span class="chip neutro sem-ponto">${f.envios.length} envios (${f.envios.map((d) => d.base_ab === "A" || d.base_ab === "B" ? d.base_ab : "inteira").join(" e ")})</span>` : `<span class="chip neutro sem-ponto">${baseNome(f.envios[0])}</span>`}</div>
      <div class="stats"><div class="stat"><b>${f.s.limpa || f.envios.reduce((a, d) => a + (num(d.base_limpa) || 0), 0)}</b><span>base limpa</span></div><div class="stat"><b>${f.s.entregues ? br(pct(f.s.abertos, f.s.entregues)) + "%" : "—"}</b><span>lido</span></div><div class="stat"><b>${f.envios.some((d) => num(d.respostas) != null) ? f.resp : "—"}/${f.envios.some((d) => num(d.orcamentos) != null) ? f.orc : "—"}</b><span>respostas/orç.</span></div></div>
      <span class="go">Abrir fornecedor <i class="ti ti-arrow-right" aria-hidden="true"></i></span></button>`; };
/* Modo lista: uma tabela com tudo, uma linha por fornecedor. Quem teve envios A e B aparece somado; cada envio fica na ficha.
   A situação é curta porque a data já está na primeira coluna. */
const CM_CURTO = { ok: ["ok", "Enviado"], sem_metricas: ["neutro", "Sem números"], programado: ["info", "Programado"], hoje: ["info", "Disparo hoje"], sem_data: ["neutro", "Sem data"] };
/* Base de cada envio do fornecedor: inteira, metade A, metade B (ou A e B, quando foram dois envios). */
const cmBases = (f) => f.envios.map((d) => `<span class="tag ab">${d.base_ab === "A" || d.base_ab === "B" ? d.base_ab : "Inteira"}</span>`).join(" ");
const chipCmCurto = (k) => { const [c, t] = CM_CURTO[k] || ["neutro", k]; return `<span class="chip ${c}">${t}</span>`; };
function cmTabelaForn(forn) {
  const linha = (f) => { const sit = cmSitForn(f); const tem = f.s.env > 0; const tr = (v) => (tem ? v : "—");
    const datas = [...new Set(f.envios.map((d) => d.data_disparo).filter(Boolean))].sort();
    const quando = datas.length > 1 ? datas.map((x) => fmtData(x).slice(0, 5)).join(" e ") : datas.length ? fmtData(datas[0]) : "Sem data";
    const limpa = f.envios.reduce((a, d) => a + (num(d.base_limpa) || 0), 0);
    return `<tr class="clicavel" data-ir="cmf:${esc(f.k)}">
      <td class="data">${quando}${f.envios.length > 1 ? `<small>${f.envios.length} envios</small>` : ""}</td>
      <td><div class="who"><button type="button" class="linkbtn forn" data-ir="cmf:${esc(f.k)}">${esc(f.empresa || "Sem nome")}</button><small title="${esc(f.produto || "")}">${esc(f.chave || "sem ID")}${f.produto ? " · " + esc(f.produto) : ""}</small></div></td>
      <td class="base">${cmBases(f)}</td>
      <td>${chipCmCurto(sit.k)}</td>
      <td class="num">${limpa || "—"}</td><td class="num">${tr(f.s.entregues)}</td><td class="num">${tr(br(pct(f.s.abertos, f.s.entregues)) + "%")}</td><td class="num">${tr(f.s.cliques)}</td>
      <td class="num">${f.envios.some((d) => num(d.respostas) != null) ? f.resp : "—"}</td><td class="num">${f.envios.some((d) => num(d.orcamentos) != null) ? f.orc : "—"}</td></tr>`; };
  return `<div class="tbl-wrap"><table class="tabela-forn"><thead><tr><th>Disparo em</th><th>Fornecedor</th><th>Base</th><th>Situação</th><th class="num">Base limpa</th><th class="num">Entregues</th><th class="num">% lido</th><th class="num">Cliques</th><th class="num">Respostas</th><th class="num">Orçamentos</th></tr></thead>
    <tbody>${forn.map(linha).join("")}</tbody></table></div>`;
}
/* Busca do Cold mail: fornecedor, ID do cliente, produto, solicitante, assunto ou data, sem diferença de acento ou maiúscula.
   Filtra a lista de fornecedores; os números do topo continuam sendo de todos. */
const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const bateBusca = (q, vals) => { const x = semAcento(q); return !x || vals.some((v) => semAcento(v).includes(x)); };
const barraBusca = (id, valor, ph, contagem) => `<div class="busca-barra"><label class="busca-campo" for="${id}"><i class="ti ti-search" aria-hidden="true"></i><input type="search" id="${id}" value="${esc(valor)}" placeholder="${ph}" aria-label="${ph}" autocomplete="off"></label><span class="note" id="${id}Cont" role="status">${contagem}</span></div>`;
const cmBate = (d) => bateBusca(state.cmBusca, [d.empresa, String(d.chave || "").replace(/\.0$/, ""), d.produto, d.solicitante, d.assunto, fmtData(d.data_disparo)]);
function cmFiltrados() { const todos = cmFornecedores(); return { todos, forn: todos.filter((f) => f.envios.some(cmBate)) }; }
const cmContagem = ({ todos, forn }) => (state.cmBusca.trim() ? `${forn.length} de ${todos.length} fornecedor(es)` : `${todos.length} fornecedor(es) · mais recentes primeiro`);
function cmListaHtml({ forn }) {
  if (!forn.length) return vazio("ti-search-off", "Nenhum fornecedor encontrado.", `Nada com “${esc(state.cmBusca.trim())}”. Confira o nome ou busque pelo ID do cliente.`);
  return state.vista === "lista" ? cmTabelaForn(forn) : `<div class="grid-cards">${forn.map(cmCardForn).join("")}</div>`;
}
const cmBuscaBarra = (fl) => `<div class="busca-barra"><label class="busca-campo" for="cmBusca"><i class="ti ti-search" aria-hidden="true"></i><input type="search" id="cmBusca" value="${esc(state.cmBusca)}" placeholder="Buscar por fornecedor, ID do cliente ou produto" aria-label="Buscar fornecedor" autocomplete="off"></label><span class="note" id="cmContagem" role="status">${cmContagem(fl)}</span></div>`;
/* Redesenha só a lista e a tabela, sem tirar o cursor do campo de busca. */
function renderCmLista() {
  const l = $("cmLista"); if (!l) return render();
  const fl = cmFiltrados(); l.innerHTML = cmListaHtml(fl);
  const c = $("cmContagem"); if (c) c.textContent = cmContagem(fl);
}

function telaColdmail() {
  cab("Cold mail", "Cartas personalizadas por fornecedor, enviadas pelo BillionMail. Cada fornecedor reúne os envios da campanha (base inteira ou metades A e B); a parte da base que vai pelo WhatsApp fica no ColdZap.");
  if (!state.carregado.inst) return carregando();
  const forn = cmFornecedores();
  /* Período: os números e o funil mostram só os envios com disparo no mês escolhido (vazio = todos os meses). */
  const mes = state.cmMes; const doMes = (m) => state.cm.filter((d) => !m || (d.data_disparo || "").startsWith(m));
  const lista = doMes(mes); const s = cmTotais(lista); const nForn = mes ? cmFornecedores(lista).length : forn.length;
  const mesesCm = mesesDe(state.cm.map((d) => d.data_disparo));
  const somaBase = (ls) => ({ tamanho: ls.reduce((a, d) => a + (num(d.tamanho_base) || 0), 0), limpa: ls.reduce((a, d) => a + (num(d.base_limpa) || 0), 0) });
  const b = somaBase(lista); const prog = lista.filter((d) => cmSituacao(d).k === "programado").length;
  const listaAnt = mes ? doMes(mesAnterior(mes)) : [];
  b.sub = [`${lista.length} envio(s)${prog ? `, ${prog} programado(s)` : ""}`, vsMes(mes, b.tamanho, listaAnt.length ? somaBase(listaAnt).tamanho : null)].filter(Boolean).join(" · ");
  const agenda = state.cm.filter((d) => ["hoje", "programado", "sem_metricas", "sem_data"].includes(cmSituacao(d).k))
    .sort((a, b) => (a.data_disparo || "9999").localeCompare(b.data_disparo || "9999"));
  return `<div class="pilha">
    <div class="acoes">${state.podeEditar ? `<button type="button" class="btn" data-ir="cm-novo"><i class="ti ti-plus" aria-hidden="true"></i>Novo cold mail</button>` : ""}${ajuda('Os números do BillionMail podem mudar: abra o fornecedor e use "Editar" para atualizar.')}</div>
    ${periodoSel("cmMes", mes, mesesCm, "Mostra só os envios com data de disparo no mês escolhido: tamanho da base, números do BillionMail, respostas e orçamentos. A agenda e a lista de fornecedores continuam com todos os envios.")}
    ${secao("h-cmt", "ti-chart-bar", "Resultado do e-mail", `${mes ? nomeMes(mes) + " · " : ""}Funil dos envios com números do BillionMail · o WhatsApp fica no ColdZap`, cmKpis(s, nForn, b))}
    <div class="grade-2">
      ${painel("h-cmf", "ti-filter", `Funil do cold mail ${ajuda("O funil conta só os envios que já têm os números do BillionMail lançados, para as taxas saírem certas. Por isso a base limpa aqui pode ser menor que a do cartão, que soma todos os envios do período.")}`, "Só o e-mail · envios com números", funil(instEtapas(s), "var(--f-cm)"))}
      ${painel("h-cma", "ti-calendar-event", "Agenda", agenda.length ? `${agenda.length} envio(s)` : "", agenda.length ? `<ul class="pendencias">${agenda.map((d) => { const k = cmSituacao(d).k;
        return `<li class="${k === "sem_metricas" ? "alerta" : ""}"><span class="pi" aria-hidden="true"><i class="ti ${k === "programado" || k === "hoje" ? "ti-calendar-event" : k === "sem_data" ? "ti-calendar-off" : "ti-chart-bar-off"}"></i></span><div><button type="button" data-ir="cmf:${esc(normChave(d.chave) || "sem-id:" + String(d.empresa || "").trim().toLowerCase())}">${esc(String(d.empresa || "").trim())} · ${baseNome(d)}</button><span>${k === "hoje" ? "Disparo hoje" : k === "programado" ? `Programado para ${fmtData(d.data_disparo)}` : k === "sem_data" ? "Sem data de disparo" : `Enviado em ${fmtData(d.data_disparo)}: lançar os números do BillionMail`}</span></div></li>`; }).join("")}</ul>`
        : `<p class="note" style="display:flex;gap:8px;align-items:center"><i class="ti ti-circle-check" style="color:var(--ok);font-size:18px" aria-hidden="true"></i>Nenhum envio programado nem sem números.</p>`)}
    </div>
    ${secao("h-cml", "ti-building-store", "Fornecedores", "", forn.length ? (() => { const fl = cmFiltrados(); return `${cmBuscaBarra(fl)}<div id="cmLista">${cmListaHtml(fl)}</div>`; })()
      : vazio("ti-mail-forward", "Nenhum cold mail registrado ainda.", state.podeEditar ? "Use “Novo cold mail” para lançar o primeiro." : ""), forn.length ? seletorVista() : "")}
  </div>`;
}

function telaCmFornecedor(k) {
  const f = cmFornecedores().find((x) => x.k === k);
  if (!f) { cab("Cold mail", ""); return state.carregado.inst ? vazio("ti-list-search", "Este fornecedor não está no cold mail.", `<button type="button" class="linkbtn" data-ir="coldmail">Voltar para o Cold mail</button>`) : carregando(); }
  cab(f.empresa || "Fornecedor", f.produto || "");
  const tot = cmTotais(f.envios); const ref = f.envios[f.envios.length - 1];
  const envio = (d) => { const s = instSomar([d]); const sit = cmSituacao(d); const tem = temMetrica(d);
    return `<article class="envio cm" aria-label="${baseNome(d)}">
      <div class="envio-top"><div><b>${baseNome(d)}</b><span class="note">${d.data_disparo ? (sit.k === "programado" ? "Programado para " : "Disparo em ") + fmtData(d.data_disparo) : "Sem data de disparo"}${d.remetente ? " · remetente " + esc(d.remetente) : ""}</span></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${sit.chip}${state.podeEditar ? `<button type="button" class="btn secundario" data-orc-ir="${esc(d.id)}"><i class="ti ti-file-invoice" aria-hidden="true"></i>Registrar orçamento</button><button type="button" class="btn secundario" data-ir="cm:${esc(d.id)}"><i class="ti ti-pencil" aria-hidden="true"></i>Editar</button>` : ""}</div></div>
      <div class="mini mini-6"><div><b>${num(d.tamanho_base) ?? "—"}</b><span>Tamanho da base</span></div><div><b>${num(d.base_limpa) ?? "—"}</b><span>Base limpa</span></div>
        <div><b>${tem ? br(pct(s.entregues, s.env)) + "%" : "—"}</b><span>Entregues</span></div><div><b>${tem ? br(pct(s.abertos, s.entregues)) + "%" : "—"}</b><span>Lido</span></div>
        <div><b>${tem ? br(pct(s.cliques, s.entregues)) + "%" : "—"}</b><span>Cliques</span></div><div><b>${num(d.respostas) ?? "—"} / ${num(d.orcamentos) ?? "—"}</b><span>Respostas / orçamentos</span></div></div>
      ${sit.k === "programado" || sit.k === "hoje" ? `<p class="note">As métricas entram depois do envio, pela tela de Analytics do BillionMail.</p>` : sit.k === "sem_metricas" ? `<p class="note" style="color:var(--bad)">Já passou da data do disparo e ainda não há números do BillionMail. ${state.podeEditar ? "Use “Editar” para lançar." : ""}</p>` : ""}
      ${orcTabela(d.id)}
      ${d.assunto ? `<p class="note">Assunto: ${esc(d.assunto)}</p>` : ""}${d.obs ? `<p class="note">Obs.: ${esc(d.obs)}</p>` : ""}</article>`; };
  const czm = f.cz ? czMetricas(f.cz) : null;
  return `<div class="pilha">
    <dl class="ficha">
      <div><dt>Fornecedor</dt><dd>${esc(f.empresa)}</dd></div>
      <div><dt>ID do cliente</dt><dd>${esc(f.chave || "—")}</dd></div>
      <div><dt>Solicitante</dt><dd>${esc(f.solicitante || "—")}</dd></div>
      <div><dt>Solicitado em</dt><dd>${ref.data_solicitacao ? fmtData(ref.data_solicitacao) : "—"}</dd></div>
      ${ref.base_link && /^https?:\/\//.test(ref.base_link) ? `<div><dt>Base de disparo</dt><dd><a href="${esc(ref.base_link)}" target="_blank" rel="noopener">Abrir a base</a></dd></div>` : ""}
      <div class="largo"><dt>Produto</dt><dd>${esc(f.produto || "—")}</dd></div>
    </dl>
    ${secao("h-cmr", "ti-chart-bar", "Resultado do e-mail", "Envios com números do BillionMail", cmKpis(tot, null))}
    ${secao("h-cmv", "ti-mail-forward", "Envios", `${f.envios.length} envio(s)`, `<div class="envios">${f.envios.map(envio).join("")}</div>
      ${state.podeEditar ? `<button type="button" class="btn secundario" style="justify-self:start;margin-top:14px" data-ir="cm-novo:${esc(f.k)}"><i class="ti ti-plus" aria-hidden="true"></i>Novo envio deste fornecedor</button>` : ""}`)}
    ${!f.cz && czPodeCriar() ? `<div class="analise-nota"><i class="ti ti-brand-whatsapp" aria-hidden="true"></i><span>A parte da base que vai pelo WhatsApp ainda não tem lista no ColdZap. <button type="button" class="linkbtn" data-ir="cz-nova:${esc(f.k)}">Criar a lista do ColdZap</button></span></div>` : ""}
    ${f.cz ? (() => { const limpa = f.envios.reduce((a, d) => a + (num(d.base_limpa) || 0), 0); const datasEmail = [...new Set(f.envios.map((d) => d.data_disparo).filter(Boolean))].sort().map(fmtData).join(" e ");
      return `<section class="painel" aria-labelledby="h-cmb"><div class="section-head"><h2 id="h-cmb"><i class="ti ti-arrows-split" aria-hidden="true"></i>Base dividida em dois canais</h2><span class="note">${limpa + czm.total} leads no total · cada canal tem a sua data</span></div>
      <div class="canais-base"><div class="cm"><i class="ti ti-mail-forward" aria-hidden="true"></i><div><b>${limpa}</b><span>pelo e-mail (Cold mail)</span><small>Disparo do e-mail: ${datasEmail || "sem data"}</small></div></div>
      <div class="cz"><i class="ti ti-brand-whatsapp" aria-hidden="true"></i><div><b>${czm.total}</b><span>pelo WhatsApp (ColdZap)</span><small>Disparo do WhatsApp: ${fmtData(f.cz.data) || "sem data"}</small></div></div></div>
      <p class="note">Os números do WhatsApp ficam no ColdZap e não entram no resultado do e-mail. <button type="button" class="linkbtn" data-ir="czd:${esc(f.cz.id)}">Ver a lista no ColdZap</button></p></section>`; })() : ""}
  </div>`;
}

/* ---------- Orçamentos recebidos: o detalhe de cada orçamento, um por lead ----------
   Ficam na coleção "orcamentos" (campo envio = id do envio), que só operadores leem,
   porque têm nome, e-mail e telefone do comprador. O número de orçamentos do envio continua no envio. */
const ORC_CAMPOS = [["data", "Data", "date"], ["id_orcamento", "ID (orçamento)", "text"], ["produto", "Produto/Serviço", "text"], ["comprador", "Nome do Comprador", "text"],
  ["empresa", "Nome da Empresa", "text"], ["email", "E-mail", "email"], ["telefone", "Telefone", "tel"], ["regiao", "Região", "text"], ["perfil", "Tipo de Perfil", "text"]];
const orcsDoEnvio = (id) => (state.orcs || []).filter((o) => id && o.envio === id).sort((a, b) => (a.data || "").localeCompare(b.data || ""));
const orcLinha = (o = {}) => `<div class="orc-linha" data-orc="${esc(o._id || "")}"><div class="campos">${ORC_CAMPOS.map(([k, rot, tipo]) =>
  `<label class="campo">${rot}<input type="${tipo}" data-oc="${k}" value="${esc(o[k] ?? "")}"${k === "perfil" ? ' list="orcPerfis"' : k === "regiao" ? ' list="orcRegioes"' : ""} autocomplete="off"></label>`).join("")}</div>
  <button type="button" class="btn secundario orc-tirar" data-orc-tirar="1"><i class="ti ti-trash" aria-hidden="true"></i>Tirar este orçamento</button></div>`;
function orcBloco(envioId) {
  if (!state.podeEditar) return "";
  if (state.orcErro) return `<p class="analise-nota orc-aviso"><i class="ti ti-lock" aria-hidden="true"></i>O detalhe dos orçamentos ainda não está liberado no banco do painel. Falta publicar a regra nova do Firestore.</p>`;
  const valores = (k) => [...new Set((state.orcs || []).map((o) => String(o[k] || "").trim()).filter(Boolean))].sort();
  return `<div class="orc-bloco"><div class="orc-cab"><b><i class="ti ti-file-invoice" aria-hidden="true"></i>Detalhe dos orçamentos</b>
      <span class="note">Um por lead. Dica: copie a linha da planilha (Data, ID, Produto/Serviço…) e cole no campo Data, que o painel preenche os outros campos. Ao salvar, o número de Orçamentos acompanha a lista.</span></div>
    <div id="orcLinhas" class="orc-linhas">${orcsDoEnvio(envioId).map(orcLinha).join("")}</div>
    <button type="button" class="btn secundario" style="justify-self:start" data-orc-add="1"><i class="ti ti-plus" aria-hidden="true"></i>Adicionar orçamento</button>
    <datalist id="orcPerfis">${valores("perfil").map((v) => `<option value="${esc(v)}">`).join("")}</datalist>
    <datalist id="orcRegioes">${valores("regiao").map((v) => `<option value="${esc(v)}">`).join("")}</datalist></div>`;
}
/* Tabela dos orçamentos de um envio, na tela do fornecedor (só para operadores). */
function orcTabela(envioId) {
  if (!state.podeEditar || !state.orcOk) return "";
  const ls = orcsDoEnvio(envioId); if (!ls.length) return "";
  const cel = (o, k) => { const v = String(o[k] ?? "").trim(); if (!v) return "—"; if (k === "data") return fmtData(v); if (k === "email") return `<a href="mailto:${esc(v)}">${esc(v)}</a>`; return esc(v); };
  return `<div class="orc-tabela"><b class="orc-titulo"><i class="ti ti-file-invoice" aria-hidden="true"></i>Orçamentos recebidos (${ls.length})</b>
    <div class="tbl-wrap"><table><thead><tr>${ORC_CAMPOS.map(([k, rot]) => `<th class="c-${k}">${rot}</th>`).join("")}</tr></thead>
    <tbody>${ls.map((o) => `<tr>${ORC_CAMPOS.map(([k]) => `<td class="c-${k}">${cel(o, k)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
}
/* Lê as linhas de orçamento do formulário (ignora as vazias). */
const orcDoForm = () => [...document.querySelectorAll("#orcLinhas .orc-linha")].map((l) => {
  const o = { _id: l.dataset.orc || "" }; ORC_CAMPOS.forEach(([k]) => (o[k] = (l.querySelector(`[data-oc="${k}"]`)?.value || "").trim())); return o;
}).filter((o) => ORC_CAMPOS.some(([k]) => o[k]));
function telaCmForm(id, chavePre) {
  const novo = !id;
  const base = chavePre ? cmFornecedores().find((x) => x.k === chavePre) : null;
  const d = novo ? { base_ab: "Inteira", data_solicitacao: hojeLocal(), empresa: base?.empresa || "", chave: base?.chave || "", produto: base?.produto || "", solicitante: base?.solicitante || "", base_link: base?.envios.slice(-1)[0]?.base_link || "" }
    : state.cm.find((x) => x.id === id);
  cab(novo ? (base ? `Novo envio · ${base.empresa}` : "Novo cold mail") : d ? `${String(d.empresa || "Cold mail").trim()} · ${baseNome(d)}` : "Cold mail",
    novo ? "Lance o fornecedor, a base e a data. Os números do BillionMail entram depois do envio e podem ser corrigidos quando mudarem." : "Corrija aqui os números do BillionMail sempre que mudarem.");
  if (!d) return state.carregado.inst ? `<div class="empty">Este envio não existe mais. <button type="button" class="linkbtn" data-ir="coldmail">Voltar para o Cold mail</button></div>` : carregando();
  const bm = d.bm || {}; const dis = state.podeEditar ? "" : " disabled";
  const f = (k, rot, tipo, val, extra = "") => `<label class="campo" for="c_${k}">${rot}<input type="${tipo}" id="c_${k}" value="${esc(val ?? "")}"${extra}${dis}></label>`;
  const pctv = (v) => (v != null && v !== "" ? br(v) : "");
  const voltar = !novo ? `cmf:${esc(normChave(d.chave) || "sem-id:" + String(d.empresa || "").trim().toLowerCase())}` : base ? `cmf:${esc(base.k)}` : "coldmail";
  return `<form id="cmForm" class="form" data-id="${esc(id || "")}" data-voltar="${voltar}" novalidate>
    <fieldset><legend>Fornecedor e envio</legend><div class="campos">
      ${f("empresa", "Fornecedor", "text", String(d.empresa || "").trim(), ' required autocomplete="off"')}
      ${f("chave", "ID do cliente", "text", String(d.chave || "").replace(/\.0$/, ""), ' placeholder="ex.: 26-40549-1"')}
      ${f("produto", "Produto", "text", d.produto)}
      ${f("solicitante", "Solicitante", "text", d.solicitante)}
      ${f("data_solicitacao", "Data da solicitação", "date", d.data_solicitacao)}
      ${f("data_disparo", "Data do disparo", "date", d.data_disparo)}
      <label class="campo" for="c_base_ab">Base utilizada<select id="c_base_ab"${dis}>${BASE_AB.map((v) => `<option value="${v}"${(d.base_ab || "Inteira") === v ? " selected" : ""}>${v === "Inteira" ? "Inteira" : "Metade " + v}</option>`).join("")}</select></label>
      ${f("remetente", "Remetente", "text", d.remetente)}
      ${f("assunto", "Assunto do e-mail", "text", d.assunto)}
      ${f("base_link", "Base de disparo (link)", "text", d.base_link)}
      ${f("tamanho_base", "Tamanho da base", "number", d.tamanho_base, ' min="0" step="1" inputmode="numeric"')}
      ${f("base_limpa", "Base limpa", "number", d.base_limpa, ' min="0" step="1" inputmode="numeric"')}
    </div></fieldset>
    <fieldset><legend>BillionMail</legend><p class="note" style="margin:0">Copie da tela de Analytics: os percentuais como aparecem (aceita vírgula). Se deixar "Enviados" em branco, o painel usa a base limpa.</p><div class="campos">
      ${f("enviados", "Enviados (Success)", "number", bm.enviados, ' min="0" step="1" inputmode="numeric"')}
      ${f("delivered_pct", "Delivered % (entregues)", "text", pctv(bm.delivered_pct), ' inputmode="decimal" placeholder="ex.: 98,5"')}
      ${f("opened_pct", "Opened % (lido)", "text", pctv(bm.opened_pct), ' inputmode="decimal"')}
      ${f("clicked_pct", "Clicked % (cliques)", "text", pctv(bm.clicked_pct), ' inputmode="decimal"')}
      ${f("bounced_pct", "Bounced %", "text", pctv(bm.bounced_pct), ' inputmode="decimal"')}
    </div></fieldset>
    <fieldset><legend>Retorno do e-mail</legend><p class="note" style="margin:0">Respostas e orçamentos que vieram pelo e-mail. O WhatsApp da mesma base é marcado lead a lead no ColdZap.</p><div class="campos">
      ${f("respostas", "Respostas", "number", d.respostas, ' min="0" step="1" inputmode="numeric"')}
      ${f("orcamentos", "Orçamentos", "number", d.orcamentos, ' min="0" step="1" inputmode="numeric"')}
      <label class="campo largo" for="c_obs">Observação<textarea id="c_obs" rows="3"${dis}>${esc(d.obs || "")}</textarea></label>
    </div>${orcBloco(id)}</fieldset>
    <div class="acoes">
      ${state.podeEditar ? `<button type="submit" class="btn" id="cmSalvar">${novo ? "Registrar envio" : "Salvar alterações"}</button>` : ""}
      <button type="button" class="btn secundario" data-ir="${voltar}">Voltar</button>
      ${!novo && state.podeEditar ? `<span id="cmApagarBox"><button type="button" class="btn secundario" data-cm-apagar="${esc(id)}">Excluir envio</button></span>` : ""}
      <span class="status-line" id="cmMsg" role="status"></span>
    </div>
  </form>`;
}
async function salvarCm(form) {
  if (!db || !state.podeEditar) return;
  const msg = $("cmMsg"); const aviso = (t, e) => { msg.textContent = t; msg.classList.toggle("err", !!e); };
  const v = (k) => ($("c_" + k)?.value ?? "").trim();
  const n = (k) => { const x = v(k); return x === "" || isNaN(+x) ? null : Math.max(0, Math.round(+x)); };
  const p = (k) => { const x = v(k).replace("%", "").replace(",", "."); return x === "" || isNaN(+x) ? null : Math.min(100, Math.max(0, Math.round(+x * 100) / 100)); };
  if (!v("empresa")) { aviso("Informe o fornecedor.", true); $("c_empresa").focus(); return; }
  const agora = new Date().toISOString();
  const metricas = p("delivered_pct") != null || p("opened_pct") != null || p("clicked_pct") != null;
  const orcs = orcDoForm(); const tirar = (form.dataset.orcTirar || "").split(",").filter(Boolean);
  const nOrc = orcs.length ? Math.max(n("orcamentos") ?? 0, orcs.length) : n("orcamentos");
  const dados = {
    frente: "coldmail", empresa: v("empresa"), chave: v("chave"), produto: v("produto"), solicitante: v("solicitante"),
    data_solicitacao: v("data_solicitacao"), data_disparo: v("data_disparo"), base_ab: v("base_ab") || "Inteira",
    remetente: v("remetente"), assunto: v("assunto"), base_link: v("base_link"), tamanho_base: n("tamanho_base"), base_limpa: n("base_limpa"),
    bm: { enviados: n("enviados") ?? (metricas ? n("base_limpa") : null), delivered_pct: p("delivered_pct"), opened_pct: p("opened_pct"), clicked_pct: p("clicked_pct"), bounced_pct: p("bounced_pct") },
    respostas: n("respostas"), orcamentos: nOrc, obs: v("obs"), atualizado_em: agora,
  };
  const btn = $("cmSalvar"); if (btn) btn.disabled = true;
  try {
    const envioId = form.dataset.id || "cm-" + Date.now().toString(36);
    if (form.dataset.id) await db.collection("institucional").doc(envioId).update(dados);
    else { await db.collection("institucional").doc(envioId).set({ ...dados, criado_em: agora }); form.dataset.id = envioId; }
    const k = normChave(dados.chave) || "sem-id:" + dados.empresa.toLowerCase();
    const i = state.cm.findIndex((x) => x.id === envioId);
    if (i >= 0) Object.assign(state.cm[i], dados);
    if (orcs.length || tirar.length) {
      try {
        const lote = db.batch(); const salvos = [];
        orcs.forEach((o, j) => {
          const oid = o._id || `orc-${Date.now().toString(36)}-${j}`; const x = { frente: "coldmail", envio: envioId, chave: dados.chave, fornecedor: dados.empresa, atualizado_em: agora };
          ORC_CAMPOS.forEach(([c]) => (x[c] = o[c])); if (!o._id) x.criado_em = agora;
          lote.set(db.collection("orcamentos").doc(oid), x, { merge: true }); salvos.push({ _id: oid, ...x });
        });
        tirar.forEach((oid) => lote.delete(db.collection("orcamentos").doc(oid)));
        await lote.commit();
        state.orcs = [...state.orcs.filter((o) => !tirar.includes(o._id) && !salvos.some((s) => s._id === o._id)), ...salvos];
      } catch (e) {
        if (btn) btn.disabled = false;
        return aviso(semPermissao(e) ? "O envio foi salvo, mas o detalhe dos orçamentos não: o banco ainda não libera esse registro." : "O envio foi salvo, mas o detalhe dos orçamentos não. Tente salvar de novo.", true);
      }
    }
    ir({ tipo: "cmf", id: k }, true);
  } catch (e) {
    if (btn) btn.disabled = false;
    aviso(semPermissao(e) ? "Você tem acesso só de leitura a este painel." : "Não foi possível salvar. Tente de novo em alguns segundos.", true);
  }
}
async function apagarCm(id, btn) {
  btn.disabled = true;
  const d = state.cm.find((x) => x.id === id); const k = d ? normChave(d.chave) || "sem-id:" + String(d.empresa || "").trim().toLowerCase() : "";
  try { await db.collection("institucional").doc(id).delete(); state.cm = state.cm.filter((x) => x.id !== id); ir(state.cm.some((x) => (normChave(x.chave) || "sem-id:" + String(x.empresa || "").trim().toLowerCase()) === k) ? { tipo: "cmf", id: k } : { tipo: "coldmail" }); }
  catch (e) { btn.disabled = false; const m = $("cmMsg"); if (m) { m.textContent = "Não foi possível excluir agora."; m.classList.add("err"); } }
}

/* ---------- render ---------- */
function render() {
  abas(); crumbs();
  const r = state.rota;
  $("view").innerHTML =
    r.tipo === "pasta" ? telaPasta(r.id) : r.tipo === "disparo" ? telaDisparo(r.id)
    : r.tipo === "fid-novo" ? telaFidForm(null, r.id) : r.tipo === "fid-editar" ? telaFidForm(r.id)
    : r.tipo === "institucional" ? telaInstitucional() : r.tipo === "inst" ? telaInstForm(r.id) : r.tipo === "inst-novo" ? telaInstForm(null)
    : r.tipo === "coldmail" ? telaColdmail() : r.tipo === "cmf" ? telaCmFornecedor(r.id) : r.tipo === "cm" ? telaCmForm(r.id) : r.tipo === "cm-novo" ? telaCmForm(null, r.id)
    : r.tipo === "coldzap" ? telaColdzap() : r.tipo === "czd" ? telaCzDisparo(r.id) : r.tipo === "cz-nova" ? telaCzForm(null, r.id) : r.tipo === "cz-editar" ? telaCzForm(r.id)
    : r.tipo === "estrategia" ? telaEstrategia() : r.tipo === "visao" ? telaVisao(r.id)
    : r.tipo === "inicio" ? telaInicio() : telaGeral();
}

/* ---------- as quatro frentes ---------- */
const FRENTES_INFO = {
  fidelizacao: { cls: "fid", ico: "ti-refresh", nome: "Reativação", sub: "Por produto e por segmento", destino: "inicio",
    para_quem: "Quem já cotou na plataforma. Por produto: quem cotou aquele produto. Por segmento: empresas de um segmento.",
    canal: "E-mail pelo BillionMail para a base e WhatsApp para os leads de maior potencial.",
    mensagem: "Por produto: as outras opções do que o lead cotou. Por segmento: produtos que o segmento costuma usar. Carta do Soluções por grupo, sem citar fornecedor.",
    quem_envia: "Growth",
    medida: "Respostas, interessados e orçamentos gerados, por canal e por visão." },
  institucional: { cls: "inst", ico: "ti-building", nome: "Institucional", sub: "Cartas por segmento", destino: "institucional",
    para_quem: "Uma base escolhida por segmento de mercado.",
    canal: "E-mail pelo BillionMail, com a base inteira ou dividida em metades A e B.",
    mensagem: "Carta institucional do Soluções, sem fornecedor específico.",
    quem_envia: "Growth, a pedido de um solicitante",
    medida: "% lido, cliques, respostas e orçamentos. Conversão = orçamentos ÷ respostas." },
  coldmail: { cls: "cm", ico: "ti-mail-forward", nome: "Cold mail", sub: "Carta por fornecedor", destino: "coldmail",
    para_quem: "Leads que já cotaram na plataforma, com a base inteira ou dividida em metades A e B.",
    canal: "E-mail pelo BillionMail. A base é dividida: 20 a 30 leads vão pelo WhatsApp (ColdZap) e o restante pelo e-mail.",
    mensagem: "Carta personalizada que cita o fornecedor e o produto dele.",
    quem_envia: "Growth, a pedido de um solicitante",
    medida: "Entregues, % lido, cliques, respostas e orçamentos do e-mail." },
  coldzap: { cls: "cz", ico: "ti-brand-whatsapp", nome: "ColdZap", sub: "WhatsApp do cold mail", destino: "coldzap",
    para_quem: "20 a 30 leads separados da base de cada cold mail por fornecedor. O restante da base recebe o e-mail (Cold mail).",
    canal: "WhatsApp, enviado à mão, lead a lead.",
    mensagem: "Mensagem personalizada sobre o produto do fornecedor.",
    quem_envia: "Maryanna",
    medida: "Enviados, números que não existem, respostas e orçamentos de cada lista." },
};
const PASSOS_PADRAO = [
  { icone: "ti-target", titulo: "Visão e oferta", texto: "Escolher a visão: por produto (outras opções do que o lead cotou) ou por segmento (o que o segmento costuma usar)." },
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
/* Totais das quatro frentes. Com um mês ("2026-11"), entram só os disparos que saíram naquele mês:
   as respostas e os orçamentos contam no mês em que o disparo saiu, não no dia em que a resposta chegou. */
function totaisFrentes(mes = "") {
  const noMes = (dt) => !mes || String(dt || "").startsWith(mes);
  const ds = state.disparos.filter((d) => !mes || dataEnvio(d).startsWith(mes));
  const is = state.inst.filter((d) => noMes(d.data_disparo)); const cs = state.cm.filter((d) => noMes(d.data_disparo)); const zs = state.cz.filter((d) => noMes(d.data));
  const f = somar(ds.map((d) => metricasDisparo(d).geral)); const i = instSomar(is);
  const z = czSomar(zs.map(czMetricas)); const c = cmTotais(cs);
  return { f, i, c, z, ds, is, cs, zs, enviados: f.enviados + i.env + c.env + z.enviados, respostas: f.respostas + i.respostas + c.respostas + z.respostas, orcamentos: f.pedidos + i.orcamentos + c.orcamentos + z.orcamentos };
}
/* Meses que têm algum disparo, do mais recente para o mais antigo. */
function mesesGeral() {
  const set = new Set(); const add = (dt) => { if (dt) set.add(String(dt).slice(0, 7)); };
  state.disparos.forEach((d) => add(dataEnvio(d))); state.inst.forEach((d) => add(d.data_disparo)); state.cm.forEach((d) => add(d.data_disparo)); state.cz.forEach((d) => add(d.data));
  return [...set].sort().reverse();
}
const mesAnterior = (m) => { const [y, mm] = m.split("-").map(Number); const d = new Date(y, mm - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
/* Comparação com o mês anterior: diferença em número, com seta. */
const compara = (v, ant, nomeAnt) => { const d = v - ant;
  return `<span class="delta"><i class="ti ${d > 0 ? "ti-trending-up" : d < 0 ? "ti-trending-down" : "ti-equal"}" aria-hidden="true"></i>${d > 0 ? "+" + d : d < 0 ? d : "igual"} vs ${nomeAnt}</span>`; };
/* As quatro frentes em uma linha cada: para quem, canal e o que medimos. */
const RESUMO_FRENTES = [
  ["fidelizacao", "Leads que já cotaram na plataforma", "E-mail e WhatsApp", "Respostas, interessados e orçamentos"],
  ["institucional", "Uma base escolhida por segmento", "E-mail", "% lido, respostas e orçamentos"],
  ["coldmail", "Leads que já cotaram na plataforma", "E-mail que cita o fornecedor", "% lido, respostas e orçamentos"],
  ["coldzap", "20 a 30 leads de cada cold mail", "WhatsApp, enviado à mão", "Enviados, respostas e orçamentos"],
];
/* O que falta enviar, lançar ou conferir, calculado a partir dos dados. Alertas (números que não fecham) vêm primeiro. */
function pendencias() {
  const p = [];
  state.disparos.filter((d) => !d.manual && !d.enviado_em).forEach((d) => { const pa = state.pastas.find((x) => x.id === d.pasta);
    p.push({ ic: "ti-hourglass", t: `${pa ? pa.nome + " · " : ""}${d.nome}: aguardando envio`, s: `${metricasDisparo(d).geral.total} leads preparados em ${fmtData(d.data)}`, ir: `disparo:${d.id}` }); });
  state.disparos.filter((d) => (d.manual ? !!dataEnvio(d) && !!num(d.base_limpa_email) : d.enviado_em) && !(d.bm && +d.bm.enviados)).forEach((d) =>
    p.push({ ic: "ti-mail", t: `${d.nome}: lançar os números do BillionMail`, s: "Enviados, entregues, abertos, cliques e bounce", ir: `disparo:${d.id}` }));
  state.cz.forEach((d) => { const m = czMetricas(d);
    const sz = czSituacao(d, m);
    if (sz.k === "atrasado") p.push({ ic: "ti-brand-whatsapp", alerta: true, t: `${d.empresa}: WhatsApp atrasado, ${m.pendentes} lead(s) sem envio`, s: `Disparo marcado para ${fmtData(d.data)}`, ir: `czd:${d.id}` });
    if (sz.k === "hoje") p.push({ ic: "ti-brand-whatsapp", t: `${d.empresa}: disparo de WhatsApp hoje, ${m.pendentes} lead(s) sem envio`, s: "Marque o envio conforme mandar", ir: `czd:${d.id}` });
    if (m.orcamentos > m.respostas) p.push({ ic: "ti-alert-triangle", alerta: true, t: `${d.empresa}: ${m.orcamentos} orçamento(s) com ${m.respostas} resposta(s) marcada(s)`, s: "Marque a resposta dos leads que viraram orçamento", ir: `czd:${d.id}` });
  });
  if (state.czOk) {
    const semEnvio = {}; state.czLeads.forEach((l) => { if (l.status && l.status !== "aguardando" && l.envio !== "enviado") semEnvio[l.disparo] = (semEnvio[l.disparo] || 0) + 1; });
    Object.entries(semEnvio).forEach(([id, n]) => { const d = state.cz.find((x) => x.id === id);
      if (d) p.push({ ic: "ti-alert-triangle", alerta: true, t: `${d.empresa}: ${n} resposta(s) em lead sem envio marcado`, s: "Marque o envio para a resposta contar no resultado", ir: `czd:${id}` }); });
  }
  state.cm.filter((d) => cmSituacao(d).k === "sem_metricas").forEach((d) => p.push({ ic: "ti-mail-forward", t: `${String(d.empresa || "").trim()} (${baseNome(d).toLowerCase()}): lançar os números do BillionMail`, s: `Cold mail enviado em ${fmtData(d.data_disparo)}`, ir: `cmf:${normChave(d.chave) || "sem-id:" + String(d.empresa || "").trim().toLowerCase()}` }));
  state.inst.filter((d) => d.data_disparo && !(d.bm && +d.bm.enviados)).forEach((d) =>
    p.push({ ic: "ti-building", t: `${d.segmento || "Institucional"}: lançar os números do BillionMail`, s: `Disparo de ${fmtData(d.data_disparo)}`, ir: `inst:${d.id}` }));
  return p.sort((a, b) => (b.alerta ? 1 : 0) - (a.alerta ? 1 : 0));
}
/* Linha do tempo: o que foi preparado e enviado, do mais recente para o mais antigo. */
function atividades() {
  const ev = [];
  state.disparos.forEach((d) => { const pa = state.pastas.find((x) => x.id === d.pasta)?.nome || "Reativação";
    if (d.manual) { if (d.data) ev.push({ data: d.data, cls: "fid", t: `${pa} · ${d.nome} ${d.data > hojeLocal() ? "programado" : "enviado"}`, s: `Reativação · ${VISOES[visaoDe(d)].nome.toLowerCase()}${d.segmento ? " · " + d.segmento : ""}`, ir: `disparo:${d.id}` }); return; }
    if (d.enviado_em) ev.push({ data: d.enviado_em, cls: "fid", t: `${pa} · ${d.nome} enviado`, s: `Reativação · ${metricasDisparo(d).geral.total} leads`, ir: `disparo:${d.id}` });
    if (d.data) ev.push({ data: d.data, cls: "fid", t: `${pa} · ${d.nome} preparado`, s: `Reativação · ${metricasDisparo(d).geral.total} leads`, ir: `disparo:${d.id}` }); });
  state.cz.forEach((d) => { const m = czMetricas(d); const k = czSituacao(d, m).k;
    ev.push({ data: d.data, cls: "cz", t: `WhatsApp ${k === "disparado" ? "disparado" : k === "programado" ? "programado" : k === "hoje" ? "de hoje" : "atrasado"}: ${d.empresa}`, s: `ColdZap · ${m.total} leads${m.pendentes ? ` · ${m.pendentes} sem envio` : ""}`, ir: `czd:${d.id}` }); });
  state.cm.forEach((d) => { if (d.data_disparo) ev.push({ data: d.data_disparo, cls: "cm", t: `Cold mail ${d.data_disparo > hojeLocal() ? "programado" : "enviado"}: ${String(d.empresa || "").trim()}`, s: `Cold mail · ${baseNome(d).toLowerCase()}${num(d.base_limpa) != null ? " · " + num(d.base_limpa) + " e-mails" : ""}`, ir: `cmf:${normChave(d.chave) || "sem-id:" + String(d.empresa || "").trim().toLowerCase()}` }); });
  state.inst.forEach((d) => { const dt = d.data_disparo || d.data_solicitacao; if (dt) ev.push({ data: dt, cls: "inst", t: `${d.data_disparo ? "Disparo" : "Pedido"} institucional: ${d.segmento || "sem segmento"}`, s: `Institucional${d.solicitante ? " · " + d.solicitante : ""}`, ir: `inst:${d.id}` }); });
  return ev.filter((e) => e.data).sort((a, b) => b.data.localeCompare(a.data));
}
const linhaTempo = (ev) => ev.length ? `<ol class="linha-tempo">${ev.map((e) => `<li class="${e.cls}"><span class="quando">${fmtData(e.data).slice(0, 5)}</span><span class="ponto" aria-hidden="true"></span>
  <div class="oque"><button type="button" class="linkbtn" style="text-decoration:none;color:var(--ink);font-weight:600" data-ir="${esc(e.ir)}">${esc(e.t)}</button><span>${esc(e.s)}</span></div></li>`).join("")}</ol>` : `<p class="note">Nada registrado ainda.</p>`;

/* ---------- Visão geral ---------- */
/* Orçamentos por mês (até 6 meses com disparo), uma barra por mês dividida pelas frentes. Clicar num mês filtra a página. */
function evolucao(mesSel) {
  const ms = mesesGeral().slice(0, 6).reverse(); if (!ms.length) return "";
  const ordem = ["fidelizacao", "institucional", "coldmail", "coldzap"];
  const dados = ms.map((m) => { const t = totaisFrentes(m);
    return { m, total: t.orcamentos, resp: t.respostas, partes: [t.f.pedidos, t.i.orcamentos, t.c.orcamentos, t.z.orcamentos] }; });
  const max = Math.max(1, ...dados.map((d) => d.total));
  const rot = (m) => { const [y, mm] = m.split("-"); const n = MESES[+mm - 1]; return `${n[0].toUpperCase()}${n.slice(1, 3)}/${y.slice(2)}`; };
  const linhas = dados.map((d) => `<button type="button" class="evo-linha${mesSel === d.m ? " sel" : ""}" data-geral-mes="${d.m}" aria-pressed="${mesSel === d.m}" title="${nomeMes(d.m)}: ${d.total} orçamento(s) e ${d.resp} resposta(s). Clique para ver só este mês.">
      <span class="evo-mes">${rot(d.m)}</span>
      <span class="evo-trilho" aria-hidden="true"><span class="evo-barra" style="width:${d.total ? Math.max(1.5, (d.total / max) * 100) : 0}%">${d.partes.map((v, i) => v > 0 ? `<span class="${FRENTES_INFO[ordem[i]].cls}" style="flex:${v}"></span>` : "").join("")}</span></span>
      <span class="evo-total">${d.total}</span></button>`).join("");
  const melhor = dados.reduce((a, d) => (d.total > a.total ? d : a), dados[0]);
  return painel("h-evo", "ti-chart-bar", `Orçamentos por mês ${ajuda("Soma das quatro frentes, contada no mês do disparo. Cada cor é uma frente. Clique num mês para ver a página só com ele; clique de novo para voltar a todos.")}`,
    dados.length > 1 ? `Últimos ${dados.length} meses com disparo` : "O histórico cresce a cada mês",
    `<div class="evo"><div class="evo-linhas" role="group" aria-label="Orçamentos por mês">${linhas}</div>
      <div class="evo-rodape"><div class="evo-leg">${ordem.map((k) => `<span class="${FRENTES_INFO[k].cls}"><i aria-hidden="true"></i>${FRENTES_INFO[k].nome}</span>`).join("")}</div>
      ${melhor.total ? `<span class="note">Melhor mês: <b>${nomeMes(melhor.m)}</b>, com ${melhor.total} orçamento(s)</span>` : ""}</div></div>`);
}
function telaGeral() {
  cab("Visão geral", "");
  const mes = state.geralMes; const meses = mesesGeral();
  const t = totaisFrentes(mes); const { f, i, c, z } = t; const nForn = cmFornecedores(t.cs).length;
  const nDisp = t.ds.length + t.is.length + t.cs.length + t.zs.length;
  const ant = mes ? totaisFrentes(mesAnterior(mes)) : null; const nomeAnt = mes ? MESES[+mesAnterior(mes).slice(5) - 1] : "";
  const nAnt = ant ? ant.ds.length + ant.is.length + ant.cs.length + ant.zs.length : 0;
  const cmp = (v, va) => (ant ? (nAnt ? compara(v, va, nomeAnt) : `<span class="delta">sem disparos em ${nomeAnt}</span>`) : "");
  const hs = (ic, l, v, s, extra = "", cls = "") => `<div class="hero-stat${cls ? " " + cls : ""}"><span class="l"><i class="ti ${ic}" aria-hidden="true"></i>${l}</span><span class="v">${v}</span><span class="s">${s}</span>${extra}</div>`;
  const pend = pendencias(); const mostra = pend.slice(0, 6);
  const mini = (itens) => `<div class="mini">${itens.map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>`;
  const frente = (k, n, itens, extra) => { const fi = FRENTES_INFO[k]; return `<section class="frente ${fi.cls}" aria-labelledby="fr-${k}">
    <div class="frente-top"><span class="ico-frente" aria-hidden="true"><i class="ti ${fi.ico}"></i></span><div><b id="fr-${k}">${fi.nome}</b><span>${fi.sub} · ${n}</span></div></div>
    ${mini(itens)}${extra || ""}
    <button type="button" class="abrir" data-ir="${fi.destino}">Abrir ${fi.nome} <i class="ti ti-arrow-right" aria-hidden="true"></i></button></section>`; };
  return `<div class="pilha">
    <div class="acoes periodo">
      <label for="geralMes" class="note" style="display:flex;gap:8px;align-items:center"><i class="ti ti-calendar-month" aria-hidden="true" style="font-size:17px"></i>Período <select id="geralMes"><option value="">Todos os meses</option>${meses.map((m) => `<option value="${m}"${mes === m ? " selected" : ""}>${nomeMes(m)}</option>`).join("")}</select></label>
      ${ajuda(mes ? `Disparos que saíram em ${nomeMes(mes).toLowerCase()}, comparados com ${nomeAnt}. Respostas e orçamentos contam no mês do disparo.` : "Tudo desde o primeiro disparo. Escolha um mês para ver só ele e comparar com o mês anterior.")}
      <div class="baixar-geral"><span class="note" id="geralMsg" aria-live="polite"></span>
        ${state.downloads && window.ExcelJS ? `<button type="button" class="btn secundario" data-geral-baixar title="Planilha com todas as frentes e canais${mes ? " de " + nomeMes(mes).toLowerCase() : ""}, mais a comparação mês a mês"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i>Baixar dados (Excel)</button>` : ""}
        <button type="button" class="btn secundario" data-geral-pdf title="Abre a impressão do navegador: escolha Salvar como PDF"><i class="ti ti-file-type-pdf" aria-hidden="true"></i>Salvar em PDF</button></div>
    </div>
    <section class="hero" aria-labelledby="h-hero">
      <div class="hero-txt"><span class="eyebrow"><i class="ti ti-activity" aria-hidden="true"></i>Growth · disparos ao vivo${mes ? " · " + nomeMes(mes) : ""}</span>
        <h2 id="h-hero">Reativação de leads e geração de orçamentos para os fornecedores ${ajuda("Acompanhamento consolidado das quatro frentes: Reativação (leads que já cotaram), Institucional (disparos por segmento), Cold mail (carta por fornecedor) e ColdZap (WhatsApp do cold mail).")}</h2></div>
      <div class="hero-stats">
        ${hs("ti-stack-2", "Disparos e listas", nDisp, `${t.ds.length} reativação · ${t.is.length} institucional · ${t.cs.length} cold mail · ${t.zs.length} ColdZap`, cmp(nDisp, nAnt))}
        ${hs("ti-send", "Mensagens enviadas", t.enviados, "e-mail e WhatsApp somados", cmp(t.enviados, ant?.enviados))}
        ${hs("ti-message-circle", "Respostas", t.respostas, `${br(pct(t.respostas, t.enviados))}% das enviadas`, cmp(t.respostas, ant?.respostas))}
        ${hs("ti-file-invoice", "Orçamentos gerados", t.orcamentos, t.respostas ? `${br(pct(t.orcamentos, t.respostas))}% das respostas` : "marcados nas listas", cmp(t.orcamentos, ant?.orcamentos), "destaque")}
      </div>
      <div class="hero-acoes"><button type="button" class="btn claro" data-ir="estrategia"><i class="ti ti-route" aria-hidden="true"></i>Entender a estratégia</button></div>
    </section>
    <div class="grade-2">
      ${painel("h-fc", "ti-filter", `Funil consolidado ${ajuda("Cold mail e ColdZap são canais separados da mesma campanha: a base de cada fornecedor é dividida, com 20 a 30 leads pelo WhatsApp (ColdZap) e o restante pelo e-mail (Cold mail).")}`, mes ? `As quatro frentes · ${nomeMes(mes)}` : "As quatro frentes somadas", funil([
        { nome: "Enviadas", icone: "ti-send", v: t.enviados }, { nome: "Respostas", icone: "ti-message-circle", v: t.respostas }, { nome: "Orçamentos", icone: "ti-file-invoice", v: t.orcamentos },
      ]) + `<div class="tbl-wrap"><table><thead><tr><th>Frente</th><th class="num">Enviadas</th><th class="num">Respostas</th><th class="num">Orçamentos</th></tr></thead><tbody>
        <tr><td><b>Reativação</b></td><td class="num">${f.enviados}</td><td class="num">${f.respostas}</td><td class="num">${f.pedidos}</td></tr>
        <tr><td><b>Institucional</b></td><td class="num">${i.env}</td><td class="num">${i.respostas}</td><td class="num">${i.orcamentos}</td></tr>
        <tr><td><b>Cold mail</b></td><td class="num">${c.env}</td><td class="num">${c.respostas}</td><td class="num">${c.orcamentos}</td></tr>
        <tr><td><b>ColdZap</b></td><td class="num">${z.enviados}</td><td class="num">${z.respostas}</td><td class="num">${z.orcamentos}</td></tr></tbody></table></div>`)}
      ${painel("h-pend", "ti-checklist", "Pendências", pend.length ? `${pend.length} item(ns)` : "", mostra.length ? `<ul class="pendencias">${mostra.map((x) => `<li class="${x.alerta ? "alerta" : ""}"><span class="pi" aria-hidden="true"><i class="ti ${x.ic}"></i></span><div><button type="button" data-ir="${esc(x.ir)}">${esc(x.t)}</button><span>${esc(x.s)}</span></div></li>`).join("")}</ul>${pend.length > mostra.length ? `<p class="note">E mais ${pend.length - mostra.length}.</p>` : ""}`
        : `<p class="note" style="display:flex;gap:8px;align-items:center"><i class="ti ti-circle-check" style="color:var(--ok);font-size:18px" aria-hidden="true"></i>Nada pendente agora.</p>`)}
    </div>
    ${evolucao(mes)}
    ${secao("h-fr", "ti-layout-columns", `As quatro frentes ${ajuda("Clique numa frente para ver os disparos e marcar as respostas.")}`, mes ? nomeMes(mes) : "", `<div class="frentes">
      ${frente("fidelizacao", `${t.ds.length} disparo(s)`, [["Enviados", f.enviados], ["Responderam", f.respostas], ["Interessados", f.interessados], ["Orçamentos", f.pedidos]],
        progresso([["Enviados", f.enviados, "seg-ok"], ["Aguardando envio", Math.max(0, f.total - f.enviados), "seg-neutro"]], f.total))}
      ${frente("institucional", `${t.is.length} disparo(s)`, [["Entregues", i.entregues], ["% lido", `${br(pct(i.abertos, i.entregues))}%`], ["Respostas", i.respostas], ["Orçamentos", i.orcamentos]])}
      ${frente("coldmail", `${nForn} fornecedor(es)`, [["Entregues", c.entregues], ["% lido", `${br(pct(c.abertos, c.entregues))}%`], ["Respostas", c.respostas], ["Orçamentos", c.orcamentos]])}
      ${frente("coldzap", `${t.zs.length} lista(s)`, [["Enviados", z.enviados], ["Número não existe", z.nao_existe], ["Responderam", z.respostas], ["Orçamentos", z.orcamentos]], czProgresso(z))}
    </div>`)}
    <div class="grade-2 igual">
      ${painel("h-lt", "ti-timeline-event", "Linha do tempo", "Mais recentes primeiro", linhaTempo(atividades().slice(0, 8)))}
      ${painel("h-cf", "ti-route", "Como funciona", "As quatro frentes em resumo", `<ul class="resumo-frentes">${RESUMO_FRENTES.map(([k, quem, canal, medida]) => { const fi = FRENTES_INFO[k];
        return `<li class="${fi.cls}"><span class="pi" aria-hidden="true"><i class="ti ${fi.ico}"></i></span><div><button type="button" class="linkbtn" data-ir="${fi.destino}">${fi.nome}</button>
          <dl><div><dt>Para quem</dt><dd>${quem}</dd></div><div><dt>Canal</dt><dd>${canal}</dd></div><div><dt>O que medimos</dt><dd>${medida}</dd></div></dl></div></li>`; }).join("")}</ul>
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
  const partes = [["e-porque", "ti-target-arrow", "Objetivo"], ["e-frentes", "ti-layout-columns", "As quatro frentes"], ["e-visoes", "ti-arrows-split", "As duas visões"], ["e-caminho", "ti-route", "O caminho de um disparo"]];
  if (e.classes?.length) partes.push(["e-classes", "ti-users-group", "Quem recebe o quê"]);
  if (comMatriz.length) partes.push(["e-oferta", "ti-target", "O que oferecer"]);
  if (e.regras?.length) partes.push(["e-regras", "ti-checklist", "Diretrizes"]);
  partes.push(["e-numeros", "ti-book", "Como ler os números"]);
  const agora = {
    fidelizacao: [[t.f.enviados, "enviados"], [t.f.respostas, "respostas"], [t.f.pedidos, "orçamentos"]],
    institucional: [[t.i.n, "disparos"], [t.i.respostas, "respostas"], [t.i.orcamentos, "orçamentos"]],
    coldmail: [[t.c.n, "envios"], [t.c.respostas, "respostas"], [t.c.orcamentos, "orçamentos"]],
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
    ${secao("e-frentes", "ti-layout-columns", "As quatro frentes", "Cada frente tem um público, um canal e uma forma de medir", `<div class="comparativo">${comp}</div>`)}
    ${secao("e-visoes", "ti-arrows-split", "As duas visões da Reativação", "Todo disparo de reativação segue uma delas", `<div class="frentes">${cardVisao("produto")}${cardVisao("necessidade")}</div>`)}
    ${secao("e-caminho", "ti-route", "O caminho de um disparo", "Da escolha da visão ao resultado", `<div class="painel"><ol class="passos" style="list-style:none;margin:0;padding:0">${passos.map((p, n) => `<li class="passo"><span class="n" aria-hidden="true"><i class="ti ${p.icone || "ti-point"}"></i></span><span class="eyebrow">Passo ${n + 1}</span><h3>${esc(p.titulo)}</h3><p>${esc(p.texto)}</p></li>`).join("")}</ol></div>`)}
    ${e.classes?.length ? secao("e-classes", "ti-users-group", "Quem recebe o quê", "Todo lead é avaliado antes de qualquer mensagem" + (ref ? ` · números do ${ref}` : ""), `<div class="classes">${e.classes.map((c) => { const k = String(c.classe || "").toUpperCase(); const n = contagem ? contagem[k] : null;
      return `<div class="classe cl-${esc(k.toLowerCase())}"><div style="display:flex;gap:12px;align-items:center"><span class="letra" aria-hidden="true"${k.length > 1 ? ' style="font-size:12px"' : ""}>${esc(c.classe)}</span><div><h3>${k.length > 1 ? "" : "Classe " + esc(c.classe) + " · "}${esc(c.nome || "")}</h3>${n != null ? `<span class="qtd-cl">${n} lead(s)</span>` : ""}</div></div>
        <p class="note">${esc(c.quem || "")}</p><div class="canal-cl"><i class="ti ti-send" aria-hidden="true"></i><span>${esc(c.canal || "")}</span></div></div>`; }).join("")}</div>`) : ""}
    ${comMatriz.length ? secao("e-oferta", "ti-target", "O que oferecer", "Por produto e por segmento, em cada pasta", `<div class="pilha">${comMatriz.map((p) => `${p.estrategia?.length ? `<h3 class="sub-oferta"><i class="ti ${VISOES.produto.ico}" aria-hidden="true"></i>${esc(p.nome)} · por produto</h3>${matrizProduto(p)}` : ""}${p.necessidade?.length ? `<h3 class="sub-oferta"><i class="ti ${VISOES.necessidade.ico}" aria-hidden="true"></i>${esc(p.nome)} · por segmento</h3>${matrizNecessidade(p)}` : ""}`).join("")}</div>`) : ""}
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
  if ((r.tipo === "cm" || r.tipo === "cm-novo") && $("cmForm")) return;
  if ((r.tipo === "fid-novo" || r.tipo === "fid-editar") && $("fidForm")) return;
  if ((r.tipo === "cz-nova" || r.tipo === "cz-editar") && $("czForm")) return;
  if (a.startsWith("obs-") || a.startsWith("czobs-")) return;
  if (a === "busca") return renderLeadsSomente();
  if (a === "czbusca") return renderCzLeads();
  if (a === "cmBusca") return renderCmLista();
  if (a === "czBuscaLista") return renderCzLista();
  if (a === "instBusca") return renderInstLista();
  render();
}

/* ---------- gravação (reativação) ---------- */
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
      const w2 = XLSX.utils.aoa_to_sheet([["Lead ID", "Nome", "Empresa", "E-mail", "Telefone", "Produto na plataforma", "Data da cotação", "Cotações no período", "Destino", "Motivo (se ficou fora)", "O que pediu"],
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
  const doMes = state.disparos.filter((d) => dataEnvio(d).startsWith(mes));
  const mm = doMes.map((d) => ({ d, m: metricasDisparo(d) }));
  const tot = { geral: somar(mm.map((x) => x.m.geral)), email: somar(mm.map((x) => x.m.email)), whatsapp: somar(mm.map((x) => x.m.whatsapp)) };
  const resp = state.leads.filter((l) => (l.respondido_em || "").startsWith(mes));
  const wb = XLSX.utils.book_new();
  aba(wb, "Resumo", [
    [`Relatório de reativação · ${nomeMes(mes)}`], [`Gerado em ${new Date().toLocaleDateString("pt-BR")}`], [],
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
      const v = VISOES[visaoDe(d)].nome; const e = fmtData(dataEnvio(d));
      return [[p, d.nome, v, e, "Total", ...linhaM(m.geral)], [p, d.nome, v, e, "E-mail", ...linhaM(m.email)], [p, d.nome, v, e, "WhatsApp", ...linhaM(m.whatsapp)]]; })],
    [16, 16, 16, 12, 10, 10, 12, 10, 12, 10, 16, 14]);
  if (state.leadsOk) aba(wb, "Respostas do mês", [["Data da resposta", "Pasta", "Disparo", "Empresa", "Nome", "E-mail", "Canal", "Resposta", "Orçamento gerado", "Observação"],
    ...resp.sort((a, b) => a.respondido_em.localeCompare(b.respondido_em)).map((l) => { const d = state.disparos.find((x) => x.id === l.disparo) || {};
      return [fmtData(l.respondido_em), state.pastas.find((p) => p.id === d.pasta)?.nome || "", d.nome || "", l.empresa, l.nome, l.email, l.canal === "whatsapp" ? "WhatsApp" : "E-mail", STATUS[l.status], l.pedido_cadastrado ? "Sim" : "Não", l.obs || ""]; })],
    [14, 12, 12, 30, 16, 32, 10, 16, 16, 40]);
  await salvarXlsx(wb, `Relatório de reativação - ${nomeMes(mes)}.xlsx`, "relMsg");
  btn.disabled = false;
}

/* ---------- Visão geral: baixar os dados de todas as frentes e canais (Excel) e salvar a página com os gráficos (PDF) ---------- */
/* Uma linha por frente e canal no período (mes vazio = todos os meses). Entregues, abertos e cliques só existem no e-mail. */
function linhasFrentes(mes) {
  const t = totaisFrentes(mes);
  const fe = somar(t.ds.map((d) => metricasDisparo(d).email)); const fw = somar(t.ds.map((d) => metricasDisparo(d).whatsapp));
  const bms = t.ds.map(funilBm).filter((f) => f.env);
  const sb = (k) => (bms.length ? bms.reduce((a, f) => a + (f[k] || 0), 0) : null);
  return [
    { frente: "Reativação", canal: "E-mail", n: t.ds.length, env: fe.enviados, ent: sb("entregues"), ab: sb("abertos"), cl: sb("cliques"), resp: fe.respostas, orc: fe.pedidos },
    { frente: "Reativação", canal: "WhatsApp", n: t.ds.length, env: fw.enviados, resp: fw.respostas, orc: fw.pedidos },
    { frente: "Institucional", canal: "E-mail", n: t.is.length, env: t.i.env, ent: t.i.entregues, ab: t.i.abertos, cl: t.i.cliques, resp: t.i.respostas, orc: t.i.orcamentos },
    { frente: "Cold mail", canal: "E-mail", n: t.cs.length, env: t.c.env, ent: t.c.entregues, ab: t.c.abertos, cl: t.c.cliques, resp: t.c.respostas, orc: t.c.orcamentos },
    { frente: "ColdZap", canal: "WhatsApp", n: t.zs.length, env: t.z.enviados, resp: t.z.respostas, orc: t.z.orcamentos },
  ];
}
const taxa = (a, b) => (b && a != null ? a / b : null);
const somaLinhas = (ls, frente, canal) => { const s = (k) => { const v = ls.map((l) => l[k]).filter((x) => x != null); return v.length ? v.reduce((a, x) => a + x, 0) : null; };
  return { frente, canal, n: s("n"), env: s("env"), ent: s("ent"), ab: s("ab"), cl: s("cl"), resp: s("resp"), orc: s("orc") }; };
const CAB_FRENTE = ["Frente", "Canal", "Disparos ou listas", "Enviados", "Entregues", "Abertos", "Cliques", "Respostas", "Orçamentos", "% entrega", "% abertura", "CTR", "% resposta", "% orçamento / resposta", "% orçamento / enviado"];
const valoresFrente = (l) => [l.frente, l.canal, l.n, l.env, l.ent ?? null, l.ab ?? null, l.cl ?? null, l.resp, l.orc,
  taxa(l.ent, l.env), taxa(l.ab, l.ent), taxa(l.cl, l.ent), taxa(l.resp, l.ent || l.env), taxa(l.orc, l.resp), taxa(l.orc, l.ent || l.env)];

async function baixarDadosGeral(btn) {
  const msg = $("geralMsg"); btn.disabled = true; if (msg) msg.textContent = "Gerando a planilha…";
  try {
    const mes = state.geralMes; const periodo = mes ? nomeMes(mes) : "Todos os meses";
    const meses = mesesGeral().slice().reverse();
    const wb = new ExcelJS.Workbook(); wb.creator = "Painel de Disparos · Growth";
    const AZUL = "FF012F73", CINZA = "FFEEF2F7";
    const FMT_PCT = "0.0%";
    /* cabeçalho em azul, linha congelada, filtro, larguras e % formatado */
    const tabela = (ws, linhaCab, cab, larguras, colsPct) => {
      const r = ws.getRow(linhaCab); r.values = cab; r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.alignment = { vertical: "middle", wrapText: true }; r.height = 30;
      cab.forEach((_, i) => { r.getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; });
      ws.views = [{ state: "frozen", ySplit: linhaCab }]; ws.autoFilter = { from: { row: linhaCab, column: 1 }, to: { row: linhaCab, column: cab.length } };
      larguras.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      (colsPct || []).forEach((c) => { ws.getColumn(c).numFmt = FMT_PCT; });
    };
    const barras = (ws, col, de, ate, cor) => { if (ate < de) return; const L = ws.getColumn(col).letter;
      try { ws.addConditionalFormatting({ ref: `${L}${de}:${L}${ate}`, rules: [{ type: "dataBar", cfvo: [{ type: "min" }, { type: "max" }], color: { argb: cor }, gradient: false }] }); } catch (e) {} };
    const titulo = (ws, txt, sub) => { ws.getCell("A1").value = txt; ws.getCell("A1").font = { bold: true, size: 14, color: { argb: AZUL } }; ws.getCell("A2").value = sub; ws.getCell("A2").font = { color: { argb: "FF5F6F86" } }; };
    const gerado = `Gerado em ${new Date().toLocaleDateString("pt-BR")} · ${periodo}`;

    /* 1. Resumo do período: cada frente e canal, e os totais por canal */
    const lf = linhasFrentes(mes);
    const tot = [somaLinhas(lf.filter((l) => l.canal === "E-mail"), "Total", "E-mail"), somaLinhas(lf.filter((l) => l.canal === "WhatsApp"), "Total", "WhatsApp"), somaLinhas(lf, "Total", "E-mail e WhatsApp")];
    tot[2].n = lf.reduce((a, l, i) => a + (i === 1 ? 0 : l.n || 0), 0); /* a Reativação conta uma vez só */
    tot[2].ent = tot[2].ab = tot[2].cl = null; /* entrega, abertura e cliques só existem no e-mail (ver a linha Total · E-mail) */
    const r1 = wb.addWorksheet("Resumo"); titulo(r1, "Painel de Disparos · resumo por frente e canal", gerado);
    tabela(r1, 4, CAB_FRENTE, [16, 12, 11, 11, 11, 11, 10, 11, 11, 10, 10, 9, 10, 13, 13], [10, 11, 12, 13, 14, 15]);
    lf.forEach((l) => r1.addRow(valoresFrente(l)));
    tot.forEach((l) => { const r = r1.addRow(valoresFrente(l)); r.font = { bold: true }; r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } }; }); });
    barras(r1, 9, 5, 4 + lf.length, "FF7C3AED"); barras(r1, 13, 5, 4 + lf.length, "FF0D9488");
    r1.addRow([]); r1.addRow(["Como ler: e-mail e WhatsApp são canais separados (os 20 a 30 leads de cada cold mail vão pelo WhatsApp, no ColdZap). Respostas e orçamentos contam no mês do disparo."]).font = { italic: true, color: { argb: "FF5F6F86" } };

    /* 2. Canais por mês: e-mail x WhatsApp lado a lado */
    const r2 = wb.addWorksheet("Canais por mês"); titulo(r2, "E-mail x WhatsApp, mês a mês", gerado.replace(` · ${periodo}`, " · todos os meses"));
    tabela(r2, 4, ["Mês", "E-mail · enviados", "E-mail · respostas", "E-mail · orçamentos", "E-mail · % resposta", "WhatsApp · enviados", "WhatsApp · respostas", "WhatsApp · orçamentos", "WhatsApp · % resposta", "Total de orçamentos"],
      [16, 13, 13, 13, 12, 13, 13, 13, 13, 13], [5, 9]);
    meses.forEach((m) => { const ls = linhasFrentes(m); const e = somaLinhas(ls.filter((l) => l.canal === "E-mail")); const w = somaLinhas(ls.filter((l) => l.canal === "WhatsApp"));
      r2.addRow([nomeMes(m), e.env, e.resp, e.orc, taxa(e.resp, e.ent || e.env), w.env, w.resp, w.orc, taxa(w.resp, w.env), (e.orc || 0) + (w.orc || 0)]); });
    barras(r2, 10, 5, 4 + meses.length, "FF1C51A0");

    /* 3. Frentes por mês: uma linha por mês, frente e canal (boa para tabela dinâmica e gráficos) */
    const r3 = wb.addWorksheet("Frentes por mês"); titulo(r3, "Frentes por mês", "Uma linha por mês, frente e canal: use filtros, tabela dinâmica ou gráficos do Excel");
    tabela(r3, 4, ["Mês", ...CAB_FRENTE], [16, 16, 12, 11, 11, 11, 11, 10, 11, 11, 10, 10, 9, 10, 13, 13], [11, 12, 13, 14, 15, 16]);
    meses.forEach((m) => linhasFrentes(m).forEach((l) => r3.addRow([nomeMes(m), ...valoresFrente(l)])));

    /* 4. Cold mail por fornecedor (e-mail) com o WhatsApp da mesma base ao lado */
    const t = totaisFrentes(mes);
    const r4 = wb.addWorksheet("Cold mail"); titulo(r4, "Cold mail por fornecedor", gerado);
    tabela(r4, 4, ["Fornecedor", "ID do cliente", "Produto", "Último envio", "Envios", "Base limpa", "Enviados", "Entregues", "% abertura", "Cliques", "CTR", "Respostas", "Orçamentos", "% orçamento / resposta", "WhatsApp · enviados", "WhatsApp · respostas", "WhatsApp · orçamentos"],
      [30, 14, 30, 12, 8, 10, 10, 10, 10, 9, 8, 10, 11, 13, 12, 12, 12], [9, 11, 14]);
    const forns = cmFornecedores(t.cs);
    forns.forEach((f) => { const z = f.cz ? czMetricas(f.cz) : null;
      r4.addRow([f.empresa, f.chave, f.produto, f.ultima ? fmtData(f.ultima) : "", f.envios.length, f.s.limpa, f.s.env, f.s.entregues, taxa(f.s.abertos, f.s.entregues), f.s.cliques, taxa(f.s.cliques, f.s.entregues),
        f.resp, f.orc, taxa(f.orc, f.resp), z ? z.enviados : null, z ? z.respostas : null, z ? z.orcamentos : null]); });
    barras(r4, 13, 5, 4 + forns.length, "FF7C3AED");

    /* 5. ColdZap por lista */
    const r5 = wb.addWorksheet("ColdZap"); titulo(r5, "ColdZap (WhatsApp do cold mail) por lista", gerado);
    tabela(r5, 4, ["Fornecedor", "ID do cliente", "Produto", "Data do disparo", "Leads", "Enviados", "Número não existe", "Responderam", "Interessados", "Orçamentos", "% resposta", "% orçamento / resposta"],
      [30, 14, 30, 12, 8, 10, 12, 12, 12, 11, 10, 13], [11, 12]);
    t.zs.forEach((d) => { const m = czMetricas(d);
      r5.addRow([d.empresa, String(d.chave || "").replace(/\.0$/, ""), d.produto || "", d.data ? fmtData(d.data) : "", m.total, m.enviados, m.nao_existe, m.respostas, m.interessados, m.orcamentos, taxa(m.respostas, m.enviados), taxa(m.orcamentos, m.respostas)]); });
    barras(r5, 10, 5, 4 + t.zs.length, "FF0D9488");

    /* 6. Institucional por disparo */
    const r6 = wb.addWorksheet("Institucional"); titulo(r6, "Institucional por disparo", gerado);
    tabela(r6, 4, ["Segmento", "Data do disparo", "Base limpa", "Enviados", "Entregues", "% abertura", "Cliques", "CTR", "Respostas", "Orçamentos", "% orçamento / resposta"], [30, 13, 11, 10, 10, 10, 9, 8, 10, 11, 13], [6, 8, 11]);
    t.is.forEach((d) => { const s = instCalc(d); r6.addRow([d.segmento || d.nome || "", d.data_disparo ? fmtData(d.data_disparo) : "", s.limpa, s.env, s.entregues, taxa(s.abertos, s.entregues), s.cliques, taxa(s.cliques, s.entregues), s.respostas, s.orcamentos, taxa(s.orcamentos, s.respostas)]); });

    /* 7. Reativação por disparo e canal */
    const r7 = wb.addWorksheet("Reativação"); titulo(r7, "Reativação por disparo e canal", gerado);
    tabela(r7, 4, ["Pasta", "Disparo", "Visão", "Enviado em", "Canal", "Enviados", "Responderam", "% resposta", "Interessados", "Orçamentos", "% orçamento / resposta"], [16, 22, 16, 12, 10, 10, 12, 10, 12, 11, 13], [8, 11]);
    t.ds.forEach((d) => { const m = metricasDisparo(d); const p = state.pastas.find((x) => x.id === d.pasta)?.nome || ""; const v = VISOES[visaoDe(d)]?.nome || ""; const e = dataEnvio(d) ? fmtData(dataEnvio(d)) : "";
      [["Total", m.geral], ["E-mail", m.email], ["WhatsApp", m.whatsapp]].forEach(([c, x]) => r7.addRow([p, d.nome, v, e, c, x.enviados, x.respostas, taxa(x.respostas, x.enviados), x.interessados, x.pedidos, taxa(x.pedidos, x.respostas)])); });

    const buf = await wb.xlsx.writeBuffer();
    await state.downloads.save({ filename: `Painel de Disparos - dados - ${periodo}.xlsx`, data: new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) });
    if (msg) msg.textContent = "Planilha salva.";
  } catch (e) {
    console.error(e); if (msg) msg.textContent = e?.code === "declined" ? "Download cancelado." : "Não foi possível gerar a planilha agora.";
  }
  btn.disabled = false;
}
/* PDF: usa a impressão do navegador ("Salvar como PDF"), sempre no modo claro e sem o menu e os botões. */
function salvarPdfGeral() {
  const raiz = document.documentElement; const antes = raiz.getAttribute("data-theme");
  raiz.setAttribute("data-theme", "light"); raiz.classList.add("imprimindo");
  const voltar = () => { if (antes) raiz.setAttribute("data-theme", antes); else raiz.removeAttribute("data-theme"); raiz.classList.remove("imprimindo"); };
  addEventListener("afterprint", voltar, { once: true });
  setTimeout(() => window.print(), 60);
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

/* ---------- versão nova ----------
   O GitHub Pages manda o navegador guardar a página por até 10 minutos. O painel compara a versão desta página
   (meta "versao", trocada pelo scripts/nova_versao.py a cada publicação) com o versao.txt publicado, buscado sem cache.
   Ao abrir: se estiver velha, recarrega na hora com "?v=" (endereço novo, sem cache). Com o painel aberto: mostra um aviso. */
const VERSAO = document.querySelector('meta[name="versao"]')?.content || "";
let versaoNova = "";
const irParaVersao = (v) => location.replace(location.pathname + "?v=" + encodeURIComponent(v) + location.hash);
async function conferirVersao(inicio) {
  if (!VERSAO || VERSAO === "0") return;
  let nova = "";
  try { const r = await fetch(`versao.txt?nc=${Date.now()}`, { cache: "no-store" }); if (r.ok) nova = (await r.text()).trim(); } catch (e) { return; }
  if (!nova || nova === VERSAO) return;
  versaoNova = nova;
  const chave = "painel-recarregou-" + nova; let ja = false;
  try { ja = sessionStorage.getItem(chave) === "1"; } catch (e) {}
  const linkDeLogin = /[?&](oobCode|mode|apiKey)=/.test(location.search);
  if (inicio && !ja && !linkDeLogin) { try { sessionStorage.setItem(chave, "1"); } catch (e) {} return irParaVersao(nova); }
  if (!$("avisoVersao")) {
    const d = document.createElement("div"); d.id = "avisoVersao"; d.className = "aviso-versao"; d.setAttribute("role", "status");
    d.innerHTML = `<i class="ti ti-sparkles" aria-hidden="true"></i><span>Saiu uma versão nova do painel.</span><button type="button" class="btn" data-atualizar>Atualizar</button>`;
    document.body.appendChild(d);
  }
}
conferirVersao(true);
setInterval(() => conferirVersao(false), 5 * 60 * 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) conferirVersao(false); });

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
state.vista = lerVista();

/* ---------- eventos ---------- */
document.addEventListener("click", (ev) => {
  const oir = ev.target.closest("[data-orc-ir]");
  if (oir) {
    ir({ tipo: "cm", id: oir.dataset.orcIr });
    const ls = $("orcLinhas"); if (ls) ls.insertAdjacentHTML("beforeend", orcLinha());
    const alvo = document.querySelector(".orc-bloco, .orc-aviso");
    if (alvo) { alvo.scrollIntoView({ block: "start" }); window.scrollBy(0, -16); }
    ls?.lastElementChild?.querySelector("input")?.focus({ preventScroll: true });
    return;
  }
  if (ev.target.closest("[data-orc-add]")) { const ls = $("orcLinhas"); if (ls) { ls.insertAdjacentHTML("beforeend", orcLinha()); ls.lastElementChild.querySelector("input").focus(); } return; }
  const otr = ev.target.closest("[data-orc-tirar]");
  if (otr) { const l = otr.closest(".orc-linha"); const f = $("cmForm"); if (l.dataset.orc && f) f.dataset.orcTirar = [f.dataset.orcTirar, l.dataset.orc].filter(Boolean).join(","); l.remove(); return; }
  if (ev.target.closest("[data-tema]")) return trocarTema();
  if (ev.target.closest("[data-atualizar]")) return irParaVersao(versaoNova || VERSAO);
  const vs = ev.target.closest("[data-vista]");
  if (vs) { state.vista = vs.dataset.vista === "lista" ? "lista" : "caixas"; try { localStorage.setItem(CHAVE_VISTA, state.vista); } catch (e) {} return render(); }
  const gm = ev.target.closest("[data-geral-mes]"); if (gm) { state.geralMes = state.geralMes === gm.dataset.geralMes ? "" : gm.dataset.geralMes; return render(); }
  const gb = ev.target.closest("[data-geral-baixar]"); if (gb) return baixarDadosGeral(gb);
  if (ev.target.closest("[data-geral-pdf]")) return salvarPdfGeral();
  if (ev.target.closest("[data-analise]")) {
    state.verAnalise = !state.verAnalise;
    document.querySelectorAll(".oferta-bloco").forEach((x) => x.classList.toggle("com-analise", state.verAnalise));
    document.querySelectorAll("[data-analise]").forEach((x) => { x.setAttribute("aria-pressed", state.verAnalise ? "true" : "false"); x.innerHTML = rotuloAnalise(); });
    return;
  }
  const cs = ev.target.closest("[data-cz-sel]"); if (cs) return aplicarCzSel(cs.dataset.czSel, cs);
  const fs = ev.target.closest("[data-fid-sel]"); if (fs) return aplicarFidSel(fs.dataset.fidSel === "1");
  const ee = ev.target.closest("[data-enviar-email]"); if (ee) return salvarEnvioEmail(ee.dataset.enviarEmail, ($("dataEnvio")?.value || "").trim(), ee);
  const de = ev.target.closest("[data-desmarcar-envio]");
  if (de) { $("desmarcarBox").innerHTML = `<button type="button" class="btn perigo" data-desmarcar-ok="${esc(de.dataset.desmarcarEnvio)}">Confirmar: desmarcar envio</button> <button type="button" class="btn secundario" data-desmarcar-nao="1">Manter</button>`; return; }
  if (ev.target.closest("[data-desmarcar-nao]")) return render();
  const dok = ev.target.closest("[data-desmarcar-ok]"); if (dok) return salvarEnvioEmail(dok.dataset.desmarcarOk, "", dok, true);
  const dl = ev.target.closest("[data-baixar]"); if (dl) return baixar(dl.dataset.baixar, dl);
  const cp = ev.target.closest("[data-campanha]"); if (cp) return baixarCampanha(cp.dataset.campanha, cp);
  const rl = ev.target.closest("[data-relatorio]"); if (rl) return relatorioMensal(rl);
  const zb = ev.target.closest("[data-czbaixar]"); if (zb) return baixarCz(zb.dataset.czbaixar, zb);
  const ro = ev.target.closest("[data-rolar]");
  if (ro) { const alvo = document.getElementById(ro.dataset.rolar); if (alvo) alvo.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); return; }
  const fa = ev.target.closest("[data-fid-apagar]");
  if (fa) { $("fidApagarBox").innerHTML = `<button type="button" class="btn perigo" data-fid-apagar-ok="${esc(fa.dataset.fidApagar)}">Confirmar exclusão</button> <button type="button" class="btn secundario" data-fid-apagar-nao="${esc(fa.dataset.fidApagar)}">Manter</button>`; return; }
  const fan = ev.target.closest("[data-fid-apagar-nao]");
  if (fan) { $("fidApagarBox").innerHTML = `<button type="button" class="btn secundario" data-fid-apagar="${esc(fan.dataset.fidApagarNao)}">Excluir disparo</button>`; return; }
  const fao = ev.target.closest("[data-fid-apagar-ok]"); if (fao) return apagarFid(fao.dataset.fidApagarOk, fao);
  const za = ev.target.closest("[data-cz-apagar]");
  if (za) { const n = state.czLeads.filter((l) => l.disparo === za.dataset.czApagar).length;
    $("czApagarBox").innerHTML = `<button type="button" class="btn perigo" data-cz-apagar-ok="${esc(za.dataset.czApagar)}">Confirmar: excluir a lista e os ${n} lead(s)</button> <button type="button" class="btn secundario" data-cz-apagar-nao="${esc(za.dataset.czApagar)}">Manter</button>`; return; }
  const zan = ev.target.closest("[data-cz-apagar-nao]");
  if (zan) { $("czApagarBox").innerHTML = `<button type="button" class="btn secundario" data-cz-apagar="${esc(zan.dataset.czApagarNao)}">Excluir lista</button>`; return; }
  const zao = ev.target.closest("[data-cz-apagar-ok]"); if (zao) return apagarCzLista(zao.dataset.czApagarOk, zao);
  const ca = ev.target.closest("[data-cm-apagar]");
  if (ca) { $("cmApagarBox").innerHTML = `<button type="button" class="btn perigo" data-cm-apagar-ok="${esc(ca.dataset.cmApagar)}">Confirmar exclusão</button> <button type="button" class="btn secundario" data-cm-apagar-nao="${esc(ca.dataset.cmApagar)}">Manter</button>`; return; }
  const can = ev.target.closest("[data-cm-apagar-nao]");
  if (can) { $("cmApagarBox").innerHTML = `<button type="button" class="btn secundario" data-cm-apagar="${esc(can.dataset.cmApagarNao)}">Excluir envio</button>`; return; }
  const cao = ev.target.closest("[data-cm-apagar-ok]"); if (cao) return apagarCm(cao.dataset.cmApagarOk, cao);
  const ap = ev.target.closest("[data-apagar]");
  if (ap) { $("apagarBox").innerHTML = `<button type="button" class="btn perigo" data-apagar-ok="${esc(ap.dataset.apagar)}">Confirmar exclusão</button> <button type="button" class="btn secundario" data-apagar-nao="${esc(ap.dataset.apagar)}">Manter</button>`; return; }
  const apn = ev.target.closest("[data-apagar-nao]");
  if (apn) { $("apagarBox").innerHTML = `<button type="button" class="btn secundario" data-apagar="${esc(apn.dataset.apagarNao)}">Excluir disparo</button>`; return; }
  const apok = ev.target.closest("[data-apagar-ok]"); if (apok) return apagarInst(apok.dataset.apagarOk, apok);
  const b = ev.target.closest("[data-ir]"); if (!b) return;
  const i = b.dataset.ir.indexOf(":");
  ir(i < 0 ? { tipo: b.dataset.ir } : { tipo: b.dataset.ir.slice(0, i), id: b.dataset.ir.slice(i + 1) });
});
document.addEventListener("submit", (ev) => { if (ev.target.id === "instForm") { ev.preventDefault(); salvarInst(ev.target); } if (ev.target.id === "cmForm") { ev.preventDefault(); salvarCm(ev.target); } if (ev.target.id === "fidForm") { ev.preventDefault(); salvarFid(ev.target); } if (ev.target.id === "czForm") { ev.preventDefault(); salvarCzForm(ev.target); } });
document.addEventListener("toggle", (ev) => { if (ev.target.id === "leadsDet") state.leadsAberto = ev.target.open; }, true);
document.addEventListener("paste", (ev) => {
  const inp = ev.target.closest?.(".orc-linha input"); if (!inp) return;
  const txt = (ev.clipboardData?.getData("text") || "").replace(/\r/g, "");
  if (!/[\t\n]/.test(txt.trim())) return;
  ev.preventDefault();
  const ini = Math.max(0, ORC_CAMPOS.findIndex(([k]) => k === inp.dataset.oc));
  const linhas = txt.split("\n").filter((l) => l.trim() && !/^\s*data\s*\t\s*id/i.test(l));
  let linha = inp.closest(".orc-linha");
  linhas.forEach((l, n) => {
    if (n > 0) { $("orcLinhas").insertAdjacentHTML("beforeend", orcLinha()); linha = $("orcLinhas").lastElementChild; }
    l.split("\t").forEach((val, j) => { const c = ORC_CAMPOS[ini + j]; const el = c && linha.querySelector(`[data-oc="${c[0]}"]`); if (el) el.value = c[2] === "date" ? czData(val) || "" : val.trim(); });
  });
});
document.addEventListener("input", (ev) => {
  if (ev.target.id === "busca") { state.busca = ev.target.value; renderLeadsSomente(); }
  if (ev.target.id === "czbusca") { state.busca = ev.target.value; renderCzLeads(); }
  if (ev.target.id === "cmBusca") { state.cmBusca = ev.target.value; renderCmLista(); }
  if (ev.target.id === "czBuscaLista") { state.czBuscaLista = ev.target.value; renderCzLista(); }
  if (ev.target.id === "instBusca") { state.instBusca = ev.target.value; renderInstLista(); }
  if (ev.target.id === "z_padrao" && state.czUp) { state.czUp.padrao = ev.target.value; czRenderResumo(); }
});
/* Planilha do ColdZap: arrastar o arquivo para a caixa. Fora da caixa, o arquivo solto não abre no lugar do painel. */
["dragenter", "dragover"].forEach((t) => document.addEventListener(t, (ev) => {
  if (!$("czForm")) return; ev.preventDefault();
  const z = ev.target.closest?.("#czDrop"); if (z) z.classList.add("sobre"); else $("czDrop")?.classList.remove("sobre");
}));
document.addEventListener("dragleave", (ev) => { const z = ev.target.closest?.("#czDrop"); if (z && !z.contains(ev.relatedTarget)) z.classList.remove("sobre"); });
document.addEventListener("drop", (ev) => {
  if (!$("czForm")) return; ev.preventDefault(); $("czDrop")?.classList.remove("sobre");
  if (ev.target.closest?.("#czDrop")) { const f = ev.dataTransfer?.files?.[0]; if (f) czLerArquivo(f); }
});
document.addEventListener("change", (ev) => {
  const el = ev.target;
  if (el.id === "z_arquivo") { const f = el.files?.[0]; el.value = ""; return czLerArquivo(f); }
  if (el.id === "z_folha" && state.czUp?.wb) { state.czUp.folha = el.value; czCarregarFolha(); const b = $("czPrevia"); if (b) b.innerHTML = czPreviaHtml(); return; }
  if (el.dataset.czmap && state.czUp?.mapa) { state.czUp.mapa[el.dataset.czmap] = el.value; return czRenderResumo(); }
  if (el.id === "z_cm") { const fo = cmFornecedores().find((x) => x.k === el.value); if (fo) [["empresa", fo.empresa], ["chave", fo.chave], ["produto", fo.produto], ["solicitante", fo.solicitante]].forEach(([k, val]) => { const i = $("z_" + k); if (i) i.value = val || ""; }); return; }
  if (el.id === "fCanal") { state.canal = el.value; return renderLeadsSomente(); }
  if (el.id === "fStatus") { state.status = el.value; return renderLeadsSomente(); }
  if (el.id === "fEnvio") { state.envio = el.value; return renderCzLeads(); }
  if (el.id === "fCzStatus") { state.status = el.value; return renderCzLeads(); }
  if (el.id === "czSelTodos" || el.id === "czSelTh") { czFiltrados(state.rota.id).forEach((l) => (el.checked ? state.czSel.add(l._id) : state.czSel.delete(l._id))); return atualizarSel(); }
  if (el.dataset.czsel) { if (el.checked) state.czSel.add(el.dataset.czsel); else state.czSel.delete(el.dataset.czsel); return atualizarSel(); }
  if (el.id === "fidSelTodos" || el.id === "fidSelTh") { fidWhats(fidFiltrados(state.rota.id)).forEach((x) => (el.checked ? state.fidSel.add(x) : state.fidSel.delete(x))); return atualizarFidSel(); }
  if (el.dataset.fidsel) { if (el.checked) state.fidSel.add(el.dataset.fidsel); else state.fidSel.delete(el.dataset.fidsel); return atualizarFidSel(); }
  if (el.id === "instMes") { state.instMes = el.value; return render(); }
  if (el.id === "cmMes") { state.cmMes = el.value; return render(); }
  if (el.id === "czMes") { state.czMes = el.value; return render(); }
  if (el.id === "fidMes") { state.fidMes = el.value; return render(); }
  if (el.id === "geralMes") { state.geralMes = el.value; return render(); }
  if (el.id === "f_visao") { const c = $("campoSeg"); if (c) c.hidden = el.value !== "necessidade"; return; }
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
window.addEventListener("popstate", (ev) => { if (!iniciado) return; prepararRota(rotaDoHash()); render(); const y = ev.state?.y || 0; requestAnimationFrame(() => window.scrollTo(0, y)); });
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
    <div class="marca"><span class="logo-redonda" role="img" aria-label="Soluções Industriais"></span><span class="sep" aria-hidden="true"></span><div><b>Growth</b><span>Disparos</span></div></div>
    <div style="display:grid;gap:8px"><h1>Painel de Disparos · Growth</h1><p>Os disparos do Growth em um só lugar: a estratégia, os resultados de cada frente e a marcação das respostas, ao vivo.</p></div>
    <ul>
      <li><i class="ti ti-refresh" aria-hidden="true"></i><span><b>Reativação</b>Por produto e por segmento</span></li>
      <li><i class="ti ti-building" aria-hidden="true"></i><span><b>Institucional</b>Cartas por segmento</span></li>
      <li><i class="ti ti-mail-forward" aria-hidden="true"></i><span><b>Cold mail</b>Carta por fornecedor</span></li>
      <li><i class="ti ti-brand-whatsapp" aria-hidden="true"></i><span><b>ColdZap</b>WhatsApp do cold mail</span></li>
    </ul></div>`;
function telaLogin(msg, ok) {
  const dominio = String(window.DOMINIO_EMPRESA || "");
  document.body.classList.add("sem-menu");
  cab("Painel de Disparos · Growth", ""); $("abas").innerHTML = ""; $("crumbs").innerHTML = ""; $("conta").hidden = true; $("aovivo").hidden = true;
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
  cab("Painel de Disparos · Growth", ""); $("abas").innerHTML = ""; $("crumbs").innerHTML = ""; $("conta").hidden = true; $("aovivo").hidden = true;
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
  Object.assign(state, { pastas: [], estrategia: null, disparos: [], leads: [], bases: {}, inst: [], cm: [], cz: [], czLeads: [], carregado: {}, czSel: new Set(), fidSel: new Set(), leadsOk: false, czOk: false, orcs: [], orcOk: false, orcErro: false, podeEditar: false });
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
  /* Outros domínios da empresa que podem pedir o link de acesso (contas Microsoft com o endereço padrão do tenant).
     Quem entra por eles só acessa o painel se estiver cadastrado como operador: as regras do banco continuam iguais. */
  const dominiosLink = [dominio, "solucind.onmicrosoft.com"].filter(Boolean);

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
      if (!dominiosLink.some((d) => email.endsWith("@" + d))) return telaLogin(`Use o seu e-mail @${dominio}.`);
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
    ouvir("institucional", (s) => { const docs = s.docs.map((d) => ({ id: d.id, ...d.data() })); state.inst = docs.filter((d) => d.frente !== "coldmail"); state.cm = docs.filter((d) => d.frente === "coldmail"); chegou("inst"); }, () => chegou("inst"));
    ouvir("coldzap", (s) => { state.cz = s.docs.map((d) => ({ id: d.id, ...d.data() })); chegou("cz"); }, () => chegou("cz"));
    ouvir("orcamentos", (s) => { state.orcs = s.docs.map((d) => ({ _id: d.id, ...d.data() })); state.orcOk = true; state.orcErro = false; chegou("orc"); }, () => { state.orcOk = false; state.orcErro = true; chegou("orc"); });
    ouvir("coldzap_leads", (s) => { state.czLeads = s.docs.map((d) => ({ _id: d.id, ...d.data() })); state.czOk = true; chegou("czl"); }, () => { state.czOk = false; chegou("czl"); });
  });
})();
