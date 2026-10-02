// Monta o PDF do orçamento do cliente (detalhado ou resumido) e cuida de enviar, baixar e imprimir
import { achar, config } from './db.js';
import { moeda, m2, medida, dataBR } from './util.js';
import { Pdf, LARGURA, ALTURA, medir, quebrar } from './pdf.js';
import {
  LADOS, TIPOS_BORDA, GRUPOS, temFaixa, areaPeca, valorPeca, qtdDe, totalPecas, totalItens, totalGeral, descBordas,
} from './calc.js';

const M = 40, W = LARGURA - 2 * M;               // margem e largura útil
const CINZA = '#5b626b', LINHA = '#d5d1ca', TINTA = '#15191d', OURO = '#b8873a';

const mistura = (hex, alvo, t) => '#' + [1, 3, 5].map(i => {
  const a = parseInt(hex.slice(i, i + 2), 16), b = parseInt(alvo.slice(i, i + 2), 16);
  return Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
}).join('');
const clara = hex => [1, 3, 5].reduce((s, i, k) => s + parseInt(hex.slice(i, i + 2), 16) * [0.299, 0.587, 0.114][k], 0) / 255 > 0.55;
const corValida = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#b9b6b1');
const corDoTema = nome => corValida(getComputedStyle(document.documentElement).getPropertyValue(nome).trim());

// A logo vai para o PDF como JPEG com fundo branco
async function logoJpeg() {
  const dados = config().logo;
  if (!dados) return null;
  const img = new Image();
  img.src = dados;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0);
  const b64 = c.toDataURL('image/jpeg', 0.9).split(',')[1];
  return { bytes: Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)), w: c.width, h: c.height };
}

// Desenho da peça: tampo com as bordas em volta, como na tela. Devolve a altura usada.
function desenharPeca(pdf, p, x, y, largura) {
  if (!(p.comp > 0 && p.larg > 0)) return 0;
  const m = 20, s = Math.min((largura - 2 * m) / p.comp, 72 / p.larg);
  const tw = p.comp * s, th = Math.max(p.larg * s, 16);
  const tx = x + (largura - tw) / 2, ty = y + m;
  const cor = corValida(p.cor), faixa = mistura(cor, '#ffffff', 0.32), traco = '#55514c';
  const letra = c => (clara(c) ? TINTA : '#ffffff');

  pdf.ret(tx, ty, tw, th, { fundo: cor, traco, esp: 0.6 });
  pdf.texto(`${medida(p.comp)} × ${medida(p.larg)} cm`, tx + tw / 2, ty + th / 2 + 2.4, { tam: 7, alinhar: 'centro', cor: letra(cor) });

  for (const lado of Object.keys(LADOS)) {
    const b = p.bordas[lado], lateral = lado === 'esquerda' || lado === 'direita';
    const comprimento = lateral ? th : tw;
    if (temFaixa(b)) {
      const t = Math.min(Math.max(b.altura * s, 9), 16);
      const z = { fundo: [tx, ty - t, tw, t], frente: [tx, ty + th, tw, t], esquerda: [tx - t, ty, t, th], direita: [tx + tw, ty, t, th] }[lado];
      pdf.ret(z[0], z[1], z[2], z[3], { fundo: faixa, traco, esp: 0.6 });
      const nome = `${TIPOS_BORDA[b.tipo]} ${medida(b.altura)}`;
      const txt = medir(nome, 6) + 4 <= comprimento ? nome : medida(b.altura);
      if (lateral) pdf.texto(txt, z[0] + z[2] / 2 + 2.1, z[1] + z[3] / 2, { tam: 6, alinhar: 'centro', giro: true, cor: letra(faixa) });
      else pdf.texto(txt, z[0] + z[2] / 2, z[1] + z[3] / 2 + 2.1, { tam: 6, alinhar: 'centro', cor: letra(faixa) });
    } else if (b.tipo === 'acabamento') {
      const e = { fundo: [tx, ty, tx + tw, ty], frente: [tx, ty + th, tx + tw, ty + th], esquerda: [tx, ty, tx, ty + th], direita: [tx + tw, ty, tx + tw, ty + th] }[lado];
      pdf.linha(e[0], e[1], e[2], e[3], OURO, 2.4);
      if (medir(b.acab, 5.5) + 4 <= comprimento) {
        if (lado === 'fundo') pdf.texto(b.acab, tx + tw / 2, ty - 4, { tam: 5.5, alinhar: 'centro', cor: CINZA });
        if (lado === 'frente') pdf.texto(b.acab, tx + tw / 2, ty + th + 8.5, { tam: 5.5, alinhar: 'centro', cor: CINZA });
        if (lado === 'esquerda') pdf.texto(b.acab, tx - 4, ty + th / 2, { tam: 5.5, alinhar: 'centro', giro: true, cor: CINZA });
        if (lado === 'direita') pdf.texto(b.acab, tx + tw + 8.5, ty + th / 2, { tam: 5.5, alinhar: 'centro', giro: true, cor: CINZA });
      }
    }
  }
  return th + 2 * m;
}

export async function pdfOrcamento(o) {
  const cfg = config(), pdf = new Pdf();
  const acento = corDoTema('--p1'), suave = corDoTema('--ps');
  const detalhado = o.modoCliente !== 'resumido';
  const cliente = o.clienteId ? achar('clientes', o.clienteId) : null;
  const nomeCliente = (cliente ? cliente.nome : o.clienteNome) || 'Sem cliente';
  let y = M;
  // garante espaço para o próximo bloco; se não couber, passa para outra página
  const espaco = altura => { if (y + altura > ALTURA - M) { pdf.novaPagina(); y = M; } };

  // ---------- cabeçalho
  const logo = await logoJpeg().catch(() => null);
  if (logo) {
    const k = Math.min(52 / logo.w, 52 / logo.h);
    pdf.imagem(pdf.novaImagem(logo.bytes, logo.w, logo.h), M + (52 - logo.w * k) / 2, y + (52 - logo.h * k) / 2, logo.w * k, logo.h * k);
  } else {
    pdf.ret(M, y, 52, 52, { fundo: acento, raio: 12 });
    for (const [x1, y1, x2, y2] of [[13, 34, 26, 16], [26, 16, 39, 34], [13, 34, 39, 34], [13, 40.5, 39, 40.5]]) pdf.linha(M + x1, y + y1, M + x2, y + y2, '#ffffff', 2.6);
  }
  pdf.texto(cfg.empresa, M + 64, y + 22, { tam: 17, negrito: true, cor: acento });
  const contato = [cfg.telefone, cfg.endereco, cfg.documento].filter(Boolean).join(' · ');
  quebrar(contato, W - 64 - 150, 8.5).slice(0, 2).forEach((l, i) => pdf.texto(l, M + 64, y + 35 + i * 11, { tam: 8.5, cor: CINZA }));
  pdf.texto('ORÇAMENTO', M + W, y + 10, { tam: 7, negrito: true, cor: CINZA, alinhar: 'dir' });
  pdf.texto(o.numero, M + W, y + 30, { tam: 19, negrito: true, cor: acento, alinhar: 'dir' });
  pdf.texto(`${dataBR(o.criadoEm)} · válido por ${o.validadeDias || cfg.validadeDias} dias`, M + W, y + 43, { tam: 8.5, cor: CINZA, alinhar: 'dir' });
  y += 62;
  pdf.linha(M, y, M + W, y, acento, 2.2);
  y += 14;

  // ---------- cliente
  const contatoCliente = cliente ? [cliente.telefone, cliente.endereco].filter(Boolean).join(' · ') : '';
  const alturaCliente = contatoCliente ? 48 : 37;
  pdf.ret(M, y, W, alturaCliente, { fundo: suave, raio: 8 });
  pdf.texto('CLIENTE', M + 12, y + 13, { tam: 6.5, negrito: true, cor: CINZA });
  pdf.texto(nomeCliente, M + 12, y + 28, { tam: 12, negrito: true, cor: TINTA });
  if (contatoCliente) pdf.texto(quebrar(contatoCliente, W - 24, 8.5)[0], M + 12, y + 40, { tam: 8.5, cor: CINZA });
  y += alturaCliente + 14;

  // ---------- pedras
  if (detalhado) {
    for (const p of o.pecas) {
      const linhas = [
        [`${qtdDe(p) > 1 ? qtdDe(p) + ' × ' : ''}${p.nome}`, true],
        [p.materialNome],
        [`Tampo: ${medida(p.comp)} × ${medida(p.larg)} cm`],
        ...descBordas(p).map(d => [d]),
        [`Área: ${m2(areaPeca(p) * qtdDe(p))}`],
        [moeda(valorPeca(p)), true],
      ];
      const alturaDesenho = Math.max(p.larg * Math.min(130 / p.comp, 72 / p.larg), 16) + 40;
      const bloco = Math.max(alturaDesenho, linhas.length * 12.5 + 6);
      espaco(bloco + 12);
      desenharPeca(pdf, p, M, y + (bloco - alturaDesenho) / 2, 170);
      let ly = y + (bloco - linhas.length * 12.5) / 2 + 9;
      for (const [txt, forte] of linhas) {
        pdf.texto(quebrar(txt, W - 190, forte ? 10.5 : 9.5, forte)[0], M + 190, ly, { tam: forte ? 10.5 : 9.5, negrito: !!forte, cor: TINTA });
        ly += 12.5;
      }
      y += bloco + 6;
      pdf.linha(M, y, M + W, y, LINHA, 0.7);
      y += 8;
    }
  } else if (o.pecas.length) {
    espaco(20 + o.pecas.length * 13);
    pdf.texto('Pedras', M, y + 9, { tam: 10.5, negrito: true, cor: TINTA });
    y += 16;
    for (const p of o.pecas) {
      espaco(13);
      pdf.texto(`${qtdDe(p)} × ${p.nome} — ${p.materialNome}, ${medida(p.comp)} × ${medida(p.larg)} cm`, M, y + 8, { tam: 9.5, cor: TINTA });
      y += 13;
    }
    y += 6;
  }

  // ---------- produtos e serviços
  for (const tipo of ['produto', 'servico']) {
    const itens = o.itens.filter(it => it.tipo === tipo);
    if (!itens.length) continue;
    espaco(30);
    pdf.texto(GRUPOS[tipo].varios, M, y + 9, { tam: 10.5, negrito: true, cor: TINTA });
    y += 16;
    for (const it of itens) {
      espaco(13);
      pdf.texto(`${it.qtd} × ${it.nome}`, M, y + 8, { tam: 9.5, cor: TINTA });
      if (detalhado) pdf.texto(moeda(it.preco * it.qtd), M + W, y + 8, { tam: 9.5, cor: TINTA, alinhar: 'dir' });
      y += 13;
    }
    y += 6;
  }

  // ---------- totais
  const parciais = [];
  if (detalhado) {
    parciais.push(['Pedras', moeda(totalPecas(o))]);
    if (totalItens(o, 'produto')) parciais.push(['Produtos', moeda(totalItens(o, 'produto'))]);
    if (totalItens(o, 'servico')) parciais.push(['Serviços', moeda(totalItens(o, 'servico'))]);
  }
  if (o.frete) parciais.push(['Frete / instalação', moeda(o.frete)]);
  if (o.desconto) parciais.push(['Desconto', '− ' + moeda(o.desconto)]);
  espaco(parciais.length * 14 + 50);
  pdf.linha(M, y, M + W, y, LINHA, 0.7);
  y += 6;
  for (const [nome, valor] of parciais) {
    pdf.texto(nome, M, y + 9, { tam: 10, cor: CINZA });
    pdf.texto(valor, M + W, y + 9, { tam: 10, cor: TINTA, alinhar: 'dir' });
    y += 14;
  }
  y += 4;
  pdf.ret(M, y, W, 28, { fundo: acento, raio: 8 });
  pdf.texto('Total', M + 12, y + 18.5, { tam: 12.5, negrito: true, cor: '#ffffff' });
  pdf.texto(moeda(totalGeral(o)), M + W - 12, y + 18.5, { tam: 12.5, negrito: true, cor: '#ffffff', alinhar: 'dir' });
  y += 28 + 14;

  // ---------- observações
  if (o.obs) {
    const linhas = quebrar(o.obs, W, 9.5);
    espaco(16 + linhas.length * 12.5);
    pdf.texto('Observações', M, y + 9, { tam: 10.5, negrito: true, cor: TINTA });
    y += 16;
    for (const l of linhas) { espaco(12.5); pdf.texto(l, M, y + 8, { tam: 9.5, cor: TINTA }); y += 12.5; }
  }

  const nome = `Orcamento-${o.numero}-${nomeCliente}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return new File([pdf.gerar()], nome + '.pdf', { type: 'application/pdf' });
}

export function baixar(arquivo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(arquivo);
  a.download = arquivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// Imprime o PDF sem sair da página: no computador, por um quadro escondido; no celular, baixa o arquivo
export function imprimirPdf(arquivo) {
  if (matchMedia('(pointer: coarse)').matches) { baixar(arquivo); return 'baixado'; }
  const url = URL.createObjectURL(arquivo);
  document.getElementById('quadro-pdf')?.remove();
  const quadro = document.createElement('iframe');
  quadro.id = 'quadro-pdf';
  quadro.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  quadro.onload = () => {
    try { quadro.contentWindow.focus(); quadro.contentWindow.print(); }
    catch (e) { window.open(url, '_blank'); }
  };
  quadro.src = url;
  document.body.appendChild(quadro);
  return 'imprimindo';
}
