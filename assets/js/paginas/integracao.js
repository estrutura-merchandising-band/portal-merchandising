// Aba INTEGRAÇÃO COM O APP (ADM): acompanha a carga diária que o aplicativo do repositor
// busca no portal — se o portal entregou, se o app gravou, onde parou e o motivo.
import { h, limpar, icone, botao, modal, toast, tabela, alerta, num, dataHora } from '../ui.js';
import { sb, rpc, consulta } from '../api.js';
import { cabecalho } from './comum.js';

export const STATUS_CARGA = {
  CONCLUIDA: ['Concluída', 'ok'],
  ENTREGUE: ['Entregue, sem confirmação do app', 'aviso'],
  EM_ANDAMENTO: ['Em andamento', 'azul'],
  FALHOU: ['Falhou', 'erro'],
  BLOQUEADA: ['Bloqueada pelo app', 'erro'],
  INTERROMPIDA: ['Interrompida', 'erro'],
};
const SITUACAO = {
  CONCLUIDA: ['ok', 'check', 'Carga de hoje concluída'],
  ENTREGUE: ['aviso', 'relogio', 'Portal entregou; falta o app confirmar'],
  EM_ANDAMENTO: ['azul', 'relogio', 'Carga em andamento'],
  FALHOU: ['erro', 'fechar', 'A carga de hoje falhou'],
  BLOQUEADA: ['erro', 'bloquear', 'O app bloqueou a carga de hoje'],
  INTERROMPIDA: ['erro', 'fechar', 'A carga de hoje parou no meio'],
  AGUARDANDO: ['cinza', 'relogio', 'Aguardando a carga de hoje'],
  NAO_BUSCOU: ['erro', 'fechar', 'O app não buscou os dados hoje'],
  DESATIVADA: ['cinza', 'bloquear', 'Acompanhamento desligado'],
  SEM_HISTORICO: ['cinza', 'integracao', 'Aguardando a primeira carga do app'],
};
const badge = (s) => h('span', { class: `badge ${STATUS_CARGA[s]?.[1] || 'cinza'}` }, STATUS_CARGA[s]?.[0] || s);
const hora = (iso) => (iso ? dataHora(iso).slice(12, 17) : '');
const dataBR = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
function duracao(c) {
  const fim = c.finalizada_em || c.atualizada_em;
  const s = Math.max(0, Math.round((new Date(fim) - new Date(c.iniciada_em)) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export async function render(el) {
  const corpo = h('div', { class: 'stack', style: { gap: '16px' } });
  let ds = null;            // situação do disparo manual
  let timer = null;         // acompanhamento ao vivo depois de pedir uma carga
  el.append(cabecalho('Integração com o app',
    'Acompanhe a carga diária em que o aplicativo do repositor busca a estrutura e os clientes das rotas no portal: se o portal entregou, se o app gravou, onde parou e o motivo.',
    [botao('Atualizar', { icone: 'log', onClick: () => carregar() }),
     botao('Rodar carga agora', { tipo: 'primario', icone: 'enviar', onClick: () => pedirCarga() })]), corpo);

  async function carregar(silencioso = false) {
    if (!silencioso) limpar(corpo, h('div', { class: 'carregando' }, h('span', { class: 'spinner' })));
    const desde = new Date(Date.now() - 31 * 864e5).toISOString();
    const [st, d, cargas] = await Promise.all([
      rpc('api_status_integracao'),
      rpc('integracao_disparo_status'),
      consulta(sb.from('api_cargas').select('*').gte('iniciada_em', desde).order('iniciada_em', { ascending: false }).limit(300)),
    ]);
    ds = d;
    limpar(corpo, cartaoHoje(st, ds), faixa30dias(cargas), historico(cargas), cartaoManual(ds, carregar), cartaoConfig(st, carregar));
    return { st, ds };
  }

  // Atualiza a tela a cada 4 s enquanto a carga pedida estiver rodando (até 6 min).
  function acompanhar() {
    clearInterval(timer);
    const inicio = Date.now();
    timer = setInterval(async () => {
      if (!document.body.contains(corpo) || Date.now() - inicio > 6 * 60e3) return clearInterval(timer);
      try {
        const { st, ds: d } = await carregar(true);
        const rodando = ['EM_ANDAMENTO', 'ENTREGUE'].includes(st.carga?.status) || d.ultimo?.situacao === 'AGUARDANDO';
        if (!rodando) {
          clearInterval(timer);
          const u = d.ultimo;
          if (u) toast(u.texto, u.situacao === 'OK' ? 'ok' : 'erro', 7000);
        }
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 4000);
  }

  async function pedirCarga() {
    try { ds = await rpc('integracao_disparo_status'); } catch (e) { return toast(e.message, 'erro'); }
    if (!ds.configurado) {
      toast('Antes, cadastre o endereço da função do app e a chave de disparo em "Carga manual".', 'aviso', 6000);
      document.getElementById('int-manual')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!ds.pode_disparar) return toast(ds.motivo, 'aviso', 6000);
    const forcar = h('input', { type: 'checkbox' });
    modal({
      titulo: 'Rodar carga agora',
      conteudo: h('div', { class: 'stack' },
        h('p', { style: { margin: 0 } }, 'O portal vai pedir ao app para buscar agora a estrutura e os clientes das rotas, do mesmo jeito que acontece todo dia às 06:00.'),
        h('div', { class: 'small muted' }, 'Leva em torno de 1 minuto. O app só troca os dados se tudo chegar certo; se algo falhar, continua com os dados que já tinha. O andamento aparece nesta tela.'),
        ds.pode_forcar ? h('div', { class: 'alerta aviso' }, h('div', {},
          h('b', {}, `A última carga (nº ${ds.ultima_bloqueada.id}) foi bloqueada pelo app por segurança`),
          h('div', { class: 'small', style: { margin: '4px 0 8px' } }, ds.ultima_bloqueada.mensagem || ''),
          h('label', { class: 'check' }, forcar, 'A redução está correta: gravar mesmo assim (forçar)'))) : null),
      acoes: [
        { texto: 'Cancelar' },
        { texto: 'Rodar agora', tipo: 'primario', icone: 'enviar', onClick: async ({ fechar }) => {
          try {
            const r = await rpc('integracao_disparar', { p_forcar: forcar.checked });
            fechar(); toast(r.mensagem, 'ok', 6000);
            await carregar(true); acompanhar();
          } catch (e) { toast(e.message, 'erro', 7000); }
        } },
      ],
    });
  }

  await carregar();
}

// ---------- Situação de hoje ----------
function cartaoHoje(st, ds) {
  const [cor, ic, titulo] = SITUACAO[st.situacao] || ['cinza', 'relogio', st.situacao];
  const c = st.carga;
  const cores = { ok: '#17924f', aviso: '#d97706', erro: '#c42b31', azul: 'var(--primary-solid)', cinza: 'var(--neutral-mark)' };
  const bolha = h('div', { class: 'int-bolha', style: { background: cores[cor] } }, icone(ic));
  return h('div', { class: `card int-hoje ${cor}` },
    h('div', { class: 'card-b', style: { display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' } },
      bolha,
      h('div', { class: 'stack', style: { gap: '8px', flex: 1, minWidth: '260px' } },
        h('div', {}, h('div', { style: { fontSize: '18px', fontWeight: 700 } }, titulo), h('div', { class: 'muted' }, st.texto)),
        c ? h('div', { class: 'small muted' }, `Carga nº ${c.id}`, c.manual_por ? ` (manual, pedida por ${c.manual_por})` : '', ` · começou às ${hora(c.iniciada_em)}`, c.finalizada_em ? ` · terminou às ${hora(c.finalizada_em)}` : '', ` · duração ${duracao(c)}`) : null,
        c ? etapas(c) : null,
        c && c.etapa && c.status !== 'CONCLUIDA' ? h('div', { class: 'small' }, h('b', {}, 'Onde está / parou: '), c.etapa) : null,
        c && c.mensagem ? h('div', { class: 'motivo' }, icone('bloquear'), h('div', {}, h('b', {}, 'Motivo'), h('div', { class: 'txt' }, c.mensagem))) : null,
        pedidoManual(ds),
        st.tentativas_chave_invalida_hoje ? alerta('aviso', null, `Hoje houve ${st.tentativas_chave_invalida_hoje} tentativa(s) de acesso com chave inválida. Se não foi o app, avise a TI.`) : null,
        h('div', { class: 'small muted' }, `Carga prevista todos os dias às ${st.hora_prevista} (tolerância de ${st.tolerancia_min} min).`,
          st.ultima_concluida ? ` Última carga concluída: ${dataHora(st.ultima_concluida.em).slice(0, 17)} — ${num(st.ultima_concluida.posicoes)} posições e ${num(st.ultima_concluida.vinculos)} clientes × rota.` : ' Nenhuma carga concluída ainda.'))),
  );
}

// Resultado do último pedido manual (só aparece se foi hoje, ou se ainda está aguardando).
const COR_PEDIDO = { OK: 'ok', AGUARDANDO: 'info', AVISO: 'aviso', SEM_RESPOSTA: 'aviso', ERRO: 'erro' };
function pedidoManual(ds) {
  const u = ds?.ultimo;
  if (!u || (dataBR(u.solicitado_em) !== dataBR(new Date().toISOString()) && u.situacao !== 'AGUARDANDO')) return null;
  return h('div', { class: `alerta ${COR_PEDIDO[u.situacao] || 'info'}` }, h('div', {},
    h('b', {}, `Carga manual pedida às ${hora(u.solicitado_em)}${u.usuario_nome ? ' por ' + u.usuario_nome : ''}${u.forcar ? ' (forçada)' : ''}: `),
    u.situacao === 'AGUARDANDO' ? h('span', { class: 'spinner', style: { width: '12px', height: '12px', marginRight: '6px', verticalAlign: '-1px' } }) : null,
    u.texto));
}

// Linha do tempo da carga: pediu -> estrutura -> clientes -> app gravou
function etapas(c) {
  const falhou = ['FALHOU', 'BLOQUEADA', 'INTERROMPIDA'].includes(c.status);
  const passos = [
    ['App pediu os dados', true, hora(c.iniciada_em)],
    ['Portal entregou a estrutura', c.posicoes_entregues > 0, c.posicoes_entregues ? `${num(c.posicoes_entregues)} posições` : ''],
    ['Portal entregou os clientes', c.paginas_total && c.paginas_entregues >= c.paginas_total, c.vinculos_entregues ? `${num(c.vinculos_entregues)} clientes × rota` : ''],
    ['App gravou os dados', c.status === 'CONCLUIDA', c.status === 'CONCLUIDA' ? `${num(c.posicoes_gravadas)} / ${num(c.vinculos_gravados)}` : ''],
  ];
  const primeiroPendente = passos.findIndex((p) => !p[1]);
  return h('div', { class: 'etapas', style: { maxWidth: '780px' } }, passos.map(([nome, feito, det], i) => {
    let cls = feito ? (c.status === 'CONCLUIDA' || i < primeiroPendente ? 'ok' : 'feita') : '';
    let ic = feito ? 'check' : null;
    if (!feito && i === primeiroPendente) {
      if (falhou) { cls = 'nok'; ic = 'fechar'; } else { cls = 'atual'; ic = 'relogio'; }
    }
    return h('div', { class: `etapa ${cls}` }, h('div', { class: 'pt' }, ic ? icone(ic) : null), h('div', { class: 'nm' }, nome), h('div', { class: 'dt' }, det));
  }));
}

// ---------- Últimos 30 dias ----------
function faixa30dias(cargas) {
  const porDia = {};
  for (const c of [...cargas].reverse()) porDia[dataBR(c.iniciada_em)] = c;   // fica a última do dia
  const dias = [];
  for (let i = 29; i >= 0; i--) dias.push(new Date(Date.now() - i * 864e5).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }));
  const cor = (c) => (!c ? 'sem' : c.status === 'CONCLUIDA' ? 'ok' : ['ENTREGUE', 'EM_ANDAMENTO'].includes(c.status) ? 'aviso' : 'erro');
  const ok = dias.filter((d) => porDia[d]?.status === 'CONCLUIDA').length;
  return h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h2', {}, 'Últimos 30 dias'), h('span', { class: 'muted small' }, `${ok} de 30 dias com carga concluída`), h('div', { class: 'spacer' }),
      h('div', { class: 'row small muted', style: { gap: '12px' } },
        h('span', {}, h('i', { class: 'int-dia ok' }), ' concluída'), h('span', {}, h('i', { class: 'int-dia aviso' }), ' sem confirmação'),
        h('span', {}, h('i', { class: 'int-dia erro' }), ' falhou'), h('span', {}, h('i', { class: 'int-dia sem' }), ' sem carga'))),
    h('div', { class: 'card-b' }, h('div', { class: 'int-dias' }, dias.map((d) => {
      const c = porDia[d];
      const [a, m, dd] = d.split('-');
      return h('div', { class: `int-cel ${cor(c)}`, title: `${dd}/${m}/${a}: ${c ? `${STATUS_CARGA[c.status][0]}${c.etapa ? ' — ' + c.etapa : ''}` : 'sem carga'}` }, dd);
    }))));
}

// ---------- Histórico ----------
function historico(cargas) {
  return h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h2', {}, 'Histórico de cargas'), h('span', { class: 'muted small' }, 'Clique numa carga para ver cada chamada feita pelo app.')),
    tabela([
      { titulo: 'Nº', render: (c) => h('span', { class: 'nowrap' }, h('span', { class: 'mono' }, c.id),
          c.manual_por ? h('span', { class: 'badge azul', title: `Carga manual pedida por ${c.manual_por}`, style: { marginLeft: '6px' } }, 'manual') : null) },
      { titulo: 'Início', render: (c) => h('span', { class: 'small nowrap' }, dataHora(c.iniciada_em).slice(0, 17)) },
      { titulo: 'Situação', render: (c) => badge(c.status) },
      { titulo: 'Onde parou / última etapa', render: (c) => h('span', { class: 'small' }, c.etapa || '') },
      { titulo: 'Entregue pelo portal', render: (c) => h('span', { class: 'small nowrap' }, `${num(c.posicoes_entregues)} pos. · ${num(c.vinculos_entregues)} cli.`) },
      { titulo: 'Gravado no app', render: (c) => h('span', { class: 'small nowrap' }, c.posicoes_gravadas == null ? '—' : `${num(c.posicoes_gravadas)} pos. · ${num(c.vinculos_gravados)} cli.`) },
      { titulo: 'Duração', render: (c) => h('span', { class: 'small nowrap' }, duracao(c)) },
      { titulo: 'Motivo', render: (c) => h('div', { class: 'small int-motivo', title: c.mensagem || '', style: { color: c.mensagem && c.status !== 'CONCLUIDA' ? 'var(--danger)' : '' } }, c.mensagem || '') },
    ], cargas.slice(0, 100), { vazio: 'Nenhuma carga registrada ainda. Assim que o app buscar os dados, ela aparece aqui.', aoClicar: detalhes }));
}

async function detalhes(c) {
  const acessos = await consulta(sb.from('api_acessos').select('*').eq('carga_id', c.id).order('id'));
  modal({
    titulo: `Carga nº ${c.id} — ${dataHora(c.iniciada_em).slice(0, 17)}`, tamanho: 'grande',
    conteudo: h('div', { class: 'stack' },
      h('div', { class: 'row' }, badge(c.status), h('span', { class: 'small muted' }, `duração ${duracao(c)}`),
        c.manual_por ? h('span', { class: 'small muted' }, `· carga manual pedida por ${c.manual_por}`) : null),
      etapas(c),
      c.etapa ? h('div', { class: 'small' }, h('b', {}, 'Última etapa: '), c.etapa) : null,
      c.mensagem ? h('div', { class: 'motivo' }, icone('bloquear'), h('div', {}, h('b', {}, 'Motivo'), h('div', { class: 'txt' }, c.mensagem))) : null,
      h('b', {}, 'Chamadas feitas pelo app'),
      tabela([
        { titulo: 'Hora', render: (a) => h('span', { class: 'small nowrap' }, dataHora(a.quando).slice(12)) },
        { titulo: 'Pedido', render: (a) => h('span', { class: 'small' }, a.recurso + (a.pagina ? ` (página ${a.pagina})` : '')) },
        { titulo: 'Resultado', render: (a) => h('span', { class: `badge ${a.http_status < 300 ? 'ok' : 'erro'}` }, a.http_status < 300 ? 'OK' : `Erro ${a.http_status}`) },
        { titulo: 'Linhas', classe: 'right', render: (a) => (a.linhas == null ? '' : num(a.linhas)) },
        { titulo: 'Tempo', classe: 'right', render: (a) => `${num(a.duracao_ms)} ms` },
        { titulo: 'Erro', render: (a) => h('span', { class: 'small', style: { color: 'var(--danger)' } }, a.erro || '') },
      ], acessos, { vazio: 'Nenhuma chamada registrada.' })),
    acoes: [{ texto: 'Fechar', tipo: 'primario' }],
  });
}

// ---------- Carga manual: ligação com o app ----------
function cartaoManual(ds, recarregar) {
  const url = h('input', { type: 'url', value: ds.app_url || '', placeholder: 'https://SEU-PROJETO-DO-APP.supabase.co/functions/v1/sincronizar-portal', style: { width: '100%' } });
  const chave = h('input', { type: 'password', autocomplete: 'new-password', style: { width: '100%' },
    placeholder: ds.chave_cadastrada ? '•••••••• cadastrada — deixe em branco para manter' : 'cole aqui a SYNC_KEY do app' });
  return h('div', { class: 'card', id: 'int-manual' },
    h('div', { class: 'card-h' }, h('h2', {}, 'Carga manual'),
      ds.configurado ? h('span', { class: 'badge ok' }, 'pronta para uso') : h('span', { class: 'badge cinza' }, 'não configurada')),
    h('div', { class: 'card-b stack' },
      h('div', { class: 'muted small' }, 'Para o botão "Rodar carga agora" funcionar, o portal precisa saber o endereço da função "sincronizar-portal" do app e a chave que autoriza o pedido (a mesma SYNC_KEY cadastrada no app). A chave fica guardada no cofre do Supabase e nunca aparece de volta na tela.'),
      h('div', { class: 'campo' }, h('label', {}, 'Endereço da função do app'), url),
      h('div', { class: 'campo' }, h('label', {}, 'Chave de disparo (SYNC_KEY do app)'), chave,
        ds.chave_atualizada_em ? h('div', { class: 'small muted', style: { marginTop: '4px' } }, `Chave cadastrada em ${dataHora(ds.chave_atualizada_em).slice(0, 17)}.`) : null),
      h('div', {}, botao('Salvar', { tipo: 'primario', onClick: async () => {
        try {
          const r = await rpc('integracao_salvar_disparo', { p_url: url.value, p_chave: chave.value });
          toast(r.mensagem); recarregar();
        } catch (e) { toast(e.message, 'erro', 7000); }
      } }))));
}

// ---------- Configuração ----------
function cartaoConfig(st, recarregar) {
  const horaInp = h('input', { type: 'time', value: st.hora_prevista });
  const tol = h('input', { type: 'number', min: 5, max: 720, value: st.tolerancia_min, style: { width: '110px' } });
  const ativa = h('input', { type: 'checkbox', checked: st.ativa });
  return h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h2', {}, 'Horário esperado da carga')),
    h('div', { class: 'card-b stack' },
      h('div', { class: 'muted small' }, 'O horário em que o app busca os dados é agendado no próprio app (todo dia às 06:00). Aqui você informa o horário esperado para o portal avisar quando a carga não acontecer.'),
      h('div', { class: 'row', style: { gap: '16px', alignItems: 'flex-end' } },
        h('div', { class: 'campo' }, h('label', {}, 'Horário previsto (Brasília)'), horaInp),
        h('div', { class: 'campo' }, h('label', {}, 'Tolerância (minutos)'), tol),
        h('label', { class: 'check' }, ativa, 'Acompanhamento ligado'),
        botao('Salvar', { tipo: 'primario', onClick: async () => {
          try {
            const r = await rpc('integracao_salvar_config', { p_hora: horaInp.value, p_tolerancia: Number(tol.value), p_ativa: ativa.checked });
            toast(r.mensagem); recarregar();
          } catch (e) { toast(e.message, 'erro'); }
        } }))));
}
