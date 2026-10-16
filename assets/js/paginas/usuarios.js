import { h, limpar, botao, modal, toast, tabela, alerta, confirmar, pedirTexto } from '../ui.js';
import { sb, consulta, estado, funcaoUsuarios, msgErro } from '../api.js';
import { cabecalho } from './comum.js';

const PERFIS = {
  ADM: ['Administração de Vendas', 'Acesso total: estrutura de todas as gerências, clientes, bases, fechamento, log e usuários.'],
  GC: ['Gerente Comercial', 'Altera GM, SM, LM e rotas das suas gerências.'],
  GM: ['Gerente de Merchandising', 'Altera SM, LM e rotas das suas gerências.'],
  SM: ['Supervisor de Merchandising', 'Altera LM e rotas das suas gerências.'],
  LM: ['Líder de Merchandising', 'Altera rotas das suas gerências (se "Alterar a estrutura" estiver ligado).'],
};
const PERMS = [
  ['pode_editar_estrutura', 'Alterar a estrutura', 'Alocar/retirar colaboradores e criar/inativar rotas abaixo do seu nível'],
  ['pode_ver_clientes', 'Ver clientes das rotas', 'Consultar e exportar os clientes de cada rota'],
  ['pode_editar_dias', 'Alterar dias de visita', 'Mudar os dias de visita dos clientes das rotas (sem incluir ou remover clientes)'],
  ['pode_solicitar_clientes', 'Solicitar inclusão/exclusão de clientes', 'Pedir para incluir ou remover clientes das rotas; cada pedido passa pela aprovação da Administração de Vendas (aba Aprovações)'],
  ['pode_editar_clientes', 'Alterar clientes direto (sem aprovação)', 'Incluir/remover clientes sem passar pela aprovação e mudar dias de visita'],
  ['pode_fechamento', 'Baixar fechamentos', 'Baixar os arquivos de fechamento mensal (apenas das suas gerências)'],
];

export function gerarSenha() {
  const alfa = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz', dig = '23456789';
  const r = new Uint32Array(10); crypto.getRandomValues(r);
  let s = ''; for (let i = 0; i < 7; i++) s += alfa[r[i] % alfa.length];
  for (let i = 7; i < 10; i++) s += dig[r[i] % dig.length];
  return s.slice(0, 1).toUpperCase() + s.slice(1) + '@';
}

export async function render(el, params) {
  let aba = params.aba || 'usuarios';
  const abasEl = h('div', { class: 'abas' });
  const corpo = h('div');
  el.append(cabecalho('Usuários e acessos', 'Crie usuários, defina perfil, gerências e permissões. Só a Administração de Vendas acessa esta tela.'), abasEl, corpo);
  function desenharAbas() {
    limpar(abasEl, [['usuarios', 'Usuários'], ['gerencias', 'Gerências']].map(([k, t]) => h('button', { type: 'button', class: aba === k ? 'ativo' : '', onclick: () => { aba = k; desenharAbas(); abrir(); } }, t)));
  }
  let seq = 0;
  async function abrir() {
    const meu = ++seq; const alvo = h('div');
    limpar(corpo, h('div', { class: 'carregando' }, h('span', { class: 'spinner' })));
    const recarregar = () => { if (meu === seq) abrir(); };
    try { if (aba === 'usuarios') await abaUsuarios(alvo, recarregar); else await abaGerencias(alvo, recarregar); }
    catch (e) { limpar(alvo, alerta('erro', null, e.message)); }
    if (meu === seq) limpar(corpo, alvo);
  }
  desenharAbas(); await abrir();
}

async function abaUsuarios(el, recarregar) {
  const [lista, gers] = await Promise.all([
    consulta(sb.from('usuarios').select('*').order('ativo', { ascending: false }).order('nome')),
    consulta(sb.from('gerencias').select('codigo, nome').eq('ativa_merch', true).order('codigo')),
  ]);
  const busca = h('input', { type: 'search', placeholder: 'Buscar nome ou e-mail' });
  const area = h('div');
  function desenhar() {
    const t = busca.value.trim().toUpperCase();
    limpar(area, tabela([
      { titulo: 'Nome', render: (u) => h('div', {}, h('b', {}, u.nome), u.matricula ? h('div', { class: 'muted small' }, `Mat. ${u.matricula}`) : null) },
      { titulo: 'E-mail', render: (u) => h('span', { class: 'small' }, u.email) },
      { titulo: 'Perfil', render: (u) => h('span', { class: `badge ${u.perfil === 'ADM' ? 'azul' : 'cinza'}` }, PERFIS[u.perfil][0]) },
      { titulo: 'Gerências', render: (u) => h('span', { class: 'small' }, u.perfil === 'ADM' ? 'Todas' : (u.gerencias.join(', ') || h('span', { class: 'badge aviso' }, 'Nenhuma'))) },
      { titulo: 'Permissões', render: (u) => u.perfil === 'ADM' ? h('span', { class: 'small muted' }, 'Todas') : h('div', { class: 'chips' }, PERMS.filter(([k]) => u[k]).map(([, t]) => h('span', { class: 'badge cinza' }, t))) },
      { titulo: 'Status', render: (u) => (u.ativo ? h('span', { class: 'badge ok' }, 'Ativo') : h('span', { class: 'badge erro' }, 'Inativo')) },
      { titulo: '', classe: 'right', render: (u) => h('div', { class: 'acoes-linha' },
        botao('Editar', { peq: true, icone: 'editar', onClick: () => formulario(u, gers, recarregar) }),
        botao('Senha', { peq: true, tipo: 'sutil', icone: 'chave', onClick: () => redefinirSenha(u) }),
        u.id !== estado.usuario.id ? botao(u.ativo ? 'Inativar' : 'Reativar', { peq: true, tipo: u.ativo ? 'perigo-sutil' : '', onClick: () => alternar(u, recarregar) }) : null) },
    ], lista.filter((u) => !t || u.nome.includes(t) || u.email.toUpperCase().includes(t)), { classeLinha: (u) => (u.ativo ? '' : 'inativa') }));
  }
  busca.addEventListener('input', desenhar);
  limpar(el, h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('div', { class: 'toolbar' }, busca), h('div', { class: 'spacer' }), botao('Novo usuário', { tipo: 'primario', icone: 'pessoa', onClick: () => formulario(null, gers, recarregar) })),
    area));
  desenhar();
}

function formulario(u, gers, aoConcluir) {
  const novo = !u;
  const v = u || { nome: '', email: '', matricula: '', perfil: 'GC', gerencias: [], pode_editar_estrutura: true, pode_ver_clientes: true, pode_editar_clientes: false, pode_fechamento: false, pode_editar_dias: false, pode_solicitar_clientes: false };
  const nome = h('input', { type: 'text', value: v.nome });
  const email = h('input', { type: 'email', value: v.email, disabled: !novo });
  const matricula = h('input', { type: 'text', value: v.matricula || '' });
  const perfil = h('select', {}, Object.entries(PERFIS).map(([k, [t]]) => h('option', { value: k, selected: v.perfil === k }, `${k} — ${t}`)));
  const descPerfil = h('div', { class: 'ajuda' });
  const senha = h('input', { type: 'text', value: novo ? gerarSenha() : '' });
  const chkG = Object.fromEntries(gers.map((g) => [g.codigo, h('input', { type: 'checkbox', checked: v.gerencias.includes(g.codigo) })]));
  const chkP = Object.fromEntries(PERMS.map(([k]) => [k, h('input', { type: 'checkbox', checked: !!v[k] })]));
  const blocoG = h('div', { class: 'campo' }, h('label', {}, 'Gerências que o usuário acompanha'),
    h('div', { class: 'row' }, botao('Marcar todas', { peq: true, tipo: 'sutil', onClick: () => Object.values(chkG).forEach((c) => (c.checked = true)) }), botao('Limpar', { peq: true, tipo: 'sutil', onClick: () => Object.values(chkG).forEach((c) => (c.checked = false)) })),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '6px' } }, gers.map((g) => h('label', { class: 'check' }, chkG[g.codigo], g.codigo))));
  const blocoP = h('div', { class: 'campo' }, h('label', {}, 'Permissões'),
    PERMS.map(([k, t, d]) => h('label', { class: 'check', style: { alignItems: 'flex-start' } }, chkP[k], h('span', {}, h('b', {}, t), h('span', { class: 'muted small' }, ` — ${d}`)))));
  const notaAdm = alerta('info', 'Perfil ADM', 'Acessa todas as gerências e tem todas as permissões, inclusive log, usuários, bases e fechamento.');
  function atualizarPerfil() {
    descPerfil.textContent = PERFIS[perfil.value][1];
    const adm = perfil.value === 'ADM';
    blocoG.classList.toggle('hidden', adm); blocoP.classList.toggle('hidden', adm); notaAdm.classList.toggle('hidden', !adm);
  }
  // Ao criar, sugere as permissões padrão do perfil escolhido.
  const PADRAO = { GC: { pode_editar_estrutura: true, pode_ver_clientes: true, pode_editar_dias: false, pode_editar_clientes: false, pode_fechamento: false, pode_solicitar_clientes: false },
    GM: { pode_editar_estrutura: true, pode_ver_clientes: true, pode_editar_dias: true, pode_editar_clientes: false, pode_fechamento: false, pode_solicitar_clientes: true },
    SM: { pode_editar_estrutura: true, pode_ver_clientes: true, pode_editar_dias: true, pode_editar_clientes: false, pode_fechamento: false, pode_solicitar_clientes: true },
    LM: { pode_editar_estrutura: false, pode_ver_clientes: true, pode_editar_dias: true, pode_editar_clientes: false, pode_fechamento: false, pode_solicitar_clientes: false } };
  perfil.addEventListener('change', () => { if (novo && PADRAO[perfil.value]) for (const [k, val] of Object.entries(PADRAO[perfil.value])) chkP[k].checked = val; });
  if (novo) for (const [k, val] of Object.entries(PADRAO.GC)) chkP[k].checked = val;
  perfil.addEventListener('change', atualizarPerfil); atualizarPerfil();

  modal({
    titulo: novo ? 'Novo usuário' : `Editar ${v.nome}`, tamanho: 'grande',
    conteudo: h('div', { class: 'stack' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'campo' }, h('label', {}, 'Nome *'), nome),
        h('div', { class: 'campo' }, h('label', {}, 'E-mail (login) *'), email, !novo ? h('div', { class: 'ajuda' }, 'O e-mail de login não pode ser alterado.') : null),
        h('div', { class: 'campo' }, h('label', {}, 'Matrícula'), matricula),
        h('div', { class: 'campo' }, h('label', {}, 'Perfil *'), perfil, descPerfil),
        novo ? h('div', { class: 'campo inteiro' }, h('label', {}, 'Senha inicial *'), h('div', { class: 'row' }, h('div', { class: 'grow' }, senha), botao('Gerar outra', { peq: true, onClick: () => { senha.value = gerarSenha(); } })),
          h('div', { class: 'ajuda' }, 'Mínimo 8 caracteres. Envie ao usuário; ele pode trocar em "Minha conta".')) : null),
      notaAdm, blocoG, blocoP),
    acoes: [{ texto: 'Cancelar' }, { texto: novo ? 'Criar usuário' : 'Salvar', tipo: 'primario', onClick: async ({ fechar }) => {
      const reg = {
        nome: nome.value.trim(), matricula: matricula.value.trim() || null, perfil: perfil.value,
        gerencias: perfil.value === 'ADM' ? [] : gers.filter((g) => chkG[g.codigo].checked).map((g) => g.codigo),
        ...Object.fromEntries(PERMS.map(([k]) => [k, perfil.value === 'ADM' ? true : chkP[k].checked])),
      };
      if (!reg.nome) return toast('Informe o nome.', 'aviso');
      if (novo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) return toast('Informe um e-mail válido.', 'aviso');
      if (reg.perfil !== 'ADM' && !reg.gerencias.length && !(await confirmar({ titulo: 'Sem gerências', mensagem: 'O usuário não terá nenhuma gerência e não verá nada no portal. Continuar?' }))) return;
      try {
        if (novo) {
          if (senha.value.length < 8) return toast('A senha precisa ter pelo menos 8 caracteres.', 'aviso');
          const { id } = await funcaoUsuarios({ acao: 'criar', email: email.value.trim().toLowerCase(), senha: senha.value });
          const { error } = await sb.from('usuarios').insert({ id, email: email.value.trim().toLowerCase(), ...reg });
          if (error) throw new Error(msgErro(error));
          fechar(); aoConcluir();
          mostrarCredenciais(email.value.trim().toLowerCase(), senha.value);
        } else {
          const { error } = await sb.from('usuarios').update(reg).eq('id', u.id);
          if (error) throw new Error(msgErro(error));
          fechar(); toast('Usuário atualizado.'); aoConcluir();
        }
      } catch (e) { toast(e.message, 'erro', 8000); }
    } }],
  });
}

function mostrarCredenciais(email, senha) {
  const url = location.origin + location.pathname;
  const texto = `Acesso ao Portal Merchandising\nEndereço: ${url}\nLogin: ${email}\nSenha: ${senha}\n(troque a senha em "Minha conta" no primeiro acesso)`;
  modal({ titulo: 'Usuário pronto', acoes: [
    { texto: 'Copiar dados de acesso', onClick: async () => { try { await navigator.clipboard.writeText(texto); toast('Copiado.'); } catch { toast('Não foi possível copiar; selecione o texto.', 'aviso'); } } },
    { texto: 'Fechar', tipo: 'primario' }],
  conteudo: h('div', { class: 'stack' }, alerta('ok', 'Login criado', 'Envie os dados abaixo ao usuário por um canal seguro.'), h('pre', { class: 'json' }, texto)) });
}

async function redefinirSenha(u) {
  const nova = await pedirTexto({ titulo: `Redefinir senha de ${u.nome}`, rotulo: 'Nova senha', valor: gerarSenha(), ajuda: 'Mínimo 8 caracteres. A troca fica registrada no log.', textoOk: 'Redefinir senha' });
  if (nova === null) return;
  try { await funcaoUsuarios({ acao: 'redefinir_senha', user_id: u.id, senha: nova }); mostrarCredenciais(u.email, nova); }
  catch (e) { toast(e.message, 'erro', 8000); }
}

async function alternar(u, aoConcluir) {
  if (u.ativo && !(await confirmar({ titulo: `Inativar ${u.nome}?`, mensagem: 'O usuário perde o acesso imediatamente. O histórico no log é mantido.', textoOk: 'Inativar', perigo: true }))) return;
  const { error } = await sb.from('usuarios').update({ ativo: !u.ativo }).eq('id', u.id);
  if (error) toast(msgErro(error), 'erro'); else { toast(u.ativo ? 'Usuário inativado.' : 'Usuário reativado.'); aoConcluir(); }
}

async function abaGerencias(el, recarregar) {
  const lista = await consulta(sb.from('gerencias').select('*').order('ativa_merch', { ascending: false }).order('codigo'));
  limpar(el, h('div', { class: 'card' },
    h('div', { class: 'card-h' }, h('div', { class: 'muted small' }, 'Gerências que participam do merchandising aparecem na estrutura (são criadas as posições GC, GM, SM e LM). Gerências novas da base de clientes entram desmarcadas.'),
      h('div', { class: 'spacer' }), botao('Nova gerência', { tipo: 'primario', icone: 'mais', onClick: nova })),
    tabela([
      { titulo: 'Código', render: (g) => h('b', {}, g.codigo) },
      { titulo: 'Nome / descrição', render: (g) => g.nome || h('span', { class: 'muted' }, '—') },
      { titulo: 'Participa do merchandising', render: (g) => (g.ativa_merch ? h('span', { class: 'badge ok' }, 'Sim') : h('span', { class: 'badge cinza' }, 'Não')) },
      { titulo: '', classe: 'right', render: (g) => h('div', { class: 'acoes-linha' },
        botao('Renomear', { peq: true, tipo: 'sutil', icone: 'editar', onClick: async () => {
          const n = await pedirTexto({ titulo: `Nome da ${g.codigo}`, rotulo: 'Nome / descrição (ex.: cidade)', valor: g.nome || '' });
          if (n === null) return;
          const { error } = await sb.from('gerencias').update({ nome: n.trim() || null }).eq('codigo', g.codigo);
          if (error) toast(msgErro(error), 'erro'); else recarregar();
        } }),
        botao(g.ativa_merch ? 'Retirar do merchandising' : 'Incluir no merchandising', { peq: true, onClick: async () => {
          if (g.ativa_merch && !(await confirmar({ titulo: `Retirar ${g.codigo}?`, mensagem: 'A gerência deixa de aparecer na estrutura, pendências e fechamento. As posições e vínculos ficam guardados.', perigo: true, textoOk: 'Retirar' }))) return;
          const { error } = await sb.from('gerencias').update({ ativa_merch: !g.ativa_merch }).eq('codigo', g.codigo);
          if (error) toast(msgErro(error), 'erro'); else { toast('Gerência atualizada. Recarregue a página para atualizar os menus.'); recarregar(); }
        } })) },
    ], lista)));

  async function nova() {
    const cod = await pedirTexto({ titulo: 'Nova gerência', rotulo: 'Código (igual ao da base de clientes, ex.: GC. G4)', obrigatorio: true, textoOk: 'Criar' });
    if (!cod) return;
    const { error } = await sb.from('gerencias').insert({ codigo: cod.trim().toUpperCase(), ativa_merch: true });
    if (error) toast(msgErro(error), 'erro'); else { toast('Gerência criada com as posições de liderança.'); recarregar(); }
  }
}
