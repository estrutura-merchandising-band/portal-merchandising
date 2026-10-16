import { h, limpar, botao, modal, alerta, toast, debounce, badgeSituacao, NIVEIS, confirmar, pedirTexto, mascaraTelefone, telefoneValido, fmtTelefone } from '../ui.js';
import { rpc, estado, definirGerencia } from '../api.js';

export function cabecalho(titulo, subtitulo, acoes = []) {
  return h('div', { class: 'cabecalho' },
    h('div', {}, h('h1', {}, titulo), subtitulo ? h('p', {}, subtitulo) : null),
    h('div', { class: 'acoes' }, acoes));
}

export function seletorGerencia(aoMudar, { incluirTodas = false } = {}) {
  const s = h('select', { 'aria-label': 'Gerência' },
    incluirTodas ? h('option', { value: '' }, 'Todas as minhas gerências') : null,
    estado.gerencias.map((g) => h('option', { value: g.codigo, selected: g.codigo === estado.gerenciaAtual }, g.codigo + (g.nome ? ` — ${g.nome}` : ''))));
  s.addEventListener('change', () => { if (s.value) definirGerencia(s.value); aoMudar(s.value); });
  return s;
}

export const rotuloPosicao = (p) => (p.nivel === 'RP' ? `Rota ${p.codigo}` : `${p.codigo} · ${NIVEIS[p.nivel]}`);

export function semGerencias() {
  return alerta('aviso', 'Nenhuma gerência liberada', 'Seu usuário ainda não tem gerências vinculadas. Peça à Administração de Vendas para liberar o acesso.');
}

// ---------------------------------------------------------------------------
// Modal de alocação de colaborador (com aviso de transferência e confirmação)
// ---------------------------------------------------------------------------
export function modalAlocar(pos, aoConcluir, { colaborador } = {}) {
  const busca = h('input', { type: 'search', placeholder: 'Digite a matrícula ou parte do nome (mín. 2 letras)' });
  const res = h('div', { class: 'resultados hidden' });
  const status = h('div', { class: 'muted small' });
  const atual = pos.matricula
    ? alerta('info', 'Ocupante atual', `${pos.nome || '?'} (mat. ${pos.matricula}). Se você escolher outra pessoa, o ocupante atual ficará sem posição.`)
    : null;

  const conteudoBusca = h('div', { class: 'stack' }, atual,
    h('div', { class: 'campo' }, h('label', {}, 'Colaborador'), busca, status), res);

  const m = modal({ titulo: `Alocar em ${rotuloPosicao(pos)} (${pos.gerencia})`, conteudo: conteudoBusca, tamanho: 'grande', acoes: [{ texto: 'Cancelar' }] });

  let seq = 0;
  const pesquisar = debounce(async () => {
    const t = busca.value.trim();
    if (t.length < 2) { res.classList.add('hidden'); limpar(status); return; }
    const meu = ++seq;
    limpar(status, h('span', { class: 'spinner' }), ' Buscando…');
    try {
      const lista = await rpc('buscar_colaboradores', { p_texto: t, p_limite: 30 });
      if (meu !== seq) return;
      limpar(status, lista.length ? `${lista.length} resultado(s)` : 'Nenhum colaborador encontrado na base.');
      res.classList.toggle('hidden', !lista.length);
      limpar(res, lista.map((c) => {
        const onde = (c.posicoes_atuais || []).map((p) => `${p.nivel === 'RP' ? 'Rota ' + p.codigo : p.codigo} (${p.gerencia})`).join(', ');
        const mesmo = c.matricula === pos.matricula;
        return h('div', { class: 'res' },
          h('div', { class: 'info' },
            h('b', {}, c.nome),
            h('div', { class: 'muted small' }, `Mat. ${c.matricula} · ${c.cargo || 'sem cargo'}${c.lotacao ? ' · ' + c.lotacao : ''}`),
            h('div', { class: 'row', style: { marginTop: '4px' } }, badgeSituacao(c.situacao, c.na_base),
              onde ? h('span', { class: 'badge aviso' }, `Hoje em: ${onde}`) : h('span', { class: 'badge cinza' }, 'Sem posição'))),
          mesmo ? h('span', { class: 'badge azul' }, 'Já está aqui')
            : botao('Selecionar', { tipo: 'primario', peq: true, desabilitado: !c.na_base, onClick: () => escolher(c) }));
      }));
    } catch (e) { limpar(status, h('span', { style: { color: 'var(--danger)' } }, e.message)); }
  }, 300);
  busca.addEventListener('input', pesquisar);

  async function escolher(c, confirmado = false, acumular = false) {
    try {
      const r = await rpc('alocar_colaborador', { p_posicao_id: pos.id, p_matricula: c.matricula, p_confirmar: confirmado, p_acumular: acumular });
      if (r.status === 'confirmar') return telaConfirmacao(c, r);
      m.fechar();
      toast(r.mensagem);
      (r.infos || []).forEach((i) => toast(i, 'aviso', 6000));
      aoConcluir && aoConcluir();
    } catch (e) { toast(e.message, 'erro', 7000); }
  }

  function telaConfirmacao(c, r) {
    const itens = [];
    for (const cf of r.conflitos || []) {
      itens.push(alerta('aviso', 'Transferência',
        `${r.colaborador.nome} (mat. ${r.colaborador.matricula}) está hoje em ${cf.nivel === 'RP' ? 'Rota ' + cf.codigo : cf.codigo} (${cf.gerencia}). ` +
        `Ao confirmar, a pessoa será transferida para ${rotuloPosicao(r.posicao)} (${r.posicao.gerencia}) e ${cf.nivel === 'RP' ? 'a rota ' + cf.codigo : cf.codigo} ficará vaga.`));
    }
    if (r.ocupante_atual) {
      itens.push(alerta('aviso', 'Posição ocupada',
        `${rotuloPosicao(r.posicao)} hoje é de ${r.ocupante_atual.nome} (mat. ${r.ocupante_atual.matricula}), que será retirado(a) e ficará sem posição.`));
    }
    for (const a of r.avisos || []) itens.push(alerta('erro', 'Atenção', a));
    for (const i of r.infos || []) itens.push(alerta('info', null, i));

    const acumulaveis = (r.conflitos || []).filter((cf) => cf.pode_acumular);
    let radioAcum = null;
    if (acumulaveis.length) {
      radioAcum = h('input', { type: 'radio', name: 'modo', value: 'acumular' });
      itens.push(h('div', { class: 'stack', style: { gap: '6px' } },
        h('div', { class: 'rotulo' }, 'Liderança do mesmo nível em outra gerência — o que deseja fazer?'),
        h('label', { class: 'check' }, h('input', { type: 'radio', name: 'modo', value: 'transferir', checked: true }), 'Transferir (sai da posição anterior)'),
        h('label', { class: 'check' }, radioAcum, `Acumular (fica responsável pelas duas gerências)`)));
    }
    itens.push(h('p', { style: { margin: 0 } }, h('b', {}, 'Deseja confirmar esta alteração?'), ' Ela ficará registrada no log com seu usuário, data e hora.'));
    limpar(m.corpo, h('div', { class: 'stack' }, itens));
    m.definirAcoes([
      { texto: 'Voltar', onClick: () => { limpar(m.corpo, conteudoBusca); m.definirAcoes([{ texto: 'Cancelar' }]); } },
      { texto: 'Confirmar alteração', tipo: 'primario', onClick: () => escolher(c, true, !!radioAcum?.checked) },
    ]);
  }
  if (colaborador) escolher(colaborador);
  return m;
}

// Campo de busca de colaborador reutilizável (ex.: na criação de rota). Retorna { el, valor() }.
export function seletorColaborador() {
  let escolhido = null, seq = 0;
  const busca = h('input', { type: 'search', placeholder: 'Matrícula ou parte do nome (opcional)' });
  const res = h('div', { class: 'resultados hidden' });
  const sel = h('div');
  const pesquisar = debounce(async () => {
    const t = busca.value.trim();
    if (t.length < 2) { res.classList.add('hidden'); return; }
    const meu = ++seq;
    const lista = await rpc('buscar_colaboradores', { p_texto: t, p_limite: 15 });
    if (meu !== seq) return;
    res.classList.remove('hidden');
    limpar(res, lista.length ? lista.map((c) => {
      const onde = (c.posicoes_atuais || []).map((p) => `${p.nivel === 'RP' ? 'Rota ' + p.codigo : p.codigo} (${p.gerencia})`).join(', ');
      return h('div', { class: 'res' },
        h('div', { class: 'info' }, h('b', {}, c.nome), h('div', { class: 'muted small' }, `Mat. ${c.matricula} · ${c.cargo || 'sem cargo'}`),
          h('div', { class: 'row', style: { marginTop: '4px' } }, badgeSituacao(c.situacao, c.na_base), onde ? h('span', { class: 'badge aviso' }, `Hoje em: ${onde}`) : h('span', { class: 'badge cinza' }, 'Sem posição'))),
        botao('Selecionar', { peq: true, tipo: 'primario', desabilitado: !c.na_base, onClick: () => { escolhido = c; mostrar(); } }));
    }) : h('div', { class: 'res' }, h('span', { class: 'muted' }, 'Nenhum colaborador encontrado.')));
  }, 300);
  busca.addEventListener('input', pesquisar);
  function mostrar() {
    if (!escolhido) { limpar(sel); busca.classList.remove('hidden'); return; }
    busca.classList.add('hidden'); res.classList.add('hidden');
    limpar(sel, h('div', { class: 'alerta info' }, h('div', { class: 'grow' }, h('b', {}, escolhido.nome), `Mat. ${escolhido.matricula} · ${escolhido.cargo || 'sem cargo'}`),
      botao('Trocar', { peq: true, onClick: () => { escolhido = null; busca.value = ''; mostrar(); busca.focus(); } })));
  }
  return { el: h('div', { class: 'stack', style: { gap: '6px' } }, busca, sel, res), valor: () => escolhido };
}

export function editarTelefone(pos, aoConcluir) {
  const inp = mascaraTelefone(h('input', { type: 'text', value: pos.telefone_rota || '' }));
  const erro = h('div', { class: 'ajuda', style: { color: 'var(--danger)' } });
  const m = modal({
    titulo: `Telefone — ${rotuloPosicao(pos)}`,
    conteudo: h('div', { class: 'campo' }, h('label', {}, 'Telefone'), inp, erro,
      h('div', { class: 'ajuda' }, 'Padrão (XX) XXXXX-XXXX: DDD + 9 dígitos. Deixe em branco para remover. Vai para o arquivo de fechamento e fica registrado no log.')),
    acoes: [{ texto: 'Cancelar' }, { texto: 'Salvar', tipo: 'primario', onClick: async () => {
      if (!telefoneValido(inp.value)) { erro.textContent = 'Telefone incompleto. Use (XX) XXXXX-XXXX.'; inp.focus(); return; }
      try { const r = await rpc('editar_telefone_posicao', { p_posicao_id: pos.id, p_telefone: inp.value }); m.fechar(); toast(r.mensagem); aoConcluir && aoConcluir(); }
      catch (e) { erro.textContent = e.message; }
    } }],
  });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') m.caixa.querySelector('.modal-f .primario').click(); });
}

// Telefone exibido: o da rota; se vazio, o do cadastro do colaborador (em cinza).
export function celTelefone(p, pode, aoConcluir) {
  const txt = p.telefone_rota ? h('span', {}, fmtTelefone(p.telefone_rota))
    : (p.telefone ? h('span', { class: 'muted', title: 'Telefone do cadastro do colaborador' }, fmtTelefone(p.telefone)) : h('span', { class: 'muted' }, '—'));
  return h('span', { class: 'row nowrap', style: { gap: '2px', flexWrap: 'nowrap' } }, txt,
    pode ? botao('', { peq: true, tipo: 'sutil', icone: 'editar', titulo: p.telefone_rota ? 'Alterar ou remover telefone' : 'Incluir telefone', onClick: () => editarTelefone(p, aoConcluir) }) : null);
}

export async function retirarColaborador(pos, aoConcluir) {
  const motivo = await pedirTexto({
    titulo: `Retirar ${pos.nome} de ${rotuloPosicao(pos)}`, rotulo: 'Motivo (opcional, vai para o log)',
    ajuda: 'A posição ficará vaga. Os clientes da rota continuam vinculados a ela.', textoOk: 'Retirar colaborador',
  });
  if (motivo === null) return;
  try { const r = await rpc('desalocar_colaborador', { p_posicao_id: pos.id, p_motivo: motivo }); toast(r.mensagem); aoConcluir && aoConcluir(); }
  catch (e) { toast(e.message, 'erro', 7000); }
}

export async function alternarStatus(pos, aoConcluir) {
  const ativar = !pos.ativa;
  if (!ativar && !(await confirmar({ titulo: `Inativar ${rotuloPosicao(pos)}?`, mensagem: 'A posição deixará de aparecer na estrutura ativa e no fechamento. Você pode reativá-la depois.', textoOk: 'Inativar', perigo: true }))) return;
  try {
    let r = await rpc('alterar_status_posicao', { p_posicao_id: pos.id, p_ativa: ativar, p_confirmar: false });
    if (r.status === 'confirmar') {
      if (!(await confirmar({ titulo: 'Clientes vinculados', mensagem: r.mensagem, textoOk: 'Inativar e desvincular', perigo: true }))) return;
      r = await rpc('alterar_status_posicao', { p_posicao_id: pos.id, p_ativa: ativar, p_confirmar: true });
    }
    toast(r.mensagem); aoConcluir && aoConcluir();
  } catch (e) { toast(e.message, 'erro', 7000); }
}

export async function editarObservacao(pos, aoConcluir) {
  const obs = await pedirTexto({ titulo: `Observação — ${rotuloPosicao(pos)}`, rotulo: 'Observação', valor: pos.observacao || '', multilinha: true });
  if (obs === null) return;
  try { await rpc('editar_observacao_posicao', { p_posicao_id: pos.id, p_observacao: obs }); toast('Observação salva.'); aoConcluir && aoConcluir(); }
  catch (e) { toast(e.message, 'erro'); }
}
