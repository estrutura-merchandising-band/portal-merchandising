// Utilitários de interface: criação de elementos, modais, avisos, tabelas, formatação e Excel.

export function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  anexar(el, filhos);
  return el;
}
function anexar(el, filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
}
export const limpar = (el, ...filhos) => { el.replaceChildren(); anexar(el, filhos); return el; };

// ---------- Ícones (SVG inline) ----------
const P = {
  painel: 'M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z',
  estrutura: 'M12 2a3 3 0 0 0-1 5.83V10H6a2 2 0 0 0-2 2v2.17a3 3 0 1 0 2 0V12h5v2.17a3 3 0 1 0 2 0V12h5v2.17a3 3 0 1 0 2 0V12a2 2 0 0 0-2-2h-5V7.83A3 3 0 0 0 12 2z',
  clientes: 'M4 4h16v4H4zm0 6h7v10H4zm9 0h7v4h-7zm0 6h7v4h-7z',
  pendencias: 'M12 2 1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z',
  fechamento: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14v11zM9.5 17.5l-3-3 1.4-1.4 1.6 1.6 5.6-5.6 1.4 1.4-7 7z',
  bases: 'M12 3C7.6 3 4 4.3 4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6c0-1.7-3.6-3-8-3zm0 2c3.9 0 6 .9 6 1s-2.1 1-6 1-6-.9-6-1 2.1-1 6-1zm6 13c0 .1-2.1 1-6 1s-6-.9-6-1v-2.3c1.5.8 3.7 1.3 6 1.3s4.5-.5 6-1.3V18zm0-5c0 .1-2.1 1-6 1s-6-.9-6-1v-2.3c1.5.8 3.7 1.3 6 1.3s4.5-.5 6-1.3V13z',
  log: 'M13 3a9 9 0 0 0-9 9H1l4 4 4-4H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
  usuarios: 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 1.9 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z',
  conta: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z',
  mais: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  excel: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8.5 18l2.3-3.5L8.5 11h1.9l1.4 2.3 1.4-2.3h1.9l-2.3 3.5 2.3 3.5h-1.9l-1.4-2.3-1.4 2.3H8.5z',
  upload: 'M5 20h14v-2H5v2zm0-10h4v6h6v-6h4l-7-7-7 7z',
  pessoa: 'M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2zm9 4c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z',
  fechar: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',
  menu: 'M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z',
  sair: 'M10 17l1.4-1.4L8.8 13H20v-2H8.8l2.6-2.6L10 7l-5 5 5 5zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4V5z',
  lixo: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  troca: 'M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z',
  remover: 'M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-14-2v2h8v-2H1zm14 4c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z',
  lista: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
  editar: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  chave: 'M12.65 10A6 6 0 1 0 7 18a6 6 0 0 0 5.65-4H17v4h4v-4h2v-4H12.65zM7 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4z',
  bloquear: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM4 12a8 8 0 0 1 12.9-6.3L5.7 16.9A7.9 7.9 0 0 1 4 12zm8 8a7.9 7.9 0 0 1-4.9-1.7L18.3 7.1A8 8 0 0 1 12 20z',
  aprovacoes: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-2 14-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
  integracao: 'M12 4V1L8 5l4 4V6a6 6 0 0 1 6 6 5.87 5.87 0 0 1-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12a8 8 0 0 0-8-8zm0 14a6 6 0 0 1-6-6 5.87 5.87 0 0 1 .7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12a8 8 0 0 0 8 8v3l4-4-4-4v3z',
  check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  relogio: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
  enviar: 'M2.01 21 23 12 2.01 3 2 10l15 2-15 2z',
  sino: 'M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
  menos: 'M19 13H5v-2h14v2z',
  sol: 'M6.76 4.84 4.96 3.05 3.55 4.46l1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7 1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91 1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z',
  lua: 'M12.3 22h-.1a10.31 10.31 0 0 1-7.34-3.15 10.46 10.46 0 0 1-.26-14 10.13 10.13 0 0 1 4-2.74 1 1 0 0 1 1.06.22 1 1 0 0 1 .24 1 8.4 8.4 0 0 0 1.94 8.81 8.47 8.47 0 0 0 8.83 1.94 1 1 0 0 1 1.27 1.29A10.16 10.16 0 0 1 19.6 19a10.28 10.28 0 0 1-7.3 3z',
  recolher: 'M18.41 16.59 13.82 12l4.59-4.59L17 6l-6 6 6 6zM11.41 16.59 6.82 12l4.59-4.59L10 6l-6 6 6 6z',
  abaixo: 'M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z',
  direita: 'M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z',
  loja: 'M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z',
  pino: 'M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z',
  busca: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
};
export function icone(nome) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'currentColor'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', P[nome] || ''); s.append(p);
  return s;
}

export function botao(texto, { tipo = '', icone: ic, onClick, titulo, desabilitado, peq } = {}) {
  return h('button', { type: 'button', class: `btn ${tipo} ${peq ? 'peq' : ''}`, title: titulo, onclick: onClick, disabled: !!desabilitado },
    ic ? icone(ic) : null, texto);
}

// ---------- Avisos ----------
export function toast(msg, tipo = 'ok', ms = 4200) {
  const t = h('div', { class: `toast ${tipo}` }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- Modais ----------
export function modal({ titulo, conteudo, acoes = [], tamanho = '', aoFechar, fecharFora = true }) {
  const corpo = h('div', { class: 'modal-b' }, conteudo);
  const rodape = h('div', { class: 'modal-f' });
  const caixa = h('div', { class: `modal ${tamanho}`, role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'modal-h' }, h('h3', {}, titulo), h('button', { class: 'btn sutil icone', type: 'button', title: 'Fechar', onclick: () => fechar() }, icone('fechar'))),
    corpo, rodape);
  const fundo = h('div', { class: 'modal-fundo' }, caixa);
  if (fecharFora) fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(); });
  const esc = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', esc);
  let fechado = false;
  function fechar(valor) {
    if (fechado) return; fechado = true;
    document.removeEventListener('keydown', esc);
    fundo.remove();
    aoFechar && aoFechar(valor);
  }
  function definirAcoes(lista) {
    limpar(rodape, lista.map((a) => {
      const b = botao(a.texto, { tipo: a.tipo, icone: a.icone, desabilitado: a.desabilitado });
      b.addEventListener('click', async () => {
        if (!a.onClick) return fechar();
        b.disabled = true; const orig = b.innerHTML; b.innerHTML = '<span class="spinner"></span> ' + a.texto;
        try { await a.onClick({ fechar, corpo, botao: b }); }
        finally { if (!fechado) { b.disabled = false; b.innerHTML = orig; } }
      });
      return b;
    }));
  }
  definirAcoes(acoes);
  document.getElementById('modais').append(fundo);
  setTimeout(() => caixa.querySelector('input:not([type=checkbox]):not([type=radio]), textarea, select')?.focus(), 30);
  return { fechar, corpo, definirAcoes, caixa };
}

export function confirmar({ titulo = 'Confirmar', mensagem, textoOk = 'Confirmar', perigo = false, textoCancelar = 'Cancelar' }) {
  return new Promise((ok) => {
    let resp = false;
    const m = modal({
      titulo, conteudo: typeof mensagem === 'string' ? h('p', { style: { margin: 0 } }, mensagem) : mensagem,
      aoFechar: () => ok(resp),
      acoes: [{ texto: textoCancelar }, { texto: textoOk, tipo: perigo ? 'perigo' : 'primario', onClick: () => { resp = true; m.fechar(); } }],
    });
  });
}

export function pedirTexto({ titulo, rotulo, valor = '', ajuda, textoOk = 'Salvar', multilinha = false, obrigatorio = false }) {
  return new Promise((ok) => {
    let resp = null;
    const inp = multilinha ? h('textarea', {}, valor) : h('input', { type: 'text', value: valor });
    const m = modal({
      titulo, conteudo: h('div', { class: 'campo' }, h('label', {}, rotulo), inp, ajuda ? h('div', { class: 'ajuda' }, ajuda) : null),
      aoFechar: () => ok(resp),
      acoes: [{ texto: 'Cancelar' }, { texto: textoOk, tipo: 'primario', onClick: () => {
        if (obrigatorio && !inp.value.trim()) { inp.focus(); return; }
        resp = inp.value; m.fechar();
      } }],
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !multilinha) m.caixa.querySelector('.modal-f .primario')?.click(); });
  });
}

export function alerta(tipo, titulo, texto) {
  return h('div', { class: `alerta ${tipo}` }, h('div', {}, titulo ? h('b', {}, titulo) : null, texto));
}

// ---------- Tabela ----------
// colunas: [{ titulo, campo, render(linha), classe, th }]
export function tabela(colunas, linhas, { vazio = 'Nenhum registro.', classeLinha, aoClicar } = {}) {
  const thead = h('thead', {}, h('tr', {}, colunas.map((c) => h('th', { class: c.classe || '' }, c.titulo))));
  const tbody = h('tbody');
  if (!linhas.length) tbody.append(h('tr', {}, h('td', { colspan: colunas.length, class: 'vazio' }, vazio)));
  for (const l of linhas) {
    const tr = h('tr', { class: (classeLinha ? classeLinha(l) : '') + (aoClicar ? ' clicavel' : '') },
      colunas.map((c) => h('td', { class: c.classe || '' }, c.render ? c.render(l) : (l[c.campo] ?? ''))));
    if (aoClicar) tr.addEventListener('click', (e) => { if (!e.target.closest('button, input, a, label')) aoClicar(l); });
    tbody.append(tr);
  }
  return h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela' }, thead, tbody));
}

// ---------- Formatação ----------
const fmtDH = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fmtD = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
export const dataHora = (v) => (v ? fmtDH.format(new Date(v)) : '');
export const data = (v) => (v ? fmtD.format(new Date(v)) : '');
export const competenciaTxt = (d) => { if (!d) return ''; const [a, m] = String(d).split('-'); return `${m}/${a}`; };
export const num = (n) => (n ?? 0).toLocaleString('pt-BR');
export function debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const normCab = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]/g, '');
export function normCodigo(v) {
  if (v === null || v === undefined) return null;
  let s = (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(v)) : String(v)).replace(/[\s ]+/g, '').replace(/\.0+$/, '');
  if (!s) return null;
  if (/^\d+$/.test(s)) s = s.replace(/^0+(?=\d)/, '');
  return s.toUpperCase();
}
export const limpaTxt = (v) => { if (v === null || v === undefined) return null; const s = String(v).replace(/^[\s ]+|[\s ]+$/g, ''); return s || null; };
export function seguro(fn) { try { return fn(); } catch { return null; } }

export const NIVEIS = {
  GC: 'Gerente Comercial', GM: 'Gerente de Merchandising', SM: 'Supervisor de Merchandising', LM: 'Líder de Merchandising', RP: 'Repositor (rota)', ADM: 'Administração de Vendas',
};
export function badgeSituacao(sit, naBase = true) {
  if (naBase === false) return h('span', { class: 'badge erro' }, 'Fora da base');
  if (!sit) return h('span', { class: 'badge cinza' }, '—');
  const s = semAcento(sit).toUpperCase();
  if (s.startsWith('ATIVIDADE NORMAL')) return h('span', { class: 'badge ok' }, 'Ativo');
  if (s.includes('FERIAS')) return h('span', { class: 'badge azul' }, 'Férias');
  if (s.includes('AFAST') || s.includes('LICENCA')) return h('span', { class: 'badge aviso' }, sit.toLowerCase().replace(/^./, (c) => c.toUpperCase()));
  return h('span', { class: 'badge cinza' }, sit);
}

// ---------- Excel ----------
// Lê uma planilha e encontra a aba/linha de cabeçalho que contém as colunas exigidas.
// mapa: { campo: ['nomes', 'possiveis'] } (normalizados com normCab). obrigatorios: campos que precisam existir.
export async function lerPlanilha(arquivo, mapa, obrigatorios) {
  const buf = await arquivo.arrayBuffer();
  const amostra = XLSX.read(buf, { type: 'array', sheetRows: 30 });
  let achado = null;
  for (const nome of amostra.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json(amostra.Sheets[nome], { header: 1, defval: null, blankrows: true, raw: true });
    for (let i = 0; i < linhas.length && !achado; i++) {
      const cab = (linhas[i] || []).map(normCab);
      const col = {};
      for (const [campo, nomes] of Object.entries(mapa)) {
        // respeita a ordem de preferência dos nomes (ex.: "Descrição CC" antes de "Centro de custo")
        for (const n of nomes) { const idx = cab.indexOf(n); if (idx >= 0) { col[campo] = idx; break; } }
      }
      if (obrigatorios.every((c) => col[c] !== undefined)) achado = { aba: nome, linhaCab: i, col };
    }
    if (achado) break;
  }
  if (!achado) {
    throw new Error(`Não encontrei as colunas obrigatórias (${obrigatorios.map((c) => mapa[c][0]).join(', ')}) em nenhuma aba do arquivo.`);
  }
  const wb = XLSX.read(buf, { type: 'array', sheets: [achado.aba], dense: true, cellDates: true });
  const todas = XLSX.utils.sheet_to_json(wb.Sheets[achado.aba], { header: 1, defval: null, blankrows: false, raw: true });
  // localizar novamente o cabeçalho (blankrows false pode mudar o índice)
  let ini = todas.findIndex((l) => obrigatorios.every((c) => normCab((l || [])[achado.col[c]]) && mapa[c].includes(normCab(l[achado.col[c]]))));
  if (ini < 0) ini = 0;
  const linhas = [];
  for (let i = ini + 1; i < todas.length; i++) {
    const l = todas[i]; const o = {};
    let algum = false;
    for (const [campo, idx] of Object.entries(achado.col)) { o[campo] = l[idx] ?? null; if (o[campo] !== null && o[campo] !== '') algum = true; }
    if (algum) linhas.push(o);
  }
  return { aba: achado.aba, colunas: Object.keys(achado.col), linhas };
}

// Datas vão como número de série do Excel (evita deslocamento de fuso horário).
function celula(v) {
  if (v instanceof Date) return { t: 'n', v: (Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()) - Date.UTC(1899, 11, 30)) / 864e5, z: 'dd/mm/yyyy' };
  return v;
}

export function baixarExcel(nomeArquivo, abas) {
  // abas: [{ nome, linhas: [obj], colunas: [{titulo, campo, largura}] }]
  const wb = XLSX.utils.book_new();
  for (const a of abas) {
    const aoa = [a.colunas.map((c) => c.titulo)];
    for (const l of a.linhas) aoa.push(a.colunas.map((c) => celula((typeof c.campo === 'function' ? c.campo(l) : l[c.campo]) ?? null)));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = a.colunas.map((c) => ({ wch: c.largura || Math.max(10, Math.min(45, String(c.titulo).length + 4)) }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: a.colunas.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, a.nome.slice(0, 31));
  }
  XLSX.writeFile(wb, nomeArquivo, { compression: true });
}

export function seletorArquivo(aceita = '.xlsx,.xls,.xlsb,.csv') {
  return new Promise((ok) => {
    const inp = h('input', { type: 'file', accept: aceita, style: { display: 'none' } });
    inp.addEventListener('change', () => { ok(inp.files[0] || null); inp.remove(); });
    document.body.append(inp); inp.click();
  });
}

// ---------- Telefone (XX) XXXXX-XXXX ----------
export function digitosTelefone(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 12 && d.startsWith('0')) d = d.slice(1);
  return d;
}
export function fmtTelefone(v) {
  const d = digitosTelefone(v);
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : (v || '');
}
export const telefoneValido = (v) => { const d = digitosTelefone(v); return d.length === 0 || d.length === 11; };
// Aplica a máscara enquanto a pessoa digita; aceita só números (até 11).
export function mascaraTelefone(inp) {
  inp.setAttribute('inputmode', 'numeric');
  inp.setAttribute('placeholder', '(XX) XXXXX-XXXX');
  inp.maxLength = 15;
  const aplicar = () => {
    const d = inp.value.replace(/\D/g, '').slice(0, 11);
    let s = d;
    if (d.length > 0) s = '(' + d.slice(0, 2);
    if (d.length >= 2) s += ') ' + d.slice(2, 7);
    if (d.length > 7) s += '-' + d.slice(7);
    inp.value = s;
  };
  inp.addEventListener('input', aplicar);
  if (inp.value) aplicar();
  return inp;
}

export const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD
