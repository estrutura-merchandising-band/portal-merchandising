import { h, limpar, botao, modal, toast, tabela, alerta, confirmar, debounce, num, baixarExcel, hoje, lerPlanilha, seletorArquivo, normCodigo, badgeSituacao, icone } from '../ui.js';
import { sb, rpc, consulta, buscarTudo, estado, definirGerencia, podeEditarClientes, podeEditarDias, podeSolicitarClientes, registrarEvento, ehAdm, atualizarAvisos } from '../api.js';
import { cabecalho, semGerencias } from './comum.js';
import { modalPedido, campoJustificativa, enviarSolicitacao, resultadoSolicitacao, motivoBox, tipoSol, relativo } from './solicitacoes.js';

const DIAS = [['seg', 'SEG'], ['ter', 'TER'], ['qua', 'QUA'], ['qui', 'QUI'], ['sex', 'SEX'], ['sab', 'SAB']];

export async function render(el, params) {
  let rotaId = params.rota ? Number(params.rota) : null;
  if (rotaId) {
    const p = await consulta(sb.from('vw_posicoes').select('gerencia').eq('id', rotaId).maybeSingle());
    if (p && estado.gerencias.some((g) => g.codigo === p.gerencia)) definirGerencia(p.gerencia); else rotaId = null;
  }
  if (!estado.gerenciaAtual) { el.append(cabecalho('Clientes das rotas'), semGerencias()); return; }

  const listaEl = h('div', { class: 'lista-rotas' });
  const detalhe = h('div', { class: 'card' });
  const buscaRota = h('input', { type: 'search', placeholder: 'Filtrar rotas', style: { width: '100%' } });
  const acoesTopo = h('div', { class: 'acoes' });
  el.append(
    h('div', { class: 'cabecalho' }, h('div', {}, h('h1', {}, 'Clientes das rotas'), h('p', {}, 'Cadastro de clientes atendidos por cada rota de repositor. Só é permitido cliente da mesma gerência da rota.')), acoesTopo),
    h('div', { class: 'md' },
      h('div', { class: 'card' }, h('div', { class: 'card-h' }, buscaRota), listaEl),
      detalhe));

  let rotas = [], qtd = {}, pendQtd = {};
  buscaRota.addEventListener('input', desenharLista);

  function montarAcoesTopo() {
    const g = estado.gerenciaAtual;
    limpar(acoesTopo,
      botao('Onde está o cliente?', { icone: 'busca', onClick: ondeEsta }),
      botao('Exportar gerência', { icone: 'excel', onClick: exportarGerencia }),
      podeEditarClientes(g) || ehAdm() ? botao('Importar planilha', { icone: 'upload', onClick: () => importarPlanilha(() => carregarRotas()) }) : null);
  }

  async function carregarRotas() {
    montarAcoesTopo();
    const g = estado.gerenciaAtual;
    limpar(listaEl, h('div', { class: 'carregando' }, h('span', { class: 'spinner' })));
    const [r, q, pd] = await Promise.all([
      consulta(sb.from('vw_posicoes').select('id, codigo, matricula, nome, ativa, gerencia, situacao, colaborador_na_base').eq('gerencia', g).eq('nivel', 'RP').eq('ativa', true).order('codigo')),
      rpc('qtd_clientes_rotas', { p_gerencia: g }),
      consulta(sb.from('solicitacoes_clientes').select('posicao_id').eq('gerencia', g).eq('status', 'PENDENTE').limit(5000)),
    ]);
    rotas = r; qtd = Object.fromEntries((q || []).map((x) => [x.posicao_id, x.qtd]));
    pendQtd = {}; for (const x of pd || []) pendQtd[x.posicao_id] = (pendQtd[x.posicao_id] || 0) + 1;
    if (!rotaId || !rotas.some((x) => x.id === rotaId)) rotaId = rotas[0]?.id || null;
    desenharLista();
    carregarDetalhe();
  }

  function desenharLista() {
    const t = buscaRota.value.trim().toUpperCase();
    const lista = rotas.filter((r) => !t || r.codigo.includes(t) || (r.nome || '').toUpperCase().includes(t));
    limpar(listaEl, lista.length ? lista.map((r) => h('div', { class: `item ${r.id === rotaId ? 'ativo' : ''}`, onclick: () => { rotaId = r.id; desenharLista(); carregarDetalhe(); } },
      h('span', { class: 'cod' }, r.codigo),
      h('span', { class: 'quem' }, r.nome || h('i', {}, 'vaga')),
      pendQtd[r.id] ? h('span', { class: 'pend', title: `${pendQtd[r.id]} pedido(s) aguardando aprovação` }, icone('relogio'), pendQtd[r.id]) : null,
      h('span', { class: `badge ${qtd[r.id] ? 'azul' : 'cinza'}` }, num(qtd[r.id] || 0)))) : h('div', { class: 'vazio' }, 'Nenhuma rota ativa.'));
    requestAnimationFrame(() => listaEl.querySelector('.item.ativo')?.scrollIntoView({ block: 'nearest' }));
  }

  async function carregarDetalhe() {
    const rota = rotas.find((r) => r.id === rotaId);
    if (!rota) { limpar(detalhe, h('div', { class: 'vazio' }, 'Selecione uma rota.')); return; }
    limpar(detalhe, h('div', { class: 'carregando' }, h('span', { class: 'spinner' }), ' Carregando clientes…'));
    const meuId = estado.usuario.id;
    const [vinc, sols] = await Promise.all([
      buscarTudo(() => sb.from('vw_rota_clientes').select('*').eq('posicao_id', rota.id).order('cod_cliente')),
      consulta(sb.from('vw_solicitacoes').select('*').eq('posicao_id', rota.id)
        .or(`status.eq.PENDENTE,and(status.eq.REPROVADA,solicitante_id.eq.${meuId},ciente_em.is.null)`).order('criado_em').limit(2000)),
    ]);
    qtd[rota.id] = vinc.length;
    const pendInc = sols.filter((s) => s.status === 'PENDENTE' && s.tipo === 'INCLUSAO');
    const pendExc = new Map(sols.filter((s) => s.status === 'PENDENTE' && s.tipo === 'EXCLUSAO').map((s) => [s.cod_cliente, s]));
    const reprovadas = sols.filter((s) => s.status === 'REPROVADA');
    pendQtd[rota.id] = pendInc.length + pendExc.size; desenharLista();
    const pode = podeEditarClientes(rota.gerencia);
    const sol = podeSolicitarClientes(rota.gerencia);
    const podeDias = podeEditarDias(rota.gerencia);
    const selecionados = new Set();
    const filtro = h('input', { type: 'search', placeholder: 'Filtrar clientes' });
    const area = h('div');
    const btnRemSel = botao('Remover selecionados', { tipo: 'perigo-sutil', peq: true, icone: 'lixo', desabilitado: true, onClick: removerSelecionados });
    const btnSolSel = botao('Solicitar exclusão dos selecionados', { tipo: 'perigo-sutil', peq: true, icone: 'menos', desabilitado: true, onClick: () => pedirExclusao([...selecionados]) });
    // pedidos de inclusão pendentes aparecem como linhas "fantasma" no topo da tabela
    const fantasmas = pendInc.map((s) => ({ __sol: s, cod_cliente: s.cod_cliente, nome_fantasia: s.nome_cliente, segmento: s.segmento, cidade: s.cidade, bairro: s.bairro,
      seg: s.seg, ter: s.ter, qua: s.qua, qui: s.qui, sex: s.sex, sab: s.sab }));
    const marcarSel = () => { btnRemSel.disabled = !selecionados.size; btnSolSel.disabled = !selecionados.size; };

    function desenharTabela() {
      const t = filtro.value.trim().toUpperCase();
      const lista = [...fantasmas, ...vinc].filter((v) => !t || v.cod_cliente.includes(t) || (v.nome_fantasia || '').toUpperCase().includes(t) || (v.cidade || '').toUpperCase().includes(t));
      const colunas = [];
      if (pode || sol) colunas.push({ titulo: '', render: (v) => {
        if (v.__sol || (sol && pendExc.has(v.cod_cliente))) return null;
        const c = h('input', { type: 'checkbox', checked: selecionados.has(v.cod_cliente) });
        c.addEventListener('change', () => { c.checked ? selecionados.add(v.cod_cliente) : selecionados.delete(v.cod_cliente); marcarSel(); }); return c; } });
      colunas.push(
        { titulo: 'Cód.', render: (v) => h('span', { class: 'mono' }, v.cod_cliente) },
        { titulo: 'Cliente', render: (v) => h('div', {},
          h('div', {}, v.nome_fantasia || h('i', { class: 'muted' }, '(cliente fora da sua visão — outra gerência)')),
          h('div', { class: 'row', style: { gap: '4px' } },
            v.cliente_na_base === false ? h('span', { class: 'badge erro' }, 'Fora da base de clientes') : null,
            v.gerencia_cliente && v.gerencia_cliente !== v.gerencia ? h('span', { class: 'badge erro' }, `Hoje é da ${v.gerencia_cliente}`) : null,
            !v.nome_fantasia && !v.__sol ? h('span', { class: 'badge erro' }, 'Outra gerência') : null,
            v.__sol ? badgePedido('Inclusão aguardando aprovação', v.__sol) : null,
            pendExc.has(v.cod_cliente) ? badgePedido('Exclusão aguardando aprovação', pendExc.get(v.cod_cliente)) : null)) },
        { titulo: 'Segmento', render: (v) => h('span', { class: 'small' }, v.segmento || '') },
        { titulo: 'Cidade / bairro', render: (v) => h('span', { class: 'small' }, [v.cidade, v.bairro].filter(Boolean).join(' · ')) },
        ...DIAS.map(([k, t]) => ({ titulo: t, classe: 'dia', render: (v) => caixaDia(v, k, podeDias && !v.__sol) })));
      if (pode || sol) colunas.push({ titulo: '', classe: 'right', render: (v) => {
        const p = v.__sol || pendExc.get(v.cod_cliente);
        if (p) return p.solicitante_id === meuId ? botao('', { peq: true, tipo: 'sutil', icone: 'fechar', titulo: 'Cancelar meu pedido', onClick: () => cancelarPedido(p) }) : null;
        if (pode) return botao('', { peq: true, tipo: 'sutil', icone: 'lixo', titulo: 'Remover da rota', onClick: () => remover([v.cod_cliente]) });
        return botao('', { peq: true, tipo: 'sutil', icone: 'lixo', titulo: 'Solicitar exclusão', onClick: () => pedirExclusao([v.cod_cliente]) });
      } });
      limpar(area, tabela(colunas, lista, { vazio: vinc.length ? 'Nenhum cliente no filtro.' : 'Esta rota ainda não tem clientes.',
        classeLinha: (v) => (v.__sol ? 'sol-inc' : pendExc.has(v.cod_cliente) ? 'sol-exc' : '') }));
    }
    filtro.addEventListener('input', desenharTabela);

    async function remover(cods) {
      if (!(await confirmar({ titulo: 'Remover cliente(s) da rota', mensagem: `Remover ${cods.length} cliente(s) da rota ${rota.codigo}? A alteração fica registrada no log.`, textoOk: 'Remover', perigo: true }))) return;
      try { const r = await rpc('rota_remover_clientes', { p_posicao_id: rota.id, p_cods: cods }); toast(r.mensagem); carregarDetalhe(); }
      catch (e) { toast(e.message, 'erro'); }
    }
    function removerSelecionados() { remover([...selecionados]); }

    function pedirExclusao(cods) {
      const itens = cods.filter((c) => !pendExc.has(c)).map((c) => ({ cod_cliente: c }));
      if (!itens.length) { toast('Esses clientes já têm pedido aguardando aprovação.', 'aviso'); return; }
      modalPedido({ rota, tipo: 'EXCLUSAO', itens, aoConcluir: () => { selecionados.clear(); carregarDetalhe(); } });
    }
    async function cancelarPedido(p) {
      if (!(await confirmar({ titulo: 'Cancelar pedido', mensagem: `Cancelar o pedido de ${p.tipo === 'INCLUSAO' ? 'inclusão' : 'exclusão'} do cliente ${p.cod_cliente} na rota ${rota.codigo}?`, textoOk: 'Cancelar pedido', textoCancelar: 'Voltar', perigo: true }))) return;
      try { const r = await rpc('cancelar_solicitacoes', { p_ids: [p.id] }); toast(r.mensagem); atualizarAvisos(); carregarDetalhe(); }
      catch (e) { toast(e.message, 'erro'); }
    }
    async function cienteReprovadas() {
      try { await rpc('marcar_solicitacoes_cientes', { p_ids: reprovadas.map((s) => s.id) }); atualizarAvisos(); carregarDetalhe(); }
      catch (e) { toast(e.message, 'erro'); }
    }
    const nPend = pendInc.length + pendExc.size;
    const avisos = h('div', { class: 'stack', style: { padding: '12px 16px 0' } },
      reprovadas.length ? h('div', { class: 'alerta erro', style: { display: 'block' } },
        h('div', { class: 'row' }, h('b', { style: { margin: 0 } }, `${reprovadas.length} pedido(s) seu(s) reprovado(s) nesta rota`), h('div', { class: 'spacer' }),
          botao('Ciente', { peq: true, icone: 'check', onClick: cienteReprovadas })),
        h('div', { class: 'stack', style: { gap: '8px', marginTop: '8px' } }, reprovadas.slice(0, 10).map((s) => h('div', { class: 'stack', style: { gap: '4px' } },
          h('div', { class: 'row small' }, tipoSol(s.tipo), h('b', {}, `${s.cod_cliente} — ${s.nome_cliente || ''}`)), motivoBox(s))))) : null,
      sol ? alerta('info', null, h('span', {}, 'Inclusões e exclusões de clientes nesta rota passam pela ', h('b', { style: { display: 'inline' } }, 'aprovação da Administração de Vendas'), '. ',
        nPend ? `${nPend} pedido(s) aguardando. ` : '', h('a', { href: '#/aprovacoes' }, 'Ver minhas solicitações'))) : null,
      !sol && nPend ? alerta('aviso', null, h('span', {}, `${nPend} pedido(s) de alteração aguardando aprovação nesta rota. `, ehAdm() ? h('a', { href: '#/aprovacoes' }, 'Abrir Aprovações') : null)) : null);

    limpar(detalhe,
      h('div', { class: 'card-h' },
        h('div', {}, h('h2', {}, `Rota ${rota.codigo}`),
          h('div', { class: 'muted small' }, rota.matricula ? `${rota.nome} · mat. ${rota.matricula}` : 'Rota sem repositor', ' · ', `${num(vinc.length)} cliente(s)`, nPend ? ` · ${nPend} pedido(s) pendente(s)` : '')),
        rota.matricula ? badgeSituacao(rota.situacao, rota.colaborador_na_base) : h('span', { class: 'badge aviso' }, 'Vaga'),
        h('div', { class: 'spacer' }),
        h('div', { class: 'toolbar' }, filtro,
          pode ? btnRemSel : null,
          sol ? btnSolSel : null,
          botao('Exportar', { icone: 'excel', peq: true, onClick: () => exportarRota(rota, vinc) }),
          pode ? botao('Adicionar clientes', { tipo: 'primario', icone: 'mais', onClick: () => adicionar(rota, carregarDetalhe) }) : null,
          sol ? botao('Solicitar inclusão', { tipo: 'primario', icone: 'mais', onClick: () => adicionar(rota, carregarDetalhe, { solicitar: true }) }) : null)),
      avisos.childElementCount ? avisos : null,
      area);
    desenharTabela();
  }

  function badgePedido(txt, p) {
    const b = h('span', { class: 'badge aviso', title: `Pedido de ${p.solicitante_nome} ${relativo(p.criado_em)}. Justificativa: ${p.justificativa}` }, icone('relogio'), txt);
    b.querySelector('svg').style.cssText = 'width:12px;height:12px';
    return b;
  }

  function caixaDia(v, k, pode) {
    const c = h('input', { type: 'checkbox', checked: !!v[k], disabled: !pode, title: pode ? 'Clique para alterar' : '' });
    c.style.accentColor = 'var(--primary)';
    if (pode) c.addEventListener('change', async () => {
      const novo = { ...v, [k]: c.checked };
      c.disabled = true;
      try {
        await rpc('rota_atualizar_dias', { p_vinculo_id: v.id, p_seg: novo.seg, p_ter: novo.ter, p_qua: novo.qua, p_qui: novo.qui, p_sex: novo.sex, p_sab: novo.sab });
        v[k] = c.checked;
      } catch (e) { c.checked = !c.checked; toast(e.message, 'erro'); }
      c.disabled = false;
    });
    return c;
  }

  function exportarRota(rota, vinc) {
    baixarExcel(`Clientes_rota_${rota.codigo}_${hoje()}.xlsx`, [{ nome: `Rota ${rota.codigo}`, linhas: vinc, colunas: colunasExport(() => rota) }]);
  }

  async function exportarGerencia() {
    const g = estado.gerenciaAtual;
    toast('Gerando planilha…', 'aviso', 2000);
    const vinc = await buscarTudo(() => sb.from('vw_rota_clientes').select('*').eq('gerencia', g).order('rota').order('cod_cliente'));
    const porId = Object.fromEntries(rotas.map((r) => [r.id, r]));
    baixarExcel(`Clientes_rotas_${g.replace(/[^A-Z0-9]/gi, '')}_${hoje()}.xlsx`, [{ nome: 'Clientes x Rotas', linhas: vinc, colunas: colunasExport((v) => porId[v.posicao_id] || {}) }]);
    registrarEvento('EXPORTACAO', `Exportou clientes das rotas da ${g} (${vinc.length} linhas)`, g);
  }

  function ondeEsta() {
    const inp = h('input', { type: 'text', placeholder: 'Código do cliente (PV)' });
    const out = h('div');
    const m = modal({
      titulo: 'Em quais rotas o cliente está?',
      conteudo: h('div', { class: 'stack' }, h('div', { class: 'row' }, inp, botao('Consultar', { tipo: 'primario', onClick: consultar })), out),
      acoes: [{ texto: 'Fechar' }],
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') consultar(); });
    async function consultar() {
      const cod = normCodigo(inp.value); if (!cod) return;
      limpar(out, h('span', { class: 'spinner' }));
      try {
        const [rs, cli] = await Promise.all([rpc('rotas_do_cliente', { p_cod: cod }), consulta(sb.from('clientes').select('*').eq('cod_cliente', cod).maybeSingle())]);
        limpar(out,
          cli ? alerta(cli.na_base ? 'info' : 'erro', `${cli.cod_cliente} — ${cli.nome_fantasia || ''}`, `${cli.gerencia || 'sem gerência'} · ${cli.segmento || ''} · ${[cli.cidade, cli.bairro].filter(Boolean).join(' / ')}${cli.na_base ? '' : ' · FORA DA BASE ATUAL'}`)
            : alerta('aviso', 'Cliente não encontrado', 'Não está na base de clientes ou pertence a uma gerência que você não acompanha.'),
          tabela([{ titulo: 'Rota', render: (r) => h('a', { href: `#/clientes?rota=${r.posicao_id}`, onclick: () => m.fechar() }, r.rota) }, { titulo: 'Gerência', campo: 'gerencia' }, { titulo: 'Repositor', render: (r) => r.nome_repositor || h('i', { class: 'muted' }, 'vaga') }, { titulo: 'Dias', campo: 'dias' }],
            rs, { vazio: 'O cliente não está em nenhuma rota que você acompanha.' }));
      } catch (e) { limpar(out, alerta('erro', null, e.message)); }
    }
  }

  await carregarRotas();
}

function colunasExport(rotaDe) {
  return [
    { titulo: 'Gerência', campo: 'gerencia' }, { titulo: 'Rota RP', campo: 'rota' },
    { titulo: 'Matrícula Rep', campo: (v) => rotaDe(v).matricula || '' }, { titulo: 'Nome Repositor', campo: (v) => rotaDe(v).nome || '', largura: 34 },
    { titulo: 'PV', campo: 'cod_cliente' }, { titulo: 'Nome Fantasia', campo: 'nome_fantasia', largura: 34 }, { titulo: 'Segmento', campo: 'segmento', largura: 18 },
    { titulo: 'Cidade', campo: 'cidade', largura: 20 }, { titulo: 'Bairro', campo: 'bairro', largura: 24 },
    ...DIAS.map(([k, t]) => ({ titulo: t, campo: (v) => (v[k] ? 1 : null), largura: 6 })),
  ];
}

// ---------------------------------------------------------------------------
// Adicionar clientes a uma rota
// ---------------------------------------------------------------------------
function adicionar(rota, aoConcluir, { solicitar = false } = {}) {
  const codigos = h('textarea', { placeholder: 'Cole os códigos dos clientes (PV), um por linha ou separados por vírgula/espaço' });
  const busca = h('input', { type: 'search', placeholder: `Buscar cliente da ${rota.gerencia} por nome ou código` });
  const res = h('div', { class: 'resultados hidden' });
  const dias = Object.fromEntries(DIAS.map(([k]) => [k, h('input', { type: 'checkbox' })]));
  const atualizar = h('input', { type: 'checkbox' });
  const saida = h('div');
  const just = solicitar ? campoJustificativa('INCLUSAO') : null;

  const pesquisar = debounce(async () => {
    const t = busca.value.trim().replace(/[,()*%]/g, ' ').trim();
    if (t.length < 2) { res.classList.add('hidden'); return; }
    const filtroOr = /^\d+$/.test(t) ? `cod_cliente.eq.${normCodigo(t)},nome_fantasia.ilike.*${t}*` : `nome_fantasia.ilike.*${t}*,razao_social.ilike.*${t}*`;
    const lista = await consulta(sb.from('clientes').select('cod_cliente, nome_fantasia, segmento, cidade, bairro').eq('gerencia', rota.gerencia).eq('na_base', true).or(filtroOr).limit(20));
    if (!lista.length) {
      // explica por que não apareceu: cliente de outra gerência, fora da base ou inexistente
      let msg = `Nenhum cliente da ${rota.gerencia} encontrado com "${t}".`;
      if (/^\d+$/.test(t)) {
        const outro = await consulta(sb.from('clientes').select('cod_cliente, nome_fantasia, gerencia, na_base').eq('cod_cliente', normCodigo(t)).maybeSingle());
        if (outro && outro.gerencia !== rota.gerencia) msg = `O cliente ${outro.cod_cliente} - ${outro.nome_fantasia || ''} pertence à ${outro.gerencia || 'outra gerência'} e não pode entrar numa rota da ${rota.gerencia}.`;
        else if (outro && !outro.na_base) msg = `O cliente ${outro.cod_cliente} não está ativo na base de clientes atual.`;
        else if (!outro) msg = `O código ${t} não foi encontrado na base de clientes${estado.usuario?.perfil === 'ADM' ? '' : ' das suas gerências'}.`;
      }
      res.classList.remove('hidden');
      limpar(res, h('div', { class: 'res' }, h('div', { class: 'info' }, h('span', { style: { color: 'var(--danger)' } }, msg))));
      return;
    }
    res.classList.remove('hidden');
    limpar(res, lista.map((c) => h('div', { class: 'res' },
      h('div', { class: 'info' }, h('b', {}, `${c.cod_cliente} — ${c.nome_fantasia}`), h('div', { class: 'muted small' }, [c.segmento, c.cidade, c.bairro].filter(Boolean).join(' · '))),
      botao('Adicionar à lista', { peq: true, onClick: () => { codigos.value = (codigos.value.trim() ? codigos.value.trim() + '\n' : '') + c.cod_cliente; } }))));
  }, 300);
  busca.addEventListener('input', pesquisar);

  const m = modal({
    titulo: solicitar ? `Solicitar inclusão de clientes · rota ${rota.codigo} (${rota.gerencia})` : `Adicionar clientes à rota ${rota.codigo} (${rota.gerencia})`, tamanho: 'grande',
    conteudo: h('div', { class: 'stack' },
      solicitar ? alerta('info', null, 'Os clientes só entram na rota depois da aprovação da Administração de Vendas. Você acompanha o pedido em "Minhas solicitações".') : null,
      h('div', { class: 'campo' }, h('label', {}, 'Buscar cliente'), busca), res,
      h('div', { class: 'campo' }, h('label', {}, solicitar ? 'Códigos a solicitar' : 'Códigos a incluir'), codigos),
      h('div', { class: 'campo' }, h('label', {}, 'Dias de visita'), h('div', { class: 'row', style: { gap: '14px' } }, DIAS.map(([k, t]) => h('label', { class: 'check' }, dias[k], t)))),
      solicitar ? just.el : h('label', { class: 'check' }, atualizar, 'Se o cliente já estiver nesta rota, atualizar os dias de visita'),
      saida),
    acoes: [{ texto: 'Fechar' }, solicitar ? { texto: 'Enviar para aprovação', tipo: 'primario', icone: 'enviar', onClick: solicitarInclusao } : { texto: 'Incluir clientes', tipo: 'primario', onClick: incluir }],
  });

  async function solicitarInclusao() {
    const lista = [...new Set(codigos.value.split(/[\s,;]+/).map(normCodigo).filter(Boolean))];
    if (!lista.length) { toast('Informe pelo menos um código.', 'aviso'); return; }
    if (lista.length > 500) { toast('Envie no máximo 500 clientes por pedido.', 'aviso'); return; }
    if (just.txt.value.trim().length < 5) { toast('Escreva a justificativa (mínimo 5 caracteres).', 'aviso'); just.txt.focus(); return; }
    const base = Object.fromEntries(DIAS.map(([k]) => [k, dias[k].checked]));
    if (!Object.values(base).some(Boolean) && !(await confirmar({ titulo: 'Sem dia de visita', mensagem: 'Nenhum dia de visita foi marcado. Enviar mesmo assim?', textoOk: 'Enviar' }))) return;
    try {
      const r = await enviarSolicitacao({ rota, tipo: 'INCLUSAO', itens: lista.map((c) => ({ cod_cliente: c, ...base })), justificativa: just.txt.value });
      resultadoSolicitacao(saida, r);
      if (r.solicitados) { toast(r.mensagem); aoConcluir && aoConcluir(); }
      codigos.value = r.itens.filter((x) => x.status === 'erro').map((x) => x.cod_cliente).join('\n');
      if (r.solicitados && !codigos.value) m.definirAcoes([{ texto: 'Concluir', tipo: 'primario' }]);
    } catch (e) { toast(e.message, 'erro', 7000); }
  }

  async function incluir() {
    const lista = [...new Set(codigos.value.split(/[\s,;]+/).map(normCodigo).filter(Boolean))];
    if (!lista.length) { toast('Informe pelo menos um código.', 'aviso'); return; }
    const base = Object.fromEntries(DIAS.map(([k]) => [k, dias[k].checked]));
    const itens = lista.map((c) => ({ cod_cliente: c, ...base, atualizar_dias: atualizar.checked }));
    const todos = [];
    for (let i = 0; i < itens.length; i += 1000) {
      const r = await rpc('rota_incluir_clientes', { p_posicao_id: rota.id, p_itens: itens.slice(i, i + 1000) });
      todos.push(...r.itens);
    }
    mostrarResultado(saida, todos);
    if (todos.some((x) => x.status !== 'erro')) { aoConcluir && aoConcluir(); }
    codigos.value = todos.filter((x) => x.status === 'erro').map((x) => x.cod_cliente).join('\n');
  }
  return m;
}

function mostrarResultado(alvo, itens, extra = {}) {
  const c = (s) => itens.filter((x) => x.status === s).length;
  const erros = itens.filter((x) => x.status === 'erro');
  limpar(alvo, h('div', { class: 'stack' },
    alerta(erros.length ? 'aviso' : 'ok', 'Resultado',
      `${c('incluido')} incluído(s) · ${c('atualizado')} atualizado(s) · ${c('ja_existe')} já estavam na rota · ${erros.length} com erro` +
      (extra.removidos !== undefined ? ` · ${extra.removidos} removido(s) por substituição` : '')),
    erros.length ? h('div', { class: 'stack', style: { gap: '6px' } },
      h('div', { class: 'row' }, h('b', {}, 'Linhas com erro (não foram gravadas)'), h('div', { class: 'spacer' }),
        botao('Baixar erros', { peq: true, icone: 'excel', onClick: () => baixarExcel(`Erros_inclusao_${hoje()}.xlsx`, [{ nome: 'Erros', linhas: erros, colunas: [{ titulo: 'Rota', campo: 'rota' }, { titulo: 'Cliente', campo: 'cod_cliente' }, { titulo: 'Nome', campo: 'nome', largura: 30 }, { titulo: 'Erro', campo: 'mensagem', largura: 90 }] }]) })),
      h('div', { style: { maxHeight: '260px', overflow: 'auto' } }, tabela([{ titulo: 'Rota', campo: 'rota' }, { titulo: 'Cliente', render: (x) => h('span', { class: 'mono' }, x.cod_cliente || '') }, { titulo: 'Erro', render: (x) => h('span', { class: 'small' }, x.mensagem) }], erros.slice(0, 500)))) : null));
}

// ---------------------------------------------------------------------------
// Importar planilha Rota × Cliente × Dias
// ---------------------------------------------------------------------------
const MAPA_VINCULOS = {
  rota: ['rota', 'rotarp', 'rotarepositor', 'codigorota', 'codrota'],
  cod_cliente: ['pv', 'codcliente', 'codigocliente', 'codigodocliente', 'cliente', 'codigopv'],
  seg: ['seg', 'segunda', 'segundafeira'], ter: ['ter', 'terca', 'tercafeira'], qua: ['qua', 'quarta', 'quartafeira'],
  qui: ['qui', 'quinta', 'quintafeira'], sex: ['sex', 'sexta', 'sextafeira'], sab: ['sab', 'sabado'],
};
const marcado = (v) => v !== null && v !== undefined && /^(1|x|s|sim|true|ok|v)$/i.test(String(v).trim());

export async function importarPlanilha(aoConcluir) {
  const arquivo = await seletorArquivo();
  if (!arquivo) return;
  let dados;
  try { dados = await lerPlanilha(arquivo, MAPA_VINCULOS, ['rota', 'cod_cliente']); }
  catch (e) { toast(e.message, 'erro', 8000); return; }
  const itens = dados.linhas.map((l) => ({
    rota: String(l.rota ?? '').trim().toUpperCase(), cod_cliente: normCodigo(l.cod_cliente),
    seg: marcado(l.seg), ter: marcado(l.ter), qua: marcado(l.qua), qui: marcado(l.qui), sex: marcado(l.sex), sab: marcado(l.sab),
  })).filter((x) => x.rota && x.cod_cliente);
  const porRota = {};
  for (const i of itens) (porRota[i.rota] ||= []).push(i);
  const semDias = DIAS.every(([k]) => !dados.colunas.includes(k));
  const subst = h('input', { type: 'checkbox' });
  const saida = h('div');
  const barra = h('div', { class: 'progresso hidden' }, h('div'));

  const m = modal({
    titulo: 'Importar clientes das rotas', tamanho: 'grande',
    conteudo: h('div', { class: 'stack' },
      alerta('info', arquivo.name, `Aba "${dados.aba}": ${num(itens.length)} linha(s) válidas em ${num(Object.keys(porRota).length)} rota(s). Colunas reconhecidas: ${dados.colunas.join(', ')}.`),
      semDias ? alerta('aviso', 'Sem colunas de dias', 'O arquivo não tem colunas SEG/TER/QUA/QUI/SEX/SAB. Os clientes entrarão sem dia de visita.') : null,
      h('label', { class: 'check' }, subst, h('span', {}, h('b', {}, 'Substituir'), ' — nas rotas presentes no arquivo, remover os clientes que NÃO estão na planilha')),
      h('div', { class: 'muted small' }, 'Regras: a rota precisa existir e estar ativa; o cliente precisa estar na base e ser da mesma gerência da rota. Linhas com erro não são gravadas e aparecem no relatório.'),
      barra, saida),
    acoes: [{ texto: 'Fechar' }, { texto: 'Importar', tipo: 'primario', onClick: async () => {
      if (subst.checked && !(await confirmar({ titulo: 'Confirmar substituição', mensagem: `Os clientes que não estão na planilha serão removidos de ${Object.keys(porRota).length} rota(s). Confirma?`, textoOk: 'Sim, substituir', perigo: true }))) return;
      // agrupa por rota em lotes de até ~2000 linhas (uma rota nunca é dividida)
      const lotes = []; let atual = [];
      for (const lista of Object.values(porRota)) {
        if (atual.length && atual.length + lista.length > 2000) { lotes.push(atual); atual = []; }
        atual.push(...lista);
      }
      if (atual.length) lotes.push(atual);
      barra.classList.remove('hidden');
      const todos = []; let removidos = 0;
      for (let i = 0; i < lotes.length; i++) {
        const r = await rpc('importar_vinculos', { p_itens: lotes[i], p_substituir: subst.checked });
        todos.push(...r.itens); removidos += r.removidos || 0;
        barra.firstChild.style.width = `${Math.round(((i + 1) / lotes.length) * 100)}%`;
      }
      mostrarResultado(saida, todos, subst.checked ? { removidos } : {});
      m.definirAcoes([{ texto: 'Concluir', tipo: 'primario' }]);
      aoConcluir && aoConcluir();
    } }],
  });
}
