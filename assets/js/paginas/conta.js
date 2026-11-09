import { h, botao, toast, alerta } from '../ui.js';
import { sb, estado, registrarEvento, msgErro } from '../api.js';
import { cabecalho } from './comum.js';

const PERFIS = { ADM: 'Administração de Vendas', GC: 'Gerente Comercial', GM: 'Gerente de Merchandising', SM: 'Supervisor de Merchandising', LM: 'Líder de Merchandising', IM: 'Inteligência de Mercado' };

export async function render(el) {
  const u = estado.usuario;
  const s1 = h('input', { type: 'password', autocomplete: 'new-password' });
  const s2 = h('input', { type: 'password', autocomplete: 'new-password' });
  const linha = (r, v) => h('div', { class: 'campo' }, h('label', {}, r), h('div', {}, v));
  const pode = (b) => (u.perfil === 'ADM' || b ? h('span', { class: 'badge ok' }, 'Sim') : h('span', { class: 'badge cinza' }, 'Não'));
  el.append(cabecalho('Minha conta'),
    h('div', { class: 'grid g2' },
      h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', {}, 'Meus dados e acessos')),
        h('div', { class: 'card-b stack' },
          linha('Nome', u.nome), linha('E-mail', u.email), linha('Perfil', PERFIS[u.perfil]),
          linha('Gerências', u.perfil === 'ADM' || u.perfil === 'IM' ? 'Todas' : (u.gerencias.join(', ') || 'Nenhuma')),
          h('div', { class: 'form-grid' },
            linha('Alterar estrutura', pode(u.pode_editar_estrutura)), linha('Ver clientes das rotas', pode(u.pode_ver_clientes || u.pode_editar_clientes)),
            linha('Alterar dias de visita', pode(u.pode_editar_dias || u.pode_editar_clientes)), linha('Alterar clientes das rotas', pode(u.pode_editar_clientes)), linha('Baixar fechamentos', pode(u.pode_fechamento))),
          u.perfil === 'IM' ? alerta('info', null, 'Perfil de consulta: você vê a estrutura e os clientes das rotas de todas as gerências e baixa os fechamentos mensais, sem alterar nada. Para mudar seus acessos, fale com a Administração de Vendas.') :
          u.perfil !== 'ADM' ? alerta('info', null, 'Você altera apenas os níveis abaixo do seu perfil, nas gerências acima. Para mudar seus acessos, fale com a Administração de Vendas.') : null)),
      h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', {}, 'Trocar senha')),
        h('div', { class: 'card-b stack' },
          h('div', { class: 'campo' }, h('label', {}, 'Nova senha'), s1, h('div', { class: 'ajuda' }, 'Mínimo 8 caracteres, com letras e números.')),
          h('div', { class: 'campo' }, h('label', {}, 'Repita a nova senha'), s2),
          h('div', { class: 'row' }, botao('Salvar nova senha', { tipo: 'primario', onClick: async (e) => {
            if (s1.value.length < 8 || !/\d/.test(s1.value) || !/[a-z]/i.test(s1.value)) return toast('A senha precisa ter 8+ caracteres, com letras e números.', 'aviso');
            if (s1.value !== s2.value) return toast('As senhas não conferem.', 'aviso');
            const b = e.currentTarget; b.disabled = true;
            const { error } = await sb.auth.updateUser({ password: s1.value });
            b.disabled = false;
            if (error) return toast(msgErro(error), 'erro');
            s1.value = ''; s2.value = '';
            registrarEvento('SENHA_ALTERADA', `${u.nome} alterou a própria senha`, u.email);
            toast('Senha alterada.');
          } }))))));
}
