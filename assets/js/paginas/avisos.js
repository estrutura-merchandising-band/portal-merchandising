// Aba AVISOS: comunicados automáticos do portal (ex.: clientes que saíram da base e
// foram retirados das rotas). ADM vê todos; a liderança vê os da sua gerência.
import { h, limpar, botao, toast, tabela, dataHora, baixarExcel } from '../ui.js';
import { rpc } from '../api.js';
import { cabecalho } from './comum.js';

const TIPOS = { CLIENTE_SAIU_DA_BASE: ['Cliente saiu da base', 'erro'] };

export async function render(el) {
  let soNaoLidos = true;
  const corpo = h('div', { class: 'stack', style: { gap: '14px' } });
  const fNao = h('button', { type: 'button', class: 'chip ativo', onclick: () => { soNaoLidos = true; filtros(); carregar(); } }, 'Não lidos');
  const fTodos = h('button', { type: 'button', class: 'chip', onclick: () => { soNaoLidos = false; filtros(); carregar(); } }, 'Todos');
  const filtros = () => { fNao.classList.toggle('ativo', soNaoLidos); fTodos.classList.toggle('ativo', !soNaoLidos); };
  el.append(
    cabecalho('Avisos', 'Comunicados automáticos do portal para a Administração de Vendas e a liderança de cada gerência.',
      [botao('Marcar todos como lidos', { icone: 'check', onClick: async () => { await rpc('avisos_marcar_lidos', { p_ids: null }); toast('Avisos marcados como lidos.'); atualizarContador(); carregar(); } })]),
    h('div', { class: 'row', style: { gap: '8px', marginBottom: '14px' } }, fNao, fTodos),
    corpo);

  async function carregar() {
    limpar(corpo, h('div', { class: 'carregando' }, h('span', { class: 'spinner' })));
    const lista = await rpc('avisos_listar', { p_somente_nao_lidos: soNaoLidos, p_limite: 200 });
    if (!lista.length) {
      limpar(corpo, h('div', { class: 'card' }, h('div', { class: 'card-b vazio' }, soNaoLidos ? 'Nenhum aviso novo.' : 'Nenhum aviso ainda.')));
      return;
    }
    limpar(corpo, lista.map(cartao));
  }

  function cartao(a) {
    const [rot, cor] = TIPOS[a.tipo] || [a.tipo, 'cinza'];
    const itens = a.itens || [];
    return h('div', { class: `card aviso-card ${a.lido_em ? 'lido' : ''}` },
      h('div', { class: 'card-h' },
        h('span', { class: `badge ${cor}` }, rot),
        a.gerencia ? h('span', { class: 'badge cinza' }, a.gerencia) : null,
        h('h2', { style: { fontSize: '15px' } }, a.titulo),
        h('div', { class: 'spacer' }),
        h('span', { class: 'small muted nowrap' }, dataHora(a.criado_em).slice(0, 17))),
      h('div', { class: 'card-b stack' },
        a.texto ? h('div', { class: 'small' }, a.texto) : null,
        itens.length ? tabela([
          { titulo: 'Cód.', render: (i) => h('span', { class: 'mono' }, i.cod_cliente) },
          { titulo: 'Cliente', render: (i) => i.nome || '' },
          { titulo: 'Rota', render: (i) => h('b', {}, i.rota) },
          { titulo: 'Repositor', render: (i) => h('span', { class: 'small' }, i.repositor || 'vaga') },
          { titulo: 'Dias que tinha', render: (i) => h('span', { class: 'small' }, i.dias || '') },
        ], itens.slice(0, 300)) : null,
        h('div', { class: 'row' },
          itens.length ? botao('Exportar', { peq: true, icone: 'excel', onClick: () => baixarExcel(`Aviso_${a.id}_${(a.gerencia || 'geral').replace(/\W+/g, '')}.xlsx`, [{ nome: 'Clientes', linhas: itens,
            colunas: [{ titulo: 'Cód. cliente', campo: 'cod_cliente' }, { titulo: 'Cliente', campo: 'nome', largura: 40 }, { titulo: 'Rota', campo: 'rota' }, { titulo: 'Repositor', campo: 'repositor', largura: 36 }, { titulo: 'Dias que tinha', campo: 'dias' }] }]) }) : null,
          h('div', { class: 'spacer' }),
          a.lido_em ? h('span', { class: 'small muted' }, `Lido em ${dataHora(a.lido_em).slice(0, 17)}`)
            : botao('Marcar como lido', { peq: true, tipo: 'primario', icone: 'check', onClick: async () => { await rpc('avisos_marcar_lidos', { p_ids: [a.id] }); atualizarContador(); carregar(); } }))));
  }

  await carregar();
}

export async function atualizarContador() {
  const cs = document.querySelectorAll('.cont-avisos');
  if (!cs.length) return 0;
  try {
    const n = await rpc('avisos_contar');
    cs.forEach((c) => {
      c.classList.toggle('hidden', !n);
      c.textContent = n > 99 ? '99+' : String(n);
      c.title = `${n} aviso(s) não lido(s)`;
    });
    return n;
  } catch { return 0; }   // banco sem a atualização 12
}

