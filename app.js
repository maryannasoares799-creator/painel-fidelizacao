const STATUS = { aguardando: "Sem resposta", interessado: "Interessado", sem_interesse: "Sem interesse", saiu: "Pediu para sair" };
const ENVIO = { "": "Não enviado", enviado: "Enviado", nao_existe: "Número não existe" };
const BASE_AB = ["Inteira", "A", "B"];
const state = {
  pastas: [], disparos: [], leads: [], bases: {}, inst: [], cz: [], czLeads: [], carregado: {},
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
const carregando = () => `<div class="empty">Carregando…</div>`;
const semPermissao = (e) => !!e && (e.code === "permission-denied" || e.code === "invalid_argument");
const kpiGrid = (itens) => `<div class="kpis">${itens.map(([l, v, s, h]) => `<div class="kpi${h ? " highlight" : ""}"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${esc(s)}</span></div>`).join("")}</div>`;

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
const FRENTE = (r) => (r.tipo === "geral" ? "geral" : ["institucional", "inst", "inst-novo"].includes(r.tipo) ? "institucional" : ["coldzap", "czd"].includes(r.tipo) ? "coldzap" : "fidelizacao");
function hashDe(r) {
  if (r.tipo === "geral") return "";
  if (r.tipo === "inicio") return "fidelizacao";
  if (r.tipo === "institucional" || r.tipo === "coldzap") return r.tipo;
  if (r.tipo === "inst-novo") return "institucional-novo";
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
  $("abas").innerHTML = `<div class="menu-rotulo">Frentes</div>` + [
    ["geral", "geral", "ti-layout-dashboard", "Visão geral"],
    ["fidelizacao", "inicio", "ti-refresh", "Fidelização"],
    ["institucional", "institucional", "ti-building", "Institucional"],
    ["coldzap", "coldzap", "ti-brand-whatsapp", "ColdZap"],
  ].map(([k, destino, ico, nome]) => `<button type="button" class="menu-item" data-ir="${destino}"${f === k ? ' aria-current="page"' : ""}><i class="ti ${ico}" aria-hidden="true"></i>${nome}</button>`).join("");
}
function crumbs() {
  const c = $("crumbs"); const r = state.rota; const sep = `<span aria-hidden="true">/</span>`;
  let parts = [];
  if (r.tipo === "pasta") parts = [`<button type="button" data-ir="inicio">Fidelização</button>`, `<span aria-current="page">${esc(state.pastas.find((p) => p.id === r.id)?.nome)}</span>`];
  if (r.tipo === "disparo") {
    const d = state.disparos.find((x) => x.id === r.id); const p = state.pastas.find((x) => x.id === d?.pasta);
    parts = [`<button type="button" data-ir="inicio">Fidelização</button>`];
    if (p) parts.push(`<button type="button" data-ir="pasta:${esc(p.id)}">${esc(p.nome)}</button>`);
    parts.push(`<span aria-current="page">${esc(d?.nome)}</span>`);
  }
  if (r.tipo === "inst" || r.tipo === "inst-novo") parts = [`<button type="button" data-ir="institucional">Institucional</button>`, `<span aria-current="page">${r.tipo === "inst-novo" ? "Novo disparo" : "Ficha do disparo"}</span>`];
  if (r.tipo === "czd") parts = [`<button type="button" data-ir="coldzap">ColdZap</button>`, `<span aria-current="page">${esc(state.cz.find((x) => x.id === r.id)?.empresa || "Lista")}</span>`];
  c.innerHTML = parts.join(sep);
}

/* ---------- blocos (fidelização) ---------- */
function kpis(m, base) {
  return kpiGrid([
    ["Enviados", m.enviados, m.enviados < m.total ? `${m.total - m.enviados} aguardando envio` : `${m.total} na base`],
    ["Responderam", m.respostas, `${br(pct(m.respostas, m.enviados))}% dos enviados`],
    ["Interessados", m.interessados, `${br(pct(m.interessados, m.enviados))}% dos enviados`],
    ["Orçamentos gerados", m.pedidos, `${br(pct(m.pedidos, m.respostas))}% das respostas`],
    ["Pediram para sair", m.sairam, `${br(pct(m.sairam, m.enviados))}% dos enviados`],
    ["Voltaram a cotar", m.voltaram, `${br(pct(m.voltaram, m.enviados))}%` + (base ? ` · média histórica ${br(base)}%` : ""), true],
  ]);
}
function canais(mm) {
  const card = (m, nome) => `<div class="canal"><h3>${nome}<span>${m.enviados} enviados</span></h3>${[["Responderam", m.respostas], ["Interessados", m.interessados], ["Voltaram a cotar", m.voltaram, true]].map(([l, v, w]) => {
    const p = pct(v, m.enviados);
    return `<div class="bar"><span>${l}</span><span class="track"><span class="fill${w ? " wood" : ""}" style="width:${Math.min(p, 100)}%"></span></span><span class="pct">${br(p)}%</span></div>`;
  }).join("")}</div>`;
  return `<div class="canais">${card(mm.whatsapp, "WhatsApp")}${card(mm.email, "E-mail")}</div>`;
}
const situacao = (d) => (d.enviado_em ? `<span class="tag enviado">Enviado em ${fmtData(d.enviado_em)}</span>` : `<span class="tag preparado">Preparado, aguardando envio</span>`);

/* ---------- telas (fidelização) ---------- */
function telaInicio() {
  $("titulo").textContent = "Fidelização";
  const total = somar(state.disparos.map((d) => metricasDisparo(d).geral));
  const pastas = [...state.pastas].sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
  return `<div style="display:grid;gap:26px">
    <p class="lead-txt">Disparos de e-mail e WhatsApp para quem já cotou no Soluções Industriais, organizados por produto. Abra uma pasta para ver os disparos e os resultados.</p>
    <section aria-labelledby="h-tot"><div class="section-head"><h2 id="h-tot">Todos os disparos</h2><span class="note">${state.disparos.length} disparo(s) em ${state.pastas.length} pasta(s)</span></div>${kpis(total)}</section>
    ${state.downloads && window.XLSX ? `<section aria-labelledby="h-rel"><div class="section-head"><h2 id="h-rel">Relatório mensal</h2><span class="note">Disparos enviados no mês, resultados por canal e respostas recebidas</span></div>
      <div class="relatorio"><label for="mesRel">Mês <select id="mesRel">${meses().map((m, i) => `<option value="${m}"${i === 0 ? " selected" : ""}>${nomeMes(m)}</option>`).join("")}</select></label>
      <button type="button" class="btn" data-relatorio="1">Baixar relatório</button><span class="note" id="relMsg"></span></div></section>` : ""}
    <section aria-labelledby="h-pastas"><div class="section-head"><h2 id="h-pastas">Pastas por produto</h2></div>
      <div class="grid-cards">${pastas.map((p) => {
        const m = metricasPasta(p); const n = state.disparos.filter((d) => d.pasta === p.id).length;
        return `<button type="button" class="card" data-ir="pasta:${esc(p.id)}">
          <div class="top"><div><div class="nome">${esc(p.nome)}</div><div class="sub">${n} disparo(s) · ${m.total} leads</div></div><span class="folder-ico" aria-hidden="true"><i class="ti ti-folder"></i></span></div>
          <div class="stats"><div class="stat"><b>${br(pct(m.respostas, m.enviados))}%</b><span>resposta</span></div><div class="stat"><b>${m.interessados}</b><span>interessados</span></div><div class="stat"><b>${m.voltaram}</b><span>voltaram a cotar</span></div></div>
          <span class="go">Abrir pasta</span></button>`;
      }).join("")}<div class="card nova"><div class="nome" style="font:700 16px var(--display)">Próximo produto</div><div class="sub">Novas pastas aparecem aqui quando um produto entra no projeto.</div></div></div>
    </section></div>`;
}
function telaPasta(id) {
  const p = state.pastas.find((x) => x.id === id); if (!p) return telaInicio();
  $("titulo").textContent = p.nome;
  const ds = state.disparos.filter((d) => d.pasta === id).sort((a, b) => (b.numero || 0) - (a.numero || 0));
  return `<div style="display:grid;gap:26px">
    ${p.descricao ? `<p class="lead-txt">${esc(p.descricao)}</p>` : ""}
    <section aria-labelledby="h-pr"><div class="section-head"><h2 id="h-pr">Resultado da pasta</h2></div>${kpis(metricasPasta(p), p.base_historica)}</section>
    ${p.estrategia?.length ? `<section aria-labelledby="h-est"><div class="section-head"><h2 id="h-est">Estratégia de base</h2><span class="note">${esc(p.estrategia_nota || "")}</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Se o lead cotou ${esc(p.nome.toLowerCase())}</th><th>Ofereça</th><th>Por quê</th><th>Quando</th><th>Para quem</th></tr></thead><tbody>${p.estrategia.map((e) =>
        `<tr><td><b>${esc(e.linha)}</b></td><td>${esc(e.oferta)}</td><td class="note">${esc(e.dado)}</td><td>${esc(e.quando)}</td><td class="note">${esc(e.para_quem)}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
    <section aria-labelledby="h-ds"><div class="section-head"><h2 id="h-ds">Disparos</h2><span class="note">${ds.length} disparo(s)</span></div>
      <div class="grid-cards">${ds.map((d) => { const m = metricasDisparo(d).geral; return `<button type="button" class="card" data-ir="disparo:${esc(d.id)}">
        <div class="top"><div><div class="nome">${esc(d.nome)}</div><div class="sub">${esc(d.carta || "")} · ${fmtData(d.enviado_em || d.data)}</div></div></div>
        <div>${situacao(d)}</div>
        <div class="stats"><div class="stat"><b>${m.enviados}/${m.total}</b><span>enviados</span></div><div class="stat"><b>${br(pct(m.respostas, m.enviados))}%</b><span>resposta</span></div><div class="stat"><b>${m.interessados}</b><span>interessados</span></div></div>
        <span class="go">Abrir disparo</span></button>`; }).join("") || `<div class="empty">Nenhum disparo nesta pasta ainda.</div>`}</div>
    </section></div>`;
}
function telaDisparo(id) {
  const d = state.disparos.find((x) => x.id === id); if (!d) return telaInicio();
  const p = state.pastas.find((x) => x.id === d.pasta) || {};
  $("titulo").textContent = d.nome;
  const mm = metricasDisparo(d);
  return `<div style="display:grid;gap:26px">
    <dl class="ficha">
      <div><dt>Situação</dt><dd>${situacao(d)}</dd></div>
      <div><dt>Carta</dt><dd>${esc(d.carta || "")}</dd></div>
      <div><dt>Período da base</dt><dd>${d.periodo_inicio ? `Cotações de ${fmtData(d.periodo_inicio)} a ${fmtData(d.periodo_fim)}` : esc(d.base || "")}</dd></div>
      ${d.leads_base ? `<div><dt>Leads na base</dt><dd>${d.leads_base} encontrados · ${d.fora || 0} ficaram fora</dd></div>` : ""}
      ${d.criterio ? `<div><dt>Critério</dt><dd>${esc(d.criterio)}</dd></div>` : ""}
      <div><dt>Canais</dt><dd>${d.email || 0} por e-mail · ${d.whatsapp || 0} por WhatsApp</dd></div>
      ${d.retorno_atualizado_em ? `<div><dt>Retorno medido em</dt><dd>${fmtData(d.retorno_atualizado_em)}</dd></div>` : ""}
    </dl>
    ${state.downloads && window.XLSX ? `<div class="acoes">
      ${d.campanha && window.ExcelJS ? `<button type="button" class="btn" data-campanha="${esc(d.id)}">Baixar campanha</button>` : ""}
      ${state.leadsOk ? `<button type="button" class="btn secundario" data-baixar="${esc(d.id)}">Baixar base em Excel</button>` : ""}
      <span class="note" id="dlMsg">Campanha: lista de WhatsApp pronta para enviar, lista de e-mail e textos. Base: critérios, destino de cada lead e respostas até agora.</span></div>` : ""}
    <section aria-labelledby="h-res"><div class="section-head"><h2 id="h-res">Resultado</h2></div>${kpis(mm.geral, d.base_historica ?? p.base_historica)}</section>
    <section aria-labelledby="h-fun"><div class="section-head"><h2 id="h-fun">Funil do e-mail</h2><span class="note">Copie da tela de Analytics do BillionMail: o Success e os percentuais, como aparecem</span></div>${funilEmail(d, mm.email)}</section>
    <section aria-labelledby="h-can"><div class="section-head"><h2 id="h-can">E-mail contra WhatsApp</h2><span class="note">Percentuais sobre os enviados em cada canal</span></div>${canais(mm)}</section>
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
  return `<div class="tbl-wrap"><table><thead><tr><th>Etapa</th><th>No BillionMail</th><th>Quantidade</th><th>Onde achar / taxa</th></tr></thead><tbody>${linhas.map(([a, b, c, t]) =>
    `<tr><td><b>${a}</b></td><td class="num">${b}</td><td class="num">${c}</td><td class="note">${t}</td></tr>`).join("")}</tbody></table></div>`;
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
      <td>${l.voltou_cotar ? `<span class="tag voltou">voltou ${fmtData(l.voltou_cotar)}</span>` : `<span class="note">—</span>`}</td>
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
      ${ls.length ? `<div class="tbl-wrap"><table><thead><tr><th>Lead</th><th>Canal</th><th>O que pediu</th><th>Envio</th><th>Resposta</th><th>Orçamento gerado</th><th>Site</th><th>Observação</th></tr></thead><tbody>${linhas}</tbody></table></div>` : `<div class="empty">Nenhum lead com esses filtros.</div>`}
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
    ["Disparos", s.n, `${s.limpa} e-mails na base limpa`],
    ["Entregues", s.entregues, s.env ? `${br(pct(s.entregues, s.env))}% dos ${s.env} enviados` : "lance os números do BillionMail"],
    ["% lido", `${br(pct(s.abertos, s.entregues))}%`, `${s.abertos} abertos`],
    ["Cliques no link", s.cliques, `${br(pct(s.cliques, s.entregues))}% dos entregues`],
    ["Respostas", s.respostas, `${br(pct(s.respostas, s.entregues))}% dos entregues`],
    ["Orçamentos", s.orcamentos, `${br(pct(s.orcamentos, s.respostas))}% das respostas (conversão)`, true],
  ]);
}
const linhaInst = (s) => `<td class="num">${s.limpa}</td><td class="num">${s.entregues}</td><td class="num">${br(pct(s.abertos, s.entregues))}%</td><td class="num">${s.cliques}</td><td class="num">${s.respostas}</td><td class="num">${s.orcamentos}</td><td class="num">${br(pct(s.orcamentos, s.respostas))}%</td>`;
function telaInstitucional() {
  $("titulo").textContent = "Disparos institucionais";
  if (!state.carregado.inst) return carregando();
  const mesesInst = [...new Set(state.inst.map((d) => (d.data_disparo || "").slice(0, 7)).filter(Boolean))].sort().reverse();
  const lista = state.inst.filter((d) => !state.instMes || (d.data_disparo || "").startsWith(state.instMes))
    .sort((a, b) => (b.data_disparo || b.data_solicitacao || "").localeCompare(a.data_disparo || a.data_solicitacao || ""));
  const s = instSomar(lista);
  const segs = {}; lista.forEach((d) => (segs[d.segmento || "Sem segmento"] ||= []).push(d));
  const segLinhas = Object.entries(segs).map(([seg, ds]) => [seg, ds.length, instSomar(ds)]).sort((a, b) => b[2].orcamentos - a[2].orcamentos || b[1] - a[1]);
  return `<div style="display:grid;gap:26px">
    <p class="lead-txt">Cartas do Soluções Industriais para uma base escolhida por segmento, sem fornecedor específico. Cada disparo é uma linha, com o funil do BillionMail e o retorno.</p>
    <div class="acoes">
      ${state.podeEditar ? `<button type="button" class="btn" data-ir="inst-novo">Novo disparo institucional</button>` : ""}
      <label for="instMes" class="note" style="display:flex;gap:8px;align-items:center">Mês do disparo <select id="instMes"><option value="">Todos</option>${mesesInst.map((m) => `<option value="${m}"${state.instMes === m ? " selected" : ""}>${nomeMes(m)}</option>`).join("")}</select></label>
    </div>
    <section aria-labelledby="h-it"><div class="section-head"><h2 id="h-it">Resultado</h2><span class="note">${state.instMes ? nomeMes(state.instMes) : "Todos os meses"}</span></div>${instKpis(s)}</section>
    ${lista.length ? `
    <section aria-labelledby="h-seg"><div class="section-head"><h2 id="h-seg">Por segmento</h2><span class="note">Conversão = orçamentos ÷ respostas</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Segmento</th><th class="num">Disparos</th><th class="num">Base limpa</th><th class="num">Entregues</th><th class="num">% lido</th><th class="num">Cliques</th><th class="num">Respostas</th><th class="num">Orçamentos</th><th class="num">Conversão</th></tr></thead>
      <tbody>${segLinhas.map(([seg, n, t]) => `<tr><td><b>${esc(seg)}</b></td><td class="num">${n}</td>${linhaInst(t)}</tr>`).join("")}</tbody></table></div></section>
    <section aria-labelledby="h-il"><div class="section-head"><h2 id="h-il">Disparos</h2><span class="note">${lista.length} disparo(s) · abra um para lançar ou corrigir os números</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Disparo em</th><th>Segmento</th><th>Base</th><th>Solicitante</th><th class="num">Base limpa</th><th class="num">Entregues</th><th class="num">% lido</th><th class="num">Cliques</th><th class="num">Respostas</th><th class="num">Orçamentos</th><th class="num">Conversão</th></tr></thead>
      <tbody>${lista.map((d) => `<tr><td><button type="button" class="linkbtn" data-ir="inst:${esc(d.id)}">${d.data_disparo ? fmtData(d.data_disparo) : "Sem data"}</button></td><td>${esc(d.segmento || "")}</td><td><span class="tag ab">${esc(d.base_ab || "Inteira")}</span></td><td>${esc(d.solicitante || "")}</td>${linhaInst(instSomar([d]))}</tr>`).join("")}</tbody></table></div></section>`
    : `<div class="empty">Nenhum disparo institucional registrado${state.instMes ? " neste mês" : " ainda"}. ${state.podeEditar ? "Use “Novo disparo institucional” para lançar o primeiro: segmento, base e data. Os números do BillionMail e as respostas entram depois do envio." : ""}</div>`}
  </div>`;
}
function telaInstForm(id) {
  const novo = !id;
  const d = novo ? { base_ab: "Inteira", data_solicitacao: hoje() } : state.inst.find((x) => x.id === id);
  $("titulo").textContent = novo ? "Novo disparo institucional" : d ? `${d.segmento || "Disparo"}${d.data_disparo ? " · " + fmtData(d.data_disparo) : ""}` : "Disparo institucional";
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
    ["Leads separados", m.total, m.pendentes ? `${m.pendentes} ainda sem envio` : "todos tratados"],
    ["Enviados", m.enviados, `${br(pct(m.enviados, m.total))}% da lista`],
    ["Número não existe", m.nao_existe, `${br(pct(m.nao_existe, m.total))}% da lista`],
    ["Responderam", m.respostas, `${br(pct(m.respostas, m.enviados))}% dos enviados`],
    ["Interessados", m.interessados, `${br(pct(m.interessados, m.enviados))}% dos enviados`],
    ["Orçamentos", m.orcamentos, `${br(pct(m.orcamentos, m.respostas))}% das respostas`, true],
  ]);
}
function telaColdzap() {
  $("titulo").textContent = "ColdZap";
  if (!state.carregado.cz) return carregando();
  const ds = [...state.cz].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const tot = czSomar(ds.map(czMetricas));
  return `<div style="display:grid;gap:26px">
    <p class="lead-txt">A parte da base de um cold mail que vai pelo WhatsApp, enviada à mão pela Maryanna. Cada lista mostra lead a lead quem recebeu, quem respondeu e quais respostas viraram orçamento.</p>
    <section aria-labelledby="h-zt"><div class="section-head"><h2 id="h-zt">Todas as listas</h2><span class="note">${ds.length} lista(s) de WhatsApp</span></div>${czKpis(tot)}</section>
    <section aria-labelledby="h-zl"><div class="section-head"><h2 id="h-zl">Listas por fornecedor</h2></div>
      <div class="grid-cards">${ds.map((d) => { const m = czMetricas(d); return `<button type="button" class="card" data-ir="czd:${esc(d.id)}">
        <div class="top"><div><div class="nome">${esc(d.empresa)}</div><div class="sub">${esc(d.chave || "")}${d.produto ? " · " + esc(d.produto) : ""}</div></div><span class="zap-ico" aria-hidden="true"><i class="ti ti-brand-whatsapp"></i></span></div>
        <div class="sub">Preparada em ${fmtData(d.data)}${d.remetente ? " · envia " + esc(d.remetente) : ""}</div>
        <div class="stats"><div class="stat"><b>${m.enviados}/${m.total}</b><span>enviados</span></div><div class="stat"><b>${br(pct(m.respostas, m.enviados))}%</b><span>resposta</span></div><div class="stat"><b>${m.orcamentos}</b><span>orçamentos</span></div></div>
        <span class="go">Abrir lista</span></button>`; }).join("")}
        <div class="card nova"><div class="nome" style="font:700 16px var(--display)">Próximo cold mail</div><div class="sub">A lista de WhatsApp entra aqui quando a base de um cold mail é separada.</div></div></div>
    </section></div>`;
}
function telaCzDisparo(id) {
  const d = state.cz.find((x) => x.id === id);
  if (!d) { $("titulo").textContent = "ColdZap"; return state.carregado.cz ? `<div class="empty">Esta lista não existe. <button type="button" class="linkbtn" data-ir="coldzap">Voltar para o ColdZap</button></div>` : carregando(); }
  $("titulo").textContent = d.empresa;
  const m = czMetricas(d);
  return `<div style="display:grid;gap:26px">
    <dl class="ficha">
      <div><dt>Fornecedor</dt><dd>${esc(d.empresa)}</dd></div>
      <div><dt>ID do cliente</dt><dd>${esc(d.chave || "")}</dd></div>
      ${d.produto ? `<div><dt>O que oferece</dt><dd>${esc(d.produto)}</dd></div>` : ""}
      <div><dt>Preparada em</dt><dd>${fmtData(d.data)}</dd></div>
      <div><dt>Quem envia</dt><dd>${esc(d.remetente || "")}</dd></div>
      ${d.base ? `<div><dt>Base</dt><dd>${esc(d.base)}</dd></div>` : ""}
      ${d.solicitante ? `<div><dt>Solicitante</dt><dd>${esc(d.solicitante)}</dd></div>` : ""}
    </dl>
    ${state.downloads && window.XLSX && state.czOk ? `<div class="acoes"><button type="button" class="btn secundario" data-czbaixar="${esc(d.id)}">Baixar lista em Excel</button><span class="note" id="czMsg">Lista com o link de cada conversa e as marcações feitas aqui.</span></div>` : ""}
    <section aria-labelledby="h-zr"><div class="section-head"><h2 id="h-zr">Resultado</h2></div>${czKpis(m)}</section>
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
    : r.tipo === "inicio" ? telaInicio() : telaGeral();
}

/* ---------- Visão geral: as três frentes lado a lado ---------- */
function telaGeral() {
  $("titulo").textContent = "Visão geral";
  const f = somar(state.disparos.map((d) => metricasDisparo(d).geral));
  const i = instSomar(state.inst);
  const z = czSomar(state.cz.map(czMetricas));
  const enviados = f.enviados + i.env + z.enviados;
  const respostas = f.respostas + i.respostas + z.respostas;
  const orcamentos = f.pedidos + i.orcamentos + z.orcamentos;
  const mini = (itens) => `<div class="mini">${itens.map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>`;
  const frente = (ico, cls, nome, sub, destino, itens) => `<section class="frente" aria-label="${nome}">
    <div class="frente-top"><div class="titulo"><span class="${cls}" aria-hidden="true"><i class="ti ${ico}"></i></span><div><b>${nome}</b><span>${sub}</span></div></div>
      <button type="button" class="btn secundario" data-ir="${destino}">Abrir ${nome.toLowerCase()}</button></div>
    ${mini(itens)}</section>`;
  return `<div style="display:grid;gap:22px">
    <p class="lead-txt">Os disparos do Growth em um só lugar: quem já cotou e foi chamado de volta, as cartas por segmento e o WhatsApp do cold mail.</p>
    ${kpiGrid([
      ["Disparos registrados", state.disparos.length + state.inst.length + state.cz.length, `${state.disparos.length} fidelização · ${state.inst.length} institucional · ${state.cz.length} ColdZap`],
      ["Mensagens enviadas", enviados, "e-mail e WhatsApp somados"],
      ["Respostas", respostas, `${br(pct(respostas, enviados))}% das enviadas`],
      ["Orçamentos gerados", orcamentos, `${br(pct(orcamentos, respostas))}% das respostas`, true],
    ])}
    <div class="frentes">
      ${frente("ti-refresh", "folder-ico", "Fidelização", `Quem já cotou, por produto · ${state.disparos.length} disparo(s)`, "inicio",
        [["Enviados", f.enviados], ["Responderam", f.respostas], ["Orçamentos", f.pedidos], ["Voltaram a cotar", f.voltaram]])}
      ${frente("ti-building", "folder-ico", "Institucional", `Cartas por segmento · ${state.inst.length} disparo(s)`, "institucional",
        [["Entregues", i.entregues], ["% lido", `${br(pct(i.abertos, i.entregues))}%`], ["Respostas", i.respostas], ["Orçamentos", i.orcamentos]])}
      ${frente("ti-brand-whatsapp", "zap-ico", "ColdZap", `WhatsApp do cold mail · ${state.cz.length} lista(s)`, "coldzap",
        [["Enviados", z.enviados], ["Número não existe", z.nao_existe], ["Responderam", z.respostas], ["Orçamentos", z.orcamentos]])}
    </div>
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
    const w3 = XLSX.utils.aoa_to_sheet([["Empresa", "Nome", "E-mail", "Canal", "Dia (WhatsApp)", "Enviado", "Resposta", "Orçamento gerado", "Voltou a cotar", "Observação"],
      ...ls.map((l) => [l.empresa, l.nome, l.email, l.canal === "whatsapp" ? "WhatsApp" : "E-mail", l.dia || "", (l.canal === "email" ? !!d.enviado_em : !!l.enviado) ? "Sim" : "Não",
        STATUS[l.status || "aguardando"], l.pedido_cadastrado ? "Sim" : "Não", l.voltou_cotar ? fmtData(l.voltou_cotar) : "", l.obs || ""])]);
    w3["!cols"] = [30, 18, 34, 10, 14, 10, 16, 16, 14, 40].map((wch) => ({ wch }));
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
const linhaM = (m) => [m.enviados, m.respostas, `${br(pct(m.respostas, m.enviados))}%`, m.interessados, `${br(pct(m.interessados, m.enviados))}%`, m.pedidos, m.sairam, m.voltaram, `${br(pct(m.voltaram, m.enviados))}%`];
const CAB_M = ["Enviados", "Responderam", "% resposta", "Interessados", "% interesse", "Orçamentos gerados", "Pediram para sair", "Voltaram a cotar", "% voltaram"];
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
  const regua = doMes.map((d) => { const p = state.pastas.find((x) => x.id === d.pasta); const b = d.base_historica ?? p?.base_historica;
    return [`Régua de retorno · ${p?.nome || ""} ${d.nome}`, b != null ? `${br(b)}%` : "sem régua"]; });
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
    ...regua,
    ["Observação", "Voltaram a cotar = leads do disparo que fizeram nova cotação no site depois do envio, medido no Metabase. A régua é a taxa de quem voltou sozinho, sem disparo, num grupo histórico montado do mesmo jeito."],
  ], [44, 14, 14, 12, 14, 12, 18, 16, 16, 12]);
  aba(wb, "Por disparo", [["Pasta", "Disparo", "Enviado em", "Canal", ...CAB_M],
    ...mm.flatMap(({ d, m }) => { const p = state.pastas.find((x) => x.id === d.pasta)?.nome || "";
      return [[p, d.nome, fmtData(d.enviado_em), "Total", ...linhaM(m.geral)], [p, d.nome, fmtData(d.enviado_em), "E-mail", ...linhaM(m.email)], [p, d.nome, fmtData(d.enviado_em), "WhatsApp", ...linhaM(m.whatsapp)]]; })],
    [16, 16, 12, 10, 10, 12, 10, 12, 10, 16, 14, 14, 10]);
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

/* ---------- eventos ---------- */
document.addEventListener("click", (ev) => {
  const dl = ev.target.closest("[data-baixar]"); if (dl) return baixar(dl.dataset.baixar, dl);
  const cp = ev.target.closest("[data-campanha]"); if (cp) return baixarCampanha(cp.dataset.campanha, cp);
  const rl = ev.target.closest("[data-relatorio]"); if (rl) return relatorioMensal(rl);
  const zb = ev.target.closest("[data-czbaixar]"); if (zb) return baixarCz(zb.dataset.czbaixar, zb);
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
function telaLogin(msg, ok) {
  const dominio = String(window.DOMINIO_EMPRESA || "");
  document.body.classList.add("sem-menu");
  $("titulo").textContent = "Painel de Fidelização"; $("abas").innerHTML = ""; $("crumbs").innerHTML = ""; $("conta").hidden = true;
  $("view").innerHTML = `<div class="login">
    <div class="selo"><i class="ti ti-chart-bar" aria-hidden="true"></i><div><b>Soluções Industriais</b><br><span class="note">Growth · Disparos</span></div></div>
    <h2>Entrar</h2>
    <p class="lead-txt" style="margin:0">Digite o seu e-mail da empresa. Você recebe um link de acesso no Outlook: abra o link neste mesmo computador e pronto.</p>
    <form id="formLink" class="login-form" novalidate>
      <label class="campo" for="loginEmail">E-mail da empresa<input type="email" id="loginEmail" autocomplete="email" placeholder="nome@${esc(dominio)}" value="${esc(lerEmail())}"></label>
      <div class="acoes"><button type="submit" class="btn" id="enviarLink">Receber link de acesso</button></div>
    </form>
    ${msg ? `<p class="status-line${ok ? "" : " err"}" role="${ok ? "status" : "alert"}" style="margin:0">${esc(msg)}</p>` : ""}
    <p class="note" style="margin:0">Administração do painel: <button type="button" class="linkbtn" id="entrarGoogle">entrar com Google</button></p>
  </div>`;
}
function telaConfirmarEmail(msg) {
  document.body.classList.add("sem-menu");
  $("titulo").textContent = "Painel de Fidelização"; $("abas").innerHTML = ""; $("crumbs").innerHTML = ""; $("conta").hidden = true;
  $("view").innerHTML = `<div class="login">
    <h2>Confirme o seu e-mail</h2>
    <p class="lead-txt" style="margin:0">O link foi aberto num navegador diferente do que pediu o acesso. Digite o mesmo e-mail que recebeu o link para terminar.</p>
    <form id="formConfirma" class="login-form" novalidate>
      <label class="campo" for="confEmail">E-mail<input type="email" id="confEmail" autocomplete="email"></label>
      <div class="acoes"><button type="submit" class="btn">Entrar</button></div>
    </form>
    ${msg ? `<p class="status-line err" role="alert" style="margin:0">${esc(msg)}</p>` : ""}
  </div>`;
}
function limparDados() {
  assinaturas.forEach((parar) => { try { parar(); } catch (e) {} }); assinaturas = [];
  iniciado = false;
  Object.assign(state, { pastas: [], disparos: [], leads: [], bases: {}, inst: [], cz: [], czLeads: [], carregado: {}, leadsOk: false, czOk: false, podeEditar: false });
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
    abas();

    const limite = setTimeout(() => { if (!iniciado) $("view").innerHTML = `<div class="empty">Os dados do painel não carregaram. Recarregue a página para tentar de novo.</div>`; }, 10000);
    const chegou = (k) => {
      state.carregado[k] = true;
      if (!iniciado && state.carregado.pastas && state.carregado.disparos) { iniciado = true; clearTimeout(limite); state.rota = rotaDoHash(); render(); }
      else atualizar();
    };
    const ouvir = (col, ok, erro) => assinaturas.push(db.collection(col).onSnapshot(ok, erro));
    ouvir("bases", (s) => { state.bases = Object.fromEntries(s.docs.map((d) => [d.id, d.data()])); }, () => {});
    ouvir("pastas", (s) => { state.pastas = s.docs.map((d) => ({ id: d.id, ...d.data() })); chegou("pastas"); }, () => chegou("pastas"));
    ouvir("disparos", (s) => { state.disparos = s.docs.map((d) => ({ id: d.id, ...d.data() })); chegou("disparos"); }, () => chegou("disparos"));
    ouvir("leads", (s) => { state.leads = s.docs.map((d) => ({ _id: d.id, ...d.data() })); state.leadsOk = state.leads.length > 0; chegou("leads"); }, () => { state.leadsOk = false; chegou("leads"); });
    ouvir("institucional", (s) => { state.inst = s.docs.map((d) => ({ id: d.id, ...d.data() })); chegou("inst"); }, () => chegou("inst"));
    ouvir("coldzap", (s) => { state.cz = s.docs.map((d) => ({ id: d.id, ...d.data() })); chegou("cz"); }, () => chegou("cz"));
    ouvir("coldzap_leads", (s) => { state.czLeads = s.docs.map((d) => ({ _id: d.id, ...d.data() })); state.czOk = true; chegou("czl"); }, () => { state.czOk = false; chegou("czl"); });
  });
})();
