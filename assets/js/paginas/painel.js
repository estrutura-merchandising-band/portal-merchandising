// Painel: visão geral das gerências que o usuário acompanha.
import { h, tabela, num, alerta, icone } from '../ui.js';
import { rpc, estado, definirGerencia, ehAdm, ehIM, usaAprovacoes, atualizarAvisos } from '../api.js';
import { cabecalho, semGerencias } from './comum.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export async function render(el) {
  if (!estado.gerencias.length) { el.append(cabecalho('Painel'), semGerencias()); return; }
  const adm = ehAdm();
  const [resumo, pend, nAvisos, integ, solic] = await Promise.all([
    rpc('resumo_gerencias'),
    rpc('pendencias', { p_gerencia: null }),
    rpc('avisos_contar').catch(() => 0),
    adm ? rpc('api_status_integracao').catch(() => null) : Promise.resolve(null),
    usaAprovacoes() ? atualizarAvisos() : Promise.resolve(null),
  ]);
  const altas = pend.filter((p) => p.gravidade === 'ALTA');
  const porGer = {};
  for (const p of altas) porGer[p.gerencia] = (porGer[p.gerencia] || 0) + 1;
  const soma = (k) => resumo.reduce((s, r) => s + (r[k] || 0), 0);
  const rotas = soma('rotas_ativas'), ocupadas = soma('rotas_ocupadas'), vagas = soma('rotas_vagas');
  const lidVagas = resumo.reduce((s, r) => s + (r.gc ? 0 : 1) + (r.gm || r.sm ? 0 : 1) + (r.lm ? 0 : 1), 0);

  // ---------- saudação ----------
  const agora = new Date();
  const hora = Number(agora.toLocaleString('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }));
  const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const nomeU = estado.usuario.nome.split(' ')[0];
  const dataTxt = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' });
  const topo = h('div', { class: 'cabecalho saudacao' }, h('div', {},
    h('div', { class: 'data' }, dataTxt),
    h('h1', {}, `${saud}, ${nomeU.charAt(0) + nomeU.slice(1).toLowerCase()}`),
    h('p', {}, `Visão geral das ${resumo.length} gerência(s) que você acompanha.`)));

  // ---------- alerta de carga do app (ADM) ----------
  let avisoApp = null;
  if (integ?.problema) {
    const c = integ.carga;
    avisoApp = h('div', { style: { marginBottom: '16px' } }, alerta('erro', 'Carga do aplicativo com problema',
      h('span', {}, integ.texto, c?.etapa ? ` Onde parou: ${c.etapa}.` : '', c?.mensagem ? ` Motivo: ${c.mensagem}` : '', ' ',
        h('a', { href: '#/integracao' }, 'Ver detalhes'))));
  }

  // ---------- indicadores ----------
  const cob = pct(ocupadas, rotas);
  const tile = ({ ic, cor = '', rot, val, sufixo, sub, barra, href }) => h(href ? 'a' : 'div', { class: 'tile', href },
    h('div', { class: 't-top' }, h('span', { class: `t-ic ${cor}` }, icone(ic)), h('span', { class: 't-rot' }, rot)),
    h('div', { class: 't-val' }, val, sufixo ? h('small', {}, sufixo) : null),
    barra || null,
    h('div', { class: 't-sub' }, sub),
    href ? seta() : null);
  const tiles = h('div', { class: 'tiles' },
    tile({ ic: 'pino', rot: 'Rotas ativas', val: num(rotas), sub: [h('b', {}, num(resumo.length)), ' gerências com merchandising'] }),
    tile({ ic: 'estrutura', rot: 'Cobertura das rotas', val: String(cob), sufixo: '%',
      barra: h('div', { class: 't-barra', role: 'img', 'aria-label': `${ocupadas} rotas com repositor e ${vagas} vagas` },
        h('i', { style: { width: `${cob}%`, background: 'var(--chart-ocupada)' } }), vagas ? h('i', { style: { flex: 1, background: 'var(--chart-vaga)' } }) : null),
      sub: [h('b', {}, num(ocupadas)), ' com repositor · ', h('b', {}, num(vagas)), ` vaga${vagas === 1 ? '' : 's'}`] }),
    tile({ ic: 'loja', rot: 'Clientes atendidos', val: num(soma('pdvs_distintos')), sub: [h('b', {}, num(soma('clientes_vinculados'))), ' vínculos cliente × rota'] }),
    tile({ ic: 'pendencias', cor: altas.length ? 'aviso' : 'ok', rot: 'Pontos de atenção', val: num(altas.length), href: '#/pendencias',
      sub: altas.length ? 'Itens para conferir em Pendências' : 'Nenhum ponto de atenção' }));

  // ---------- precisa da sua atenção ----------
  const itens = [];
  const item = (ic, cor, titulo, texto, n, href) => itens.push(h('a', { href },
    h('span', { class: `a-ic ${cor}` }, icone(ic)), h('span', { class: 'a-tx' }, h('b', {}, titulo), h('span', {}, texto)),
    n !== null ? h('span', { class: 'a-n' }, num(n)) : null, seta()));
  if (solic) {
    if (adm) item('aprovacoes', solic.para_aprovar ? 'aviso' : 'ok', 'Aprovações', solic.para_aprovar ? 'Pedidos aguardando sua decisão' : 'Nenhum pedido aguardando', solic.para_aprovar, '#/aprovacoes');
    else {
      const n = (solic.novas_reprovadas || 0) + (solic.novas_aprovadas || 0);
      item('aprovacoes', solic.novas_reprovadas ? 'erro' : n ? 'azul' : 'ok', 'Minhas solicitações',
        n ? `${solic.novas_reprovadas || 0} reprovada(s) e ${solic.novas_aprovadas || 0} aprovada(s) para ver` : 'Nenhuma novidade', n, '#/aprovacoes');
    }
  }
  if (!ehIM()) item('sino', nAvisos ? 'aviso' : 'ok', 'Avisos', nAvisos ? 'Avisos não lidos do portal' : 'Todos os avisos foram lidos', nAvisos, '#/avisos');
  item('pino', vagas ? 'aviso' : 'ok', 'Rotas vagas', vagas ? 'Rotas ativas sem repositor' : 'Todas as rotas têm repositor', vagas, '#/pendencias');
  item('usuarios', lidVagas ? 'aviso' : 'ok', 'Liderança vaga', lidVagas ? 'Posições de GC, GM/SM ou líder sem ninguém' : 'Liderança completa', lidVagas, '#/pendencias');
  if (adm && integ) item('integracao', integ.problema ? 'erro' : 'ok', 'Carga do app', integ.problema ? 'A carga de hoje teve problema' : (integ.texto || 'Carga do dia em ordem'), null, '#/integracao');
  const atencao = h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', {}, 'Precisa da sua atenção')), h('div', { class: 'atencao' }, itens));

  // ---------- gráfico: rotas por gerência ----------
  const grafico = h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h2', {}, 'Rotas por gerência'), h('div', { class: 'spacer' }),
      h('div', { class: 'legenda' }, h('span', {}, h('i', { style: { background: 'var(--chart-ocupada)' } }), 'Com repositor'), h('span', {}, h('i', { style: { background: 'var(--chart-vaga)' } }), 'Vagas'))),
    h('div', { class: 'card-b' }, barrasGerencias(resumo)));

  // ---------- tabela ----------
  const abrir = (r) => { definirGerencia(r.gerencia); window.irPara('estrutura', { g: r.gerencia }); };
  const tab = h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('h2', {}, 'Gerências'), h('span', { class: 'muted small' }, 'Clique numa linha para abrir a estrutura')),
    tabela([
      { titulo: 'Gerência', render: (r) => h('b', {}, r.gerencia) },
      { titulo: 'Gerente Comercial', render: (r) => nomeOuVago(r.gc) },
      { titulo: 'Ger./Sup. Merchandising', render: (r) => nomeOuVago(r.gm || r.sm, r.gm ? 'GM' : (r.sm ? 'SM' : '')) },
      { titulo: 'Líder', render: (r) => nomeOuVago(r.lm) },
      { titulo: 'Rotas', classe: 'right', render: (r) => num(r.rotas_ativas) },
      { titulo: 'Cobertura', render: (r) => { const p = pct(r.rotas_ocupadas, r.rotas_ativas); return h('span', { class: 'cobertura' }, h('span', { class: 'progresso' }, h('div', { style: { width: `${p}%` } })), h('span', {}, `${p}%`)); } },
      { titulo: 'Vagas', classe: 'right', render: (r) => (r.rotas_vagas ? h('span', { class: 'badge aviso' }, num(r.rotas_vagas)) : h('span', { class: 'muted' }, '0')) },
      { titulo: 'Clientes', classe: 'right', render: (r) => num(r.pdvs_distintos) },
      { titulo: 'Atenção', classe: 'right', render: (r) => (porGer[r.gerencia] ? h('span', { class: 'badge aviso' }, porGer[r.gerencia]) : h('span', { class: 'muted' }, '0')) },
      { titulo: '', classe: 'right', render: () => h('span', { class: 'muted', style: { display: 'inline-flex' } }, seta()) },
    ], resumo, { aoClicar: abrir }));

  el.append(topo, ...(avisoApp ? [avisoApp] : []), tiles, h('div', { class: 'grid g21' }, grafico, atencao), tab);
}

function seta() { const s = icone('direita'); s.classList.add('seta-ir'); return s; }

function nomeOuVago(nome, sufixo) {
  if (!nome) return h('span', { class: 'badge aviso' }, 'Vago');
  return h('span', { class: 'small' }, nome, sufixo ? h('span', { class: 'muted' }, ` (${sufixo})`) : null);
}

// Barras horizontais empilhadas (com repositor + vagas), ordenadas pelo total de rotas.
function barrasGerencias(resumo) {
  const lista = [...resumo].sort((a, b) => b.rotas_ativas - a.rotas_ativas || a.gerencia.localeCompare(b.gerencia));
  const bruto = Math.max(1, ...lista.map((r) => r.rotas_ativas));
  const passo = bruto <= 10 ? 2 : bruto <= 25 ? 5 : bruto <= 50 ? 10 : 20;
  const max = Math.ceil(bruto / passo) * passo;
  let tip = null;
  const sair = () => { tip?.remove(); tip = null; };
  const mover = (e, r) => {
    if (!tip) {
      const p = pct(r.rotas_ocupadas, r.rotas_ativas);
      tip = h('div', { class: 'tip' }, h('b', {}, r.gerencia),
        h('div', { class: 'l' }, h('i', { style: { background: 'var(--chart-ocupada)' } }), h('span', {}, 'Com repositor'), h('span', {}, num(r.rotas_ocupadas))),
        h('div', { class: 'l' }, h('i', { style: { background: 'var(--chart-vaga)' } }), h('span', {}, 'Vagas'), h('span', {}, num(r.rotas_vagas))),
        h('div', { class: 'l' }, h('i', { style: { background: 'transparent' } }), h('span', {}, 'Cobertura'), h('span', {}, `${p}%`)),
        h('div', { class: 'l' }, h('i', { style: { background: 'transparent' } }), h('span', {}, 'Clientes atendidos'), h('span', {}, num(r.pdvs_distintos))));
      document.body.append(tip);
    }
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if (y + hh > window.innerHeight - 8) y = e.clientY - hh - 14;
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  };
  window.addEventListener('hashchange', sair, { once: true });
  const linhas = lista.map((r) => {
    const l = h('div', { class: 'barra-l', role: 'button', tabindex: '0', 'aria-label': `${r.gerencia}: ${r.rotas_ocupadas} com repositor, ${r.rotas_vagas} vagas`,
      onclick: () => { sair(); definirGerencia(r.gerencia); window.irPara('estrutura', { g: r.gerencia }); } },
      h('span', { class: 'g' }, r.gerencia),
      h('div', { class: 'trilho' },
        r.rotas_ocupadas ? h('div', { class: 'seg ocupada', style: { width: `${(r.rotas_ocupadas / max) * 100}%` } }) : null,
        r.rotas_vagas ? h('div', { class: 'seg vaga', style: { width: `${(r.rotas_vagas / max) * 100}%` } }) : null),
      h('span', { class: 'tot' }, h('b', {}, num(r.rotas_ativas)), r.rotas_vagas ? h('span', { class: 'muted' }, ` · ${r.rotas_vagas}v`) : null));
    l.addEventListener('mousemove', (e) => mover(e, r));
    l.addEventListener('mouseleave', sair);
    l.addEventListener('keydown', (e) => { if (e.key === 'Enter') l.click(); });
    return l;
  });
  const ticks = []; for (let v = 0; v <= max; v += passo) ticks.push(v);
  const eixo = h('div', { class: 'eixo' }, h('span'), h('div', {}, ticks.map((v) => h('span', {}, String(v)))), h('span'));
  return h('div', {}, h('div', { class: 'barras' }, linhas), eixo);
}
