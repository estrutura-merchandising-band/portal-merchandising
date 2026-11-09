import { h, limpar, icone, toast, alerta, debounce } from './ui.js';
import { sb, configurado, estado, carregarUsuario, ehAdm, ehIM, podeVerClientes, podeFechamento, usaAprovacoes, atualizarAvisos, consulta, rpc, msgErro, definirGerencia } from './api.js';

const PAGINAS = [
  { id: 'painel', titulo: 'Painel', icone: 'painel', grupo: 'Estrutura', mod: () => import('./paginas/painel.js') },
  { id: 'avisos', titulo: 'Avisos', icone: 'sino', grupo: 'Estrutura', ver: () => !ehIM(), mod: () => import('./paginas/avisos.js') },
  { id: 'estrutura', titulo: 'Estrutura', icone: 'estrutura', grupo: 'Estrutura', ger: true, mod: () => import('./paginas/estrutura.js') },
  { id: 'clientes', titulo: 'Clientes das rotas', icone: 'clientes', grupo: 'Estrutura', ger: true, ver: podeVerClientes, mod: () => import('./paginas/clientes.js') },
  { id: 'aprovacoes', titulo: () => (ehAdm() ? 'Aprovações' : 'Minhas solicitações'), icone: 'aprovacoes', grupo: 'Estrutura', ver: usaAprovacoes, mod: () => import('./paginas/aprovacoes.js') },
  { id: 'pendencias', titulo: 'Pendências', icone: 'pendencias', grupo: 'Estrutura', mod: () => import('./paginas/pendencias.js') },
  { id: 'fechamento', titulo: 'Fechamento mensal', icone: 'fechamento', grupo: 'Administração', ver: podeFechamento, mod: () => import('./paginas/fechamento.js') },
  { id: 'bases', titulo: 'Bases e importações', icone: 'bases', grupo: 'Administração', ver: ehAdm, mod: () => import('./paginas/bases.js') },
  { id: 'integracao', titulo: 'Integração com o app', icone: 'integracao', grupo: 'Administração', ver: ehAdm, mod: () => import('./paginas/integracao.js') },
  { id: 'log', titulo: 'Log de alterações', icone: 'log', grupo: 'Administração', ver: ehAdm, mod: () => import('./paginas/log.js') },
  { id: 'usuarios', titulo: 'Usuários e acessos', icone: 'usuarios', grupo: 'Administração', ver: ehAdm, mod: () => import('./paginas/usuarios.js') },
  { id: 'conta', titulo: 'Minha conta', icone: 'conta', grupo: 'Conta', foraMenu: true, mod: () => import('./paginas/conta.js') },
];

const app = document.getElementById('app');
const tituloDe = (p) => (typeof p.titulo === 'function' ? p.titulo() : p.titulo);
const NOME = (window.PORTAL_CONFIG && window.PORTAL_CONFIG.NOME_EMPRESA) || 'Merchandising';

function telaNaoConfigurado() {
  limpar(app, h('div', { class: 'login' }, h('div', { class: 'card' },
    h('div', { class: 'logo' }, h('img', { src: 'assets/img/garrafa_branca.png', alt: '' })),
    h('h1', {}, 'Portal ainda não configurado'),
    h('p', {}, 'Abra o arquivo config.js e preencha a Project URL e a chave pública (anon / publishable) do seu projeto Supabase. O passo a passo está no guia de implantação.'))));
}

function telaLogin(msg) {
  const email = h('input', { type: 'email', autocomplete: 'username', placeholder: 'seu.email@empresa.com.br' });
  const senha = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Senha' });
  const erro = h('div');
  if (msg) erro.append(alerta('erro', null, msg));
  const btn = h('button', { class: 'btn primario', type: 'submit', style: { width: '100%', padding: '10px' } }, 'Entrar');
  const form = h('form', { class: 'stack' },
    h('div', { class: 'campo' }, h('label', {}, 'E-mail'), email),
    h('div', { class: 'campo' }, h('label', {}, 'Senha'), senha),
    erro, btn,
    h('div', { class: 'muted small center' }, 'Esqueceu a senha? Fale com a Administração de Vendas.'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpar(erro); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: senha.value });
    if (error) { erro.append(alerta('erro', null, msgErro(error))); btn.disabled = false; btn.textContent = 'Entrar'; return; }
    iniciar();
  });
  limpar(app, h('div', { class: 'login' }, h('div', { class: 'card' },
    h('div', { class: 'logo' }, h('img', { src: 'assets/img/garrafa_branca.png', alt: '' })),
    h('h1', {}, `Portal ${NOME}`),
    h('p', {}, 'Estrutura de repositores e gestão de rotas'),
    form)));
  setTimeout(() => email.focus(), 50);
}

function lerRota() {
  const [caminho, qs] = (location.hash.replace(/^#\/?/, '') || 'painel').split('?');
  return { id: caminho || 'painel', params: Object.fromEntries(new URLSearchParams(qs || '')) };
}
export function irPara(id, params = {}) {
  const qs = new URLSearchParams(params).toString();
  location.hash = `#/${id}${qs ? '?' + qs : ''}`;
}
window.irPara = irPara;

let layout, conteudo, nav, trilha, areaGer;
const lerPref = (k, pad) => { try { return localStorage.getItem(k) || pad; } catch { return pad; } };
const gravarPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };
const iniciais = (nome) => String(nome || '?').trim().split(/\s+/).filter((x) => x.length > 2 || x === x.toUpperCase()).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
const PERFIL_TXT = { ADM: 'Administração de Vendas', GC: 'Gerente Comercial', GM: 'Gerente de Merchandising', SM: 'Supervisor de Merchandising', LM: 'Líder de Merchandising', IM: 'Inteligência de Mercado' };

// ---------- Tema claro/escuro ----------
const temaAtual = () => document.documentElement.getAttribute('data-tema') || 'claro';
function aplicarTema(t) {
  document.documentElement.setAttribute('data-tema', t);
  gravarPref('pm.tema', t);
  const b = document.getElementById('btn-tema');
  if (b) { b.replaceChildren(icone(t === 'escuro' ? 'sol' : 'lua')); b.title = t === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'; }
}
const alternarTema = () => aplicarTema(temaAtual() === 'escuro' ? 'claro' : 'escuro');

// ---------- Menu lateral recolhível ----------
function alternarMenu() {
  const rec = !layout.classList.contains('recolhido');
  layout.classList.toggle('recolhido', rec);
  gravarPref('pm.menu', rec ? 'recolhido' : 'aberto');
  esconderDica();
}
let dicaEl = null;
function mostrarDica(alvo, texto) {
  if (!layout.classList.contains('recolhido') || window.innerWidth <= 820) return;
  esconderDica();
  const r = alvo.getBoundingClientRect();
  dicaEl = h('div', { class: 'dica', style: { left: `${r.right + 10}px`, top: `${r.top + r.height / 2}px` } }, texto);
  document.body.append(dicaEl);
}
function esconderDica() { dicaEl?.remove(); dicaEl = null; }

// ---------- Popover (seletor de gerência, menu do usuário) ----------
let popAberto = null;
function abrirPopover(ancora, conteudo, { alinhar = 'esquerda', largura } = {}) {
  fecharPopover();
  const r = ancora.getBoundingClientRect();
  const p = h('div', { class: 'popover', role: 'dialog' }, conteudo);
  if (largura) p.style.width = `${largura}px`;
  p.style.top = `${r.bottom + 6}px`;
  document.body.append(p);
  const w = p.offsetWidth;
  let x = alinhar === 'direita' ? r.right - w : r.left;
  x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
  p.style.left = `${x}px`;
  const fora = (e) => { if (!p.contains(e.target) && !ancora.contains(e.target)) fecharPopover(); };
  const esc = (e) => { if (e.key === 'Escape') fecharPopover(); };
  setTimeout(() => { document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc); });
  popAberto = { el: p, sair: () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); } };
  return p;
}
function fecharPopover() { if (popAberto) { popAberto.sair(); popAberto.el.remove(); popAberto = null; } }

function botaoGerencia() {
  const g = estado.gerencias.find((x) => x.codigo === estado.gerenciaAtual);
  const b = h('button', { type: 'button', class: 'ger-btn', title: 'Trocar de gerência', 'aria-haspopup': 'listbox' },
    h('span', { class: 'ger-ic' }, icone('estrutura')),
    h('span', { class: 'ger-txt' }, h('small', {}, 'Gerência'), h('span', {}, g ? g.codigo : '—')),
    estado.gerencias.length > 1 ? (() => { const i = icone('abaixo'); i.classList.add('seta'); return i; })() : null);
  if (estado.gerencias.length > 1) b.addEventListener('click', () => abrirListaGerencias(b));
  return b;
}
function abrirListaGerencias(ancora) {
  const filtro = h('input', { type: 'search', placeholder: 'Filtrar gerência', 'aria-label': 'Filtrar gerência' });
  const opcoes = h('div', { class: 'opcoes', role: 'listbox' });
  let foco = 0, visiveis = [];
  const desenhar = () => {
    const t = filtro.value.trim().toUpperCase();
    visiveis = estado.gerencias.filter((g) => !t || g.codigo.toUpperCase().includes(t) || (g.nome || '').toUpperCase().includes(t));
    foco = Math.min(foco, Math.max(0, visiveis.length - 1));
    limpar(opcoes, visiveis.length ? visiveis.map((g, i) => h('button', { type: 'button', class: `opc ${g.codigo === estado.gerenciaAtual ? 'sel' : ''} ${i === foco ? 'foco' : ''}`, role: 'option', onclick: () => escolherGerencia(g.codigo) },
      h('b', {}, g.codigo), h('span', { class: 'muted small' }, g.nome || ''), g.codigo === estado.gerenciaAtual ? icone('check') : null))
      : h('div', { class: 'muted small', style: { padding: '10px' } }, 'Nenhuma gerência encontrada.'));
  };
  filtro.addEventListener('input', () => { foco = 0; desenhar(); });
  filtro.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { foco = Math.min(foco + 1, visiveis.length - 1); desenhar(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { foco = Math.max(foco - 1, 0); desenhar(); e.preventDefault(); }
    if (e.key === 'Enter' && visiveis[foco]) escolherGerencia(visiveis[foco].codigo);
  });
  desenhar();
  abrirPopover(ancora, [filtro, opcoes], { largura: 300 });
  setTimeout(() => filtro.focus(), 20);
}
function escolherGerencia(cod) {
  fecharPopover();
  definirGerencia(cod);
  const { id, params } = lerRota();
  if (Object.keys(params).length) irPara(id); else renderizar();
}

function menuUsuario(ancora) {
  const u = estado.usuario;
  abrirPopover(ancora, [
    h('div', { class: 'cab-usuario row', style: { flexWrap: 'nowrap', gap: '10px' } }, h('span', { class: 'avatar g' }, iniciais(u.nome)),
      h('div', { style: { minWidth: 0 } }, h('b', {}, u.nome), h('div', { class: 'muted small' }, PERFIL_TXT[u.perfil]), h('div', { class: 'muted small' }, u.email))),
    h('div', { class: 'linha' }),
    h('button', { type: 'button', class: 'opc', onclick: () => { fecharPopover(); irPara('conta'); } }, icone('conta'), 'Minha conta'),
    h('button', { type: 'button', class: 'opc', onclick: () => { fecharPopover(); alternarTema(); } }, icone(temaAtual() === 'escuro' ? 'sol' : 'lua'), temaAtual() === 'escuro' ? 'Tema claro' : 'Tema escuro'),
    h('button', { type: 'button', class: 'opc', onclick: () => { fecharPopover(); abrirBusca(); } }, icone('busca'), h('span', { style: { flex: 1 } }, 'Busca rápida'), h('kbd', {}, 'Ctrl K')),
    h('div', { class: 'linha' }),
    h('button', { type: 'button', class: 'opc perigo', onclick: () => { fecharPopover(); sair(); } }, icone('sair'), 'Sair do portal'),
  ], { alinhar: 'direita', largura: 290 });
}

function montarLayout() {
  const u = estado.usuario;
  nav = h('nav', { 'aria-label': 'Menu principal' });
  const grupos = {};
  for (const p of PAGINAS) {
    if (p.ver && !p.ver()) continue;
    if (p.foraMenu) continue;
    (grupos[p.grupo] ||= []).push(p);
  }
  for (const [g, ps] of Object.entries(grupos)) {
    nav.append(h('div', { class: 'grupo' }, g));
    for (const p of ps) {
      const a = h('a', { href: `#/${p.id}`, 'data-id': p.id, onclick: () => layout.classList.remove('menu-aberto') }, icone(p.icone), h('span', { class: 'rot' }, tituloDe(p)),
        p.id === 'aprovacoes' ? h('span', { class: 'contador hidden', id: 'contador-aprovacoes' }) : null,
        p.id === 'avisos' ? h('span', { class: 'contador hidden cont-avisos', id: 'contador-avisos' }) : null,
        p.id === 'integracao' ? h('span', { class: 'contador hidden', id: 'contador-integracao', title: 'A carga do app de hoje teve problema' }, '!') : null);
      a.addEventListener('mouseenter', () => mostrarDica(a, tituloDe(p)));
      a.addEventListener('mouseleave', esconderDica);
      nav.append(a);
    }
  }
  nav.addEventListener('scroll', esconderDica);
  const side = h('aside', { class: 'side' },
    h('div', { class: 'side-topo' },
      h('div', { class: 'brand' }, h('div', { class: 'logo' }, h('img', { src: 'assets/img/garrafa_branca.png', alt: '' })),
        h('div', {}, h('b', {}, `Portal ${NOME}`), h('span', {}, 'Estrutura de repositores')))),
    nav,
    h('div', { class: 'side-rodape' }, h('button', { type: 'button', onclick: alternarMenu, title: 'Recolher ou expandir o menu' }, icone('recolher'), h('span', { class: 'rot' }, 'Recolher menu'))));

  trilha = h('div', { class: 'trilha' });
  areaGer = h('div', { class: 'row', style: { flexWrap: 'nowrap' } });
  const btnTema = h('button', { type: 'button', class: 'tb-btn', id: 'btn-tema', onclick: alternarTema });
  const sino = ehIM() ? null : h('a', { class: 'tb-btn', href: '#/avisos', title: 'Avisos' }, icone('sino'), h('span', { class: 'contador hidden cont-avisos' }));
  const btnUser = h('button', { type: 'button', class: 'tb-user', title: u.nome, 'aria-haspopup': 'menu' }, h('span', { class: 'avatar' }, iniciais(u.nome)));
  btnUser.addEventListener('click', () => menuUsuario(btnUser));
  const topbar = h('header', { class: 'topbar' },
    h('button', { type: 'button', class: 'tb-btn so-celular', 'aria-label': 'Abrir menu', onclick: () => layout.classList.toggle('menu-aberto') }, icone('menu')),
    trilha, h('div', { class: 'spacer' }), areaGer,
    h('button', { type: 'button', class: 'tb-busca', onclick: () => abrirBusca(), title: 'Busca rápida (Ctrl+K)' }, icone('busca'), h('span', {}, 'Buscar rota, pessoa, cliente…'), h('kbd', {}, 'Ctrl K')),
    h('span', { class: 'tb-sep' }), btnTema, sino, btnUser);

  conteudo = h('main', { class: 'pagina' });
  layout = h('div', { class: `layout ${lerPref('pm.menu', '') === 'recolhido' ? 'recolhido' : ''}` }, side, h('div', { class: 'main' }, topbar, conteudo));
  layout.addEventListener('click', (e) => { if (e.target === layout && layout.classList.contains('menu-aberto')) layout.classList.remove('menu-aberto'); });
  limpar(app, layout);
  aplicarTema(temaAtual());
}

function atualizarTopo(pag) {
  limpar(trilha, h('span', { class: 'grupo-t' }, pag.grupo), h('span', { class: 'sep' }, '/'), h('b', {}, tituloDe(pag)));
  limpar(areaGer, pag.ger && estado.gerencias.length ? botaoGerencia() : null);
}

// ---------- Busca rápida (Ctrl+K) ----------
let buscaAberta = null;
const semAc = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function realcar(txt, termo) {
  const t = String(txt ?? '');
  if (!termo) return t;
  const i = semAc(t).indexOf(semAc(termo));
  if (i < 0) return t;
  return [t.slice(0, i), h('mark', {}, t.slice(i, i + termo.length)), t.slice(i + termo.length)];
}
function abrirBusca() {
  if (buscaAberta) return;
  fecharPopover();
  const entrada = h('input', { type: 'text', placeholder: 'Buscar página, gerência, rota, repositor ou cliente…', 'aria-label': 'Busca rápida', autocomplete: 'off', spellcheck: 'false' });
  const lista = h('div', { class: 'cmdk-lista', role: 'listbox' });
  const caixa = h('div', { class: 'cmdk', role: 'dialog', 'aria-label': 'Busca rápida' },
    h('div', { class: 'cmdk-entrada' }, icone('busca'), entrada, h('kbd', {}, 'Esc')),
    lista,
    h('div', { class: 'cmdk-rodape' }, h('span', {}, h('kbd', {}, '↑'), h('kbd', {}, '↓'), 'navegar'), h('span', {}, h('kbd', {}, 'Enter'), 'abrir'), h('span', {}, h('kbd', {}, 'Esc'), 'fechar')));
  const fundo = h('div', { class: 'cmdk-fundo' }, caixa);
  fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(); });
  document.body.append(fundo);
  buscaAberta = fundo;
  let itens = [], foco = 0, seq = 0, remotos = { rotas: [], clientes: [], carregando: false };

  function fechar() { fundo.remove(); buscaAberta = null; }
  function ir(it) { fechar(); it.acao(); }

  function locais(t) {
    const pags = PAGINAS.filter((p) => !p.ver || p.ver()).map((p) => ({ grupo: 'Páginas', ic: p.icone, titulo: tituloDe(p), sub: p.grupo, dir: 'Abrir', acao: () => irPara(p.id) }));
    const gers = estado.gerencias.map((g) => ({ grupo: 'Gerências', ic: 'estrutura', titulo: g.codigo, sub: g.nome || 'Estrutura da gerência', dir: 'Ver estrutura', acao: () => { definirGerencia(g.codigo); irPara('estrutura', { g: g.codigo }); } }));
    const acoes = [
      { grupo: 'Ações', ic: temaAtual() === 'escuro' ? 'sol' : 'lua', titulo: temaAtual() === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro', sub: 'Aparência do portal', acao: alternarTema },
      { grupo: 'Ações', ic: 'recolher', titulo: layout.classList.contains('recolhido') ? 'Expandir menu lateral' : 'Recolher menu lateral', sub: 'Aparência do portal', acao: alternarMenu },
    ];
    if (!t) return [...pags.slice(0, 6), ...acoes];
    const ok = (x) => semAc(`${x.titulo} ${x.sub}`).includes(semAc(t));
    return [...pags.filter(ok), ...gers.filter(ok).slice(0, 6), ...acoes.filter(ok)];
  }

  function desenhar() {
    const t = entrada.value.trim();
    itens = [...locais(t), ...remotos.rotas, ...remotos.clientes];
    foco = Math.min(foco, Math.max(0, itens.length - 1));
    const filhos = []; let grupoAnt = null;
    itens.forEach((it, i) => {
      if (it.grupo !== grupoAnt) { filhos.push(h('div', { class: 'cmdk-grupo' }, it.grupo)); grupoAnt = it.grupo; }
      const el = h('div', { class: `cmdk-item ${i === foco ? 'foco' : ''}`, role: 'option', 'data-i': i, onclick: () => ir(it), onmousemove: () => { if (foco !== i) { foco = i; marcar(); } } },
        h('span', { class: 'ic' }, icone(it.ic)),
        h('span', { class: 'tx' }, h('b', {}, realcar(it.titulo, t)), it.sub ? h('span', {}, realcar(it.sub, t)) : null),
        it.dir ? h('span', { class: 'dir' }, it.dir) : null);
      filhos.push(el);
    });
    if (remotos.carregando) filhos.push(h('div', { class: 'cmdk-vazio' }, h('span', { class: 'spinner' }), ' Buscando rotas, pessoas e clientes…'));
    else if (!itens.length) filhos.push(h('div', { class: 'cmdk-vazio' }, `Nada encontrado para “${t}”.`));
    else if (t.length === 1) filhos.push(h('div', { class: 'cmdk-vazio small' }, 'Digite pelo menos 2 letras para buscar rotas, pessoas e clientes.'));
    limpar(lista, filhos);
  }
  function marcar() {
    lista.querySelectorAll('.cmdk-item').forEach((el) => el.classList.toggle('foco', Number(el.dataset.i) === foco));
    lista.querySelector('.cmdk-item.foco')?.scrollIntoView({ block: 'nearest' });
  }

  const buscarRemoto = debounce(async () => {
    const t = entrada.value.trim().replace(/[,()*%\\]/g, ' ').trim();
    const meu = ++seq;
    if (t.length < 2) { remotos = { rotas: [], clientes: [], carregando: false }; desenhar(); return; }
    remotos.carregando = true; desenhar();
    const gers = estado.gerencias.map((g) => g.codigo);
    const NIV = { GC: 'Gerente Comercial', GM: 'Gerente de Merch.', SM: 'Supervisor de Merch.', LM: 'Líder de Merch.', RP: 'Rota' };
    const [pos, cli] = await Promise.all([
      consulta(sb.from('vw_posicoes').select('id, gerencia, nivel, codigo, matricula, nome, ativa').in('gerencia', gers)
        .or(`codigo.ilike.${t}%,nome.ilike.%${t}%,matricula.eq.${t}`).order('nivel').order('codigo').limit(8)).catch(() => []),
      podeVerClientes()
        ? consulta(sb.from('vw_rota_clientes').select('posicao_id, rota, gerencia, cod_cliente, nome_fantasia, razao_social, cidade').in('gerencia', gers)
          .or(`cod_cliente.eq.${t},nome_fantasia.ilike.%${t}%,razao_social.ilike.%${t}%`).limit(8)).catch(() => [])
        : Promise.resolve([]),
    ]);
    if (meu !== seq || !buscaAberta) return;
    remotos = {
      carregando: false,
      rotas: pos.map((p) => ({ grupo: 'Rotas e pessoas', ic: p.nivel === 'RP' ? 'pino' : 'pessoa',
        titulo: p.nivel === 'RP' ? `Rota ${p.codigo}${p.nome ? ' · ' + p.nome : ' · vaga'}` : `${p.nome || 'Vago'}`,
        sub: `${p.nivel === 'RP' ? 'Repositor' : NIV[p.nivel]} · ${p.gerencia}${p.matricula ? ' · mat. ' + p.matricula : ''}${p.ativa ? '' : ' · inativa'}`,
        dir: p.gerencia, acao: () => { definirGerencia(p.gerencia); p.nivel === 'RP' && podeVerClientes() ? irPara('clientes', { rota: p.id }) : irPara('estrutura', { g: p.gerencia }); } })),
      clientes: cli.map((c) => ({ grupo: 'Clientes', ic: 'loja', titulo: `${c.cod_cliente} · ${c.nome_fantasia || c.razao_social || ''}`,
        sub: `Rota ${c.rota} · ${c.gerencia}${c.cidade ? ' · ' + c.cidade : ''}`, dir: `Rota ${c.rota}`, acao: () => irPara('clientes', { rota: c.posicao_id }) })),
    };
    desenhar();
  }, 220);

  entrada.addEventListener('input', () => { foco = 0; desenhar(); buscarRemoto(); });
  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { foco = Math.min(foco + 1, itens.length - 1); marcar(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { foco = Math.max(foco - 1, 0); marcar(); e.preventDefault(); }
    else if (e.key === 'Enter' && itens[foco]) { e.preventDefault(); ir(itens[foco]); }
    else if (e.key === 'Escape') fechar();
  });
  desenhar();
  setTimeout(() => entrada.focus(), 10);
}
window.abrirBusca = abrirBusca;
document.addEventListener('keydown', (e) => {
  if (!estado.usuario || !layout) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); if (buscaAberta) { buscaAberta.remove(); buscaAberta = null; } else abrirBusca(); }
  else if (k === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '') && !document.querySelector('.modal-fundo')) { e.preventDefault(); abrirBusca(); }
});
window.addEventListener('resize', () => { fecharPopover(); esconderDica(); });

async function sair() {
  clearInterval(timerAvisos); clearInterval(timerQuadro); clearInterval(timerInteg);
  await sb.auth.signOut();
  estado.usuario = null;
  location.hash = '';
  telaLogin();
}

let renderId = 0;
async function renderizar() {
  if (!estado.usuario) return;
  const { id, params } = lerRota();
  let pag = PAGINAS.find((p) => p.id === id && (!p.ver || p.ver()));
  if (!pag) pag = PAGINAS[0];
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('ativo', a.dataset.id === pag.id));
  fecharPopover();
  atualizarTopo(pag);
  document.title = `${tituloDe(pag)} · Portal ${NOME}`;
  const meu = ++renderId;
  limpar(conteudo, h('div', { class: 'carregando' }, h('span', { class: 'spinner' }), ' Carregando…'));
  try {
    const mod = await pag.mod();
    if (meu !== renderId) return;
    const alvo = h('div');
    await mod.render(alvo, params);
    if (meu !== renderId) return;
    limpar(conteudo, alvo);
    atualizarTopo(pag); // a página pode ter trocado a gerência (ex.: link de uma rota)
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    if (meu === renderId) limpar(conteudo, alerta('erro', 'Não foi possível carregar a página', msgErro(e)));
  }
}

async function iniciar() {
  if (!configurado) return telaNaoConfigurado();
  try {
    const r = await carregarUsuario();
    if (!r) return telaLogin();
    if (r.semAcesso) {
      await sb.auth.signOut();
      return telaLogin(`O login ${r.email} não tem acesso ativo ao portal. Procure a Administração de Vendas.`);
    }
    montarLayout();
    renderizar();
    iniciarAvisos();
  } catch (e) {
    telaLogin(msgErro(e));
  }
}

// ---------- Avisos de aprovação: contador no menu + novidades ao entrar ----------
let timerAvisos = null, timerInteg = null, timerQuadro = null, primeiraLeitura = true, ultimoQuadro = null;
function desenharContador({ antes, agora }) {
  const c = document.getElementById('contador-aprovacoes');
  if (!c) return;
  const adm = ehAdm();
  const n = adm ? agora.para_aprovar : agora.novas_reprovadas + agora.novas_aprovadas;
  c.classList.toggle('hidden', !n);
  c.classList.toggle('ok', !adm && !agora.novas_reprovadas);
  c.textContent = n > 99 ? '99+' : String(n);
  c.title = adm ? `${n} pedido(s) aguardando aprovação`
    : `${agora.novas_reprovadas} reprovada(s) e ${agora.novas_aprovadas} aprovada(s) que você ainda não viu`;
  if (!primeiraLeitura && antes) {
    const subiu = adm ? agora.para_aprovar > antes.para_aprovar : agora.novas_reprovadas > antes.novas_reprovadas || agora.novas_aprovadas > antes.novas_aprovadas;
    if (subiu) {
      c.classList.remove('pulsa'); void c.offsetWidth; c.classList.add('pulsa');
      if (adm) toast('Chegou um novo pedido para aprovação.', 'aviso');
      else if (agora.novas_reprovadas > antes.novas_reprovadas) toast('Uma solicitação sua foi reprovada. Veja o motivo em Minhas solicitações.', 'erro', 8000);
      else toast('Uma solicitação sua foi aprovada.');
    }
  }
  primeiraLeitura = false;
}
window.addEventListener('avisos', (e) => desenharContador(e.detail));

// ADM: alerta no menu quando a carga diária do app teve problema
async function checarIntegracao() {
  if (!ehAdm()) return;
  try {
    const st = await rpc('api_status_integracao');
    estado.integracao = st;
    document.getElementById('contador-integracao')?.classList.toggle('hidden', !st.problema);
  } catch { /* banco sem a atualização 10: ignora */ }
}

// Avisos do portal (ex.: cliente que saiu da base): contador no menu + toast quando chega aviso novo
async function checarQuadro() {
  if (ehIM()) return;
  try {
    const { atualizarContador } = await import('./paginas/avisos.js');
    const n = await atualizarContador();
    if (ultimoQuadro === null && n) toast(`Você tem ${n} aviso(s) novo(s) no portal. Veja no menu Avisos.`, 'aviso', 7000);
    else if (ultimoQuadro !== null && n > ultimoQuadro) toast('Chegou um novo aviso no portal. Veja no menu Avisos.', 'aviso', 7000);
    ultimoQuadro = n;
  } catch { /* não bloqueia */ }
}
window.addEventListener('hashchange', () => { if (estado.usuario) setTimeout(checarQuadro, 800); });

async function iniciarAvisos() {
  clearInterval(timerAvisos); primeiraLeitura = true;
  ultimoQuadro = null; checarQuadro(); clearInterval(timerQuadro);
  timerQuadro = setInterval(() => { if (estado.usuario && document.visibilityState === 'visible') checarQuadro(); }, 120000);
  checarIntegracao(); clearInterval(timerInteg); timerInteg = setInterval(checarIntegracao, 5 * 60000);
  if (!usaAprovacoes()) return;
  const r = await atualizarAvisos();
  timerAvisos = setInterval(() => { if (estado.usuario && document.visibilityState === 'visible') atualizarAvisos(); }, 60000);
  // quem solicita vê na hora as decisões que ainda não viu (principalmente o motivo das reprovações)
  if (!ehAdm() && (r.novas_reprovadas || r.novas_aprovadas) && lerRota().id !== 'aprovacoes') {
    try {
      const lista = await consulta(sb.from('vw_solicitacoes').select('*').eq('solicitante_id', estado.usuario.id)
        .in('status', ['APROVADA', 'REPROVADA']).is('ciente_em', null).order('decidido_em', { ascending: false }).limit(200));
      if (lista.length) {
        const { modalNovidades } = await import('./paginas/solicitacoes.js');
        modalNovidades(lista, { aoVer: () => irPara('aprovacoes') });
      }
    } catch { /* não bloqueia */ }
  }
}

window.addEventListener('hashchange', renderizar);
if (sb) {
  sb.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT' && estado.usuario) { estado.usuario = null; telaLogin('Sua sessão foi encerrada.'); }
  });
}
window.addEventListener('unhandledrejection', (e) => { toast(msgErro(e.reason), 'erro'); });
iniciar();
