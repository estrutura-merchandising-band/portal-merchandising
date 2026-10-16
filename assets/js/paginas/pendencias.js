import { h, limpar, botao, tabela, num, baixarExcel, hoje } from '../ui.js';
import { rpc, estado, podeVerClientes } from '../api.js';
import { cabecalho, seletorGerencia, semGerencias } from './comum.js';

const TIPOS = {
  VAGA_COM_CLIENTES: 'Rota vaga com clientes',
  COLABORADOR_FORA_DA_BASE: 'Colaborador fora da base de RH',
  CLIENTE_OUTRA_GERENCIA: 'Cliente de outra gerência',
  CLIENTE_FORA_DA_BASE: 'Cliente fora da base',
  LIDERANCA_VAGA: 'Liderança vaga',
  ROTA_VAGA: 'Rota sem repositor',
  ROTA_SEM_CLIENTES: 'Rota sem clientes',
  CLIENTE_SEM_DIA_VISITA: 'Cliente sem dia de visita',
  CARGO_DIVERGENTE: 'Cargo divergente',
  COLABORADOR_AFASTADO: 'Férias / afastamento',
};
const GRAV = { ALTA: ['aviso', 'Alta'], MEDIA: ['azul', 'Média'], BAIXA: ['cinza', 'Baixa'], INFO: ['cinza', 'Info'] };
const CLIENTE = ['CLIENTE_OUTRA_GERENCIA', 'CLIENTE_FORA_DA_BASE', 'CLIENTE_SEM_DIA_VISITA', 'VAGA_COM_CLIENTES', 'ROTA_SEM_CLIENTES'];

export async function render(el) {
  if (!estado.gerencias.length) { el.append(cabecalho('Pendências'), semGerencias()); return; }
  let ger = '', grav = 'ALTA', tipo = '', lista = [];
  const corpo = h('div');
  const sel = seletorGerencia((v) => { ger = v; carregar(); }, { incluirTodas: true });
  sel.value = '';
  el.append(cabecalho('Pendências da estrutura', 'Pontos de atenção da estrutura para conferir. Atualiza automaticamente a cada alteração ou importação de base.',
    [sel, botao('Exportar', { icone: 'excel', onClick: () => baixarExcel(`Pendencias_${hoje()}.xlsx`, [{ nome: 'Pendências', linhas: lista, colunas: [
      { titulo: 'Gravidade', campo: (p) => GRAV[p.gravidade]?.[1] }, { titulo: 'Tipo', campo: (p) => TIPOS[p.tipo] || p.tipo, largura: 30 },
      { titulo: 'Gerência', campo: 'gerencia' }, { titulo: 'Referência', campo: 'referencia' }, { titulo: 'Descrição', campo: 'descricao', largura: 100 }] }]) })]),
  corpo);

  async function carregar() {
    limpar(corpo, h('div', { class: 'carregando' }, h('span', { class: 'spinner' })));
    lista = await rpc('pendencias', { p_gerencia: ger || null });
    desenhar();
  }

  function desenhar() {
    const cont = (g) => lista.filter((p) => !g || p.gravidade === g).length;
    const chipsG = h('div', { class: 'chips' }, [['', 'Todas'], ['ALTA', 'Alta'], ['MEDIA', 'Média'], ['BAIXA', 'Baixa'], ['INFO', 'Info']].map(([k, t]) =>
      h('button', { type: 'button', class: `chip ${grav === k ? 'ativo' : ''}`, onclick: () => { grav = k; tipo = ''; desenhar(); } }, `${t} (${num(cont(k))})`)));
    const filtradas = lista.filter((p) => (!grav || p.gravidade === grav));
    const porTipo = {};
    for (const p of filtradas) porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1;
    const chipsT = h('div', { class: 'chips' }, h('button', { type: 'button', class: `chip ${!tipo ? 'ativo' : ''}`, onclick: () => { tipo = ''; desenhar(); } }, 'Todos os tipos'),
      Object.entries(porTipo).map(([k, n]) => h('button', { type: 'button', class: `chip ${tipo === k ? 'ativo' : ''}`, onclick: () => { tipo = k; desenhar(); } }, `${TIPOS[k] || k} (${num(n)})`)));
    const final = filtradas.filter((p) => !tipo || p.tipo === tipo);
    limpar(corpo,
      h('div', { class: 'card' },
        h('div', { class: 'card-h' }, chipsG),
        h('div', { class: 'card-h' }, chipsT),
        tabela([
          { titulo: 'Gravidade', render: (p) => h('span', { class: `badge ${GRAV[p.gravidade]?.[0]}` }, GRAV[p.gravidade]?.[1]) },
          { titulo: 'Tipo', render: (p) => h('span', { class: 'small nowrap' }, TIPOS[p.tipo] || p.tipo) },
          { titulo: 'Gerência', campo: 'gerencia' },
          { titulo: 'Referência', render: (p) => h('span', { class: 'mono' }, p.referencia || '') },
          { titulo: 'Descrição', campo: 'descricao' },
          { titulo: '', classe: 'right', render: (p) => irPara(p) },
        ], final.slice(0, 2000), { vazio: lista.length ? 'Nenhuma pendência neste filtro.' : 'Nenhuma pendência. Tudo certo!' }),
        final.length > 2000 ? h('div', { class: 'paginacao' }, `Mostrando 2.000 de ${num(final.length)} — use Exportar para ver todas.`) : null));
  }

  function irPara(p) {
    if (CLIENTE.includes(p.tipo) && p.posicao_id && podeVerClientes()) return botao('Abrir rota', { peq: true, onClick: () => window.irPara('clientes', { rota: p.posicao_id }) });
    return botao('Abrir', { peq: true, onClick: () => window.irPara('estrutura', { g: p.gerencia, filtro: p.tipo === 'ROTA_VAGA' ? 'vagas' : 'ativas' }) });
  }

  await carregar();
}
