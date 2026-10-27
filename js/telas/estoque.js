// Compras, estoque e fornecedores.
// Estoque = compras e ajustes (entradas) menos o que os pedidos aprovados usam (saídas).
// Material conta em m² (a área das peças), produto conta em unidades.
import { lista, achar, gravar, excluir } from '../db.js';
import { num, moeda, m2, emCampo, esc, novoId, agora, semAcento, hoje, diaBR, diaLocal, arred, soDigitos } from '../util.js';
import { redesenhar, ir, aviso, perguntar } from '../nucleo.js';
import { areaPeca, qtdDe } from '../calc.js';

const ic = d => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

// ---------- itens que têm estoque

// Cada item controlado: materiais (m²) e produtos do cadastro (un)
function itensControlados() {
  return [
    ...lista('materiais').map(m => ({ ref: 'materiais', id: m.id, nome: m.nome, un: 'm²', custo: m.custo || 0 })),
    ...lista('catalogo').filter(c => c.tipo === 'produto').map(c => ({ ref: 'catalogo', id: c.id, nome: c.nome, un: 'un', custo: c.custo || 0 })),
  ];
}
const chave = (ref, id) => `${ref}:${id}`;

// Saldo de cada item. As saídas só contam pedidos aprovados a partir do primeiro movimento
// do item, para os pedidos antigos (de antes do controle de estoque) não deixarem o saldo negativo.
export function saldos() {
  const mov = {};
  const pega = k => (mov[k] = mov[k] || { entradas: 0, saidas: 0, desde: null, valorCompras: 0, qtdCompras: 0 });
  for (const c of lista('compras')) {
    for (const it of c.itens || []) {
      if (!it.refId) continue;
      const m = pega(chave(it.ref, it.refId));
      m.entradas += it.qtd || 0;
      if (!m.desde || c.data < m.desde) m.desde = c.data;
      if (c.tipo !== 'ajuste' && it.qtd > 0) { m.valorCompras += (it.qtd || 0) * (it.vUnit || 0); m.qtdCompras += it.qtd || 0; }
    }
  }
  for (const o of lista('orcamentos').filter(x => x.status === 'aprovado')) {
    const dia = diaLocal(o.statusEm || o.criadoEm);
    for (const p of o.pecas) {
      const m = mov[chave('materiais', p.materialId)];
      if (m && m.desde && dia >= m.desde) m.saidas += areaPeca(p) * qtdDe(p);
    }
    for (const it of o.itens) {
      const m = it.catId && mov[chave('catalogo', it.catId)];
      if (m && m.desde && dia >= m.desde) m.saidas += it.qtd || 0;
    }
  }
  return itensControlados().map(i => {
    const m = mov[chave(i.ref, i.id)] || { entradas: 0, saidas: 0, desde: null, valorCompras: 0, qtdCompras: 0 };
    const saldo = m.entradas - m.saidas;
    const custoMedio = m.qtdCompras > 0 ? m.valorCompras / m.qtdCompras : i.custo;
    return { ...i, ...m, saldo, custoMedio, valor: Math.max(0, saldo) * custoMedio, controlado: !!m.desde };
  });
}

const qtdTexto = (v, un) => (un === 'm²' ? m2(v) : `${(Math.round(v * 100) / 100).toLocaleString('pt-BR')} un`);

// ---------- tela Estoque

const filtroEstoque = { ver: 'controlados', texto: '' };

export function telaEstoque() {
  const todos = saldos();
  const controlados = todos.filter(x => x.controlado);
  const t = semAcento(filtroEstoque.texto);
  const itens = (filtroEstoque.ver === 'controlados' ? controlados : todos).filter(x => !t || semAcento(x.nome).includes(t));
  const negativos = controlados.filter(x => x.saldo < -0.0001);
  const kpi = (r, v, d, cls = '') => `<div class="card kpi ${cls}"><small>${r}</small><b>${v}</b><span>${d}</span></div>`;
  return {
    nav: 'estoque', titulo: 'Estoque',
    topo: '<a class="botao primario" href="#/compra/nova">+ Nova compra</a>',
    corpo: `
      <div class="kpis">
        ${kpi('Itens controlados', controlados.length, `de ${todos.length} no cadastro`)}
        ${kpi('Valor em estoque', moeda(controlados.reduce((s, x) => s + x.valor, 0)), 'pelo custo médio das compras')}
        ${kpi('Saldo negativo', negativos.length, negativos.length ? 'confira e ajuste' : 'nenhum item', negativos.length ? 'alerta-kpi' : '')}
      </div>
      <p class="dica esq" style="margin-top:12px">O item passa a ser controlado na primeira compra ou ajuste. A partir daí, cada pedido aprovado
        desconta a área das peças (material) ou a quantidade (produto). Use <b>Ajustar</b> depois de contar o estoque.</p>
      <div class="chips">
        ${[['controlados', 'Controlados'], ['todos', 'Todos os itens']].map(([v, n]) => `<button class="${filtroEstoque.ver === v ? 'ativo' : ''}" data-acao="estoque-ver" data-v="${v}">${n}</button>`).join('')}
      </div>
      <input class="busca" type="search" data-busca="estoque" value="${esc(filtroEstoque.texto)}" placeholder="Buscar item" aria-label="Buscar item do estoque">
      <div id="lista-estoque">${listaEstoque(itens)}</div>`,
  };
}

function listaEstoque(itens) {
  if (!itens.length) {
    return `<div class="card vazio">${filtroEstoque.ver === 'controlados'
      ? 'Nenhum item controlado ainda.<br>Lance uma compra ou toque em “Todos os itens” e use Ajustar para informar o saldo de hoje.'
      : 'Nenhum item encontrado.'}</div>`;
  }
  return `<div class="card tabela-nota"><table>
    <thead><tr><th>Item</th><th class="n">Entradas</th><th class="n">Saídas</th><th class="n">Saldo</th><th class="n">Custo médio</th><th></th></tr></thead>
    <tbody>${itens.map(x => `<tr>
      <td><b>${esc(x.nome)}</b><small>${x.ref === 'materiais' ? 'Material' : 'Produto'}${x.desde ? ` · desde ${diaBR(x.desde)}` : ''}</small></td>
      <td class="n">${x.controlado ? qtdTexto(x.entradas, x.un) : '—'}</td>
      <td class="n">${x.controlado ? qtdTexto(x.saidas, x.un) : '—'}</td>
      <td class="n ${x.saldo < -0.0001 ? 'falta-c' : ''}"><b>${x.controlado ? qtdTexto(x.saldo, x.un) : '—'}</b></td>
      <td class="n">${moeda(x.custoMedio)}<small>por ${x.un}</small></td>
      <td class="n"><button class="pequeno" data-acao="estoque-ajustar" data-ref="${x.ref}" data-id="${x.id}">Ajustar</button></td>
    </tr>`).join('')}</tbody></table></div>`;
}

// ---------- compras

const filtroCompras = { texto: '' };

export function telaCompras() {
  const t = semAcento(filtroCompras.texto);
  // compra aberta e abandonada sem nada preenchido não aparece
  const compras = lista('compras').filter(c => c.tipo !== 'ajuste' && ((c.itens || []).length || c.fornecedorId))
    .filter(c => !t || semAcento(`${c.fornecedorNome} ${c.numeroNota}`).includes(t))
    .sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  const mes = hoje().slice(0, 7);
  const doMes = compras.filter(c => (c.data || '').slice(0, 7) === mes);
  const kpi = (r, v, d) => `<div class="card kpi"><small>${r}</small><b>${v}</b><span>${d}</span></div>`;
  return {
    nav: 'compras', titulo: 'Compras',
    topo: '<a class="botao primario" href="#/compra/nova">+ Nova compra</a>',
    corpo: `
      <div class="kpis">
        ${kpi('Compras no mês', moeda(doMes.reduce((s, c) => s + (c.total || 0), 0)), `${doMes.length} ${doMes.length === 1 ? 'compra' : 'compras'}`)}
        ${kpi('Fornecedores', lista('fornecedores').length, 'cadastrados')}
      </div>
      <input class="busca" type="search" data-busca="compras" value="${esc(filtroCompras.texto)}" placeholder="Buscar por fornecedor ou número da nota" aria-label="Buscar compra" style="margin-top:14px">
      ${compras.map(c => `<a class="card linha-orc" href="#/compra/${c.id}">
          <div class="avatar">${ic('<path d="M3 4h2l2.5 11h11L21 7H6.200"/><circle cx="9" cy="19.500" r="1.400"/><circle cx="17" cy="19.500" r="1.400"/>')}</div>
          <div class="info"><div class="nome">${esc(c.fornecedorNome || 'Sem fornecedor')}</div>
            <div class="det">${diaBR(c.data)}${c.numeroNota ? ` · NF ${esc(c.numeroNota)}` : ''} · ${(c.itens || []).length} ${(c.itens || []).length === 1 ? 'item' : 'itens'}</div></div>
          <div class="valor">${moeda(c.total)}</div></a>`).join('')
        || `<div class="card vazio">${lista('compras').some(c => c.tipo !== 'ajuste') ? 'Nenhuma compra com essa busca.' : 'Nenhuma compra lançada.<br>Toque em “Nova compra” ou importe o XML da nota do fornecedor.'}</div>`}`,
  };
}

const totalCompra = c => arred((c.itens || []).reduce((s, it) => s + (it.qtd || 0) * (it.vUnit || 0), 0));

export function telaCompra(id) {
  if (id === 'nova') {
    const c = gravar('compras', { id: novoId(), tipo: 'compra', data: hoje(), fornecedorId: '', fornecedorNome: '', numeroNota: '', chaveNota: '', obs: '', itens: [], total: 0, atualizarCusto: true, criadoEm: agora() });
    location.replace('#/compra/' + c.id);
    return null;
  }
  const c = achar('compras', id);
  if (!c) return null;
  const fornecedores = lista('fornecedores').sort((a, b) => a.nome.localeCompare(b.nome));
  const opcoesItem = sel => `<option value="">— não controlar no estoque —</option>
    <optgroup label="Materiais (m²)">${lista('materiais').map(m => `<option value="materiais:${m.id}" ${sel === `materiais:${m.id}` ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</optgroup>
    <optgroup label="Produtos (un)">${lista('catalogo').filter(x => x.tipo === 'produto').map(p => `<option value="catalogo:${p.id}" ${sel === `catalogo:${p.id}` ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</optgroup>`;
  return {
    nav: 'compras', titulo: 'Compra', voltar: '#/compras',
    corpo: `
      <div class="card importar-xml">
        <div><b>Importar o XML da nota do fornecedor</b><span>Preenche fornecedor, número, data e itens sozinho.</span></div>
        <label class="botao" for="xml-compra">Escolher XML</label>
        <input id="xml-compra" type="file" accept=".xml,text/xml,application/xml" data-xml-compra hidden>
      </div>
      <div class="card">
        <div class="linha">
          <div style="flex:2 1 220px"><label for="cp-forn">Fornecedor</label>
            <select id="cp-forn" data-compra="fornecedorId">
              <option value="">— escolher —</option>
              ${fornecedores.map(f => `<option value="${f.id}" ${f.id === c.fornecedorId ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}
            </select></div>
          <div><label for="cp-data">Data</label><input id="cp-data" type="date" data-compra="data" value="${c.data}"></div>
          <div><label for="cp-nf">Nº da nota</label><input id="cp-nf" data-compra="numeroNota" value="${esc(c.numeroNota)}" inputmode="numeric"></div>
        </div>
        <p class="nota">Fornecedor novo: cadastre em <a href="#/fornecedores">Cadastros → Fornecedores</a> (ou importe o XML, que cadastra sozinho).</p>
      </div>
      <h2>Itens</h2>
      <div class="card">
        ${(c.itens || []).map((it, i) => `<div class="item-compra">
          <input class="nome-item" aria-label="Descrição" data-ci="${i}" data-prop="nome" value="${esc(it.nome)}" placeholder="Descrição">
          <select aria-label="Item do estoque" data-ci="${i}" data-prop="vinculo">${opcoesItem(it.refId ? `${it.ref}:${it.refId}` : '')}</select>
          <div class="qtd"><input aria-label="Quantidade" inputmode="decimal" data-ci="${i}" data-prop="qtd" value="${it.qtd ? String(it.qtd).replace('.', ',') : ''}" placeholder="Qtd"><span>${it.ref === 'materiais' ? 'm²' : it.ref === 'catalogo' ? 'un' : esc(it.unidade || '')}</span></div>
          <input aria-label="Valor unitário" inputmode="decimal" data-ci="${i}" data-prop="vUnit" value="${emCampo(it.vUnit)}" placeholder="Valor unit.">
          <b id="ci-sub-${i}">${moeda((it.qtd || 0) * (it.vUnit || 0))}</b>
          <button class="perigo" aria-label="Remover item" data-acao="compra-rem-item" data-i="${i}">✕</button>
        </div>`).join('') || '<p class="nota" style="margin:0">Nenhum item. Adicione abaixo ou importe o XML.</p>'}
        <button class="largo tracejado" style="margin-top:10px" data-acao="compra-add-item">+ Adicionar item</button>
        <div class="resumo" style="margin-top:12px"><div class="forte"><span>Total da compra</span><span id="compra-total">${moeda(totalCompra(c))}</span></div></div>
      </div>
      <div class="card">
        <label class="check" style="margin-top:0"><input type="checkbox" data-compra-check="atualizarCusto" ${c.atualizarCusto ? 'checked' : ''}> Atualizar o custo no cadastro com o valor desta compra</label>
        <label for="cp-obs" style="margin-top:10px">Observações</label>
        <input id="cp-obs" data-compra="obs" value="${esc(c.obs)}">
      </div>
      <div class="linha">
        <button class="perigo" data-acao="compra-excluir" data-confirma="Tocar de novo para excluir">Excluir compra</button>
        <button class="primario" data-acao="compra-salvar">Concluir</button>
      </div>`,
  };
}

// Lê o XML da NF-e de compra (com ou sem o protocolo) e preenche a compra
function importarXml(c, texto) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  const tag = (el, nome) => (el.getElementsByTagName(nome)[0] || {}).textContent || '';
  const inf = doc.getElementsByTagName('infNFe')[0];
  if (!inf) throw new Error('Este arquivo não é o XML de uma NF-e.');
  const emit = inf.getElementsByTagName('emit')[0];
  const cnpj = soDigitos(tag(emit, 'CNPJ') || tag(emit, 'CPF'));
  // fornecedor: acha pelo CNPJ ou cadastra
  let f = lista('fornecedores').find(x => soDigitos(x.documento) === cnpj);
  if (!f) {
    const end = emit.getElementsByTagName('enderEmit')[0];
    f = gravar('fornecedores', {
      id: novoId(), nome: tag(emit, 'xFant') || tag(emit, 'xNome'), razao: tag(emit, 'xNome'), documento: cnpj, ie: tag(emit, 'IE'),
      telefone: end ? tag(end, 'fone') : '', email: '', cidade: end ? `${tag(end, 'xMun')}/${tag(end, 'UF')}` : '', obs: '', criadoEm: agora(),
    });
  }
  const controlados = itensControlados();
  const parecido = nome => {
    const n = semAcento(nome);
    return controlados.find(x => n.includes(semAcento(x.nome)) || semAcento(x.nome).includes(n));
  };
  const itens = [...inf.getElementsByTagName('det')].map(det => {
    const p = det.getElementsByTagName('prod')[0];
    const nome = tag(p, 'xProd'), un = tag(p, 'uCom');
    const achado = parecido(nome);
    return { id: novoId(), nome, unidade: un, qtd: num(tag(p, 'qCom')), vUnit: num(tag(p, 'vUnCom')), ref: achado ? achado.ref : null, refId: achado ? achado.id : null };
  });
  Object.assign(c, {
    fornecedorId: f.id, fornecedorNome: f.nome, numeroNota: tag(inf.getElementsByTagName('ide')[0], 'nNF'),
    data: (tag(inf.getElementsByTagName('ide')[0], 'dhEmi') || hoje()).slice(0, 10), chaveNota: (inf.getAttribute('Id') || '').replace(/^NFe/, ''),
    itens: [...(c.itens || []), ...itens],
  });
  c.total = totalCompra(c);
  gravar('compras', c);
  return itens;
}

// ---------- fornecedores

const filtroForn = { texto: '' };

export function telaFornecedores() {
  const t = semAcento(filtroForn.texto);
  const compras = lista('compras');
  const fs = lista('fornecedores').filter(f => f.nome || f.documento).filter(f => !t || semAcento(`${f.nome} ${f.documento}`).includes(t)).sort((a, b) => a.nome.localeCompare(b.nome));
  return {
    nav: 'fornecedores', titulo: 'Fornecedores',
    topo: '<a class="botao primario" href="#/fornecedor/novo">+ Novo fornecedor</a>',
    corpo: `
      <input class="busca" type="search" data-busca="forn" value="${esc(filtroForn.texto)}" placeholder="Buscar por nome ou CNPJ" aria-label="Buscar fornecedor">
      ${fs.map(f => {
        const n = compras.filter(c => c.fornecedorId === f.id && c.tipo !== 'ajuste').length;
        return `<a class="card linha-orc" href="#/fornecedor/${f.id}">
          <div class="avatar">${esc((f.nome || '?').trim().charAt(0).toUpperCase())}</div>
          <div class="info"><div class="nome">${esc(f.nome)}</div><div class="det">${esc([f.documento, f.cidade, f.telefone].filter(Boolean).join(' · ') || 'sem dados')}</div></div>
          <div class="det">${n} ${n === 1 ? 'compra' : 'compras'}</div></a>`;
      }).join('') || `<div class="card vazio">${lista('fornecedores').length ? 'Nenhum fornecedor com essa busca.' : 'Nenhum fornecedor cadastrado.<br>Ao importar o XML de uma compra, o fornecedor é cadastrado sozinho.'}</div>`}`,
  };
}

export function telaFornecedor(id) {
  if (id === 'novo') {
    const f = gravar('fornecedores', { id: novoId(), nome: '', razao: '', documento: '', ie: '', telefone: '', email: '', cidade: '', obs: '', criadoEm: agora() });
    location.replace('#/fornecedor/' + f.id);
    return null;
  }
  const f = achar('fornecedores', id);
  if (!f) return null;
  const campo = (prop, rotulo, extra = '', estilo = '') => `<div ${estilo}><label for="fo-${prop}">${rotulo}</label>
    <input id="fo-${prop}" data-cad="fornecedores" data-id="${f.id}" data-prop="${prop}" value="${esc(f[prop] || '')}" autocomplete="off" ${extra}></div>`;
  const compras = lista('compras').filter(c => c.fornecedorId === f.id && c.tipo !== 'ajuste').sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  return {
    nav: 'fornecedores', titulo: esc(f.nome) || 'Fornecedor', voltar: '#/fornecedores',
    corpo: `
      <div class="card">
        <div class="linha">${campo('nome', 'Nome', '', 'style="flex:2 1 220px"')}${campo('documento', 'CNPJ ou CPF', 'inputmode="numeric"')}</div>
        <div class="linha">${campo('razao', 'Razão social', '', 'style="flex:2 1 220px"')}${campo('ie', 'Inscrição estadual')}</div>
        <div class="linha">${campo('telefone', 'Telefone', 'inputmode="tel"')}${campo('email', 'E-mail', 'type="email"')}${campo('cidade', 'Cidade/UF')}</div>
        <div class="linha">${campo('obs', 'Observações (o que fornece, prazo, contato)', '', 'style="flex:1 1 100%"')}</div>
      </div>
      <h2>Compras deste fornecedor</h2>
      ${compras.map(c => `<a class="card linha-orc" href="#/compra/${c.id}"><div class="info"><div class="nome">${diaBR(c.data)}${c.numeroNota ? ` · NF ${esc(c.numeroNota)}` : ''}</div>
        <div class="det">${(c.itens || []).length} itens</div></div><div class="valor">${moeda(c.total)}</div></a>`).join('') || '<div class="card vazio">Nenhuma compra.</div>'}
      <button class="perigo" style="margin-top:12px" data-acao="forn-excluir" data-id="${f.id}" data-confirma="Tocar de novo para excluir">Excluir fornecedor</button>`,
  };
}

// ---------- eventos

const compraDaTela = () => (location.hash.startsWith('#/compra/') ? achar('compras', location.hash.split('/')[2]) : null);

export function entrada(el) {
  if (el.dataset.busca === 'estoque') {
    filtroEstoque.texto = el.value;
    const todos = saldos();
    const t = semAcento(el.value);
    document.getElementById('lista-estoque').innerHTML = listaEstoque((filtroEstoque.ver === 'controlados' ? todos.filter(x => x.controlado) : todos).filter(x => !t || semAcento(x.nome).includes(t)));
    return;
  }
  if (el.dataset.busca === 'compras' || el.dataset.busca === 'forn') {
    (el.dataset.busca === 'compras' ? filtroCompras : filtroForn).texto = el.value;
    const pos = el.selectionStart;
    redesenhar();
    const novo = document.querySelector(`[data-busca="${el.dataset.busca}"]`);
    if (novo) { novo.focus(); novo.setSelectionRange(pos, pos); }
    return;
  }
  const c = compraDaTela();
  if (!c) return;
  if (el.dataset.compra) {
    const k = el.dataset.compra;
    if (k === 'data' && !el.value) return;
    c[k] = el.value;
    if (k === 'fornecedorId') c.fornecedorNome = el.value ? achar('fornecedores', el.value).nome : '';
    gravar('compras', c);
  } else if (el.dataset.ci) {
    const it = c.itens[+el.dataset.ci], prop = el.dataset.prop;
    if (prop === 'vinculo') {
      const [ref, refId] = el.value.split(':');
      Object.assign(it, { ref: ref || null, refId: refId || null });
      gravar('compras', c);
      redesenhar();
      return;
    }
    it[prop] = prop === 'nome' ? el.value : num(el.value);
    c.total = totalCompra(c);
    gravar('compras', c);
    const sub = document.getElementById('ci-sub-' + el.dataset.ci);
    if (sub) sub.textContent = moeda((it.qtd || 0) * (it.vUnit || 0));
    document.getElementById('compra-total').textContent = moeda(c.total);
  }
}

export function mudanca(el) {
  const c = compraDaTela();
  if (c && el.dataset.compraCheck) {
    c[el.dataset.compraCheck] = el.checked;
    gravar('compras', c);
  }
  if (c && 'xmlCompra' in el.dataset && el.files[0]) {
    el.files[0].text().then(texto => {
      const itens = importarXml(c, texto);
      const semVinculo = itens.filter(i => !i.refId).length;
      aviso(`${itens.length} ${itens.length === 1 ? 'item importado' : 'itens importados'}${semVinculo ? `. Escolha o item do estoque de ${semVinculo}.` : '.'}`);
      redesenhar();
    }).catch(e => aviso(e.message || 'Não foi possível ler o XML.'));
  }
}

export const acoes = {
  'estoque-ver': el => { filtroEstoque.ver = el.dataset.v; redesenhar(); },
  'estoque-ajustar': async el => {
    const x = saldos().find(s => s.ref === el.dataset.ref && s.id === el.dataset.id);
    if (!x) return;
    const r = await perguntar({
      titulo: `Ajustar estoque: ${esc(x.nome)}`,
      corpo: `<p>Saldo no sistema: <b>${x.controlado ? qtdTexto(x.saldo, x.un) : 'não controlado ainda'}</b>. Informe quanto existe de verdade hoje.</p>
        <label for="aj-qtd">Quantidade contada (${x.un})</label><input id="aj-qtd" inputmode="decimal" value="${x.controlado ? String(arred(x.saldo)).replace('.', ',') : ''}">`,
      sim: 'Ajustar', nao: 'Cancelar',
      ler: d => d.querySelector('#aj-qtd').value,
    });
    if (r === false || r === '' || r == null) return;
    const contado = num(r), dif = arred(contado - (x.controlado ? x.saldo : 0));
    if (!dif && x.controlado) { aviso('O saldo já está certo.'); return; }
    gravar('compras', {
      id: novoId(), tipo: 'ajuste', data: hoje(), fornecedorId: '', fornecedorNome: 'Ajuste de estoque', numeroNota: '', obs: 'Contagem de estoque',
      itens: [{ id: novoId(), nome: x.nome, ref: x.ref, refId: x.id, qtd: dif, vUnit: 0 }], total: 0, criadoEm: agora(),
    });
    aviso(`Estoque de ${x.nome}: ${qtdTexto(contado, x.un)}.`);
    redesenhar();
  },
  'compra-add-item': () => {
    const c = compraDaTela();
    c.itens.push({ id: novoId(), nome: '', unidade: '', qtd: 1, vUnit: 0, ref: null, refId: null });
    gravar('compras', c);
    redesenhar();
  },
  'compra-rem-item': el => {
    const c = compraDaTela();
    c.itens.splice(+el.dataset.i, 1);
    c.total = totalCompra(c);
    gravar('compras', c);
    redesenhar();
  },
  'compra-salvar': () => {
    const c = compraDaTela();
    c.total = totalCompra(c);
    gravar('compras', c);
    // custo novo no cadastro: material por m², produto por unidade
    if (c.atualizarCusto) {
      for (const it of c.itens) {
        const reg = it.refId && achar(it.ref, it.refId);
        if (reg && it.vUnit > 0 && Math.abs((reg.custo || 0) - it.vUnit) > 0.004) { reg.custo = arred(it.vUnit); gravar(it.ref, reg); }
      }
    }
    aviso('Compra lançada.');
    ir('#/compras');
  },
  'compra-excluir': () => { excluir('compras', compraDaTela().id); aviso('Compra excluída.'); ir('#/compras'); },
  'forn-excluir': el => { excluir('fornecedores', el.dataset.id); aviso('Fornecedor excluído.'); ir('#/fornecedores'); },
};
