// Aba APROVAÇÕES
//  - ADM: fila de pedidos de inclusão/exclusão de clientes, aprovar/reprovar (motivo obrigatório) e histórico.
//  - GM/SM (quem solicita): "Minhas solicitações", com a linha do tempo de cada pedido e o motivo das reprovações.
import { h, limpar, icone, botao, modal, toast, tabela, alerta, confirmar, num, dataHora, hoje, baixarExcel } from '../ui.js';
import { sb, rpc, consulta, buscarTudo, estado, ehAdm, atualizarAvisos, registrarEvento } from '../api.js';
import { cabecalho } from './comum.js';
import {
  DIAS, PERFIL_TXT, STATUS, MOTIVOS_REPROVACAO, badgeStatus, tipoSol, diasMini, idade, relativo, motivoBox, etapas,
  cartaoNovidade, modalPedido, dataCurta,
} from './solicitacoes.js';

const diasAtras = (n) => new Date(Date.now() - n * 864e5).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const agrupar = (lista, chave) => { const m = new Map(); for (const x of lista) { const k = chave(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
const contem = (s, t) => !t || [s.cod_cliente, s.nome_cliente, s.rota, s.solicitante_nome, s.gerencia, s.rota_repositor].some((v) => (v || '').toUpperCase().includes(t));

export async function render(el, params) {
  if (ehAdm()) await renderAdm(el, params);
  else await renderSolicitante(el, params);
  atualizarAvisos();
}

// =============================================================================
// ADM — fila de aprovação
// =============================================================================
async function renderAdm(el, params) {
  let aba = params.aba || 'pendentes';
  const abasEl = h('div', { class: 'abas' });
  const kpisEl = h('div', { class: 'kpis' });
  const corpo = h('div');
  el.append(cabecalho('Aprovações', 'Pedidos de inclusão e exclusão de clientes feitos pelos gerentes e supervisores de merchandising. Nada muda nas rotas até a aprovação.'), kpisEl, abasEl, corpo);
  let pend = [];
  let seq = 0;

  async function carregarKpis() {
    const desde = diasAtras(30);
    const [p, dec] = await Promise.all([
      buscarTudo(() => sb.from('vw_solicitacoes').select('*').eq('status', 'PENDENTE').order('criado_em')),
      buscarTudo(() => sb.from('solicitacoes_clientes').select('status, criado_em, decidido_em').in('status', ['APROVADA', 'REPROVADA']).gte('decidido_em', desde)),
    ]);
    pend = p;
    const apr = dec.filter((d) => d.status === 'APROVADA').length, rep = dec.length - apr;
    const medH = dec.length ? dec.reduce((s, d) => s + (new Date(d.decidido_em) - new Date(d.criado_em)), 0) / dec.length / 36e5 : null;
    const maisAntigo = pend[0]?.criado_em;
    const kpi = (v, l, cls = '') => h('div', { class: `kpi ${cls}` }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
    limpar(kpisEl,
      kpi(num(pend.length), 'Aguardando aprovação', pend.length ? 'alerta-kpi' : ''),
      kpi(maisAntigo ? relativo(maisAntigo).replace('há ', '') : '—', 'Pedido mais antigo na fila'),
      kpi(num(apr), 'Aprovados (30 dias)'),
      kpi(num(rep), 'Reprovados (30 dias)'),
      kpi(medH === null ? '—' : medH < 1 ? `${Math.round(medH * 60)} min` : medH < 48 ? `${medH.toFixed(1).replace('.', ',')} h` : `${Math.round(medH / 24)} dias`, 'Tempo médio de resposta (30 dias)'));
  }

  function desenharAbas() {
    limpar(abasEl, [['pendentes', `Pendentes${pend.length ? ` (${num(pend.length)})` : ''}`], ['historico', 'Histórico']].map(([k, t]) =>
      h('button', { type: 'button', class: aba === k ? 'ativo' : '', onclick: () => { aba = k; desenharAbas(); abrir(); } }, t)));
  }

  async function abrir({ recarregar = false } = {}) {
    const meu = ++seq;
    const alvo = h('div');
    if (recarregar) { await carregarKpis(); desenharAbas(); atualizarAvisos(); }
    if (meu !== seq) return;
    try {
      if (aba === 'pendentes') abaPendentes(alvo, pend, () => abrir({ recarregar: true }));
      else await abaHistorico(alvo);
    } catch (e) { limpar(alvo, alerta('erro', null, e.message)); }
    if (meu === seq) limpar(corpo, alvo);
  }

  await carregarKpis();
  desenharAbas();
  await abrir();
}

function abaPendentes(el, pend, recarregar) {
  if (!pend.length) {
    el.append(h('div', { class: 'card' }, h('div', { class: 'vazio' },
      h('div', { style: { fontSize: '34px', lineHeight: 1, marginBottom: '8px', color: 'var(--success)' } }, icone('check')),
      h('b', {}, 'Tudo em dia!'), h('div', {}, 'Nenhum pedido aguardando aprovação.'))));
    el.querySelector('.vazio svg').style.cssText = 'width:42px;height:42px';
    return;
  }
  const sel = new Set();
  const gers = [...new Set(pend.map((s) => s.gerencia))].sort();
  const fGer = h('select', {}, h('option', { value: '' }, 'Todas as gerências'), gers.map((g) => h('option', { value: g }, `${g} (${pend.filter((s) => s.gerencia === g).length})`)));
  const fBusca = h('input', { type: 'search', placeholder: 'Buscar cliente, rota ou solicitante' });
  let fTipo = '';
  const chipsTipo = h('div', { class: 'chips' });
  const barra = h('div', { class: 'barra-sel hidden' });
  const lista = h('div', { class: 'solic-lista' });

  function desenharChips() {
    const n = (t) => pend.filter((s) => !t || s.tipo === t).length;
    limpar(chipsTipo, [['', 'Todos'], ['INCLUSAO', 'Inclusões'], ['EXCLUSAO', 'Exclusões']].map(([k, t]) =>
      h('button', { type: 'button', class: `chip ${fTipo === k ? 'ativo' : ''}`, onclick: () => { fTipo = k; desenharChips(); desenhar(); } }, `${t} (${n(k)})`)));
  }
  const filtrados = () => {
    const t = fBusca.value.trim().toUpperCase();
    return pend.filter((s) => (!fGer.value || s.gerencia === fGer.value) && (!fTipo || s.tipo === fTipo) && contem(s, t));
  };

  function desenharBarra() {
    barra.classList.toggle('hidden', !sel.size);
    const ids = [...sel];
    limpar(barra, h('b', {}, `${num(sel.size)} item(ns) selecionado(s)`), h('div', { class: 'spacer' }),
      botao('Limpar seleção', { peq: true, onClick: () => { sel.clear(); desenhar(); } }),
      botao('Reprovar', { tipo: 'perigo', peq: true, icone: 'fechar', onClick: () => reprovar(ids) }),
      botao('Aprovar', { tipo: 'sucesso', peq: true, icone: 'check', onClick: () => aprovar(ids) }));
  }

  function desenhar() {
    const vis = filtrados();
    const lotes = agrupar(vis, (s) => s.lote);
    limpar(lista, lotes.size ? [...lotes.values()].map(cartaoLote) : h('div', { class: 'card' }, h('div', { class: 'vazio' }, 'Nenhum pedido no filtro.')));
    desenharBarra();
  }

  function cartaoLote(itens) {
    const s0 = itens[0];
    const ids = itens.map((s) => s.id);
    const todos = h('input', { type: 'checkbox', title: 'Selecionar o pedido inteiro', checked: ids.every((i) => sel.has(i)) });
    todos.style.cssText = 'width:17px;height:17px;margin-top:3px;accent-color:var(--primary)';
    todos.addEventListener('change', () => { ids.forEach((i) => (todos.checked ? sel.add(i) : sel.delete(i))); desenhar(); });
    const colunas = [
      { titulo: '', render: (s) => { const c = h('input', { type: 'checkbox', checked: sel.has(s.id) }); c.addEventListener('change', () => { c.checked ? sel.add(s.id) : sel.delete(s.id); desenhar(); }); return c; } },
      { titulo: 'Cód.', render: (s) => h('span', { class: 'mono' }, s.cod_cliente) },
      { titulo: 'Cliente', render: (s) => h('div', {}, h('div', {}, s.nome_cliente || ''), h('div', { class: 'muted small' }, [s.segmento, s.cidade, s.bairro].filter(Boolean).join(' · '))) },
      { titulo: s0.tipo === 'INCLUSAO' ? 'Dias pedidos' : 'Dias atuais', render: (s) => diasMini(s) },
      { titulo: 'Atenção', render: (s) => h('div', { class: 'row', style: { gap: '4px' } },
        s.tipo === 'INCLUSAO' && s.outras_rotas ? h('span', { class: 'badge azul', title: 'O cliente já é atendido por estas rotas' }, `Também em: ${s.outras_rotas}`) : null,
        s.tipo === 'INCLUSAO' && s.cliente_na_base === false ? h('span', { class: 'badge erro' }, 'Fora da base de clientes') : null,
        s.rota_ativa === false ? h('span', { class: 'badge erro' }, 'Rota inativa') : null) },
      { titulo: '', classe: 'right', render: (s) => h('div', { class: 'acoes-linha' },
        botao('', { peq: true, tipo: 'sutil', icone: 'check', titulo: 'Aprovar este item', onClick: () => aprovar([s.id]) }),
        botao('', { peq: true, tipo: 'perigo-sutil', icone: 'fechar', titulo: 'Reprovar este item', onClick: () => reprovar([s.id]) })) },
    ];
    return h('div', { class: `solic ${s0.tipo === 'INCLUSAO' ? 'inc' : 'exc'}` },
      h('div', { class: 'solic-h' },
        todos,
        h('div', { style: { flex: 1, minWidth: '240px' } },
          h('div', { class: 'row' }, tipoSol(s0.tipo), h('span', { class: 'tit' }, `${itens.length} cliente(s) · rota ${s0.rota}`), h('span', { class: 'badge cinza' }, s0.gerencia)),
          h('div', { class: 'sub' }, 'Repositor: ', s0.rota_repositor || h('i', {}, 'rota vaga'), ` · ${num(s0.clientes_na_rota)} cliente(s) hoje na rota`)),
        h('div', { style: { textAlign: 'right' } },
          h('div', { class: 'small' }, h('b', {}, s0.solicitante_nome), h('span', { class: 'muted' }, ` · ${PERFIL_TXT[s0.solicitante_perfil] || s0.solicitante_perfil || ''}`)),
          idade(s0.criado_em))),
      h('div', { class: 'solic-b' },
        h('div', { class: 'justif' }, h('b', {}, 'Justificativa'), s0.justificativa),
        tabela(colunas, itens)),
      h('div', { class: 'solic-f' },
        h('a', { href: `#/clientes?rota=${s0.posicao_id}`, class: 'small' }, `Abrir rota ${s0.rota}`),
        h('div', { class: 'spacer' }),
        botao(`Reprovar${itens.length > 1 ? ' tudo' : ''}`, { tipo: 'perigo-sutil', icone: 'fechar', onClick: () => reprovar(ids) }),
        botao(`Aprovar${itens.length > 1 ? ` tudo (${itens.length})` : ''}`, { tipo: 'sucesso', icone: 'check', onClick: () => aprovar(ids) })));
  }

  const porId = Object.fromEntries(pend.map((s) => [s.id, s]));
  function resumoItens(ids) {
    const it = ids.map((i) => porId[i]).filter(Boolean);
    const inc = it.filter((s) => s.tipo === 'INCLUSAO').length, exc = it.length - inc;
    const rotas = [...new Set(it.map((s) => s.rota))];
    return { it, txt: [inc ? `${inc} inclusão(ões)` : null, exc ? `${exc} exclusão(ões)` : null].filter(Boolean).join(' e ') + ` em ${rotas.length} rota(s): ${rotas.slice(0, 8).join(', ')}${rotas.length > 8 ? '…' : ''}` };
  }

  async function aprovar(ids) {
    const r0 = resumoItens(ids);
    if (!(await confirmar({ titulo: 'Aprovar pedido(s)', textoOk: 'Aprovar e aplicar', mensagem: h('div', { class: 'stack' },
      h('p', { style: { margin: 0 } }, `Aprovar ${r0.txt}?`),
      h('div', { class: 'muted small' }, 'A alteração é aplicada na hora nas rotas e fica registrada no log com o nome de quem pediu e de quem aprovou.')) }))) return;
    try {
      const r = await rpc('aprovar_solicitacoes', { p_ids: ids });
      ids.forEach((i) => sel.delete(i));
      if (r.erros) {
        modal({ titulo: 'Alguns itens não puderam ser aplicados', conteudo: h('div', { class: 'stack' },
          alerta('aviso', r.mensagem, 'Esses itens continuam pendentes. Você pode reprovar informando o motivo.'),
          tabela([{ titulo: 'Cliente', render: (x) => h('span', { class: 'mono' }, x.cod_cliente) }, { titulo: 'Problema', campo: 'mensagem' }], r.itens.filter((x) => x.status === 'erro'))),
        acoes: [{ texto: 'Entendi', tipo: 'primario' }] });
      } else toast(r.mensagem);
      recarregar();
    } catch (e) { toast(e.message, 'erro', 8000); }
  }

  function reprovar(ids) {
    const r0 = resumoItens(ids);
    const txt = h('textarea', { placeholder: 'Explique ao solicitante por que o pedido foi reprovado (ele verá este texto).', style: { minHeight: '90px' } });
    const cont = h('div', { class: 'ajuda' });
    const atual = () => { cont.textContent = `${txt.value.trim().length} caractere(s) · mínimo 5`; };
    txt.addEventListener('input', atual); atual();
    const m = modal({
      titulo: 'Reprovar pedido(s)',
      conteudo: h('div', { class: 'stack' },
        h('p', { style: { margin: 0 } }, `Reprovar ${r0.txt}.`),
        h('div', { class: 'campo' }, h('label', {}, 'Motivo da reprovação *'),
          h('div', { class: 'chips' }, MOTIVOS_REPROVACAO.map((t) => h('button', { type: 'button', class: 'chip', onclick: () => { txt.value = t; atual(); txt.focus(); } }, t))),
          txt, cont),
        alerta('info', null, 'O solicitante recebe um aviso com o motivo assim que entrar no portal.')),
      acoes: [{ texto: 'Cancelar' }, { texto: 'Reprovar', tipo: 'perigo', icone: 'fechar', onClick: async () => {
        if (txt.value.trim().length < 5) { toast('Informe o motivo (mínimo 5 caracteres).', 'aviso'); txt.focus(); return; }
        try {
          const r = await rpc('reprovar_solicitacoes', { p_ids: ids, p_motivo: txt.value });
          ids.forEach((i) => sel.delete(i));
          toast(r.mensagem); m.fechar(); recarregar();
        } catch (e) { toast(e.message, 'erro', 8000); }
      } }],
    });
  }

  fGer.addEventListener('change', desenhar);
  fBusca.addEventListener('input', desenhar);
  el.append(
    h('div', { class: 'toolbar', style: { marginBottom: '12px' } }, fGer, chipsTipo, h('div', { class: 'spacer' }), fBusca,
      botao('Selecionar todos do filtro', { peq: true, onClick: () => { filtrados().forEach((s) => sel.add(s.id)); desenhar(); } })),
    barra, lista);
  desenharChips(); desenhar();
}

async function abaHistorico(el) {
  const f = {
    de: h('input', { type: 'date', value: diasAtras(30) }), ate: h('input', { type: 'date', value: hoje() }),
    status: h('select', {}, h('option', { value: '' }, 'Todas as decisões'), ['APROVADA', 'REPROVADA', 'CANCELADA'].map((k) => h('option', { value: k }, STATUS[k][0]))),
    ger: h('select', {}, h('option', { value: '' }, 'Todas as gerências'), estado.gerencias.map((g) => h('option', { value: g.codigo }, g.codigo))),
    busca: h('input', { type: 'search', placeholder: 'Cliente, rota ou solicitante' }),
  };
  const area = h('div');
  let dados = [];
  async function buscar() {
    limpar(area, h('div', { class: 'carregando' }, h('span', { class: 'spinner' })));
    dados = await buscarTudo(() => {
      let q = sb.from('vw_solicitacoes').select('*').neq('status', 'PENDENTE')
        .gte('criado_em', `${f.de.value}T00:00:00-03:00`).lte('criado_em', `${f.ate.value}T23:59:59-03:00`)
        .order('decidido_em', { ascending: false });
      if (f.status.value) q = q.eq('status', f.status.value);
      if (f.ger.value) q = q.eq('gerencia', f.ger.value);
      return q;
    }, { limite: 20000 });
    desenhar();
  }
  function desenhar() {
    const t = f.busca.value.trim().toUpperCase();
    const lista = dados.filter((s) => contem(s, t));
    limpar(area, h('div', { class: 'card' },
      h('div', { class: 'card-h' }, h('h2', {}, `${num(lista.length)} pedido(s) decidido(s)`), h('div', { class: 'spacer' }),
        botao('Exportar Excel', { icone: 'excel', peq: true, onClick: () => exportar(lista) })),
      tabela([
        { titulo: 'Pedido em', render: (s) => h('span', { class: 'small nowrap' }, dataCurta(s.criado_em)) },
        { titulo: 'Tipo', render: (s) => tipoSol(s.tipo) },
        { titulo: 'Rota', render: (s) => h('div', {}, h('b', { class: 'mono' }, s.rota), h('div', { class: 'muted small nowrap' }, s.gerencia)) },
        { titulo: 'Cliente', render: (s) => h('div', {}, h('span', { class: 'mono' }, s.cod_cliente), h('div', { class: 'small' }, s.nome_cliente || '')) },
        { titulo: 'Solicitante', render: (s) => h('span', { class: 'small' }, s.solicitante_nome) },
        { titulo: 'Decisão', render: (s) => h('div', {}, badgeStatus(s.status), h('div', { class: 'muted small' }, `${s.decidido_por_nome || ''} · ${dataCurta(s.decidido_em)}`)) },
        { titulo: 'Motivo / observação', render: (s) => h('span', { class: 'small', style: { color: s.status === 'REPROVADA' ? 'var(--danger)' : '' } }, s.motivo_reprovacao || s.resultado || '') },
      ], lista.slice(0, 1000), { vazio: 'Nenhum pedido decidido no período.' }),
      lista.length > 1000 ? h('div', { class: 'paginacao' }, `Mostrando 1.000 de ${num(lista.length)} — use o Excel para ver tudo.`) : null));
  }
  function exportar(lista) {
    baixarExcel(`Aprovacoes_clientes_${hoje()}.xlsx`, [{ nome: 'Aprovações', linhas: lista, colunas: colunasExport() }]);
    registrarEvento('EXPORTACAO', `Exportou o histórico de aprovações (${lista.length} linhas)`);
  }
  [f.de, f.ate, f.status, f.ger].forEach((x) => x.addEventListener('change', buscar));
  f.busca.addEventListener('input', desenhar);
  el.append(h('div', { class: 'toolbar', style: { marginBottom: '12px' } }, f.de, f.ate, f.status, f.ger, h('div', { class: 'spacer' }), f.busca), area);
  await buscar();
}

function colunasExport() {
  return [
    { titulo: 'Nº', campo: 'id' }, { titulo: 'Pedido em', campo: (s) => dataHora(s.criado_em), largura: 20 },
    { titulo: 'Tipo', campo: (s) => (s.tipo === 'INCLUSAO' ? 'Inclusão' : 'Exclusão') }, { titulo: 'Gerência', campo: 'gerencia' }, { titulo: 'Rota RP', campo: 'rota' },
    { titulo: 'PV', campo: 'cod_cliente' }, { titulo: 'Nome Fantasia', campo: 'nome_cliente', largura: 32 },
    ...DIAS.map(([k, t]) => ({ titulo: t, campo: (v) => (v[k] ? 1 : null), largura: 6 })),
    { titulo: 'Solicitante', campo: 'solicitante_nome', largura: 28 }, { titulo: 'Justificativa', campo: 'justificativa', largura: 40 },
    { titulo: 'Status', campo: (s) => STATUS[s.status]?.[0] || s.status, largura: 20 }, { titulo: 'Decidido por', campo: 'decidido_por_nome', largura: 28 },
    { titulo: 'Decidido em', campo: (s) => dataHora(s.decidido_em), largura: 20 }, { titulo: 'Motivo da reprovação', campo: 'motivo_reprovacao', largura: 44 },
    { titulo: 'Observação', campo: 'resultado', largura: 36 },
  ];
}

// =============================================================================
// GM/SM — Minhas solicitações
// =============================================================================
async function renderSolicitante(el) {
  const meuId = estado.usuario.id;
  let escopo = 'minhas', aba = 'todas';
  const novEl = h('div');
  const kpisEl = h('div', { class: 'kpis' });
  const abasEl = h('div', { class: 'abas' });
  const filtros = h('div', { class: 'toolbar', style: { marginBottom: '12px' } });
  const lista = h('div', { class: 'solic-lista' });
  const busca = h('input', { type: 'search', placeholder: 'Buscar cliente ou rota' });
  el.append(cabecalho('Minhas solicitações', 'Acompanhe seus pedidos de inclusão e exclusão de clientes. A Administração de Vendas aprova ou reprova cada um — e, se reprovar, o motivo aparece aqui.',
    [botao('Novo pedido', { tipo: 'primario', icone: 'mais', onClick: () => window.irPara('clientes') })]), novEl, kpisEl, abasEl, filtros, lista);
  let dados = [];

  async function carregar() {
    dados = await buscarTudo(() => {
      let q = sb.from('vw_solicitacoes').select('*').order('criado_em', { ascending: false });
      if (escopo === 'minhas') q = q.eq('solicitante_id', meuId);
      return q;
    }, { limite: 5000 });
    const meus = dados.filter((s) => s.solicitante_id === meuId);
    const novas = meus.filter((s) => ['APROVADA', 'REPROVADA'].includes(s.status) && !s.ciente_em);
    limpar(novEl, novas.length ? h('div', { class: 'card', style: { marginBottom: '16px', borderColor: novas.some((s) => s.status === 'REPROVADA') ? 'var(--danger-line)' : '' } },
      h('div', { class: 'card-h' }, icone('sino'), h('h2', {}, `Novidades (${novas.length})`), h('span', { class: 'muted small' }, 'Decisões que você ainda não viu'), h('div', { class: 'spacer' }),
        botao('Ciente', { tipo: 'primario', peq: true, icone: 'check', onClick: async () => {
          await rpc('marcar_solicitacoes_cientes', { p_ids: novas.map((s) => s.id) }); await atualizarAvisos(); carregar();
        } })),
      h('div', { class: 'card-b stack' }, novas.sort((a, b) => (a.status === 'REPROVADA' ? -1 : 1) - (b.status === 'REPROVADA' ? -1 : 1)).slice(0, 20).map((s) => cartaoNovidade(s)))) : null);
    novEl.querySelector('.card-h svg')?.setAttribute('style', 'width:18px;height:18px;color:var(--primary)');
    const n = (st) => dados.filter((s) => s.status === st).length;
    const kpi = (v, l, cls = '') => h('div', { class: `kpi ${cls}` }, h('div', { class: 'v' }, num(v)), h('div', { class: 'l' }, l));
    limpar(kpisEl, kpi(n('PENDENTE'), 'Aguardando aprovação'), kpi(n('APROVADA'), 'Aprovadas'), kpi(n('REPROVADA'), 'Reprovadas', n('REPROVADA') ? 'alerta-kpi' : ''), kpi(n('CANCELADA'), 'Canceladas'));
    desenharAbas(); desenhar();
  }

  function desenharAbas() {
    const n = (st) => dados.filter((s) => !st || s.status === st).length;
    limpar(abasEl, [['todas', 'Todas', ''], ['PENDENTE', 'Aguardando', 'PENDENTE'], ['REPROVADA', 'Reprovadas', 'REPROVADA'], ['APROVADA', 'Aprovadas', 'APROVADA'], ['CANCELADA', 'Canceladas', 'CANCELADA']].map(([k, t, st]) =>
      h('button', { type: 'button', class: aba === k ? 'ativo' : '', onclick: () => { aba = k; desenharAbas(); desenhar(); } }, `${t} (${num(n(st))})`)));
    limpar(filtros,
      h('div', { class: 'chips' }, [['minhas', 'Só as minhas'], ['gerencia', 'Toda a minha gerência']].map(([k, t]) =>
        h('button', { type: 'button', class: `chip ${escopo === k ? 'ativo' : ''}`, onclick: () => { escopo = k; carregar(); } }, t))),
      h('div', { class: 'spacer' }), busca);
  }

  function desenhar() {
    const t = busca.value.trim().toUpperCase();
    const vis = dados.filter((s) => (aba === 'todas' || s.status === aba) && contem(s, t));
    // um cartão por pedido (lote) e status
    const grupos = agrupar(vis, (s) => `${s.lote}|${aba === 'todas' ? '' : s.status}`);
    limpar(lista, grupos.size ? [...grupos.values()].slice(0, 200).map(cartao)
      : h('div', { class: 'card' }, h('div', { class: 'vazio' }, dados.length ? 'Nenhum pedido neste filtro.' : 'Você ainda não fez nenhum pedido. Vá em Clientes das rotas, escolha a rota e use "Solicitar inclusão" ou "Solicitar exclusão".')));
  }

  function cartao(itens) {
    const s0 = itens[0];
    const meu = s0.solicitante_id === meuId;
    const status = [...new Set(itens.map((s) => s.status))];
    const unico = status.length === 1 ? status[0] : null;
    const pendentes = itens.filter((s) => s.status === 'PENDENTE');
    const rota = { id: s0.posicao_id, codigo: s0.rota, gerencia: s0.gerencia };
    const linhas = [];
    for (const s of itens) {
      linhas.push(h('tr', {},
        h('td', {}, h('span', { class: 'mono' }, s.cod_cliente)),
        h('td', {}, s.nome_cliente || ''),
        h('td', {}, diasMini(s)),
        h('td', {}, badgeStatus(s.status), s.resultado ? h('div', { class: 'muted small' }, s.resultado) : null),
        h('td', { class: 'right' }, meu && s.status === 'REPROVADA'
          ? botao('Corrigir e reenviar', { peq: true, icone: 'enviar', onClick: () => modalPedido({
            rota, tipo: s.tipo, itens: [Object.fromEntries([['cod_cliente', s.cod_cliente], ...DIAS.map(([k]) => [k, s[k]])])],
            titulo: `Reenviar pedido · ${s.cod_cliente} na rota ${s.rota}`, justificativa: s.justificativa,
            aviso: motivoBox(s), aoConcluir: carregar }) })
          : meu && s.status === 'PENDENTE' ? botao('', { peq: true, tipo: 'sutil', icone: 'fechar', titulo: 'Cancelar este item', onClick: () => cancelar([s.id]) }) : null)));
      if (s.status === 'REPROVADA') linhas.push(h('tr', {}, h('td', { colspan: 5, style: { paddingTop: 0 } }, motivoBox(s))));
    }
    return h('div', { class: `solic ${s0.tipo === 'INCLUSAO' ? 'inc' : 'exc'}` },
      h('div', { class: 'solic-h' },
        h('div', { style: { flex: 1, minWidth: '240px' } },
          h('div', { class: 'row' }, tipoSol(s0.tipo), h('span', { class: 'tit' }, `${itens.length} cliente(s) · rota ${s0.rota}`), h('span', { class: 'badge cinza' }, s0.gerencia)),
          h('div', { class: 'sub' }, meu ? 'Pedido seu' : `Pedido de ${s0.solicitante_nome}`, ` · ${dataCurta(s0.criado_em)} (${relativo(s0.criado_em)})`)),
        h('div', { style: { width: '320px', maxWidth: '100%' } }, unico ? etapas(s0) : h('span', { class: 'badge azul' }, 'Decisão parcial'))),
      h('div', { class: 'solic-b' },
        h('div', { class: 'justif' }, h('b', {}, 'Justificativa'), s0.justificativa),
        h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela' },
          h('thead', {}, h('tr', {}, ['Cód.', 'Cliente', s0.tipo === 'INCLUSAO' ? 'Dias pedidos' : 'Dias', 'Situação', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, linhas)))),
      meu && pendentes.length > 1 ? h('div', { class: 'solic-f' }, h('span', { class: 'muted small' }, 'Aguardando a Administração de Vendas'), h('div', { class: 'spacer' }),
        botao('Cancelar pedido', { tipo: 'perigo-sutil', peq: true, icone: 'fechar', onClick: () => cancelar(pendentes.map((s) => s.id)) })) : null);
  }

  async function cancelar(ids) {
    if (!(await confirmar({ titulo: 'Cancelar pedido', mensagem: `Cancelar ${ids.length} item(ns) deste pedido? Nada será alterado na rota.`, textoOk: 'Cancelar pedido', textoCancelar: 'Voltar', perigo: true }))) return;
    try { const r = await rpc('cancelar_solicitacoes', { p_ids: ids }); toast(r.mensagem); atualizarAvisos(); carregar(); }
    catch (e) { toast(e.message, 'erro'); }
  }

  busca.addEventListener('input', desenhar);
  await carregar();
}
