// Folhas do orçamento: a do cliente (detalhada ou resumida), a de corte e a interna
import { achar, gravar, config } from '../db.js';
import { moeda, m2, pct, medida, esc, dataBR } from '../util.js';
import { redesenhar, ir, aviso } from '../nucleo.js';
import { desenho, desenhosCorte } from '../desenho.js';
import {
  GRUPOS, areaPeca, valorMaterial, maoObraDe, percMaoObra, valorPeca, custoPedra, qtdDe,
  totalPecas, totalItens, custoItens, totalGeral, resultado, descBordas, partesDaPeca,
} from '../calc.js';
import { nomeCliente } from './orcamento.js';
import { logo } from '../marca.js';

const orcDaTela = () => achar('orcamentos', location.hash.split('/')[2]);
const botaoImprimir = '<button class="primario" data-acao="imprimir">Imprimir / PDF</button>';

// Lista de produtos ou serviços, com ou sem valores
function listaItens(o, tipo, comValor) {
  const itens = o.itens.filter(it => it.tipo === tipo);
  if (!itens.length) return '';
  return `<div class="grupo-itens"><b>${GRUPOS[tipo].varios}</b>
    ${itens.map(it => `<div><span>${it.qtd} × ${esc(it.nome)}</span>${comValor ? `<span>${moeda(it.preco * it.qtd)}</span>` : ''}</div>`).join('')}</div>`;
}

function cabecalhoEmpresa(o) {
  const cfg = config();
  const contato = [cfg.telefone, cfg.endereco, cfg.documento].filter(Boolean).map(esc).join(' · ');
  const c = o.clienteId ? achar('clientes', o.clienteId) : null;
  return `
    <div class="folha-topo">
      <div class="folha-marca">
        ${logo('folha')}
        <div><h1>${esc(cfg.empresa)}</h1>${contato ? `<div class="sub">${contato}</div>` : ''}</div>
      </div>
      <div class="folha-num">
        <small>Orçamento</small>
        <b>${esc(o.numero)}</b>
        <span>${dataBR(o.criadoEm)} · válido por ${o.validadeDias || cfg.validadeDias} dias</span>
      </div>
    </div>
    <div class="folha-cliente">
      <small>Cliente</small>
      <b>${esc(nomeCliente(o))}</b>
      ${c && (c.telefone || c.endereco) ? `<span>${[c.telefone, c.endereco].filter(Boolean).map(esc).join(' · ')}</span>` : ''}
    </div>`;
}

// Cabeçalho menor das folhas de uso interno
const cabecalhoInterno = (o, titulo, nota) => `
  <div class="card folha cab-corte">
    <div class="folha-marca">
      ${logo('folha')}
      <div><h1>${titulo}</h1>
        <div class="sub">Orçamento ${esc(o.numero)} · ${esc(nomeCliente(o))} · ${dataBR(o.criadoEm)} · ${nota}</div></div>
    </div>
  </div>`;

// ---------- orçamento do cliente

export function telaCliente(id) {
  const o = achar('orcamentos', id);
  if (!o) return null;
  const resumido = o.modoCliente === 'resumido';
  const detalhes = `
    ${o.pecas.map(p => `
      <div class="item">
        <div class="mini">${desenho(p, { largura: 260 })}</div>
        <div class="txt">
          <b>${qtdDe(p) > 1 ? qtdDe(p) + ' × ' : ''}${esc(p.nome)}</b><br>
          ${esc(p.materialNome)}<br>
          Tampo: ${medida(p.comp)} × ${medida(p.larg)} cm<br>
          ${descBordas(p).map(d => esc(d) + '<br>').join('')}
          Área: ${m2(areaPeca(p) * qtdDe(p))}<br>
          <b>${moeda(valorPeca(p))}</b>
        </div>
      </div>`).join('')}
    ${o.itens.length ? `<div class="item" style="display:block">${listaItens(o, 'produto', true)}${listaItens(o, 'servico', true)}</div>` : ''}
    <div class="resumo linha-topo">
      <div><span>Pedras</span><span>${moeda(totalPecas(o))}</span></div>
      ${totalItens(o, 'produto') ? `<div><span>Produtos</span><span>${moeda(totalItens(o, 'produto'))}</span></div>` : ''}
      ${totalItens(o, 'servico') ? `<div><span>Serviços</span><span>${moeda(totalItens(o, 'servico'))}</span></div>` : ''}`;
  // resumido: o que está incluso, sem desenho e sem valor por item
  const resumo = `
    <div class="item" style="display:block">
      ${o.pecas.length ? `<div class="grupo-itens"><b>Pedras</b>
        ${o.pecas.map(p => `<div><span>${qtdDe(p)} × ${esc(p.nome)} — ${esc(p.materialNome)}, ${medida(p.comp)} × ${medida(p.larg)} cm</span></div>`).join('')}</div>` : ''}
      ${listaItens(o, 'produto')}${listaItens(o, 'servico')}
    </div>
    <div class="resumo linha-topo">`;
  return {
    nav: 'orcamentos', titulo: 'Orçamento do cliente', voltar: `#/o/${id}`, classe: 'folha-a4', depois: imprimirSePedido,
    topo: `<button data-acao="enviar-orc" data-id="${o.id}">Enviar</button>${botaoImprimir}`,
    corpo: `
      <div class="card nao-imprime">
        <label>Como enviar ao cliente</label>
        <div class="seg">
          <button class="${resumido ? '' : 'ativo'}" data-acao="modo-cliente" data-modo="detalhado">Detalhado</button>
          <button class="${resumido ? 'ativo' : ''}" data-acao="modo-cliente" data-modo="resumido">Resumido</button>
        </div>
      </div>
      <div class="card folha">
        ${cabecalhoEmpresa(o)}
        ${resumido ? resumo : detalhes}
          ${o.frete ? `<div><span>Frete / instalação</span><span>${moeda(o.frete)}</span></div>` : ''}
          ${o.desconto ? `<div><span>Desconto</span><span>− ${moeda(o.desconto)}</span></div>` : ''}
          <div class="forte total-faixa"><span>Total</span><span>${moeda(totalGeral(o))}</span></div>
        </div>
        ${o.obs ? `<p class="obs"><b>Observações:</b> ${esc(o.obs).replace(/\n/g, '<br>')}</p>` : ''}
      </div>`,
  };
}

// ---------- folha de corte

function resumoCorte(o) {
  let linhas = '';
  const porMaterial = {};
  for (const p of o.pecas) (porMaterial[p.materialNome] = porMaterial[p.materialNome] || []).push(p);
  for (const nome of Object.keys(porMaterial)) {
    let area = 0;
    linhas += `<tr class="grupo"><td colspan="4">${esc(nome)}</td></tr>`;
    for (const p of porMaterial[nome]) {
      for (const pt of partesDaPeca(p)) {
        const q = qtdDe(p), a = pt.w * pt.h * q / 10000;
        area += a;
        linhas += `<tr><td class="n">${q}</td><td>${esc(p.nome)} · ${esc(pt.nome.toLowerCase())}</td>
          <td class="n">${medida(pt.w)} × ${medida(pt.h)}</td><td class="n">${m2(a)}</td></tr>`;
      }
    }
    linhas += `<tr class="soma"><td></td><td>Total do material</td><td></td><td class="n">${m2(area)}</td></tr>`;
  }
  return `<table class="tabela">
    <tr><th class="n">Qtd</th><th>Parte</th><th class="n">Medida (cm)</th><th class="n">Área</th></tr>
    ${linhas}</table>`;
}

export function telaCorte(id) {
  const o = achar('orcamentos', id);
  if (!o) return null;
  const comResumo = o.imprimirResumo !== false;
  return {
    nav: 'orcamentos', titulo: 'Folha de corte', voltar: `#/o/${id}`, topo: botaoImprimir.replace(' / PDF', ''), classe: 'folha-a4',
    corpo: `
      <div class="card nao-imprime">
        <label class="check"><input type="checkbox" data-opcao="imprimirResumo" ${comResumo ? 'checked' : ''}> Imprimir o resumo junto com os desenhos</label>
      </div>
      ${cabecalhoInterno(o, 'Folha de corte', 'medidas em cm')}
      ${o.pecas.length ? '' : '<div class="card vazio">Este orçamento ainda não tem pedras.</div>'}
      <div class="grade-corte">
        ${o.pecas.map(p => `
          <div class="card">
            <div class="peca-t">${qtdDe(p) > 1 ? qtdDe(p) + ' × ' : ''}${esc(p.nome)}<small>${esc(p.materialNome)}</small></div>
            <div class="partes">${desenhosCorte(p)}</div>
          </div>`).join('')}
      </div>
      ${o.itens.length ? `<h2>Produtos e serviços</h2>
        <div class="card">${listaItens(o, 'servico')}${listaItens(o, 'produto')}</div>` : ''}
      ${o.obs ? `<h2>Observações</h2><div class="card">${esc(o.obs).replace(/\n/g, '<br>')}</div>` : ''}
      <div id="resumo-corte" class="${comResumo ? '' : 'nao-imprime fora'}">
        <h2>Resumo</h2>
        <div class="card rola">${resumoCorte(o)}</div>
      </div>`,
  };
}

// ---------- folha interna: custos, mão de obra e lucro. Só para a marmoraria.

export function telaInterna(id) {
  const o = achar('orcamentos', id);
  if (!o) return null;
  const r = resultado(o);
  const linha = (nome, valor, cls = '') => `<div class="${cls}"><span>${nome}</span><span>${valor}</span></div>`;
  return {
    nav: 'orcamentos', titulo: 'Financeiro', voltar: `#/o/${id}`, topo: botaoImprimir.replace(' / PDF', ''), classe: 'folha-a4',
    corpo: `
      ${cabecalhoInterno(o, 'Financeiro — custos e lucro', 'uso da marmoraria, não enviar ao cliente')}
      ${o.pecas.length ? `<h2>Pedras</h2>
      <div class="card rola"><table class="tabela">
        <tr><th>Peça</th><th class="n">Área</th><th class="n">Custo da pedra</th><th class="n">Venda da pedra</th><th class="n">Mão de obra</th><th class="n">Lucro</th></tr>
        ${o.pecas.map(p => {
          const q = qtdDe(p), custo = custoPedra(p), venda = valorMaterial(p) * q, mo = maoObraDe(p) * q;
          return `<tr><td>${q > 1 ? q + ' × ' : ''}${esc(p.nome)}</td><td class="n">${m2(areaPeca(p) * q)}</td><td class="n">${moeda(custo)}</td>
            <td class="n">${moeda(venda)}</td><td class="n">${moeda(mo)} (${pct(percMaoObra(p))})</td><td class="n">${moeda(venda + mo - custo)}</td></tr>`;
        }).join('')}
        <tr class="soma"><td>Total</td><td></td><td class="n">${moeda(r.custoPedras)}</td><td class="n">${moeda(r.vendaPedras)}</td><td class="n">${moeda(r.maoObra)}</td><td class="n">${moeda(r.vendaPedras + r.maoObra - r.custoPedras)}</td></tr>
      </table></div>` : ''}
      ${o.itens.length ? `<h2>Produtos e serviços</h2>
      <div class="card rola"><table class="tabela">
        <tr><th class="n">Qtd</th><th>Item</th><th class="n">Custo</th><th class="n">Venda</th><th class="n">Lucro</th></tr>
        ${['produto', 'servico'].map(tipo => o.itens.filter(it => it.tipo === tipo).map(it => {
          const custo = (it.custo || 0) * it.qtd, venda = it.preco * it.qtd;
          return `<tr><td class="n">${it.qtd}</td><td>${esc(it.nome)} <small>(${GRUPOS[tipo].um})</small></td><td class="n">${moeda(custo)}</td><td class="n">${moeda(venda)}</td><td class="n">${moeda(venda - custo)}</td></tr>`;
        }).join('')).join('')}
        <tr class="soma"><td></td><td>Total</td><td class="n">${moeda(custoItens(o))}</td><td class="n">${moeda(totalItens(o))}</td><td class="n">${moeda(totalItens(o) - custoItens(o))}</td></tr>
      </table></div>` : ''}
      <h2>Resultado do orçamento</h2>
      <div class="card resumo">
        ${linha('Venda das pedras', moeda(r.vendaPedras))}
        ${linha('Mão de obra', moeda(r.maoObra))}
        ${linha('Produtos', moeda(totalItens(o, 'produto')))}
        ${linha('Serviços', moeda(totalItens(o, 'servico')))}
        ${o.frete ? linha('Frete / instalação', moeda(o.frete)) : ''}
        ${o.desconto ? linha('Desconto', '− ' + moeda(o.desconto)) : ''}
        ${linha('<b>Total cobrado do cliente</b>', '<b>' + moeda(r.total) + '</b>')}
        ${linha('Custo das pedras', '− ' + moeda(r.custoPedras))}
        ${linha('Custo dos produtos', '− ' + moeda(custoItens(o, 'produto')))}
        ${custoItens(o, 'servico') ? linha('Custo dos serviços', '− ' + moeda(custoItens(o, 'servico'))) : ''}
        ${linha('Lucro bruto', moeda(r.lucro), 'forte')}
        ${linha('Margem sobre o total cobrado', r.total > 0 ? pct(r.margem) : '—')}
      </div>
      <p class="dica" style="text-align:left">O lucro bruto é o total cobrado menos o custo das pedras, dos produtos e dos serviços. A mão de obra entra inteira como receita; salários e despesas da oficina não estão descontados.</p>`,
  };
}

export function entrada(el) {
  if (!el.dataset.opcao) return;
  const o = orcDaTela();
  if (!o) return;
  o[el.dataset.opcao] = el.checked;
  gravar('orcamentos', o);
  document.getElementById('resumo-corte').className = el.checked ? '' : 'nao-imprime fora';
}

// Texto do orçamento para mandar pelo WhatsApp (segue a escolha detalhado ou resumido)
function textoOrcamento(o) {
  const cfg = config(), detalhado = o.modoCliente !== 'resumido';
  const L = [`*${cfg.empresa}*`, `Orçamento ${o.numero} · ${dataBR(o.criadoEm)}`, `Cliente: ${nomeCliente(o)}`, ''];
  if (o.pecas.length) {
    L.push('*Pedras*');
    for (const p of o.pecas) {
      L.push(`• ${qtdDe(p)} × ${p.nome} — ${p.materialNome}, ${medida(p.comp)} × ${medida(p.larg)} cm${detalhado ? ` — ${moeda(valorPeca(p))}` : ''}`);
    }
  }
  for (const tipo of ['produto', 'servico']) {
    const itens = o.itens.filter(it => it.tipo === tipo);
    if (!itens.length) continue;
    L.push(`*${GRUPOS[tipo].varios}*`);
    for (const it of itens) L.push(`• ${it.qtd} × ${it.nome}${detalhado ? ` — ${moeda(it.preco * it.qtd)}` : ''}`);
  }
  L.push('');
  if (o.frete) L.push(`Frete / instalação: ${moeda(o.frete)}`);
  if (o.desconto) L.push(`Desconto: − ${moeda(o.desconto)}`);
  L.push(`*Total: ${moeda(totalGeral(o))}*`);
  L.push(`Válido por ${o.validadeDias || cfg.validadeDias} dias.`);
  if (o.obs) L.push('', o.obs);
  if (cfg.telefone) L.push('', `${cfg.empresa} · ${cfg.telefone}`);
  return L.join('\n');
}

// Abre o WhatsApp com o texto pronto (no número do cliente, se houver). Quem envia é o usuário.
function enviarOrcamento(o) {
  const c = o.clienteId ? achar('clientes', o.clienteId) : null;
  let fone = c ? String(c.telefone || '').replace(/\D/g, '') : '';
  if (fone.length === 10 || fone.length === 11) fone = '55' + fone;
  if (fone.length < 12) fone = '';
  const texto = textoOrcamento(o);
  if (!fone && navigator.share) navigator.share({ text: texto }).catch(() => {});
  else window.open(`https://wa.me/${fone}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  if (o.status === 'rascunho') {
    o.status = 'enviado';
    o.statusEm = new Date().toISOString();
    gravar('orcamentos', o);
    aviso('Marcado como enviado.');
    redesenhar();
  }
}

let imprimirAoAbrir = false;
export const imprimirSePedido = () => {
  if (!imprimirAoAbrir) return;
  imprimirAoAbrir = false;
  setTimeout(() => window.print(), 400);   // espera a folha aparecer
};

export const acoes = {
  'enviar-orc': el => { const o = achar('orcamentos', el.dataset.id); if (o) enviarOrcamento(o); },
  'imprimir-orc': el => { imprimirAoAbrir = true; ir(`#/o/${el.dataset.id}/cliente`); },
  'imprimir': () => window.print(),
  'modo-cliente': el => { const o = orcDaTela(); o.modoCliente = el.dataset.modo; gravar('orcamentos', o); redesenhar(); },
};
