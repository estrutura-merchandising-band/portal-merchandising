import { h, limpar, botao, modal, tabela, num, dataHora, debounce, baixarExcel, hoje, toast } from '../ui.js';
import { sb, consulta, buscarTudo } from '../api.js';
import { cabecalho } from './comum.js';

export const ACOES = {
  ALOCACAO: ['Alocação', 'ok'], DESALOCACAO: ['Retirada', 'aviso'], SUBSTITUICAO: ['Substituição', 'azul'],
  POSICAO_CRIADA: ['Posição criada', 'ok'], ROTA_MOVIDA: ['Rota movida de gerência', 'azul'], ROTA_EXCLUIDA: ['Rota excluída', 'erro'], POSICAO_INATIVADA: ['Posição inativada', 'erro'], POSICAO_REATIVADA: ['Posição reativada', 'ok'], POSICAO_ALTERADA: ['Posição alterada', 'cinza'],
  CLIENTE_INCLUIDO: ['Cliente incluído', 'ok'], CLIENTE_REMOVIDO: ['Cliente removido', 'erro'], DIAS_VISITA_ALTERADOS: ['Dias de visita', 'azul'],
  USUARIO_CRIADO: ['Usuário criado', 'ok'], USUARIO_ALTERADO: ['Usuário alterado', 'azul'], USUARIO_INATIVADO: ['Usuário inativado', 'erro'], USUARIO_REATIVADO: ['Usuário reativado', 'ok'],
  LOGIN_CRIADO: ['Login criado', 'ok'], SENHA_REDEFINIDA: ['Senha redefinida', 'aviso'], SENHA_ALTERADA: ['Senha alterada', 'cinza'],
  GERENCIA_ALTERADA: ['Gerência alterada', 'azul'], SOLICITACAO_CRIADA: ['Solicitação enviada', 'azul'], SOLICITACAO_REPROVADA: ['Solicitação reprovada', 'erro'], SOLICITACAO_CANCELADA: ['Solicitação cancelada', 'cinza'], API_APP: ['API do aplicativo', 'cinza'], API_APP_FALHA: ['Falha na carga do app', 'erro'], INTEGRACAO_CONFIG: ['Config. integração', 'azul'], INTEGRACAO_DISPARO: ['Carga manual pedida', 'azul'], INTEGRACAO_DISPARO_CONFIG: ['Config. carga manual', 'azul'], TELEFONE_ALTERADO: ['Telefone alterado', 'cinza'],
  IMPORTACAO_COLABORADORES: ['Importação colaboradores', 'azul'], IMPORTACAO_CLIENTES: ['Importação clientes', 'azul'],
  CARGA_ESTRUTURA: ['Carga de estrutura', 'azul'], FECHAMENTO: ['Fechamento', 'ok'], EXPORTACAO: ['Exportação', 'cinza'], BASE_ZERADA: ['Base zerada', 'erro'],
};
const badgeAcao = (a) => h('span', { class: `badge ${ACOES[a]?.[1] || 'cinza'}` }, ACOES[a]?.[0] || a);

export async function render(el) {
  const trinta = new Date(Date.now() - 30 * 864e5).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const f = { de: h('input', { type: 'date', value: trinta }), ate: h('input', { type: 'date', value: hoje() }),
    usuario: h('select'), gerencia: h('select'), acao: h('select'), texto: h('input', { type: 'search', placeholder: 'Buscar na descrição (nome, matrícula, rota, cliente…)' }) };
  const [usuarios, gers] = await Promise.all([
    consulta(sb.from('usuarios').select('id, nome').order('nome')),
    consulta(sb.from('gerencias').select('codigo').eq('ativa_merch', true).order('codigo')),
  ]);
  limpar(f.usuario, h('option', { value: '' }, 'Todos os usuários'), usuarios.map((u) => h('option', { value: u.id }, u.nome)));
  limpar(f.gerencia, h('option', { value: '' }, 'Todas as gerências'), gers.map((g) => h('option', { value: g.codigo }, g.codigo)));
  limpar(f.acao, h('option', { value: '' }, 'Todas as ações'), Object.entries(ACOES).map(([k, [t]]) => h('option', { value: k }, t)));
  const area = h('div');
  let pag = 0; const TAM = 100;

  const filtros = h('div', { class: 'card-b' }, h('div', { class: 'grid g4', style: { gap: '10px' } },
    campo('De', f.de), campo('Até', f.ate), campo('Usuário', f.usuario), campo('Gerência', f.gerencia), campo('Ação', f.acao),
    h('div', { class: 'campo', style: { gridColumn: 'span 3' } }, h('label', {}, 'Texto'), f.texto)));
  el.append(cabecalho('Log de alterações', 'Tudo o que foi alterado no portal: quem, o quê, quando. O log não pode ser editado nem apagado.',
    [botao('Exportar Excel', { icone: 'excel', onClick: exportar })]),
  h('div', { class: 'card' }, filtros), h('div', { class: 'card' }, area));

  for (const k of ['de', 'ate', 'usuario', 'gerencia', 'acao']) f[k].addEventListener('change', () => { pag = 0; carregar(); });
  f.texto.addEventListener('input', debounce(() => { pag = 0; carregar(); }, 400));

  function montar(q) {
    if (f.de.value) q = q.gte('data_hora', `${f.de.value}T00:00:00-03:00`);
    if (f.ate.value) q = q.lte('data_hora', `${f.ate.value}T23:59:59.999-03:00`);
    if (f.usuario.value) q = q.eq('usuario_id', f.usuario.value);
    if (f.gerencia.value) q = q.eq('gerencia', f.gerencia.value);
    if (f.acao.value) q = q.eq('acao', f.acao.value);
    const t = f.texto.value.trim().replace(/[,()*%]/g, ' ').trim();
    if (t) q = q.ilike('descricao', `%${t}%`);
    return q.order('data_hora', { ascending: false }).order('id', { ascending: false });
  }

  async function carregar() {
    limpar(area, h('div', { class: 'carregando' }, h('span', { class: 'spinner' })));
    const { data, count } = await consulta(montar(sb.from('log_alteracoes').select('*', { count: 'exact' })).range(pag * TAM, pag * TAM + TAM - 1));
    const paginas = Math.max(1, Math.ceil(count / TAM));
    limpar(area, tabela([
      { titulo: 'Data / hora', render: (l) => h('span', { class: 'nowrap small' }, dataHora(l.data_hora)) },
      { titulo: 'Usuário', render: (l) => h('span', { class: 'small' }, l.usuario_nome || '') },
      { titulo: 'Ação', render: (l) => badgeAcao(l.acao) },
      { titulo: 'Gerência', render: (l) => h('span', { class: 'small nowrap' }, l.gerencia || '') },
      { titulo: 'Descrição', render: (l) => h('span', { class: 'small' }, l.descricao) },
    ], data, { vazio: 'Nenhum registro no período/filtro.', aoClicar: detalhe }),
    h('div', { class: 'paginacao' }, `${num(count)} registro(s) · página ${pag + 1} de ${num(paginas)}`,
      botao('Anterior', { peq: true, desabilitado: pag === 0, onClick: () => { pag--; carregar(); } }),
      botao('Próxima', { peq: true, desabilitado: pag + 1 >= paginas, onClick: () => { pag++; carregar(); } })));
  }

  function detalhe(l) {
    modal({ titulo: `Registro #${l.id}`, tamanho: 'grande', acoes: [{ texto: 'Fechar' }], conteudo: h('div', { class: 'stack' },
      h('div', { class: 'form-grid' },
        info('Data / hora', dataHora(l.data_hora)), info('Usuário', `${l.usuario_nome || ''}${l.usuario_email ? ' · ' + l.usuario_email : ''}`),
        info('Ação', badgeAcao(l.acao)), info('Gerência / referência', `${l.gerencia || '-'} · ${l.referencia || '-'}`),
        h('div', { class: 'inteiro' }, info('Descrição', l.descricao))),
      l.antes ? h('div', { class: 'campo' }, h('label', {}, 'Antes'), h('pre', { class: 'json' }, JSON.stringify(l.antes, null, 2))) : null,
      l.depois ? h('div', { class: 'campo' }, h('label', {}, 'Depois'), h('pre', { class: 'json' }, JSON.stringify(l.depois, null, 2))) : null) });
  }

  async function exportar() {
    toast('Gerando planilha do log…', 'aviso', 2500);
    const linhas = await buscarTudo(() => montar(sb.from('log_alteracoes').select('id, data_hora, usuario_nome, usuario_email, acao, gerencia, referencia, descricao')), { limite: 100000 });
    baixarExcel(`Log_alteracoes_${hoje()}.xlsx`, [{ nome: 'Log', linhas, colunas: [
      { titulo: 'ID', campo: 'id' }, { titulo: 'Data/hora', campo: (l) => dataHora(l.data_hora), largura: 20 },
      { titulo: 'Usuário', campo: 'usuario_nome', largura: 28 }, { titulo: 'E-mail', campo: 'usuario_email', largura: 30 },
      { titulo: 'Ação', campo: (l) => ACOES[l.acao]?.[0] || l.acao, largura: 22 }, { titulo: 'Gerência', campo: 'gerencia' },
      { titulo: 'Referência', campo: 'referencia', largura: 16 }, { titulo: 'Descrição', campo: 'descricao', largura: 110 }] }]);
  }

  await carregar();
}

const campo = (rotulo, el) => h('div', { class: 'campo' }, h('label', {}, rotulo), el);
const info = (rotulo, valor) => h('div', { class: 'campo' }, h('label', {}, rotulo), h('div', {}, valor));
