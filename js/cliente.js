// Cadastro completo do cliente: documento e endereço de cobrança.
// É pedido depois que o orçamento vira pedido (aprovado) e serve também para a nota fiscal.
import { gravar } from './db.js';
import { esc, soDigitos, tipoDocumento } from './util.js';
import { aviso } from './nucleo.js';

export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

// O que ainda falta no cadastro para fechar o pedido
export function faltaCliente(c) {
  if (!c) return ['cliente'];
  const f = [];
  if (!String(c.nome || '').trim()) f.push('nome');
  if (soDigitos(c.telefone).length < 10) f.push('telefone');
  const doc = tipoDocumento(c.documento);
  if (!doc) f.push('CPF ou CNPJ'); else if (doc === 'invalido') f.push('CPF ou CNPJ válido');
  if (soDigitos(c.cep).length !== 8) f.push('CEP');
  for (const [k, n] of [['logradouro', 'rua'], ['numero', 'número'], ['bairro', 'bairro'], ['cidade', 'cidade'], ['uf', 'estado']]) {
    if (!String(c[k] || '').trim()) f.push(n);
  }
  return f;
}

export function resumoFalta(c) {
  const f = faltaCliente(c);
  return f.length
    ? `<span class="chip st-enviado">Cadastro incompleto</span><span class="falta">Falta: ${esc(f.join(', '))}</span>`
    : '<span class="chip st-aprovado">Cadastro completo</span>';
}

export function notaDocumento(valor) {
  const t = tipoDocumento(valor);
  return { cpf: '✓ CPF válido', cnpj: '✓ CNPJ válido', invalido: 'Número inválido: confira os dígitos.', '': 'Pessoa física: CPF. Empresa: CNPJ.' }[t];
}

// Campos que editam o cliente direto (data-cad), usados na tela do cliente e no pedido.
// basico = true inclui nome e telefone (no pedido; na tela do cliente eles já estão em cima).
export function camposCliente(c, basico = false) {
  const at = prop => `data-cad="clientes" data-id="${c.id}" data-prop="${prop}" value="${esc(c[prop] || '')}" autocomplete="off"`;
  const campo = (prop, rotulo, extra = '', estilo = '') => `<div ${estilo}><label for="cc-${prop}-${c.id}">${rotulo}</label><input id="cc-${prop}-${c.id}" ${at(prop)} ${extra}></div>`;
  const doc = tipoDocumento(c.documento);
  return `
    ${basico ? `<div class="linha">${campo('nome', 'Nome completo ou razão social', '', 'style="flex:2 1 220px"')}${campo('telefone', 'Telefone / WhatsApp', 'inputmode="tel"')}</div>` : ''}
    <div class="linha">
      <div><label for="cc-documento-${c.id}">CPF ou CNPJ</label><input id="cc-documento-${c.id}" ${at('documento')} inputmode="numeric">
        <div class="nota ${doc === 'invalido' ? 'erro' : ''}" id="doc-nota-${c.id}">${notaDocumento(c.documento)}</div></div>
      ${campo('ie', 'Inscrição estadual', 'placeholder="Só empresa contribuinte"')}
      ${campo('email', 'E-mail', 'type="email" inputmode="email"')}
    </div>
    <div class="linha">
      <div><label for="cc-cep-${c.id}">CEP</label><input id="cc-cep-${c.id}" ${at('cep')} inputmode="numeric" placeholder="00000-000">
        <div class="nota">Com o CEP, rua, bairro e cidade vêm sozinhos.</div></div>
      ${campo('logradouro', 'Rua / avenida', '', 'style="flex:3 1 220px"')}
    </div>
    <div class="linha">
      ${campo('numero', 'Número', 'inputmode="numeric"')}
      ${campo('complemento', 'Complemento')}
      ${campo('bairro', 'Bairro', '', 'style="flex:2 1 160px"')}
    </div>
    <div class="linha">
      ${campo('cidade', 'Cidade', '', 'style="flex:3 1 200px"')}
      <div><label for="cc-uf-${c.id}">Estado</label>
        <select id="cc-uf-${c.id}" data-cad="clientes" data-id="${c.id}" data-prop="uf">
          <option value=""></option>${UFS.map(u => `<option ${c.uf === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select></div>
    </div>`;
}

// Depois de cada alteração no cliente: confere o documento e busca o endereço pelo CEP
export function aoAlterarCliente(c, prop) {
  if (prop === 'documento') {
    const nota = document.getElementById('doc-nota-' + c.id);
    if (nota) { nota.textContent = notaDocumento(c.documento); nota.classList.toggle('erro', tipoDocumento(c.documento) === 'invalido'); }
  }
  if (prop === 'cep') buscarCep(c);
  // cidade digitada à mão: o código do município (da nota) é conferido de novo pelo CEP depois
  if ((prop === 'cidade' || prop === 'uf') && c.ibge) { c.ibge = ''; gravar('clientes', c); }
  const falta = document.getElementById('falta-' + c.id);
  if (falta) falta.innerHTML = resumoFalta(c);
}

// Consulta pública dos Correios (ViaCEP). Devolve null sem internet ou com CEP inexistente.
export async function consultarCep(cep) {
  cep = soDigitos(cep);
  if (cep.length !== 8) return null;
  try {
    const j = await (await fetch(`https://viacep.com.br/ws/${cep}/json/`)).json();
    if (j.erro) { aviso('CEP não encontrado. Digite o endereço.'); return null; }
    return { cep: `${cep.slice(0, 5)}-${cep.slice(5)}`, logradouro: j.logradouro || '', bairro: j.bairro || '', cidade: j.localidade || '', uf: j.uf || '', ibge: j.ibge || '' };
  } catch (e) {
    return null;   // sem internet: o endereço é digitado à mão
  }
}

async function buscarCep(c) {
  const cep = soDigitos(c.cep);
  if (cep.length !== 8 || cep === c.cepBuscado) return;
  const e = await consultarCep(cep);
  if (!e) return;
  {
    c.cepBuscado = cep;
    Object.assign(c, { ...e, logradouro: e.logradouro || c.logradouro || '', bairro: e.bairro || c.bairro || '' });
    gravar('clientes', c);
    for (const prop of ['cep', 'logradouro', 'bairro', 'cidade', 'uf']) {
      const el = document.getElementById(`cc-${prop}-${c.id}`);
      if (el && el !== document.activeElement) el.value = c[prop];
    }
    const falta = document.getElementById('falta-' + c.id);
    if (falta) falta.innerHTML = resumoFalta(c);
    const numero = document.getElementById(`cc-numero-${c.id}`);
    if (numero && !c.numero) numero.focus();
  }
}
