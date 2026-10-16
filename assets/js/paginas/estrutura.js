import { h, limpar, botao, modal, toast, tabela, badgeSituacao, data, NIVEIS, baixarExcel, hoje, mascaraTelefone, telefoneValido, fmtTelefone } from '../ui.js';
import { sb, rpc, consulta, buscarTudo, estado, definirGerencia, podeEditarPosicao, podeVerClientes, registrarEvento, ehAdm } from '../api.js';
import { cabecalho, semGerencias, modalAlocar, retirarColaborador, alternarStatus, editarObservacao, seletorColaborador, celTelefone } from './comum.js';

const iniciais = (n) => String(n || '?').trim().split(/\s+/).filter((x) => x.length > 2).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';

export async function render(el, params) {
  if (params.g && estado.gerencias.some((g) => g.codigo === params.g)) definirGerencia(params.g);
  if (!estado.gerenciaAtual) { el.append(cabecalho('Estrutura'), semGerencias()); return; }

  const corpo = h('div');
  const btnTodas = botao(estado.gerencias.length > 1 ? 'Exportar todas as gerências' : 'Exportar estrutura completa', { icone: 'excel', onClick: () => exportarTodas(btnTodas) });
  el.append(cabecalho('Estrutura de merchandising', 'Gerente Comercial › Gerente de Merchandising › Supervisor › Líder › Rotas de repositor', [btnTodas]), corpo);

  let posicoes = [], qtd = {}, filtro = params.filtro || 'ativas', texto = '';

  async function carregar() {
    const g = estado.gerenciaAtual;
    limpar(corpo, h('div', { class: 'carregando' }, h('span', { class: 'spinner' }), ' Carregando estrutura…'));
    const [pos, q] = await Promise.all([
      consulta(sb.from('vw_posicoes').select('*').eq('gerencia', g).order('ordem').order('codigo')),
      rpc('qtd_clientes_rotas', { p_gerencia: g }),
    ]);
    posicoes = pos; qtd = Object.fromEntries((q || []).map((x) => [x.posicao_id, x.qtd]));
    desenhar();
  }

  function desenhar() {
    const g = estado.gerenciaAtual;
    const lid = ['GC', 'GM', 'SM', 'LM'].map((n) => posicoes.find((p) => p.nivel === n)).filter(Boolean);
    const rotas = posicoes.filter((p) => p.nivel === 'RP');
    const ativas = rotas.filter((p) => p.ativa);
    const kpis = h('div', { class: 'kpis' },
      kpi(ativas.length, 'Rotas ativas'),
      kpi(ativas.filter((p) => p.matricula).length, 'Rotas com repositor'),
      kpi(ativas.filter((p) => !p.matricula).length, 'Rotas vagas', ativas.some((p) => !p.matricula)),
      kpi(ativas.reduce((s, p) => s + (qtd[p.id] || 0), 0), 'Vínculos cliente × rota'));

    const cards = h('div', { class: 'lideranca' }, lid.map(cartaoLideranca));

    // filtros da tabela de rotas
    const chips = h('div', { class: 'chips' }, [['ativas', 'Ativas'], ['ocupadas', 'Com repositor'], ['vagas', 'Vagas'], ['inativas', 'Inativas']].map(([k, t]) =>
      h('button', { type: 'button', class: `chip ${filtro === k ? 'ativo' : ''}`, onclick: () => { filtro = k; desenhar(); } }, t)));
    const busca = h('input', { type: 'search', placeholder: 'Buscar rota, nome ou matrícula', value: texto });
    busca.addEventListener('input', () => { texto = busca.value; desenharTabela(); });
    const areaTabela = h('div');

    function desenharTabela() {
      const t = texto.trim().toUpperCase();
      let lista = rotas.filter((p) => ({ ativas: p.ativa, ocupadas: p.ativa && p.matricula, vagas: p.ativa && !p.matricula, inativas: !p.ativa }[filtro]));
      if (t) lista = lista.filter((p) => p.codigo.includes(t) || (p.nome || '').toUpperCase().includes(t) || (p.matricula || '') === t);
      limpar(areaTabela, tabela([
        { titulo: 'Rota', render: (p) => h('b', { class: 'mono' }, p.codigo) },
        { titulo: 'Repositor', render: (p) => p.matricula ? h('div', {}, h('div', {}, p.nome), p.observacao ? h('div', { class: 'muted small' }, p.observacao) : null) : h('span', { class: 'muted' }, p.ativa ? 'Vaga' : '—') },
        { titulo: 'Matrícula', render: (p) => h('span', { class: 'mono' }, p.matricula || '') },
        { titulo: 'Cargo', render: (p) => h('span', { class: 'small' }, p.cargo || '') },
        { titulo: 'Situação', render: (p) => (p.matricula ? badgeSituacao(p.situacao, p.colaborador_na_base) : (p.ativa ? h('span', { class: 'badge aviso' }, 'Vaga') : h('span', { class: 'badge cinza' }, 'Inativa'))) },
        { titulo: 'Telefone', render: (p) => h('span', { class: 'small' }, celTelefone(p, p.ativa && podeEditarPosicao(p.gerencia, 'RP'), carregar)) },
        { titulo: 'Clientes', classe: 'right', render: (p) => podeVerClientes()
          ? h('a', { href: `#/clientes?rota=${p.id}` }, String(qtd[p.id] || 0)) : String(qtd[p.id] || 0) },
        { titulo: 'Desde', render: (p) => h('span', { class: 'small muted' }, data(p.alocado_em)) },
        { titulo: '', classe: 'right', render: acoesRota },
      ], lista, { vazio: 'Nenhuma rota neste filtro.', classeLinha: (p) => (p.ativa ? '' : 'inativa') }));
    }
    desenharTabela();

    const podeRota = ehAdm();
    limpar(corpo, kpis,
      h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', {}, 'Liderança da gerência'), h('span', { class: 'muted small' }, g)), h('div', { class: 'card-b' }, cards)),
      h('div', { class: 'card' },
        h('div', { class: 'card-h' }, h('h2', {}, 'Rotas de repositor'), chips, h('div', { class: 'spacer' }),
          h('div', { class: 'toolbar' }, busca,
            botao('Exportar', { icone: 'excel', onClick: exportar }),
            podeRota ? botao('Nova rota', { tipo: 'primario', icone: 'mais', onClick: novaRota }) : null)),
        areaTabela));
  }

  function kpi(v, l, alertaK) { return h('div', { class: `kpi ${alertaK ? 'alerta-kpi' : ''}` }, h('div', { class: 'v' }, v.toLocaleString('pt-BR')), h('div', { class: 'l' }, l)); }

  function cartaoLideranca(p) {
    const pode = podeEditarPosicao(p.gerencia, p.nivel);
    return h('div', { class: `pos-card ${!p.ativa ? 'inativa' : (!p.matricula ? 'vaga' : '')}` },
      h('div', { class: 'nivel' }, NIVEIS[p.nivel], h('span', { class: 'cod' }, p.codigo)),
      p.matricula
        ? [h('div', { class: 'pessoa' }, h('span', { class: 'avatar g' }, iniciais(p.nome)),
            h('div', {}, h('div', { class: 'nome' }, p.nome), h('div', { class: 'det' }, `Mat. ${p.matricula} · ${p.cargo || 'sem cargo'}`))),
          h('div', { class: 'det' }, celTelefone(p, pode && p.ativa, carregar)), h('div', {}, badgeSituacao(p.situacao, p.colaborador_na_base))]
        : h('div', { class: 'pessoa' }, h('span', { class: 'avatar g vago' }, '?'), h('div', { class: 'vago' }, p.ativa ? 'Posição vaga' : 'Posição inativa (não usada nesta gerência)')),
      pode ? h('div', { class: 'acoes' },
        p.ativa ? botao(p.matricula ? 'Trocar' : 'Alocar', { peq: true, tipo: p.matricula ? '' : 'primario', onClick: () => modalAlocar(p, carregar) }) : null,
        p.ativa && p.matricula ? botao('Retirar', { peq: true, onClick: () => retirarColaborador(p, carregar) }) : null,
        !p.matricula && ehAdm() ? botao(p.ativa ? 'Inativar' : 'Reativar', { peq: true, tipo: 'sutil', onClick: () => alternarStatus(p, carregar) }) : null) : null);
  }

  function acoesRota(p) {
    const pode = podeEditarPosicao(p.gerencia, 'RP');
    const b = [];
    if (pode && p.ativa) {
      b.push(botao(p.matricula ? 'Trocar' : 'Alocar', { peq: true, tipo: p.matricula ? '' : 'primario', onClick: () => modalAlocar(p, carregar) }));
      if (p.matricula) b.push(botao('Retirar', { peq: true, onClick: () => retirarColaborador(p, carregar) }));
    }
    if (podeVerClientes() && p.ativa) b.push(botao('Clientes', { peq: true, tipo: 'sutil', onClick: () => window.irPara('clientes', { rota: p.id }) }));
    if (pode) {
      b.push(botao('', { peq: true, tipo: 'sutil', icone: 'editar', titulo: 'Observação', onClick: () => editarObservacao(p, carregar) }));
      if (!p.matricula && ehAdm()) b.push(botao(p.ativa ? 'Inativar' : 'Reativar', { peq: true, tipo: 'sutil', onClick: () => alternarStatus(p, carregar) }));
    }
    return h('div', { class: 'acoes-linha' }, b);
  }

  function novaRota() {
    const g = estado.gerenciaAtual;
    const cod = h('input', { type: 'text', placeholder: 'Ex.: 151', maxlength: 20, style: { textTransform: 'uppercase' } });
    const obs = h('input', { type: 'text', placeholder: 'Opcional' });
    const tel = mascaraTelefone(h('input', { type: 'text' }));
    const colab = seletorColaborador();
    const m = modal({
      titulo: `Nova rota de repositor — ${g}`, tamanho: 'grande',
      conteudo: h('div', { class: 'stack' },
        h('div', { class: 'form-grid' },
          h('div', { class: 'campo' }, h('label', {}, 'Código da rota *'), cod, h('div', { class: 'ajuda' }, 'Letras, números, ponto ou hífen. Não pode se repetir em nenhuma gerência.')),
          h('div', { class: 'campo' }, h('label', {}, 'Telefone da rota'), tel, h('div', { class: 'ajuda' }, 'Opcional. Padrão (XX) XXXXX-XXXX.')),
          h('div', { class: 'campo inteiro' }, h('label', {}, 'Observação'), obs),
          h('div', { class: 'campo inteiro' }, h('label', {}, 'Repositor'), colab.el,
            h('div', { class: 'ajuda' }, 'Opcional. Se a pessoa já estiver em outra rota, o portal pede confirmação da transferência.')))),
      acoes: [{ texto: 'Cancelar' }, { texto: 'Criar rota', tipo: 'primario', onClick: async () => {
        if (!telefoneValido(tel.value)) { toast('Telefone incompleto. Use (XX) XXXXX-XXXX ou deixe em branco.', 'aviso'); tel.focus(); return; }
        try {
          const r = await rpc('criar_rota', { p_gerencia: g, p_codigo: cod.value, p_observacao: obs.value, p_telefone: tel.value });
          m.fechar(); toast(r.mensagem); await carregar();
          const nova = posicoes.find((p) => p.id === r.id);
          if (nova && colab.valor()) modalAlocar(nova, carregar, { colaborador: colab.valor() });
        } catch (e) { toast(e.message, 'erro', 7000); }
      } }],
    });
    cod.addEventListener('keydown', (e) => { if (e.key === 'Enter') m.caixa.querySelector('.modal-f .primario').click(); });
  }

  function exportar() {
    const g = estado.gerenciaAtual;
    baixarExcel(`Estrutura_${g.replace(/[^A-Z0-9]/gi, '')}_${hoje()}.xlsx`, [{
      nome: 'Estrutura', linhas: posicoes, colunas: [
        { titulo: 'Gerência', campo: 'gerencia' }, { titulo: 'Nível', campo: (p) => NIVEIS[p.nivel] , largura: 28 },
        { titulo: 'Código', campo: 'codigo' }, { titulo: 'Matrícula', campo: 'matricula' }, { titulo: 'Nome', campo: 'nome', largura: 38 },
        { titulo: 'Cargo', campo: 'cargo', largura: 28 }, { titulo: 'Situação', campo: 'situacao', largura: 20 }, { titulo: 'Telefone', campo: (p) => fmtTelefone(p.telefone_rota || p.telefone), largura: 16 },
        { titulo: 'Qtd. clientes', campo: (p) => (p.nivel === 'RP' ? qtd[p.id] || 0 : null) }, { titulo: 'Ativa', campo: (p) => (p.ativa ? 'SIM' : 'NÃO') },
        { titulo: 'Observação', campo: 'observacao', largura: 30 },
      ],
    }]);
    registrarEvento('EXPORTACAO', `Exportou a estrutura da ${g}`, g);
  }

  // Exporta a estrutura de TODAS as gerências que o usuário enxerga, em 3 abas.
  async function exportarTodas(b) {
    b.disabled = true; const orig = b.innerHTML; b.innerHTML = '<span class="spinner"></span> Gerando…';
    try {
      const gers = estado.gerencias.map((x) => x.codigo);
      const [todas, resumo, qtds] = await Promise.all([
        buscarTudo(() => sb.from('vw_posicoes').select('*').in('gerencia', gers).order('gerencia').order('ordem').order('codigo')),
        rpc('resumo_gerencias'),
        Promise.all(gers.map((g) => rpc('qtd_clientes_rotas', { p_gerencia: g }))),
      ]);
      const q = {}; for (const lista of qtds) for (const x of lista || []) q[x.posicao_id] = x.qtd;
      const tel = (p) => (p ? fmtTelefone(p.telefone_rota || p.telefone) : null);
      const lid = {}; // gerencia -> { GC, GM, SM, LM }
      for (const p of todas) if (p.nivel !== 'RP') (lid[p.gerencia] ||= {})[p.nivel] = p;
      const nomeLid = (g, n) => { const p = lid[g]?.[n]; return p && p.ativa ? p.nome || 'VAGO' : null; };
      const matLid = (g, n) => { const p = lid[g]?.[n]; return p && p.ativa ? p.matricula : null; };
      const rotas = todas.filter((p) => p.nivel === 'RP');
      baixarExcel(`Estrutura_completa_${hoje()}.xlsx`, [
        { nome: 'Estrutura por rota', linhas: rotas, colunas: [
          { titulo: 'Gerência', campo: 'gerencia' },
          { titulo: 'Gerente Comercial', campo: (p) => nomeLid(p.gerencia, 'GC'), largura: 32 },
          { titulo: 'Mat. Gerente Merch.', campo: (p) => matLid(p.gerencia, 'GM') }, { titulo: 'Gerente de Merchandising', campo: (p) => nomeLid(p.gerencia, 'GM'), largura: 32 },
          { titulo: 'Mat. Supervisor Merch.', campo: (p) => matLid(p.gerencia, 'SM') }, { titulo: 'Supervisor de Merchandising', campo: (p) => nomeLid(p.gerencia, 'SM'), largura: 32 },
          { titulo: 'Mat. Líder', campo: (p) => matLid(p.gerencia, 'LM') }, { titulo: 'Líder de Merchandising', campo: (p) => nomeLid(p.gerencia, 'LM'), largura: 32 },
          { titulo: 'Telefone Líder', campo: (p) => tel(lid[p.gerencia]?.LM), largura: 16 },
          { titulo: 'Rota', campo: 'codigo' }, { titulo: 'Matrícula Repositor', campo: 'matricula' }, { titulo: 'Repositor', campo: (p) => p.nome || (p.ativa ? 'VAGA' : null), largura: 34 },
          { titulo: 'Cargo', campo: 'cargo', largura: 22 }, { titulo: 'Situação', campo: 'situacao', largura: 20 }, { titulo: 'Telefone Rota', campo: tel, largura: 16 },
          { titulo: 'Qtd. clientes', campo: (p) => q[p.id] || 0 }, { titulo: 'Rota ativa', campo: (p) => (p.ativa ? 'SIM' : 'NÃO') },
          { titulo: 'Observação', campo: 'observacao', largura: 30 },
        ] },
        { nome: 'Todas as posições', linhas: todas, colunas: [
          { titulo: 'Gerência', campo: 'gerencia' }, { titulo: 'Nível', campo: (p) => NIVEIS[p.nivel], largura: 28 },
          { titulo: 'Código', campo: 'codigo' }, { titulo: 'Matrícula', campo: 'matricula' }, { titulo: 'Nome', campo: 'nome', largura: 38 },
          { titulo: 'Cargo', campo: 'cargo', largura: 28 }, { titulo: 'Situação', campo: 'situacao', largura: 20 }, { titulo: 'Telefone', campo: tel, largura: 16 },
          { titulo: 'Qtd. clientes', campo: (p) => (p.nivel === 'RP' ? q[p.id] || 0 : null) }, { titulo: 'Ativa', campo: (p) => (p.ativa ? 'SIM' : 'NÃO') },
          { titulo: 'Observação', campo: 'observacao', largura: 30 },
        ] },
        { nome: 'Resumo por gerência', linhas: resumo, colunas: [
          { titulo: 'Gerência', campo: 'gerencia' }, { titulo: 'Gerente Comercial', campo: (r) => r.gc || 'VAGO', largura: 32 },
          { titulo: 'Gerente de Merchandising', campo: 'gm', largura: 32 }, { titulo: 'Supervisor de Merchandising', campo: 'sm', largura: 32 },
          { titulo: 'Líder de Merchandising', campo: (r) => r.lm || 'VAGO', largura: 32 },
          { titulo: 'Rotas ativas', campo: 'rotas_ativas' }, { titulo: 'Rotas com repositor', campo: 'rotas_ocupadas' }, { titulo: 'Rotas vagas', campo: 'rotas_vagas' },
          { titulo: 'Rotas inativas', campo: 'rotas_inativas' }, { titulo: 'Vínculos cliente × rota', campo: 'clientes_vinculados' }, { titulo: 'Clientes (PDVs)', campo: 'pdvs_distintos' },
        ] },
      ]);
      registrarEvento('EXPORTACAO', `Exportou a estrutura completa (${gers.length} gerência(s), ${rotas.length} rotas)`, 'TODAS');
    } catch (e) { toast(e.message, 'erro', 7000); }
    finally { b.disabled = false; b.innerHTML = orig; }
  }

  await carregar();
}
