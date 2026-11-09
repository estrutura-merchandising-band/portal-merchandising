// Componentes compartilhados do fluxo de aprovação de clientes (pedido -> aprovação/reprovação).
import { h, limpar, icone, modal, toast, alerta, dataHora } from '../ui.js';
import { rpc, atualizarAvisos } from '../api.js';

export const DIAS = [['seg', 'SEG'], ['ter', 'TER'], ['qua', 'QUA'], ['qui', 'QUI'], ['sex', 'SEX'], ['sab', 'SAB']];
export const PERFIL_TXT = { ADM: 'Administração de Vendas', GC: 'Gerente Comercial', GM: 'Gerente de Merchandising', SM: 'Supervisor de Merchandising', LM: 'Líder de Merchandising', IM: 'Inteligência de Mercado' };
export const STATUS = {
  PENDENTE: ['Aguardando aprovação', 'aviso'], APROVADA: ['Aprovada', 'ok'], REPROVADA: ['Reprovada', 'erro'], CANCELADA: ['Cancelada', 'cinza'],
};

export const JUSTIFICATIVAS = {
  INCLUSAO: ['Cliente novo', 'Cliente vindo de outra rota', 'Ajuste de roteiro', 'Pedido do comercial'],
  EXCLUSAO: ['Cliente fechou', 'Cliente passou para outra rota', 'Sem necessidade de merchandising', 'Ajuste de roteiro'],
};
export const MOTIVOS_REPROVACAO = [
  'Cliente já é atendido por outra rota',
  'Dias de visita incompatíveis com o roteiro',
  'Justificativa insuficiente — detalhe melhor o pedido',
  'Cliente sem perfil para merchandising',
  'Rota sem capacidade para mais clientes',
];

export const badgeStatus = (s) => h('span', { class: `badge ${STATUS[s]?.[1] || 'cinza'}` }, STATUS[s]?.[0] || s);
export const tipoSol = (t) => h('span', { class: `tipo-sol ${t === 'INCLUSAO' ? 'inc' : 'exc'}` }, icone(t === 'INCLUSAO' ? 'mais' : 'menos'), t === 'INCLUSAO' ? 'Inclusão' : 'Exclusão');
export const diasMini = (v) => h('span', { class: 'dias-mini', title: 'Dias de visita' }, DIAS.map(([k, t]) => h('span', { class: v[k] ? 'on' : '' }, t)));

// "06/10 14:31"
export const dataCurta = (iso) => { const d = dataHora(iso); return d ? `${d.slice(0, 5)} ${d.slice(12, 17)}` : ''; };

export function relativo(iso) {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `há ${hr} h`;
  const d = Math.round(hr / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}
export function idade(iso) {
  const horas = (Date.now() - new Date(iso).getTime()) / 36e5;
  return h('span', { class: `idade ${horas > 72 ? 'critica' : horas > 24 ? 'atrasada' : ''}`, title: dataHora(iso) }, icone('relogio'), relativo(iso));
}

export function motivoBox(s) {
  return h('div', { class: 'motivo' }, icone('bloquear'),
    h('div', {}, h('b', {}, `Motivo da reprovação${s.decidido_por_nome ? ` · ${s.decidido_por_nome}` : ''}`), h('div', { class: 'txt' }, s.motivo_reprovacao)));
}

// Linha do tempo: Enviado -> Em análise -> Aprovado/Reprovado/Cancelado
export function etapas(s) {
  const fim = { APROVADA: ['ok', 'check', 'Aprovado'], REPROVADA: ['nok', 'fechar', 'Reprovado'], CANCELADA: ['cinza', 'fechar', 'Cancelado'] }[s.status];
  const et = (cls, ic, nome, dt) => h('div', { class: `etapa ${cls}` }, h('div', { class: 'pt' }, ic ? icone(ic) : null), h('div', { class: 'nm' }, nome), h('div', { class: 'dt' }, dt || ''));
  return h('div', { class: 'etapas' },
    et('feita', 'enviar', 'Enviado', dataCurta(s.criado_em)),
    fim ? et('feita', 'relogio', 'Análise ADM', '') : et('atual', 'relogio', 'Em análise', relativo(s.criado_em)),
    fim ? et(fim[0], fim[1], fim[2], dataCurta(s.decidido_em)) : et('', null, 'Decisão', ''));
}

function chipsTexto(alvo, lista) {
  return h('div', { class: 'chips' }, lista.map((t) => h('button', { type: 'button', class: 'chip', onclick: () => {
    alvo.value = alvo.value.trim() ? `${alvo.value.trim()} ${t}` : t; alvo.focus(); alvo.dispatchEvent(new Event('input'));
  } }, t)));
}

// Campo de justificativa com sugestões rápidas (usado em todos os pedidos).
export function campoJustificativa(tipo, valor = '') {
  const txt = h('textarea', { placeholder: 'Explique o motivo do pedido para a Administração de Vendas (obrigatório)', style: { minHeight: '70px' } }, valor);
  const el = h('div', { class: 'campo' }, h('label', {}, 'Justificativa *'), chipsTexto(txt, JUSTIFICATIVAS[tipo] || []), txt);
  return { el, txt };
}

// Envia o pedido e mostra o resultado. itens: [{cod_cliente, seg..sab}]
export async function enviarSolicitacao({ rota, tipo, itens, justificativa }) {
  const r = await rpc('solicitar_clientes', { p_posicao_id: rota.id, p_tipo: tipo, p_itens: itens, p_justificativa: justificativa });
  atualizarAvisos();
  return r;
}

export function resultadoSolicitacao(alvo, r) {
  const prob = r.itens.filter((x) => x.status !== 'solicitado');
  limpar(alvo, h('div', { class: 'stack' },
    alerta(r.solicitados ? (prob.length ? 'aviso' : 'ok') : 'erro', r.solicitados ? 'Pedido enviado para aprovação' : 'Nada foi enviado', r.mensagem),
    prob.length ? h('div', { class: 'stack', style: { gap: '4px' } }, h('b', { class: 'small' }, 'Não enviados:'),
      prob.slice(0, 50).map((x) => h('div', { class: 'small' }, h('span', { class: 'mono' }, x.cod_cliente), x.nome ? ` — ${x.nome}` : '', h('span', { class: 'muted' }, ` · ${x.mensagem}`)))) : null));
}

// Modal para pedir EXCLUSÃO (ou reenviar um pedido reprovado).
export function modalPedido({ rota, tipo, itens, titulo, aviso, justificativa = '', aoConcluir }) {
  const j = campoJustificativa(tipo, justificativa);
  const saida = h('div');
  const m = modal({
    titulo: titulo || `${tipo === 'INCLUSAO' ? 'Solicitar inclusão' : 'Solicitar exclusão'} · rota ${rota.codigo}`,
    conteudo: h('div', { class: 'stack' },
      aviso || null,
      h('div', { class: 'row' }, tipoSol(tipo), h('b', {}, `${itens.length} cliente(s)`), h('span', { class: 'muted small' }, itens.slice(0, 6).map((i) => i.cod_cliente).join(', ') + (itens.length > 6 ? '…' : ''))),
      j.el,
      h('div', { class: 'muted small' }, 'O pedido vai para a aba Aprovações da Administração de Vendas. Você recebe o aviso quando ele for aprovado ou reprovado.'),
      saida),
    acoes: [{ texto: 'Cancelar' }, { texto: 'Enviar para aprovação', tipo: 'primario', icone: 'enviar', onClick: async () => {
      if (j.txt.value.trim().length < 5) { toast('Escreva a justificativa (mínimo 5 caracteres).', 'aviso'); j.txt.focus(); return; }
      try {
        const r = await enviarSolicitacao({ rota, tipo, itens, justificativa: j.txt.value });
        if (r.solicitados && r.solicitados === itens.length) { toast(r.mensagem); m.fechar(); }
        else { resultadoSolicitacao(saida, r); m.definirAcoes([{ texto: 'Fechar', tipo: 'primario' }]); }
        if (r.solicitados) aoConcluir && aoConcluir();
      } catch (e) { toast(e.message, 'erro', 7000); }
    } }],
  });
  return m;
}

// Aviso de decisões (aparece ao entrar no portal e na tela "Minhas solicitações").
export function cartaoNovidade(s, { compacto = false } = {}) {
  const ok = s.status === 'APROVADA';
  return h('div', { class: `novidade ${ok ? '' : 'nok'}` },
    h('div', { class: 'ic' }, icone(ok ? 'check' : 'fechar')),
    h('div', { class: 'stack', style: { gap: '6px', flex: 1, minWidth: 0 } },
      h('div', { class: 'row' }, tipoSol(s.tipo), h('b', {}, `${s.cod_cliente} — ${s.nome_cliente || ''}`), h('span', { class: 'muted small' }, `rota ${s.rota} · ${s.gerencia}`)),
      h('div', { class: 'small' }, ok ? h('span', { style: { color: 'var(--success)', fontWeight: 650 } }, 'Aprovada') : h('span', { style: { color: 'var(--danger)', fontWeight: 650 } }, 'Reprovada'),
        ` por ${s.decidido_por_nome || 'Administração'} · ${relativo(s.decidido_em)}`, s.resultado ? h('span', { class: 'muted' }, ` · ${s.resultado}`) : null),
      !ok ? motivoBox(s) : null,
      !compacto && !ok ? h('div', { class: 'small muted' }, 'Sua justificativa: ', h('i', {}, s.justificativa)) : null));
}

export function modalNovidades(lista, { aoVer } = {}) {
  const rep = lista.filter((s) => s.status === 'REPROVADA');
  const apr = lista.filter((s) => s.status === 'APROVADA');
  const m = modal({
    titulo: 'Novidades nas suas solicitações', tamanho: 'grande', fecharFora: false,
    conteudo: h('div', { class: 'stack' },
      h('div', { class: 'row' },
        rep.length ? h('span', { class: 'badge erro' }, `${rep.length} reprovada(s)`) : null,
        apr.length ? h('span', { class: 'badge ok' }, `${apr.length} aprovada(s)`) : null),
      [...rep, ...apr].slice(0, 30).map((s) => cartaoNovidade(s)),
      lista.length > 30 ? h('div', { class: 'muted small' }, `…e mais ${lista.length - 30}. Veja todas em Minhas solicitações.`) : null),
    acoes: [
      { texto: 'Ver minhas solicitações', onClick: () => { m.fechar(); aoVer && aoVer(); } },
      { texto: 'Ciente', tipo: 'primario', icone: 'check', onClick: async () => {
        try { await rpc('marcar_solicitacoes_cientes', { p_ids: lista.map((s) => s.id) }); await atualizarAvisos(); m.fechar(); }
        catch (e) { toast(e.message, 'erro'); }
      } },
    ],
  });
  return m;
}
