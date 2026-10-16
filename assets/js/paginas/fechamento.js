import { h, limpar, botao, tabela, alerta, confirmar, toast, num, dataHora, competenciaTxt, baixarExcel } from '../ui.js';
import { sb, rpc, consulta, buscarTudo, ehAdm, registrarEvento } from '../api.js';
import { cabecalho } from './comum.js';

const dataLocal = (iso) => { if (!iso) return null; const [a, m, d] = String(iso).split('-').map(Number); return new Date(a, m - 1, d); };

export const COLUNAS_FECHAMENTO = [
  { titulo: 'Referencia', campo: (l) => dataLocal(l.referencia), largura: 12 },
  { titulo: 'PV', campo: 'cod_cliente' },
  { titulo: 'Nome Fantasia', campo: 'nome_fantasia', largura: 34 },
  { titulo: 'Segmento', campo: 'segmento', largura: 16 },
  ...['seg', 'ter', 'qua', 'qui', 'sex', 'sab'].map((k) => ({ titulo: k.toUpperCase(), campo: (l) => (l[k] ? 1 : null), largura: 6 })),
  { titulo: 'Rota RP', campo: 'rota' },
  { titulo: 'Matrícula Rep', campo: 'matricula_rep' },
  { titulo: 'Nome Repositor', campo: 'nome_rep', largura: 34 },
  { titulo: 'Telefone Repositor', campo: 'telefone_rep', largura: 16 },
  { titulo: 'Situação Repositor', campo: 'situacao_rep', largura: 20 },
  { titulo: 'Gerência', campo: 'gerencia' },
  { titulo: 'Matrícula Líder', campo: 'matricula_lider' },
  { titulo: 'Nome Líder de Merchandising', campo: 'nome_lider', largura: 34 },
  { titulo: 'Telefone Líder', campo: 'telefone_lider', largura: 16 },
  { titulo: 'Matrícula Supervisor Merch.', campo: 'matricula_sup' },
  { titulo: 'Nome Supervisor de Merchandising', campo: 'nome_sup', largura: 34 },
  { titulo: 'Telefone Supervisor', campo: 'telefone_sup', largura: 16 },
  { titulo: 'Matrícula Gerente Merch.', campo: 'matricula_gm' },
  { titulo: 'Nome Gerente de Merchandising', campo: 'nome_gm', largura: 34 },
  { titulo: 'Telefone Gerente Merch.', campo: 'telefone_gm', largura: 16 },
  { titulo: 'Matrícula Gerente Comercial', campo: 'matricula_gc' },
  { titulo: 'Nome Gerente Comercial', campo: 'nome_gc', largura: 34 },
];
const NIV = { GC: 'Gerente Comercial', GM: 'Gerente de Merchandising', SM: 'Supervisor de Merchandising', LM: 'Líder de Merchandising', RP: 'Repositor (rota)' };

export async function render(el) {
  const corpo = h('div', { class: 'stack' });
  el.append(cabecalho('Fechamento mensal', 'Gera a foto oficial do mês (estrutura + clientes por rota) para a Inteligência de Mercado calcular o incentivo. Cada fechamento é imutável; refechar cria uma nova versão.'), corpo);

  async function carregar() {
    const hist = await consulta(sb.from('fechamentos').select('*').order('competencia', { ascending: false }).order('versao', { ascending: false }));
    limpar(corpo, ehAdm() ? await cartaoFechar(carregar) : null,
      h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', {}, 'Histórico de fechamentos')),
        tabela([
          { titulo: 'Competência', render: (f) => h('b', {}, competenciaTxt(f.competencia)) },
          { titulo: 'Versão', render: (f) => h('span', { class: 'badge azul' }, `v${f.versao}`) },
          { titulo: 'Fechado em', render: (f) => dataHora(f.fechado_em) },
          { titulo: 'Por', campo: 'usuario_nome' },
          { titulo: 'Linhas cliente × rota', classe: 'right', render: (f) => num(f.total_linhas) },
          { titulo: 'Posições', classe: 'right', render: (f) => num(f.total_rotas) },
          { titulo: 'Observação', render: (f) => h('span', { class: 'small' }, f.observacao || '') },
          { titulo: '', classe: 'right', render: (f) => botao('Baixar Excel', { peq: true, icone: 'excel', onClick: () => baixar(f) }) },
        ], hist, { vazio: 'Nenhum fechamento realizado ainda.' })));
  }
  await carregar();
}

async function cartaoFechar(aoConcluir) {
  // Até o dia 15, sugere o mês anterior (fechamento do mês que acabou); depois, o mês corrente.
  const [a, mm, d] = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).split('-').map(Number);
  const ref = d <= 15 ? new Date(a, mm - 2, 1) : new Date(a, mm - 1, 1);
  const sugerido = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
  const mes = h('input', { type: 'month', value: sugerido });
  const obs = h('input', { type: 'text', placeholder: 'Opcional (ex.: fechamento oficial, ajuste após correção…)' });
  const [pend, sol] = await Promise.all([rpc('pendencias', { p_gerencia: null }), rpc('resumo_solicitacoes').catch(() => ({ para_aprovar: 0 }))]);
  const avisoSol = sol.para_aprovar
    ? alerta('aviso', `${num(sol.para_aprovar)} pedido(s) de clientes aguardando aprovação`, h('span', {}, 'Pedidos pendentes não entram no fechamento. Recomendamos aprovar ou reprovar antes de fechar — ', h('a', { href: '#/aprovacoes' }, 'abrir Aprovações'), '.'))
    : null;
  const altas = pend.filter((p) => p.gravidade === 'ALTA');
  const resumo = {};
  for (const p of altas) resumo[p.tipo] = (resumo[p.tipo] || 0) + 1;
  const btn = botao('Fechar competência', { tipo: 'primario', icone: 'fechamento', onClick: async () => {
    if (!mes.value) { toast('Informe a competência.', 'aviso'); return; }
    const comp = `${mes.value}-01`;
    const existentes = await consulta(sb.from('fechamentos').select('versao').eq('competencia', comp));
    const msg = h('div', { class: 'stack' },
      h('p', { style: { margin: 0 } }, `Será gravada a foto da estrutura e dos clientes por rota como competência ${competenciaTxt(comp)}${existentes.length ? `, versão ${existentes.length + 1} (as versões anteriores são mantidas)` : ''}.`),
      altas.length ? alerta('aviso', `Há ${altas.length} ponto(s) de atenção`, 'Eles entram no fechamento como estão. Se quiser, confira antes em Pendências.') : null,
      sol.para_aprovar ? alerta('aviso', `${num(sol.para_aprovar)} pedido(s) aguardando aprovação`, 'Eles não entram neste fechamento.') : null);
    if (!(await confirmar({ titulo: 'Confirmar fechamento', mensagem: msg, textoOk: 'Fechar competência' }))) return;
    try {
      const r = await rpc('fechar_competencia', { p_competencia: comp, p_observacao: obs.value });
      toast(r.mensagem); aoConcluir();
    } catch (e) { toast(e.message, 'erro', 8000); }
  } });
  return h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h2', {}, 'Fechar competência')),
    h('div', { class: 'card-b stack' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'campo' }, h('label', {}, 'Competência (mês/ano)'), mes),
        h('div', { class: 'campo' }, h('label', {}, 'Observação'), obs)),
      altas.length
        ? alerta('aviso', `Pré-checagem: ${altas.length} ponto(s) de atenção`, h('span', {}, Object.entries(resumo).map(([t, n]) => `${t.replaceAll('_', ' ').toLowerCase()}: ${n}`).join(' · '), ' — ', h('a', { href: '#/pendencias' }, 'ver pendências')))
        : alerta('ok', 'Pré-checagem', 'Nenhum ponto de atenção encontrado.'),
      avisoSol,
      h('div', { class: 'row' }, btn)));
}

async function baixar(f) {
  toast('Gerando planilha do fechamento…', 'aviso', 2500);
  const [itens, estr] = await Promise.all([
    buscarTudo(() => sb.from('fechamento_itens').select('*').eq('fechamento_id', f.id).order('linha')),
    buscarTudo(() => sb.from('fechamento_estrutura').select('*').eq('fechamento_id', f.id).order('gerencia').order('codigo')),
  ]);
  const comp = competenciaTxt(f.competencia).replace('/', '-');
  baixarExcel(`Fechamento_Repositores_${comp}_v${f.versao}.xlsx`, [
    { nome: 'Base Atendimento Repositor', linhas: itens, colunas: COLUNAS_FECHAMENTO },
    { nome: 'Estrutura Merchandising', linhas: estr, colunas: [
      { titulo: 'Gerência', campo: 'gerencia' }, { titulo: 'Nível', campo: (l) => NIV[l.nivel], largura: 28 }, { titulo: 'Código', campo: 'codigo' },
      { titulo: 'Matrícula', campo: 'matricula' }, { titulo: 'Nome', campo: 'nome', largura: 36 }, { titulo: 'Cargo', campo: 'cargo', largura: 28 },
      { titulo: 'Situação', campo: 'situacao', largura: 20 }, { titulo: 'Telefone', campo: 'telefone', largura: 16 }, { titulo: 'Qtd. clientes', campo: (l) => (l.nivel === 'RP' ? l.qtd_clientes : null) }] },
  ]);
  registrarEvento('EXPORTACAO', `Baixou o fechamento ${competenciaTxt(f.competencia)} v${f.versao} (${itens.length} linhas)`, `${competenciaTxt(f.competencia)} v${f.versao}`);
}
