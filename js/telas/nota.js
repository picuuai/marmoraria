// Tela da nota fiscal do pedido: confere os dados e mostra os impostos calculados pelo regime da empresa.
// A transmissão para a SEFAZ entra quando o serviço emissor for escolhido.
import { achar, gravar } from '../db.js';
import { moeda, esc, pct } from '../util.js';
import { redesenhar } from '../nucleo.js';
import { montarNota, avisosNota, CODIGOS_ICMS } from '../fiscal.js';
import { nomeCliente } from './orcamento.js';
import { cartaoFiscal } from './gestao.js';
import { lista } from '../db.js';
import { diaBR } from '../util.js';
import { totalGeral } from '../calc.js';

const LINK = { ajustes: '#/ajustes', cadastros: '#/cadastros/materiais' };

export function telaNota(id) {
  const o = achar('orcamentos', id);
  if (!o) return null;
  if (o.status !== 'aprovado') {
    return { nav: 'orcamentos', titulo: 'Nota fiscal', voltar: `#/o/${id}`, corpo: '<div class="card vazio">A nota fiscal é feita a partir de um orçamento aprovado.</div>' };
  }
  const modelo = (o.nota && o.nota.modelo) || '55';
  const n = montarNota(o, modelo), t = n.t, c = n.cliente, csosn = n.regime.csosn;
  const linhaResumo = (rot, v, forte) => (v || forte ? `<div class="${forte ? 'forte' : ''}"><span>${rot}</span><span>${moeda(v)}</span></div>` : '');
  const endereco = x => [x.logradouro, x.numero, x.complemento, x.bairro, x.cidade && `${x.cidade}/${x.uf}`, x.cep].filter(Boolean).map(esc).join(', ');
  const nomeIcms = cod => (csosn ? CODIGOS_ICMS.csosn : CODIGOS_ICMS.cst)[cod] || cod;
  const avisos = avisosNota(n);
  return {
    nav: 'orcamentos', titulo: `Nota fiscal · ${esc(o.numero)}`, voltar: `#/o/${id}`,
    corpo: `
      <div class="card">
        <label>Modelo</label>
        <div class="seg">
          <button class="${modelo === '55' ? 'ativo' : ''}" data-acao="nota-modelo" data-m="55">NF-e (55) <small>empresa, entrega, outro estado</small></button>
          <button class="${modelo === '65' ? 'ativo' : ''}" data-acao="nota-modelo" data-m="65">NFC-e (65) <small>consumidor final no balcão</small></button>
        </div>
        ${o.frete && modelo === '55' ? `<label style="margin-top:12px">Frete / instalação de ${moeda(o.frete)}</label>
        <div class="seg">
          <button class="${(o.nota && o.nota.frete || 'frete') === 'frete' ? 'ativo' : ''}" data-acao="nota-frete" data-v="frete">Frete, entra na nota</button>
          <button class="${o.nota && o.nota.frete === 'fora' ? 'ativo' : ''}" data-acao="nota-frete" data-v="fora">Instalação, fica fora (NFS-e)</button>
        </div>` : ''}
      </div>

      ${n.problemas.length ? `<div class="alerta s-erro"><b>Falta para emitir</b>
        <ul class="lista-notas" style="margin-top:6px">${n.problemas.map(p => `<li>${esc(p.texto)}${LINK[p.onde] ? ` · <a href="${LINK[p.onde]}">abrir</a>` : p.onde === 'pedido' ? ` · <a href="#/o/${id}">abrir o pedido</a>` : ''}</li>`).join('')}</ul></div>`
        : '<div class="alerta s-ok"><b>Dados completos.</b> A nota está pronta para ser emitida.</div>'}
      ${avisos.map(a => `<div class="alerta s-pendente" style="margin-top:10px">${esc(a)}</div>`).join('')}

      <h2>Emitente</h2>
      <div class="card nota-bloco">
        <b>${esc(n.emitente.nome)}</b>
        <span>CNPJ ${esc(n.emitente.doc || '—')} · IE ${esc(n.f.ie || '—')}</span>
        <span>${esc(n.regime.nome)} (CRT ${n.regime.crt}) · ${esc(n.f.natureza)}</span>
        <span>Série ${n.serie} · próximo número ${n.numero} · ${n.f.ambiente === 'producao' ? 'Produção' : 'Homologação (teste)'}</span>
      </div>

      <h2>Destinatário</h2>
      <div class="card nota-bloco">
        ${c ? `<b>${esc(c.nome)}</b>
          <span>${esc(c.documento || 'sem CPF/CNPJ')}${c.ie ? ` · IE ${esc(c.ie)}` : ''} · ${esc(n.dest.texto)}</span>
          <span>${endereco(c) || 'sem endereço'}</span>
          ${n.interestadual ? `<span>Venda para outro estado (${esc(n.ufEmit)} → ${esc(n.ufDest)})</span>` : ''}`
        : `<span>${modelo === '65' ? 'Consumidor não identificado (permitido na NFC-e)' : esc(nomeCliente(o))}</span>`}
      </div>

      <h2>Itens</h2>
      <div class="card tabela-nota">
        <table>
          <thead><tr><th>Descrição</th><th>NCM</th><th>CFOP</th><th>${csosn ? 'CSOSN' : 'CST'}</th><th class="n">Qtd</th><th class="n">Valor</th><th class="n">ICMS</th>${n.f.ipi ? '<th class="n">IPI</th>' : ''}<th class="n">PIS</th><th class="n">COFINS</th></tr></thead>
          <tbody>${n.itens.map(x => `<tr>
            <td>${esc(x.desc)}</td>
            <td class="${x.ncm ? '' : 'falta-c'}">${esc(x.ncm || 'falta')}</td>
            <td>${esc(x.cfop)}</td>
            <td title="${esc(nomeIcms(x.icmsCod))}">${esc(x.origem)}${esc(x.icmsCod)}</td>
            <td class="n">${x.qtd}</td>
            <td class="n">${moeda(x.valor - x.desconto)}</td>
            <td class="n">${x.vICMS ? `${moeda(x.vICMS)}<small>${pct(x.aliqIcms)}</small>` : x.vCredSN ? `<small>crédito ${moeda(x.vCredSN)}</small>` : '—'}</td>
            ${n.f.ipi ? `<td class="n">${x.vIPI ? moeda(x.vIPI) : '—'}</td>` : ''}
            <td class="n">${x.vPIS ? moeda(x.vPIS) : '—'}</td>
            <td class="n">${x.vCOFINS ? moeda(x.vCOFINS) : '—'}</td>
          </tr>`).join('') || '<tr><td colspan="10">Nenhum item</td></tr>'}</tbody>
        </table>
      </div>
      <p class="nota">Valores por item já com o desconto rateado. ${csosn ? 'No Simples e no MEI o ICMS, o PIS e a COFINS são pagos na guia do DAS e não aparecem destacados.' : ''}</p>

      <h2>Totais</h2>
      <div class="card resumo">
        ${linhaResumo('Produtos', t.vProd, true)}
        ${linhaResumo('Desconto', -t.vDesc)}
        ${linhaResumo('Frete', t.vFrete)}
        ${linhaResumo('IPI', t.vIPI)}
        <div class="forte"><span>Valor da nota</span><span>${moeda(t.vNF)}</span></div>
        ${linhaResumo('Base do ICMS', t.vBC)}
        ${linhaResumo('ICMS', t.vICMS)}
        ${linhaResumo('Crédito de ICMS do Simples', t.vCredSN)}
        ${linhaResumo('PIS', t.vPIS)}
        ${linhaResumo('COFINS', t.vCOFINS)}
        ${linhaResumo('Fora da nota (NFS-e)', n.fora)}
      </div>

      <div class="card" style="margin-top:18px">
        <button class="primario largo" disabled>Emitir nota</button>
        <p class="nota" style="text-align:center">A emissão é ligada quando o serviço emissor e o certificado digital da marmoraria forem configurados.</p>
      </div>`,
  };
}

// ---------- módulo Fiscal: notas dos pedidos e configuração

const ABAS_FISCAL = { notas: 'Notas dos pedidos', config: 'Dados fiscais da empresa' };

export function telaFiscal(aba) {
  if (!ABAS_FISCAL[aba]) return null;
  const chips = `<div class="chips">${Object.keys(ABAS_FISCAL).map(a => `<a class="${a === aba ? 'ativo' : ''}" href="#/fiscal${a === 'notas' ? '' : '/' + a}">${ABAS_FISCAL[a]}</a>`).join('')}</div>`;
  if (aba === 'config') return { nav: 'fiscal', titulo: 'Fiscal', corpo: chips + cartaoFiscal() };
  const pedidos = lista('orcamentos').filter(o => o.status === 'aprovado')
    .sort((a, b) => (b.statusEm || '').localeCompare(a.statusEm || ''))
    .map(o => ({ o, n: montarNota(o, (o.nota && o.nota.modelo) || '55') }));
  const prontos = pedidos.filter(x => !x.n.problemas.length);
  const kpi = (rotulo, valor, detalhe) => `<div class="card kpi"><small>${rotulo}</small><b>${valor}</b><span>${detalhe}</span></div>`;
  const f = pedidos.length ? pedidos[0].n.f : null;
  return {
    nav: 'fiscal', titulo: 'Fiscal',
    corpo: `${chips}
      <div class="kpis">
        ${kpi('Pedidos aprovados', pedidos.length, 'aguardando nota')}
        ${kpi('Prontos para emitir', prontos.length, 'com todos os dados')}
        ${kpi('Com pendência', pedidos.length - prontos.length, 'falta algum dado')}
      </div>
      ${pedidos.length ? `<h2>Pedidos</h2>` + pedidos.map(({ o, n }) => `<a class="card linha-orc" href="#/o/${o.id}/nota">
          <div class="info"><div class="nome">${esc(nomeCliente(o))}</div>
            <div class="det">${esc(o.numero)} · aprovado em ${diaBR(o.statusEm || o.criadoEm)} · ${n.modelo === '65' ? 'NFC-e' : 'NF-e'}</div>
            <div class="det ${n.problemas.length ? 'txt-erro' : 'txt-ok'}">${n.problemas.length ? `Falta: ${esc(n.problemas[0].texto)}${n.problemas.length > 1 ? ` e mais ${n.problemas.length - 1}` : ''}` : 'Pronta para emitir'}</div></div>
          <div class="valor">${moeda(n.t.vNF)}</div></a>`).join('')
        : '<div class="card vazio">Nenhum pedido aprovado ainda.</div>'}
      ${f ? `<p class="nota">Regime: ${esc(n0(pedidos).regime.nome)} · ${f.ambiente === 'producao' ? 'produção' : 'homologação (teste)'}. Altere em <a href="#/fiscal/config">Dados fiscais da empresa</a>.</p>` : ''}`,
  };
}
const n0 = l => l[0].n;

export const acoes = {
  'nota-modelo': el => {
    const o = achar('orcamentos', location.hash.split('/')[2]);
    o.nota = { ...(o.nota || {}), modelo: el.dataset.m };
    gravar('orcamentos', o);
    redesenhar();
  },
  'nota-frete': el => {
    const o = achar('orcamentos', location.hash.split('/')[2]);
    o.nota = { ...(o.nota || {}), frete: el.dataset.v };
    gravar('orcamentos', o);
    redesenhar();
  },
};
