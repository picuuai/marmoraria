// Gerador de PDF pequeno, sem biblioteca: texto (Helvetica), retângulos, linhas e imagem JPEG.
// As medidas são em pontos (A4 = 595 × 842) e o y é contado de cima para baixo.

export const LARGURA = 595.28, ALTURA = 841.89;

// Largura do texto: mede com Arial, que tem as mesmas larguras da Helvetica do PDF
let tela = null;
export function medir(txt, tam, negrito) {
  tela = tela || document.createElement('canvas').getContext('2d');
  tela.font = `${negrito ? 'bold ' : ''}${tam}px Helvetica, Arial, sans-serif`;
  return tela.measureText(String(txt)).width;
}

// Quebra o texto em linhas que cabem na largura
export function quebrar(txt, largura, tam, negrito) {
  const linhas = [];
  for (const paragrafo of String(txt).split('\n')) {
    let atual = '';
    for (const palavra of paragrafo.split(/\s+/)) {
      const teste = atual ? atual + ' ' + palavra : palavra;
      if (atual && medir(teste, tam, negrito) > largura) { linhas.push(atual); atual = palavra; }
      else atual = teste;
    }
    linhas.push(atual);
  }
  return linhas;
}

// O PDF usa a tabela WinAnsi: os acentos do português têm o mesmo código do Unicode,
// e alguns sinais (travessão, aspas curvas) têm código próprio
const ESPECIAIS = { 0x2014: 0x97, 0x2013: 0x96, 0x2022: 0x95, 0x201C: 0x93, 0x201D: 0x94, 0x2018: 0x91, 0x2019: 0x92, 0x2026: 0x85, 0x20AC: 0x80, 0x2212: 0x2D, 0x202F: 0x20 };
function codificar(txt) {
  let s = '';
  for (const letra of String(txt)) {
    let c = letra.codePointAt(0);
    if (ESPECIAIS[c]) c = ESPECIAIS[c]; else if (c > 255) c = 63;
    if (c === 40 || c === 41 || c === 92) s += '\\';
    s += String.fromCharCode(c);
  }
  return s;
}

const n = v => (Math.round(v * 100) / 100).toString();
const rgb = hex => [1, 3, 5].map(i => n(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ');
const bytes = s => Uint8Array.from(s, ch => ch.charCodeAt(0) & 255);

export class Pdf {
  constructor() {
    this.paginas = [];
    this.imagens = [];
    this.novaPagina();
  }

  novaPagina() { this.c = []; this.paginas.push(this.c); }

  // opcoes: fundo e traco (cores #rrggbb), raio dos cantos, esp (espessura do traço)
  ret(x, y, w, h, { fundo, traco, raio = 0, esp = 1 } = {}) {
    if (w <= 0 || h <= 0 || (!fundo && !traco)) return;
    const y0 = ALTURA - y - h, r = Math.min(raio, w / 2, h / 2), k = r * 0.5523;
    if (fundo) this.c.push(`${rgb(fundo)} rg`);
    if (traco) this.c.push(`${rgb(traco)} RG ${n(esp)} w`);
    const caminho = r <= 0 ? `${n(x)} ${n(y0)} ${n(w)} ${n(h)} re` : [
      `${n(x + r)} ${n(y0)} m ${n(x + w - r)} ${n(y0)} l`,
      `${n(x + w - r + k)} ${n(y0)} ${n(x + w)} ${n(y0 + r - k)} ${n(x + w)} ${n(y0 + r)} c ${n(x + w)} ${n(y0 + h - r)} l`,
      `${n(x + w)} ${n(y0 + h - r + k)} ${n(x + w - r + k)} ${n(y0 + h)} ${n(x + w - r)} ${n(y0 + h)} c ${n(x + r)} ${n(y0 + h)} l`,
      `${n(x + r - k)} ${n(y0 + h)} ${n(x)} ${n(y0 + h - r + k)} ${n(x)} ${n(y0 + h - r)} c ${n(x)} ${n(y0 + r)} l`,
      `${n(x)} ${n(y0 + r - k)} ${n(x + r - k)} ${n(y0)} ${n(x + r)} ${n(y0)} c h`,
    ].join(' ');
    this.c.push(`${caminho} ${fundo && traco ? 'B' : fundo ? 'f' : 'S'}`);
  }

  linha(x1, y1, x2, y2, cor = '#000000', esp = 1) {
    this.c.push(`${rgb(cor)} RG ${n(esp)} w 1 J ${n(x1)} ${n(ALTURA - y1)} m ${n(x2)} ${n(ALTURA - y2)} l S 0 J`);
  }

  // y é a linha de base do texto. alinhar: 'esq', 'centro' ou 'dir'. giro = true escreve de baixo para cima.
  texto(txt, x, y, { tam = 10, negrito = false, cor = '#000000', alinhar = 'esq', giro = false } = {}) {
    txt = String(txt);
    if (!txt) return;
    const larg = medir(txt, tam, negrito), desloca = alinhar === 'centro' ? larg / 2 : alinhar === 'dir' ? larg : 0;
    const fonte = `/${negrito ? 'F2' : 'F1'} ${n(tam)} Tf`;
    const pos = giro
      ? `0 1 -1 0 ${n(x)} ${n(ALTURA - (y + desloca))} Tm`
      : `1 0 0 1 ${n(x - desloca)} ${n(ALTURA - y)} Tm`;
    this.c.push(`BT ${rgb(cor)} rg ${fonte} ${pos} (${codificar(txt)}) Tj ET`);
  }

  // jpeg: Uint8Array de um arquivo JPEG. Devolve o número da imagem para usar em imagem().
  novaImagem(jpeg, largura, altura) {
    this.imagens.push({ jpeg, largura, altura });
    return this.imagens.length - 1;
  }
  imagem(indice, x, y, w, h) {
    this.c.push(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(ALTURA - y - h)} cm /Im${indice} Do Q`);
  }

  gerar() {
    const objetos = [];   // cada um: lista de pedaços (texto ou bytes)
    const total = 4 + this.imagens.length + this.paginas.length * 2;
    const idImagem = i => 5 + i, idPagina = i => 5 + this.imagens.length + i * 2;
    objetos[1] = ['<< /Type /Catalog /Pages 2 0 R >>'];
    objetos[2] = [`<< /Type /Pages /Count ${this.paginas.length} /Kids [${this.paginas.map((_, i) => `${idPagina(i)} 0 R`).join(' ')}] >>`];
    objetos[3] = ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
    objetos[4] = ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
    this.imagens.forEach((im, i) => {
      objetos[idImagem(i)] = [`<< /Type /XObject /Subtype /Image /Width ${im.largura} /Height ${im.altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`, im.jpeg, '\nendstream'];
    });
    const recursos = `<< /Font << /F1 3 0 R /F2 4 0 R >>${this.imagens.length ? ` /XObject << ${this.imagens.map((_, i) => `/Im${i} ${idImagem(i)} 0 R`).join(' ')} >>` : ''} >>`;
    this.paginas.forEach((ops, i) => {
      const conteudo = ops.join('\n');
      objetos[idPagina(i)] = [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(LARGURA)} ${n(ALTURA)}] /Resources ${recursos} /Contents ${idPagina(i) + 1} 0 R >>`];
      objetos[idPagina(i) + 1] = [`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`];
    });

    const partes = [bytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
    const posicoes = [];
    let tamanho = partes[0].length;
    const junta = p => { const b = typeof p === 'string' ? bytes(p) : p; partes.push(b); tamanho += b.length; };
    for (let id = 1; id <= total; id++) {
      posicoes[id] = tamanho;
      junta(`${id} 0 obj\n`);
      objetos[id].forEach(junta);
      junta('\nendobj\n');
    }
    const inicioTabela = tamanho;
    junta(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
    for (let id = 1; id <= total; id++) junta(String(posicoes[id]).padStart(10, '0') + ' 00000 n \n');
    junta(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${inicioTabela}\n%%EOF\n`);

    const saida = new Uint8Array(tamanho);
    let p = 0;
    for (const b of partes) { saida.set(b, p); p += b.length; }
    return saida;
  }
}
