// Conexão com o Supabase, sessão do usuário e regras de permissão na interface.
// (As regras de verdade ficam no banco; aqui só escondemos o que o usuário não pode fazer.)

const cfg = window.PORTAL_CONFIG || {};
export const configurado = !!cfg.SUPABASE_URL && !/COLE_AQUI/.test(cfg.SUPABASE_URL) && !!cfg.SUPABASE_KEY && !/COLE_AQUI/.test(cfg.SUPABASE_KEY);
export const sb = configurado
  ? window.supabase.createClient(cfg.SUPABASE_URL.replace(/\/+$/, ''), cfg.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

export const estado = {
  usuario: null,       // linha da tabela usuarios
  gerencias: [],       // gerências que participam do merchandising e o usuário enxerga
  gerenciaAtual: null,
};

export const RANK = { ADM: 0, GC: 1, GM: 2, SM: 3, LM: 4, RP: 5 };
export const ehAdm = () => estado.usuario?.perfil === 'ADM';
export const veGerencia = (g) => ehAdm() || (estado.usuario?.gerencias || []).includes(g);
export const podeEditarPosicao = (g, nivel) => {
  const u = estado.usuario; if (!u) return false;
  if (u.perfil === 'ADM') return true;
  return u.pode_editar_estrutura && u.gerencias.includes(g) && RANK[nivel] > RANK[u.perfil];
};
export const podeVerClientes = () => ehAdm() || !!(estado.usuario?.pode_ver_clientes || estado.usuario?.pode_editar_clientes || estado.usuario?.pode_editar_dias || estado.usuario?.pode_solicitar_clientes);
export const podeEditarDias = (g) => ehAdm() || (!!(estado.usuario?.pode_editar_clientes || estado.usuario?.pode_editar_dias) && (estado.usuario?.gerencias || []).includes(g));
export const podeEditarClientes = (g) => ehAdm() || (!!estado.usuario?.pode_editar_clientes && (estado.usuario?.gerencias || []).includes(g));
// Pede inclusão/exclusão de clientes (passa pela aprovação da Administração de Vendas).
// Quem altera direto (ADM ou "alterar clientes direto") não precisa pedir.
export const podeSolicitarClientes = (g) => !podeEditarClientes(g) && !!estado.usuario?.pode_solicitar_clientes && (estado.usuario?.gerencias || []).includes(g);
export const usaAprovacoes = () => ehAdm() || !!estado.usuario?.pode_solicitar_clientes;
export const podeFechamento = () => ehAdm() || !!estado.usuario?.pode_fechamento;

// Traduz mensagens técnicas para algo legível.
export function msgErro(e) {
  if (!e) return 'Erro desconhecido.';
  let m = e.message || e.error_description || e.msg || String(e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
  if (/JWT expired|invalid JWT|refresh token/i.test(m)) return 'Sua sessão expirou. Saia e entre novamente.';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/permission denied/i.test(m)) return 'Você não tem permissão para esta ação.';
  if (/statement timeout|canceling statement/i.test(m)) return 'A operação demorou demais e foi cancelada. Tente com menos dados por vez.';
  if (/duplicate key/i.test(m)) return 'Registro duplicado.';
  return m;
}

export async function rpc(nome, args = {}) {
  const { data, error } = await sb.rpc(nome, args);
  if (error) throw new Error(msgErro(error));
  return data;
}

export async function consulta(q) {
  const { data, error, count } = await q;
  if (error) throw new Error(msgErro(error));
  return count !== undefined && count !== null ? { data, count } : data;
}

// Busca todas as linhas de uma consulta, de 1000 em 1000 (limite do Supabase).
export async function buscarTudo(montar, { tamanho = 1000, limite = 200000, aoProgresso } = {}) {
  const out = [];
  for (let de = 0; de < limite; de += tamanho) {
    const { data, error } = await montar().range(de, de + tamanho - 1);
    if (error) throw new Error(msgErro(error));
    out.push(...data);
    aoProgresso && aoProgresso(out.length);
    if (data.length < tamanho) break;
  }
  return out;
}

export async function funcaoUsuarios(corpo) {
  const { data, error } = await sb.functions.invoke('admin-usuarios', { body: corpo });
  if (error) {
    let m = error.message;
    try { const j = await error.context.json(); if (j?.error) m = j.error; } catch { /* sem corpo */ }
    if (/Failed to send|fetch/i.test(m)) m = 'Não foi possível chamar a função "admin-usuarios". Confira se ela foi publicada no Supabase (veja o guia).';
    throw new Error(m);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function carregarUsuario() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { estado.usuario = null; return null; }
  const { data, error } = await sb.from('usuarios').select('*').eq('id', session.user.id).maybeSingle();
  if (error) throw new Error(msgErro(error));
  estado.usuario = data && data.ativo ? data : null;
  if (!estado.usuario) return { semAcesso: true, email: session.user.email };
  const gs = await consulta(sb.from('gerencias').select('codigo, nome, ativa_merch').eq('ativa_merch', true).order('codigo'));
  estado.gerencias = gs.filter((g) => veGerencia(g.codigo));
  let salva = null; try { salva = localStorage.getItem('pm.gerencia'); } catch { /* sem storage */ }
  estado.gerenciaAtual = estado.gerencias.find((g) => g.codigo === salva)?.codigo || estado.gerencias[0]?.codigo || null;
  return estado.usuario;
}

// ---------- Avisos de aprovações (contador do menu) ----------
estado.avisos = { para_aprovar: 0, minhas_pendentes: 0, novas_aprovadas: 0, novas_reprovadas: 0 };
export async function atualizarAvisos() {
  if (!estado.usuario || !usaAprovacoes()) return estado.avisos;
  try {
    const r = await rpc('resumo_solicitacoes');
    const antes = estado.avisos;
    estado.avisos = r;
    window.dispatchEvent(new CustomEvent('avisos', { detail: { antes, agora: r } }));
  } catch { /* não bloqueia */ }
  return estado.avisos;
}

export function definirGerencia(g) {
  estado.gerenciaAtual = g;
  try { localStorage.setItem('pm.gerencia', g); } catch { /* sem storage */ }
}

export async function registrarEvento(acao, descricao, referencia = null) {
  try { await sb.rpc('registrar_evento', { p_acao: acao, p_descricao: descricao, p_referencia: referencia }); } catch { /* não bloqueia */ }
}
