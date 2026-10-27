// Tela da nota fiscal do pedido: confere os dados e mostra os impostos calculados pelo regime da empresa.
// A transmissão para a SEFAZ entra quando o serviço emissor for escolhido.
import { achar, gravar } from '../db.js';
import { moeda, esc, pct } from '../util.js';
import { redesenhar } from '../nucleo.js';
import { montarNota, avisosNota, CODIGOS_ICMS, servidorPronto, dadosEmissao, chamarServidor, emitenteNota } from '../fiscal.js';
import { aviso, perguntar } from '../nucleo.js';
import { config } from '../db.js';
import { baixar, imprimirPdf } from '../folha-pdf.js';
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
  const emitida = o.nfe && o.nfe.status !== 'cancelada' ? o.nfe : null;
  const modelo = emitida ? emitida.modelo : (o.nota && o.nota.modelo) || '55';
  const n = montarNota(o, modelo), t = n.t, c = n.cliente, csosn = n.regime.csosn;
  const linhaResumo = (rot, v, forte) => (v || forte ? `<div class="${forte ? 'forte' : ''}"><span>${rot}</span><span>${moeda(v)}</span></div>` : '');
  const endereco = x => [x.logradouro, x.numero, x.complemento, x.bairro, x.cidade && `${x.cidade}/${x.uf}`, x.cep].filter(Boolean).map(esc).join(', ');
  const nomeIcms = cod => (csosn ? CODIGOS_ICMS.csosn : CODIGOS_ICMS.cst)[cod] || cod;
  const avisos = avisosNota(n);
  return {
    nav: 'orcamentos', titulo: `Nota fiscal · ${esc(o.numero)}`, voltar: `#/o/${id}`,
    corpo: `
      ${cartaoEmitida(o)}
      <div class="card" ${emitida ? 'hidden' : ''}>
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

      ${emitida ? '' : n.problemas.length ? `<div class="alerta s-erro"><b>Falta para emitir</b>
        <ul class="lista-notas" style="margin-top:6px">${n.problemas.map(p => `<li>${esc(p.texto)}${LINK[p.onde] ? ` · <a href="${LINK[p.onde]}">abrir</a>` : p.onde === 'pedido' ? ` · <a href="#/o/${id}">abrir o pedido</a>` : ''}</li>`).join('')}</ul></div>`
        : '<div class="alerta s-ok"><b>Dados completos.</b> A nota está pronta para ser emitida.</div>'}
      ${!emitida && o.notaErro ? `<div class="alerta s-erro" style="margin-top:10px"><b>A SEFAZ recusou a última tentativa (${esc(o.notaErro.cStat || '')})</b><br>${esc(o.notaErro.motivo)}
        ${(o.notaErro.detalhes || []).length ? `<ul class="lista-notas">${o.notaErro.detalhes.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}</div>` : ''}
      ${avisos.map(a => `<div class="alerta s-pendente" style="margin-top:10px">${esc(a)}</div>`).join('')}

      <h2>Emitente</h2>
      <div class="card nota-bloco">
        <b>${esc(n.emitente.nome)}</b>
        <span>CNPJ ${esc(n.emitente.doc || '—')} · IE ${esc(n.f.ie || '—')}</span>
        <span>${esc(n.regime.nome)} (CRT ${n.regime.crt}) · ${esc(n.f.natureza)}</span>
        <span>Série ${emitida ? emitida.serie : n.serie} · ${emitida ? `número ${emitida.numero}` : `próximo número ${n.numero}`} · ${(emitida ? emitida.ambiente === 1 : n.f.ambiente === 'producao') ? 'Produção' : 'Homologação (teste)'}</span>
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

      ${emitida ? '' : `<div class="card" style="margin-top:18px">
        <button class="primario largo" data-acao="nota-emitir" ${n.problemas.length || !servidorPronto() ? 'disabled' : ''}>Emitir ${modelo === '65' ? 'NFC-e' : 'NF-e'} nº ${n.numero}</button>
        <p class="nota" style="text-align:center">${!servidorPronto() ? 'Configure o servidor de emissão em <a href="#/fiscal/config">Dados fiscais da empresa</a>.'
          : n.problemas.length ? 'Complete os dados acima para liberar a emissão.' : `Será enviada à SEFAZ em ${n.f.ambiente === 'producao' ? '<b>produção</b> (vale de verdade)' : 'homologação (teste)'}.`}</p>
      </div>`}`,
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
  const emitidas = pedidos.filter(x => x.o.nfe && x.o.nfe.status === 'autorizada');
  const prontos = pedidos.filter(x => !x.n.problemas.length && !emitidas.includes(x));
  const kpi = (rotulo, valor, detalhe) => `<div class="card kpi"><small>${rotulo}</small><b>${valor}</b><span>${detalhe}</span></div>`;
  const f = pedidos.length ? pedidos[0].n.f : null;
  return {
    nav: 'fiscal', titulo: 'Fiscal',
    corpo: `${chips}
      <div class="kpis">
        ${kpi('Notas emitidas', emitidas.length, 'autorizadas')}
        ${kpi('Prontos para emitir', prontos.length, 'com todos os dados')}
        ${kpi('Com pendência', pedidos.length - prontos.length - emitidas.length, 'falta algum dado')}
      </div>
      ${pedidos.length ? `<h2>Pedidos</h2>` + pedidos.map(({ o, n }) => `<a class="card linha-orc" href="#/o/${o.id}/nota">
          <div class="info"><div class="nome">${esc(nomeCliente(o))}</div>
            <div class="det">${esc(o.numero)} · aprovado em ${diaBR(o.statusEm || o.criadoEm)} · ${n.modelo === '65' ? 'NFC-e' : 'NF-e'}</div>
            <div class="det ${o.nfe && o.nfe.status === 'autorizada' ? 'txt-ok' : n.problemas.length ? 'txt-erro' : 'txt-ok'}">${o.nfe && o.nfe.status === 'autorizada' ? `${o.nfe.modelo === '65' ? 'NFC-e' : 'NF-e'} nº ${o.nfe.numero} autorizada${o.nfe.ambiente === 2 ? ' (teste)' : ''}`
              : n.problemas.length ? `Falta: ${esc(n.problemas[0].texto)}${n.problemas.length > 1 ? ` e mais ${n.problemas.length - 1}` : ''}` : 'Pronta para emitir'}</div></div>
          <div class="valor">${moeda(n.t.vNF)}</div></a>`).join('')
        : '<div class="card vazio">Nenhum pedido aprovado ainda.</div>'}
      ${f ? `<p class="nota">Regime: ${esc(n0(pedidos).regime.nome)} · ${f.ambiente === 'producao' ? 'produção' : 'homologação (teste)'}. Altere em <a href="#/fiscal/config">Dados fiscais da empresa</a>.</p>` : ''}`,
  };
}
const n0 = l => l[0].n;

// Nota já emitida: situação, DANFE e cancelamento
function cartaoEmitida(o) {
  const e = o.nfe;
  if (!e) return '';
  const cancelada = e.status === 'cancelada';
  const nome = e.modelo === '65' ? 'NFC-e' : 'NF-e';
  // cancelamento: até 24 horas na NF-e (alguns estados aceitam com multa depois) e 30 minutos na NFC-e
  return `<div class="card nota-emitida ${cancelada ? 'cancelada' : ''}">
    <div class="ped-t"><b>${nome} nº ${e.numero} · série ${e.serie}</b>
      <span class="chip ${cancelada ? 'st-perdido' : 'st-aprovado'}">${cancelada ? 'Cancelada' : 'Autorizada'}${e.ambiente === 2 ? ' · teste' : ''}</span></div>
    <div class="nota-bloco">
      <span>Chave: <code>${e.chave.replace(/(\d{4})(?=\d)/g, '$1 ')}</code></span>
      <span>Protocolo ${esc(e.protocolo)} · ${new Date(e.dataHora).toLocaleString('pt-BR')}</span>
      ${cancelada ? `<span>Cancelada em ${new Date(e.canceladaEm).toLocaleString('pt-BR')}: ${esc(e.justificativa)}</span>` : ''}
    </div>
    <div class="linha" style="margin-top:12px">
      <button class="primario" data-acao="nota-danfe">${e.modelo === '65' ? 'Imprimir DANFE NFC-e' : 'Imprimir DANFE'}</button>
      <button data-acao="nota-xml">Baixar XML</button>
      ${cancelada ? '' : '<button class="perigo" data-acao="nota-cancelar">Cancelar nota</button>'}
    </div>
    ${cancelada ? '<p class="nota">Esta nota foi cancelada. Você pode emitir uma nova abaixo.</p>' : ''}
  </div>`;
}

const pedidoDaNota = () => achar('orcamentos', location.hash.split('/')[2]);
let emitindo = false;

export const acoes = {
  'nota-emitir': async el => {
    const o = pedidoDaNota();
    if (!o || emitindo || (o.nfe && o.nfe.status !== 'cancelada')) return;
    const modelo = (o.nota && o.nota.modelo) || '55';
    const d = dadosEmissao(o, modelo);
    const ok = await perguntar({
      titulo: `Emitir ${modelo === '65' ? 'NFC-e' : 'NF-e'} nº ${d.numero}?`,
      corpo: `<p>${esc(nomeCliente(o))} · ${moeda(d.totais.vNF)}</p>
        <p>${d.ambiente === 1 ? '<b>Ambiente de produção: a nota vale de verdade.</b>' : 'Ambiente de homologação (teste): sem valor fiscal.'}</p>`,
      sim: 'Emitir', nao: 'Cancelar',
    });
    if (!ok) return;
    emitindo = true;
    el.disabled = true;
    el.textContent = 'Enviando para a SEFAZ…';
    try {
      const r = await chamarServidor('emitir', d);
      const cfg = config();
      const f = cfg.fiscal;
      if (r.status === 'autorizada' || r.status === 'denegada') {
        // número usado: a próxima nota vai com o seguinte
        f['proxima' + modelo] = Math.max(f['proxima' + modelo] || 1, d.numero + 1);
        gravar('config', cfg);
      }
      if (r.status === 'autorizada') {
        o.nfe = { modelo, serie: d.serie, numero: d.numero, ambiente: d.ambiente, chave: r.chave, protocolo: r.protocolo, dataHora: r.dataHora, status: 'autorizada', xml: r.xml, valor: d.totais.vNF };
        delete o.notaErro;
        aviso(`Nota nº ${d.numero} autorizada.`);
      } else {
        o.notaErro = { cStat: r.cStat, motivo: (r.status === 'denegada' ? 'Uso denegado. ' : '') + r.motivo, em: new Date().toISOString() };
        aviso('A SEFAZ recusou a nota. Veja o motivo na tela.');
      }
      gravar('orcamentos', o);
    } catch (e) {
      o.notaErro = { cStat: '', motivo: e.message, detalhes: e.detalhes || [], em: new Date().toISOString() };
      gravar('orcamentos', o);
      aviso(e.message);
    }
    emitindo = false;
    redesenhar();
  },
  'nota-danfe': async el => {
    const o = pedidoDaNota();
    el.disabled = true;
    try {
      const pdf = await chamarServidor('danfe', { chave: o.nfe.chave, xml: o.nfe.xml }, true);
      const arquivo = new File([pdf], `${o.nfe.modelo === '65' ? 'NFCe' : 'NFe'}-${o.nfe.numero}.pdf`, { type: 'application/pdf' });
      if (imprimirPdf(arquivo) === 'baixado') aviso('DANFE baixado.');
    } catch (e) { aviso(e.message); }
    el.disabled = false;
  },
  'nota-xml': () => {
    const o = pedidoDaNota();
    baixar(new File([o.nfe.xml], `${o.nfe.chave}-nfe.xml`, { type: 'application/xml' }));
  },
  'nota-cancelar': async () => {
    const o = pedidoDaNota();
    const just = await perguntar({
      titulo: `Cancelar a nota nº ${o.nfe.numero}?`,
      corpo: `<p>O cancelamento é enviado à SEFAZ e não pode ser desfeito. Prazo: 24 horas da emissão na NF-e e 30 minutos na NFC-e.</p>
        <label for="nc-just">Motivo (mínimo 15 letras)</label><textarea id="nc-just" rows="3" placeholder="Ex.: pedido cancelado pelo cliente"></textarea>`,
      sim: 'Cancelar a nota', nao: 'Voltar',
      ler: d => d.querySelector('#nc-just').value.trim(),
    });
    if (!just) return;
    if (just.length < 15) { aviso('Escreva o motivo com pelo menos 15 letras.'); return; }
    try {
      const r = await chamarServidor('cancelar', { chave: o.nfe.chave, protocolo: o.nfe.protocolo, justificativa: just, ambiente: o.nfe.ambiente, emitente: emitenteNota() });
      if (r.status !== 'cancelada') { aviso(`A SEFAZ não cancelou: ${r.motivo}`); return; }
      Object.assign(o.nfe, { status: 'cancelada', canceladaEm: new Date().toISOString(), justificativa: just, protocoloCancelamento: r.protocolo });
      gravar('orcamentos', o);
      aviso('Nota cancelada.');
      redesenhar();
    } catch (e) { aviso(e.message); }
  },
  'fiscal-testar': async el => {
    const caixa = document.getElementById('fiscal-teste');
    el.disabled = true;
    caixa.innerHTML = '<div class="alerta" style="margin-top:10px">Testando…</div>';
    try {
      const f = config().fiscal || {};
      const r = await chamarServidor('status', { emitente: emitenteNota(), ambiente: f.ambiente === 'producao' ? 1 : 2, modelo: '55' });
      caixa.innerHTML = `<div class="alerta ${r.ok ? 's-ok' : 's-pendente'}" style="margin-top:10px">
        <b>${r.ok ? 'Servidor e SEFAZ funcionando.' : 'Servidor respondeu, mas a SEFAZ está com problema.'}</b><br>
        SEFAZ: ${esc(r.cStat)} – ${esc(r.motivo)}<br>Certificado do CNPJ ${esc(r.certificado.cnpj)}, válido até ${r.certificado.validade.split('-').reverse().join('/')}.</div>`;
    } catch (e) {
      caixa.innerHTML = `<div class="alerta s-erro" style="margin-top:10px">${esc(e.message)}</div>`;
    }
    el.disabled = false;
  },
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
