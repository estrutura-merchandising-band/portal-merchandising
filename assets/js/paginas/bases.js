import { h, limpar, botao, modal, toast, tabela, alerta, confirmar, pedirTexto, debounce, num, dataHora, badgeSituacao, baixarExcel, hoje, lerPlanilha, seletorArquivo, normCodigo, limpaTxt, telefoneValido, digitosTelefone, fmtTelefone } from '../ui.js';
import { sb, rpc, consulta } from '../api.js';
import { cabecalho } from './comum.js';

const MAPAS = {
  COLABORADORES: {
    mapa: {
      matricula: ['matricula', 'matriculafuncionario', 'matric', 'chapa', 're', 'registro', 'codfuncionario', 'codigofuncionario'],
      nome: ['nomefunc', 'nome', 'nomefuncionario', 'nomecolaborador', 'colaborador', 'funcionario', 'nomecompleto'],
      cargo: ['cargo', 'funcao', 'descricaocargo', 'nomecargo', 'descricaofuncao'],
      centro_custo: ['descricaocc', 'centrodecusto', 'centrocusto', 'cc', 'descricaocentrodecusto', 'descricaocentrocusto', 'setor', 'departamento'],
      lotacao: ['lotacao', 'filial', 'unidade', 'empresa', 'local'],
      situacao: ['situacao', 'status', 'situacaofuncionario', 'situacaoatual'],
      telefone: ['telefone', 'celular', 'telefonecelular', 'fone', 'telcelular', 'whatsapp'],
    },
    obrig: ['matricula', 'nome'], tabela: 'stg_colaboradores', processar: 'processar_importacao_colaboradores',
    norm: (l) => ({ matricula: normCodigo(l.matricula), nome: limpaTxt(l.nome), cargo: limpaTxt(l.cargo), centro_custo: limpaTxt(l.centro_custo), lotacao: limpaTxt(l.lotacao), situacao: limpaTxt(l.situacao), telefone: limpaTxt(l.telefone) }),
  },
  CLIENTES: {
    mapa: {
      cod_cliente: ['codcliente', 'codigocliente', 'codigodocliente', 'pv', 'codpv'],
      nome_fantasia: ['nomefantasia', 'fantasia'], razao_social: ['razaosocial'], segmento: ['segmento'],
      canal: ['canalcliente', 'canal'], subcanal: ['subcanal'],
      gerencia: ['gerenciacomercial', 'gerencia', 'gc', 'gerenciavendas'],
      supervisao_venda: ['supervisor', 'supervisao'], rota_venda: ['rota', 'rotavenda', 'rotadevenda'],
      cidade: ['cidade', 'municipio'], bairro: ['bairro'],
      // cadastro da loja usado só pelo aplicativo do repositor (não aparece no portal)
      doc_tipo: ['class', 'tipodocumento', 'tipopessoa'], cnpj_cpf: ['cnpjcpf', 'cpfcnpj', 'cnpj', 'documento'],
      endereco: ['endereco', 'logradouro'], complemento: ['complemento'], cep: ['cep'],
      latitude: ['latitude', 'lat'], longitude: ['longitude', 'long', 'lng'],
      telefone_cliente: ['telefonecliente', 'telcliente', 'fonecliente'],
      consultor_nome: ['nomeconsultor', 'consultor', 'nomevendedor', 'vendedor'], consultor_telefone: ['telconsultor', 'telefoneconsultor', 'celularconsultor'],
      supervisor_nome: ['nomesupervisor'], supervisor_telefone: ['telefonesup', 'telefonesupervisor', 'telsupervisor'],
      gerente_telefone: ['telefonegc', 'telefonegerente', 'telgc', 'telefonegerentecomercial'],
    },
    obrig: ['cod_cliente', 'gerencia'], tabela: 'stg_clientes', processar: 'processar_importacao_clientes',
    norm: (l) => { const o = {}; for (const k of Object.keys(MAPAS.CLIENTES.mapa)) o[k] = limpaTxt(l[k]); o.cod_cliente = normCodigo(l.cod_cliente); o.gerencia = o.gerencia ? o.gerencia.toUpperCase() : null; return o; },
  },
};

export async function render(el, params) {
  let aba = params.aba || 'importar';
  const abasEl = h('div', { class: 'abas' });
  const corpo = h('div');
  el.append(cabecalho('Bases e importações', 'Atualize as bases de colaboradores e de clientes (recomendado: diariamente) e consulte o que está carregado.'), abasEl, corpo);
  const ABAS = [['importar', 'Importar bases'], ['colaboradores', 'Colaboradores'], ['clientes', 'Clientes'], ['carga', 'Carga de estrutura'], ['historico', 'Histórico de importações']];
  function desenharAbas() {
    limpar(abasEl, ABAS.map(([k, t]) => h('button', { type: 'button', class: aba === k ? 'ativo' : '', onclick: () => { aba = k; desenharAbas(); abrir(); } }, t)));
  }
  let seq = 0;
  async function abrir() {
    const meu = ++seq;
    const alvo = h('div');
    limpar(corpo, h('div', { class: 'carregando' }, h('span', { class: 'spinner' })));
    const f = { importar: abaImportar, colaboradores: abaColaboradores, clientes: abaClientes, carga: abaCarga, historico: abaHistorico }[aba];
    try { await f(alvo, () => { if (meu === seq) abrir(); }); } catch (e) { limpar(alvo, alerta('erro', null, e.message)); }
    if (meu === seq) limpar(corpo, alvo);
  }
  desenharAbas(); await abrir();
}

// ---------------------------------------------------------------------------
async function abaImportar(el, recarregar) {
  const ult = await consulta(sb.from('importacoes').select('*').eq('status', 'CONCLUIDA').order('concluido_em', { ascending: false }).limit(20));
  const ultima = (t) => ult.find((i) => i.tipo === t);
  const [nc, ncli] = await Promise.all([
    consulta(sb.from('colaboradores').select('matricula', { count: 'exact', head: true }).eq('na_base', true)),
    consulta(sb.from('clientes').select('cod_cliente', { count: 'exact', head: true }).eq('na_base', true)),
  ]);
  const cartao = (tipo, titulo, desc, total) => {
    const u = ultima(tipo);
    return h('div', { class: 'card' },
      h('div', { class: 'card-h' }, h('h2', {}, titulo), h('span', { class: 'badge azul' }, `${num(total)} na base`)),
      h('div', { class: 'card-b stack' },
        h('div', { class: 'muted' }, desc),
        u ? h('div', { class: 'small' }, 'Última atualização: ', h('b', {}, dataHora(u.concluido_em)), ` por ${u.usuario_nome || '-'} (${u.arquivo || ''})`) : h('div', { class: 'small muted' }, 'Ainda não importada.'),
        h('div', { class: 'row' }, botao('Selecionar arquivo e importar', { tipo: 'primario', icone: 'upload', onClick: () => importarBase(tipo, recarregar) }))));
  };
  limpar(el, h('div', { class: 'grid g2' },
    cartao('COLABORADORES', 'Base de colaboradores (RH)', 'Excel com Matrícula, Nome, Cargo, Centro de custo, Situação e (opcional) Telefone. Quem não vier no arquivo é marcado como "fora da base" e aparece nas pendências se estiver alocado.', nc.count),
    cartao('CLIENTES', 'Base de clientes (cadastro)', 'Excel da base de clientes ativos (pode ser o relatório completo, com várias abas). Usa Cód. Cliente e Gerência Comercial para validar que o cliente é da mesma gerência da rota.', ncli.count)),
  h('div', { class: 'card', style: { marginTop: '16px' } }, h('div', { class: 'card-b' },
    alerta('info', 'Proteção contra arquivo errado', 'Se o arquivo tiver muito menos registros que a base atual (menos de 80%), o portal pede confirmação antes de marcar os que faltam como "fora da base".'))));
}

async function importarBase(tipo, aoConcluir) {
  const cfg = MAPAS[tipo];
  const arquivo = await seletorArquivo();
  if (!arquivo) return;
  const aguarde = modal({ titulo: 'Lendo arquivo…', conteudo: h('div', { class: 'carregando' }, h('span', { class: 'spinner' }), ` Lendo ${arquivo.name}. Arquivos grandes podem levar alguns segundos.`), fecharFora: false });
  let dados;
  await new Promise((r) => setTimeout(r, 60));
  try { dados = await lerPlanilha(arquivo, cfg.mapa, cfg.obrig); }
  catch (e) { aguarde.fechar(); toast(e.message, 'erro', 9000); return; }
  aguarde.fechar();
  const linhas = dados.linhas.map(cfg.norm).filter((l) => cfg.obrig.every((c) => l[c]));
  const descartadas = dados.linhas.length - linhas.length;
  const faltando = Object.keys(cfg.mapa).filter((c) => !dados.colunas.includes(c));
  const barra = h('div', { class: 'progresso hidden' }, h('div'));
  const etapa = h('div', { class: 'muted small' });
  const saida = h('div');
  const ROT = { matricula: 'Matrícula', nome: 'Nome', cargo: 'Cargo', centro_custo: 'Centro de custo', lotacao: 'Lotação', situacao: 'Situação', telefone: 'Telefone',
    cod_cliente: 'Cód. cliente', nome_fantasia: 'Nome fantasia', razao_social: 'Razão social', segmento: 'Segmento', canal: 'Canal', subcanal: 'Subcanal',
    gerencia: 'Gerência', supervisao_venda: 'Supervisão (vendas)', rota_venda: 'Rota (vendas)', cidade: 'Cidade', bairro: 'Bairro',
    doc_tipo: 'Tipo doc. (app)', cnpj_cpf: 'CNPJ/CPF (app)', endereco: 'Endereço (app)', complemento: 'Complemento (app)', cep: 'CEP (app)',
    latitude: 'Latitude (app)', longitude: 'Longitude (app)', consultor_nome: 'Consultor (app)', consultor_telefone: 'Tel. consultor (app)',
    telefone_cliente: 'Tel. loja (app)', supervisor_nome: 'Supervisor (app)', supervisor_telefone: 'Tel. supervisor (app)', gerente_telefone: 'Tel. gerente (app)' };
  const colsAmostra = dados.colunas.map((c) => ({ titulo: ROT[c] || c, render: (l) => h('span', { class: 'small' }, l[c] ?? '') }));

  const m = modal({
    titulo: `Importar base de ${tipo === 'CLIENTES' ? 'clientes' : 'colaboradores'}`, tamanho: 'enorme', fecharFora: false,
    conteudo: h('div', { class: 'stack' },
      alerta('info', arquivo.name, `Aba "${dados.aba}" · ${num(linhas.length)} registro(s) válido(s)${descartadas ? ` · ${num(descartadas)} linha(s) ignorada(s) sem ${cfg.obrig.join('/')}` : ''}.`),
      faltando.length ? alerta('aviso', 'Colunas não encontradas (ficarão vazias)', faltando.map((c) => ROT[c] || c).join(', ')) : null,
      h('div', { class: 'rotulo' }, 'Amostra das primeiras linhas'),
      tabela(colsAmostra, linhas.slice(0, 5)),
      barra, etapa, saida),
    acoes: [{ texto: 'Cancelar' }, { texto: `Importar ${num(linhas.length)} registro(s)`, tipo: 'primario', onClick: executar }],
  });

  async function executar() {
    let imp = null;
    barra.classList.remove('hidden');
    try {
      limpar(etapa, 'Preparando importação…');
      imp = await rpc('iniciar_importacao', { p_tipo: tipo, p_arquivo: arquivo.name });
      const LOTE = 1000;
      for (let i = 0; i < linhas.length; i += LOTE) {
        const lote = linhas.slice(i, i + LOTE).map((l) => ({ importacao_id: imp, ...l }));
        const { error } = await sb.from(cfg.tabela).insert(lote);
        if (error) throw new Error(error.message);
        barra.firstChild.style.width = `${Math.round(Math.min(i + LOTE, linhas.length) / linhas.length * 90)}%`;
        limpar(etapa, `Enviando ${num(Math.min(i + LOTE, linhas.length))} de ${num(linhas.length)}…`);
      }
      limpar(etapa, 'Processando e comparando com a base atual…');
      let r = await rpc(cfg.processar, { p_importacao_id: imp, p_forcar: false });
      if (r.status === 'confirmar') {
        if (!(await confirmar({ titulo: 'Confirme a importação', mensagem: r.mensagem, textoOk: 'Sim, importar mesmo assim', perigo: true }))) {
          await rpc('cancelar_importacao', { p_importacao_id: imp });
          limpar(etapa, 'Importação cancelada. Nada foi alterado.'); barra.classList.add('hidden'); return;
        }
        r = await rpc(cfg.processar, { p_importacao_id: imp, p_forcar: true });
      }
      barra.firstChild.style.width = '100%';
      limpar(etapa);
      mostrarResumo(saida, tipo, r);
      m.definirAcoes([{ texto: 'Concluir', tipo: 'primario', onClick: () => { m.fechar(); aoConcluir && aoConcluir(); } }]);
      toast('Base importada com sucesso.');
    } catch (e) {
      if (imp) { try { await rpc('cancelar_importacao', { p_importacao_id: imp }); } catch { /* ignora */ } }
      limpar(etapa, h('span', { style: { color: 'var(--danger)' } }, 'Falhou: ' + e.message + ' — nada foi alterado na base.'));
    }
  }
}

function mostrarResumo(el, tipo, r) {
  const k = (v, l, alertaK) => h('div', { class: `kpi ${alertaK ? 'alerta-kpi' : ''}` }, h('div', { class: 'v' }, num(v)), h('div', { class: 'l' }, l));
  const lista = tipo === 'CLIENTES' ? r.mudaram_gerencia_em_rotas || [] : r.fora_da_base_alocados || [];
  limpar(el, h('div', { class: 'stack' },
    h('div', { class: 'kpis' }, k(r.total_arquivo, 'No arquivo'), k(r.novos, 'Novos'), k(r.alterados, 'Alterados'), k(r.reativados, 'Voltaram para a base'), k(r.fora_da_base, 'Saíram da base', r.fora_da_base > 0)),
    tipo === 'CLIENTES' && r.dados_app ? (r.dados_app.colunas_no_arquivo
      ? alerta(r.dados_app.clientes_em_rotas_sem_gps ? 'aviso' : 'info', 'Cadastro da loja para o aplicativo',
          `${num(r.dados_app.atualizados)} cliente(s) com o cadastro da loja atualizado: coordenadas, endereço, telefones, CNPJ/CPF, consultor e supervisor (só o app usa).` +
          (r.dados_app.clientes_em_rotas_sem_gps ? ` Atenção: ${num(r.dados_app.clientes_em_rotas_sem_gps)} cliente(s) em rotas estão sem latitude/longitude — no app, a cerca de 100 m da visita não funciona para eles.` : ' Todos os clientes das rotas têm latitude/longitude.'))
      : alerta('aviso', 'Cadastro da loja para o aplicativo', 'Este arquivo não tem as colunas do cadastro da loja (CNPJ/CPF, endereço, latitude/longitude, consultor). Os dados que o app já tinha foram mantidos.')) : null,
    tipo === 'CLIENTES' && r.retirados_das_rotas ? h('div', { class: 'stack', style: { gap: '6px' } },
      alerta('aviso', `${r.retirados_das_rotas} cliente(s) saíram da base e foram retirados das rotas (${r.vinculos_retirados} vínculo(s))`,
        h('span', {}, 'A Administração de Vendas e a liderança das gerências foram avisadas no portal (menu Avisos).',
          r.pedidos_encerrados ? ` ${r.pedidos_encerrados} pedido(s) pendente(s) desses clientes foram encerrados.` : '')),
      tabela([{ titulo: 'Cliente', campo: 'cod_cliente' }, { titulo: 'Nome', campo: 'nome' }, { titulo: 'Rota', campo: 'rota' }, { titulo: 'Gerência', campo: 'gerencia' }],
        (r.retirados || []).slice(0, 300))) : null,
    lista.length ? h('div', { class: 'stack', style: { gap: '6px' } },
      alerta('aviso', tipo === 'CLIENTES' ? `${lista.length} cliente(s) em rotas mudaram de gerência` : `${lista.length} colaborador(es) que saíram da base estão alocados`,
        'Revise em Pendências — eles não são removidos automaticamente.'),
      tabela(tipo === 'CLIENTES'
        ? [{ titulo: 'Cliente', campo: 'cod_cliente' }, { titulo: 'Nome', campo: 'nome' }, { titulo: 'De', campo: 'de' }, { titulo: 'Para', campo: 'para' }, { titulo: 'Rotas', campo: 'rotas' }]
        : [{ titulo: 'Matrícula', campo: 'matricula' }, { titulo: 'Nome', campo: 'nome' }, { titulo: 'Posição', campo: 'posicao' }, { titulo: 'Gerência', campo: 'gerencia' }], lista.slice(0, 300))) : null));
}

// ---------------------------------------------------------------------------
async function abaColaboradores(el) {
  let pag = 0, texto = '', soBase = true;
  const TAM = 50;
  const busca = h('input', { type: 'search', placeholder: 'Matrícula, nome ou cargo' });
  const chk = h('input', { type: 'checkbox', checked: true });
  const area = h('div');
  busca.addEventListener('input', debounce(() => { texto = busca.value.trim(); pag = 0; carregar(); }, 350));
  chk.addEventListener('change', () => { soBase = chk.checked; pag = 0; carregar(); });
  limpar(el, h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('div', { class: 'toolbar' }, busca, h('label', { class: 'check' }, chk, 'Só quem está na base atual'))), area));

  async function carregar() {
    let q = sb.from('colaboradores').select('*', { count: 'exact' }).order('nome').range(pag * TAM, pag * TAM + TAM - 1);
    if (soBase) q = q.eq('na_base', true);
    if (texto) {
      const t = texto.replace(/[,()*%]/g, ' ').trim();
      q = /^\d+$/.test(t) ? q.eq('matricula', normCodigo(t)) : q.or(`nome.ilike.*${t}*,cargo.ilike.*${t}*`);
    }
    const { data, count } = await consulta(q);
    limpar(area, tabela([
      { titulo: 'Matrícula', render: (c) => h('span', { class: 'mono' }, c.matricula) },
      { titulo: 'Nome', campo: 'nome' }, { titulo: 'Cargo', render: (c) => h('span', { class: 'small' }, c.cargo || '') },
      { titulo: 'Centro de custo', render: (c) => h('span', { class: 'small' }, c.centro_custo || '') },
      { titulo: 'Situação', render: (c) => badgeSituacao(c.situacao, c.na_base) },
      { titulo: 'Telefone', render: (c) => h('span', { class: 'row nowrap', style: { gap: '4px' } }, (c.telefone ? fmtTelefone(c.telefone) : h('span', { class: 'muted' }, '—')),
        botao('', { peq: true, tipo: 'sutil', icone: 'editar', titulo: 'Editar telefone', onClick: async () => {
          const v = await pedirTexto({ titulo: `Telefone de ${c.nome}`, rotulo: 'Telefone', valor: c.telefone || '', ajuda: 'Usado no arquivo de fechamento. Uma importação com coluna Telefone sobrescreve este valor.' });
          if (v === null) return;
          if (!telefoneValido(v)) return toast('Telefone inválido. Use (XX) XXXXX-XXXX, com DDD e 9 dígitos.', 'aviso');
          const { error } = await sb.from('colaboradores').update({ telefone: digitosTelefone(v) ? fmtTelefone(v) : null }).eq('matricula', c.matricula);
          if (error) toast(error.message, 'erro'); else { toast('Telefone salvo.'); carregar(); }
        } })) },
      { titulo: 'Atualizado', render: (c) => h('span', { class: 'small muted' }, dataHora(c.atualizado_em)) },
    ], data), paginacao(pag, TAM, count, (p) => { pag = p; carregar(); }));
  }
  await carregar();
}

async function abaClientes(el) {
  let pag = 0, texto = '', ger = '', soBase = true;
  const TAM = 50;
  const busca = h('input', { type: 'search', placeholder: 'Código, nome fantasia ou razão social' });
  const gs = await consulta(sb.from('gerencias').select('codigo').order('codigo'));
  const sel = h('select', {}, h('option', { value: '' }, 'Todas as gerências'), gs.map((g) => h('option', { value: g.codigo }, g.codigo)));
  const chk = h('input', { type: 'checkbox', checked: true });
  const area = h('div');
  busca.addEventListener('input', debounce(() => { texto = busca.value.trim(); pag = 0; carregar(); }, 350));
  sel.addEventListener('change', () => { ger = sel.value; pag = 0; carregar(); });
  chk.addEventListener('change', () => { soBase = chk.checked; pag = 0; carregar(); });
  limpar(el, h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('div', { class: 'toolbar' }, busca, sel, h('label', { class: 'check' }, chk, 'Só clientes na base atual'))), area));

  async function carregar() {
    let q = sb.from('clientes').select('*', { count: 'exact' }).order('cod_cliente').range(pag * TAM, pag * TAM + TAM - 1);
    if (soBase) q = q.eq('na_base', true);
    if (ger) q = q.eq('gerencia', ger);
    if (texto) {
      const t = texto.replace(/[,()*%]/g, ' ').trim();
      q = /^\d+$/.test(t) ? q.eq('cod_cliente', normCodigo(t)) : q.or(`nome_fantasia.ilike.*${t}*,razao_social.ilike.*${t}*`);
    }
    const { data, count } = await consulta(q);
    limpar(area, tabela([
      { titulo: 'Cód.', render: (c) => h('span', { class: 'mono' }, c.cod_cliente) },
      { titulo: 'Nome fantasia', campo: 'nome_fantasia' }, { titulo: 'Razão social', render: (c) => h('span', { class: 'small' }, c.razao_social || '') },
      { titulo: 'Segmento', render: (c) => h('span', { class: 'small' }, c.segmento || '') }, { titulo: 'Gerência', campo: 'gerencia' },
      { titulo: 'Cidade', render: (c) => h('span', { class: 'small' }, c.cidade || '') },
      { titulo: 'Status', render: (c) => (c.na_base ? h('span', { class: 'badge ok' }, 'Na base') : h('span', { class: 'badge erro' }, 'Fora da base')) },
    ], data), paginacao(pag, TAM, count, (p) => { pag = p; carregar(); }));
  }
  await carregar();
}

function paginacao(pag, tam, total, ir) {
  const paginas = Math.max(1, Math.ceil((total || 0) / tam));
  return h('div', { class: 'paginacao' }, `${num(total)} registro(s) · página ${pag + 1} de ${num(paginas)}`,
    botao('Anterior', { peq: true, desabilitado: pag === 0, onClick: () => ir(pag - 1) }),
    botao('Próxima', { peq: true, desabilitado: pag + 1 >= paginas, onClick: () => ir(pag + 1) }));
}

async function abaHistorico(el) {
  const lista = await consulta(sb.from('importacoes').select('*').order('iniciado_em', { ascending: false }).limit(100));
  const st = { CONCLUIDA: 'ok', EM_ANDAMENTO: 'azul', CANCELADA: 'cinza', ABANDONADA: 'cinza' };
  limpar(el, h('div', { class: 'card' }, tabela([
    { titulo: 'Data', render: (i) => dataHora(i.iniciado_em) }, { titulo: 'Base', campo: 'tipo' }, { titulo: 'Arquivo', render: (i) => h('span', { class: 'small' }, i.arquivo || '') },
    { titulo: 'Usuário', campo: 'usuario_nome' }, { titulo: 'Status', render: (i) => h('span', { class: `badge ${st[i.status] || 'cinza'}` }, i.status) },
    { titulo: 'Resumo', render: (i) => (i.resumo ? h('span', { class: 'small' }, `${num(i.resumo.total_arquivo)} no arquivo · ${num(i.resumo.novos)} novos · ${num(i.resumo.alterados)} alterados · ${num(i.resumo.fora_da_base)} saíram`) : '') },
  ], lista, { vazio: 'Nenhuma importação ainda.' })));
}

// ---------------------------------------------------------------------------
// Carga de estrutura a partir da planilha manual (formato "Base Atendimento Repositor")
// ---------------------------------------------------------------------------
const MAPA_CARGA = {
  gerencia: ['gerencia', 'gerenciacomercial'],
  rota: ['rotarp', 'rota', 'rotarepositor'],
  matricula: ['matricularep', 'matricularepositor', 'matricula'],
  matricula_lider: ['matriculalider', 'matriculadolider', 'matriculaliderdemerchandising'],
  telefone: ['telefonerepositor', 'telefonerota', 'telefone'],
  telefone_lider: ['telefonelider'],
  cod_cliente: ['pv', 'codcliente', 'codigocliente'],
  seg: ['seg'], ter: ['ter'], qua: ['qua'], qui: ['qui'], sex: ['sex'], sab: ['sab'],
};
const marcado = (v) => v !== null && v !== undefined && /^(1|x|s|sim|true|ok|v)$/i.test(String(v).trim());

async function abaCarga(el) {
  limpar(el, h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h2', {}, 'Carga de estrutura em massa')),
    h('div', { class: 'card-b stack' },
      h('p', { style: { margin: 0 } }, 'Use para a carga inicial (ou grandes reestruturações) a partir da planilha no formato da "Base de Atendimento Repositores": colunas ',
        h('b', {}, 'Gerência, Rota RP, Matrícula Rep, Matricula Líder, PV, SEG…SAB'), '.'),
      h('ul', { style: { margin: 0, paddingLeft: '18px' }, class: 'muted' },
        h('li', {}, 'Cria as rotas que ainda não existem e aloca o repositor de cada rota (regra 1:1 — conflitos são listados e não gravados).'),
        h('li', {}, 'Aloca o Líder de Merchandising de cada gerência pela coluna Matricula Líder.'),
        h('li', {}, 'Inclui os clientes nas rotas com os dias de visita (cliente de outra gerência é recusado).'),
        h('li', {}, 'Gerente Comercial, Gerente e Supervisor de Merchandising são alocados manualmente na tela Estrutura.'),
        h('li', {}, 'Antes, importe as bases de colaboradores e de clientes.')),
      h('div', { class: 'row' }, botao('Selecionar planilha', { tipo: 'primario', icone: 'upload', onClick: executarCarga })))));
}

async function executarCarga() {
  const arquivo = await seletorArquivo();
  if (!arquivo) return;
  let dados;
  try { dados = await lerPlanilha(arquivo, MAPA_CARGA, ['gerencia', 'rota']); }
  catch (e) { toast(e.message, 'erro', 8000); return; }
  const rotas = new Map(), lideres = new Map(), vinculos = [], conflitosPlanilha = [];
  for (const l of dados.linhas) {
    const g = limpaTxt(l.gerencia)?.toUpperCase(); const rota = limpaTxt(l.rota)?.toUpperCase();
    if (!g || !rota) continue;
    const mat = normCodigo(l.matricula);
    if (!rotas.has(rota)) rotas.set(rota, { gerencia: g, nivel: 'RP', rota, matricula: mat, telefone: limpaTxt(l.telefone) });
    else if (mat && rotas.get(rota).matricula && rotas.get(rota).matricula !== mat) conflitosPlanilha.push(`Rota ${rota} com duas matrículas na planilha (${rotas.get(rota).matricula} e ${mat}) — mantida a primeira.`);
    const ml = normCodigo(l.matricula_lider);
    if (ml && !lideres.has(g)) lideres.set(g, { gerencia: g, nivel: 'LM', matricula: ml, telefone: limpaTxt(l.telefone_lider) });
    const cod = normCodigo(l.cod_cliente);
    if (cod) vinculos.push({ rota, cod_cliente: cod, seg: marcado(l.seg), ter: marcado(l.ter), qua: marcado(l.qua), qui: marcado(l.qui), sex: marcado(l.sex), sab: marcado(l.sab) });
  }
  // a mesma matrícula em duas rotas da planilha
  const porMat = {};
  for (const r of rotas.values()) if (r.matricula) (porMat[r.matricula] ||= []).push(r.rota);
  for (const [m, rs] of Object.entries(porMat)) if (rs.length > 1) conflitosPlanilha.push(`Matrícula ${m} aparece em ${rs.length} rotas (${rs.join(', ')}) — só a primeira será alocada.`);

  const barra = h('div', { class: 'progresso hidden' }, h('div'));
  const etapa = h('div', { class: 'muted small' });
  const saida = h('div');
  const m = modal({
    titulo: 'Carga de estrutura', tamanho: 'grande', fecharFora: false,
    conteudo: h('div', { class: 'stack' },
      alerta('info', arquivo.name, `Aba "${dados.aba}": ${num(rotas.size)} rota(s), ${num(lideres.size)} líder(es), ${num(vinculos.length)} vínculo(s) cliente × rota.`),
      conflitosPlanilha.length ? alerta('aviso', 'Problemas na própria planilha', h('ul', { style: { margin: '4px 0 0', paddingLeft: '18px' } }, conflitosPlanilha.slice(0, 30).map((c) => h('li', {}, c)))) : null,
      barra, etapa, saida),
    acoes: [{ texto: 'Cancelar' }, { texto: 'Executar carga', tipo: 'primario', onClick: rodar }],
  });

  async function rodar() {
    barra.classList.remove('hidden');
    const relatorio = [];
    try {
      const estrutura = [...rotas.values(), ...lideres.values()];
      for (let i = 0; i < estrutura.length; i += 300) {
        limpar(etapa, `Criando rotas e alocando… ${Math.min(i + 300, estrutura.length)}/${estrutura.length}`);
        const r = await rpc('carga_estrutura', { p_itens: estrutura.slice(i, i + 300) });
        relatorio.push(...r.itens.filter((x) => x.status === 'erro').map((x) => ({ etapa: 'Estrutura', ref: `${x.gerencia} ${x.codigo}`, matricula: x.matricula, mensagem: x.mensagem })));
        barra.firstChild.style.width = `${Math.round(((i + 300) / estrutura.length) * 40)}%`;
      }
      const grupos = {}; for (const v of vinculos) (grupos[v.rota] ||= []).push(v);
      const lotes = []; let atual = [];
      for (const lista of Object.values(grupos)) { if (atual.length && atual.length + lista.length > 2000) { lotes.push(atual); atual = []; } atual.push(...lista); }
      if (atual.length) lotes.push(atual);
      let incl = 0;
      for (let i = 0; i < lotes.length; i++) {
        limpar(etapa, `Vinculando clientes… lote ${i + 1}/${lotes.length}`);
        const r = await rpc('importar_vinculos', { p_itens: lotes[i], p_substituir: false });
        incl += r.incluidos;
        relatorio.push(...r.itens.filter((x) => x.status === 'erro').map((x) => ({ etapa: 'Clientes', ref: `Rota ${x.rota}`, matricula: x.cod_cliente, mensagem: x.mensagem })));
        barra.firstChild.style.width = `${40 + Math.round(((i + 1) / lotes.length) * 60)}%`;
      }
      barra.firstChild.style.width = '100%';
      limpar(etapa);
      limpar(saida, h('div', { class: 'stack' },
        alerta(relatorio.length ? 'aviso' : 'ok', 'Carga concluída', `${num(rotas.size)} rota(s) processadas · ${num(incl)} vínculo(s) incluídos · ${num(relatorio.length)} linha(s) com problema.`),
        relatorio.length ? h('div', { class: 'stack', style: { gap: '6px' } },
          h('div', { class: 'row' }, h('b', {}, 'Problemas encontrados'), h('div', { class: 'spacer' }), botao('Baixar relatório', { peq: true, icone: 'excel', onClick: () => baixarExcel(`Carga_estrutura_problemas_${hoje()}.xlsx`, [{ nome: 'Problemas', linhas: relatorio, colunas: [{ titulo: 'Etapa', campo: 'etapa' }, { titulo: 'Referência', campo: 'ref', largura: 20 }, { titulo: 'Matrícula / Cliente', campo: 'matricula', largura: 18 }, { titulo: 'Mensagem', campo: 'mensagem', largura: 100 }] }]) })),
          h('div', { style: { maxHeight: '300px', overflow: 'auto' } }, tabela([{ titulo: 'Etapa', campo: 'etapa' }, { titulo: 'Referência', campo: 'ref' }, { titulo: 'Matr./Cliente', campo: 'matricula' }, { titulo: 'Mensagem', render: (x) => h('span', { class: 'small' }, x.mensagem) }], relatorio.slice(0, 500)))) : null));
      m.definirAcoes([{ texto: 'Concluir', tipo: 'primario' }]);
    } catch (e) {
      limpar(etapa, h('span', { style: { color: 'var(--danger)' } }, 'Falhou: ' + e.message));
    }
  }
}

