// Desenhos em SVG: texturas das pedras, a peça com as bordas e os desenhos da folha de corte
import { lista } from './db.js';
import { esc, medida } from './util.js';
import { LADOS, TIPOS_BORDA, ESQUADRIA, RETO, temFaixa, acabDaBorda, partesDaPeca } from './calc.js';

function mistura(hex, alvo, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(alvo);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const claridade = hex => [1, 3, 5].reduce((s, i, k) => s + parseInt(hex.slice(i, i + 2), 16) * [0.299, 0.587, 0.114][k], 0) / 255;

// Um <pattern> por material (tx-ID) e uma versão miúda para miniaturas (txs-ID)
export function texturas() {
  let defs = '';
  lista('materiais').forEach((m, k) => {
    const cor = /^#[0-9a-f]{6}$/i.test(m.cor || '') ? m.cor : '#b9b6b1';
    let semente = 7 + k * 31;
    const rnd = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
    let c = `<rect width="96" height="96" fill="${cor}"/>`;
    if (m.textura === 'veios') {
      const veio = mistura(cor, claridade(cor) > 0.5 ? '#4a5560' : '#d8dde2', 0.4);
      c += `<path d="M-6 28 C 20 8, 52 52, 102 24" stroke="${veio}" stroke-width="1.2" fill="none" opacity=".8"/>`;
      c += `<path d="M-6 76 C 28 60, 60 92, 102 68" stroke="${veio}" stroke-width=".7" fill="none" opacity=".6"/>`;
      c += `<path d="M40 -6 C 48 24, 32 60, 60 102" stroke="${veio}" stroke-width=".5" fill="none" opacity=".5"/>`;
    } else {
      const escura = claridade(cor) < 0.35;
      const graos = m.textura === 'liso'
        ? [mistura(cor, '#000000', 0.06), mistura(cor, '#000000', 0.03)]
        : escura
          ? [mistura(cor, '#ffffff', 0.18), mistura(cor, '#ffffff', 0.4), mistura(cor, '#000000', 0.5)]
          : [mistura(cor, '#000000', 0.4), mistura(cor, '#ffffff', 0.5), mistura(cor, '#000000', 0.68)];
      for (let i = 0; i < 300; i++) {
        c += `<circle cx="${(rnd() * 96).toFixed(1)}" cy="${(rnd() * 96).toFixed(1)}" r="${(0.4 + rnd() * 0.9).toFixed(1)}" fill="${graos[i % graos.length]}"/>`;
      }
    }
    defs += `<pattern id="tx-${m.id}" width="96" height="96" patternUnits="userSpaceOnUse">${c}</pattern>`;
    defs += `<pattern id="txs-${m.id}" width="96" height="96" patternUnits="userSpaceOnUse" patternTransform="scale(.4)">${c}</pattern>`;
  });
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${defs}</defs></svg>`;
}

export function atualizarTexturas() {
  document.getElementById('texturas').innerHTML = texturas();
}

// Preenchimento de pedra: a textura do material e, se ele não existir mais, a cor guardada na peça
const pedraDe = (p, miudo) => `style="fill:url(#${miudo ? 'txs' : 'tx'}-${p.materialId}) ${p.cor || '#b9b6b1'}"`;

export const amostra = m => `<svg aria-hidden="true"><rect width="100%" height="100%" fill="url(#tx-${m.id}) ${m.cor || '#b9b6b1'}"/></svg>`;

// Desenho do tampo com as bordas em volta. opt.interativo liga o toque nas bordas (opt.sel = borda aberta);
// opt.simples tira os textos (miniaturas).
export function desenho(p, opt = {}) {
  if (!(p.comp > 0 && p.larg > 0)) return opt.interativo ? '<div class="vazio">Informe as medidas do tampo</div>' : '';
  const W = opt.largura || 340;
  const M = opt.simples ? 14 : 48;
  const s = Math.min((W - 2 * M) / p.comp, (opt.simples ? 34 : 190) / p.larg);
  const tw = p.comp * s, th = Math.max(p.larg * s, opt.simples ? 6 : 34);
  const tx = (W - tw) / 2, ty = M;
  const pedra = pedraDe(p, opt.simples);
  const zona = (lado, t) => ({
    fundo: { x: tx, y: ty - t, w: tw, h: t },
    frente: { x: tx, y: ty + th, w: tw, h: t },
    esquerda: { x: tx - t, y: ty, w: t, h: th },
    direita: { x: tx + tw, y: ty, w: t, h: th },
  }[lado]);
  const ret = (z, cls, extra = '') =>
    `<rect class="${cls}" x="${z.x.toFixed(1)}" y="${z.y.toFixed(1)}" width="${z.w.toFixed(1)}" height="${z.h.toFixed(1)}" rx="2" ${extra}/>`;
  // texto centralizado na zona, com fundo claro para ler em cima da pedra
  const etiqueta = (z, lado, txt, comFundo = true) => {
    const cx = z.x + z.w / 2, cy = z.y + z.h / 2, larg = txt.length * 6.4 + 12;
    const gira = (lado === 'esquerda' || lado === 'direita') ? ` transform="rotate(-90 ${cx.toFixed(1)} ${cy.toFixed(1)})"` : '';
    const fundo = comFundo ? `<rect class="etq" x="${(cx - larg / 2).toFixed(1)}" y="${(cy - 8).toFixed(1)}" width="${larg.toFixed(1)}" height="16" rx="8"/>` : '';
    return `<g${gira}>${fundo}<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${esc(txt)}</text></g>`;
  };

  const tampo = { x: tx, y: ty, w: tw, h: th };
  let corpo = ret(tampo, 'tampo', pedra);
  if (!opt.simples) corpo += etiqueta(tampo, 'fundo', `${medida(p.comp)} × ${medida(p.larg)} cm`);

  for (const lado of Object.keys(LADOS)) {
    const b = p.bordas[lado];
    const lateral = lado === 'esquerda' || lado === 'direita';
    const cabeTexto = (lateral ? th : tw) >= 76;
    let t = 22;
    if (temFaixa(b)) {
      t = opt.simples ? Math.min(Math.max(b.altura * s, 3), 12) : Math.min(Math.max(b.altura * s, 20), 34);
      const z = zona(lado, t);
      corpo += ret(z, 'faixa', pedra) + ret(z, 'clareia');
      if (!opt.simples) corpo += etiqueta(z, lado, cabeTexto ? `${TIPOS_BORDA[b.tipo]} ${medida(b.altura)}` : medida(b.altura));
    } else if (b.tipo === 'acabamento') {
      const e = zona(lado, 0);
      corpo += `<line class="acab" x1="${e.x.toFixed(1)}" y1="${e.y.toFixed(1)}" x2="${(e.x + e.w).toFixed(1)}" y2="${(e.y + e.h).toFixed(1)}"/>`;
      if (!opt.simples && cabeTexto) corpo += etiqueta(zona(lado, t + 6), lado, b.acab, false);
    } else if (opt.interativo) {
      const z = zona(lado, t);
      corpo += ret(z, 'livre') + `<text class="mais" x="${(z.x + z.w / 2).toFixed(1)}" y="${(z.y + z.h / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="central">+</text>`;
    }
    if (opt.interativo) {
      corpo += ret(zona(lado, Math.max(t, 30)), 'toque' + (opt.sel === lado ? ' sel' : ''),
        `data-acao="borda" data-lado="${lado}" role="button" aria-label="Borda ${LADOS[lado]}"`);
    }
  }
  return `<svg class="desenho" viewBox="0 0 ${W} ${(th + 2 * M).toFixed(0)}" role="img" aria-label="Desenho da peça">${corpo}</svg>`;
}

// Desenhos de corte da peça: um desenho por parte, todos na mesma escala, com a medida
// do comprimento em cima e a da largura ao lado. Ficam lado a lado para economizar papel.
export function desenhosCorte(p) {
  const ml = 44, mr = 10;
  const partes = partesDaPeca(p);
  if (!partes.length) return '';
  const s = Math.min(2.4, 330 / Math.max(...partes.map(x => x.w)));
  const f = v => v.toFixed(1);
  const cabe = (txt, espaco) => txt.length * 5.8 <= espaco - 10;
  const svgs = partes.map(pt => {
    const titulo = pt.titulo || pt.nome;
    const w = pt.w * s, h = Math.max(pt.h * s, 12), x0 = ml, y0 = 44;
    const cy = y0 - 9, cx = x0 - 9;
    let c = `<text class="nome" x="2" y="12">${esc(titulo)}</text>`;
    c += `<path class="cota" d="M${x0} ${cy} H${f(x0 + w)} M${x0} ${cy - 4} V${cy + 4} M${f(x0 + w)} ${cy - 4} V${cy + 4}"/>`;
    c += `<text class="med" x="${f(x0 + w / 2)}" y="${cy - 5}" text-anchor="middle">${medida(pt.w)}</text>`;
    c += `<path class="cota" d="M${cx} ${y0} V${f(y0 + h)} M${cx - 4} ${y0} H${cx + 4} M${cx - 4} ${f(y0 + h)} H${cx + 4}"/>`;
    c += `<text class="med" x="${cx - 7}" y="${f(y0 + h / 2)}" text-anchor="end" dominant-baseline="central">${medida(pt.h)}</text>`;
    c += `<rect class="parte" x="${x0}" y="${y0}" width="${f(w)}" height="${f(h)}"/>`;
    let largura = Math.max(x0 + w + mr, titulo.length * 6.6 + 6), altura = y0 + h + 8;
    if (pt.tampo) {
      // cada lado trabalhado do tampo: linha na borda e o nome escrito por dentro
      const lados = { fundo: [x0, y0, x0 + w, y0], frente: [x0, y0 + h, x0 + w, y0 + h], esquerda: [x0, y0, x0, y0 + h], direita: [x0 + w, y0, x0 + w, y0 + h] };
      const textos = { fundo: [x0 + w / 2, y0 + 13, 0], frente: [x0 + w / 2, y0 + h - 12, 0], esquerda: [x0 + 13, y0 + h / 2, -90], direita: [x0 + w - 13, y0 + h / 2, -90] };
      for (const l of Object.keys(LADOS)) {
        const b = p.bordas[l];
        // o lado do espelho fica sem marcação no tampo: o acabamento é feito no espelho
        if (b.tipo === 'nenhum' || b.tipo === 'espelho') continue;
        const [x1, y1, x2, y2] = lados[l], [tx, ty, giro] = textos[l];
        const txt = b.tipo === 'saia' ? `Saia ${medida(b.altura)} · ${ESQUADRIA.toLowerCase()}` : b.acab;
        c += `<line class="${b.tipo === 'saia' ? 'esq' : 'acab'}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
        if (cabe(txt, giro ? h : w)) {
          c += `<text class="lado" x="${f(tx)}" y="${f(ty)}" text-anchor="middle" dominant-baseline="central"${giro ? ` transform="rotate(${giro} ${f(tx)} ${f(ty)})"` : ''}>${esc(txt)}</text>`;
        }
      }
    }
    if (pt.tipo === 'espelho' || pt.tipo === 'saia') {
      const saia = pt.tipo === 'saia';
      // saia: meia esquadria em cima (junta com o tampo) e reto embaixo (borda aparente);
      // espelho: o acabamento dele na borda de cima
      const nome = saia ? ESQUADRIA : acabDaBorda(p, pt.lado);
      const cls = saia ? 'esq' : 'acab';
      const embaixo = [];   // textos escritos embaixo da faixa
      c += `<line class="${cls}" x1="${x0}" y1="${y0}" x2="${f(x0 + w)}" y2="${y0}"/>`;
      if (!saia && h >= 20 && cabe(nome, w)) {
        c += `<text class="lado" x="${f(x0 + w / 2)}" y="${f(y0 + h / 2 + 1)}" text-anchor="middle" dominant-baseline="central">${esc(nome)}</text>`;
      } else {
        embaixo.push(`cima: ${nome.toLowerCase()}`);
      }
      if (saia) {
        c += `<line class="acab" x1="${x0}" y1="${f(y0 + h)}" x2="${f(x0 + w)}" y2="${f(y0 + h)}"/>`;
        embaixo.push(`baixo: ${RETO.toLowerCase()}`);
      }
      // pontas da faixa: marcadas quando o lado vizinho do tampo tem saia ou acabamento
      const deitada = pt.lado === 'fundo' || pt.lado === 'frente';
      const vizinhos = deitada ? ['esquerda', 'direita'] : ['fundo', 'frente'];
      const marcada = vizinhos.map(l => p.bordas[l].tipo === 'saia' || p.bordas[l].tipo === 'acabamento');
      if (marcada[0]) c += `<line class="${cls}" x1="${x0}" y1="${y0}" x2="${x0}" y2="${f(y0 + h)}"/>`;
      if (marcada[1]) c += `<line class="${cls}" x1="${f(x0 + w)}" y1="${y0}" x2="${f(x0 + w)}" y2="${f(y0 + h)}"/>`;
      if (marcada[0] || marcada[1]) {
        const quais = deitada
          ? (marcada[0] && marcada[1] ? 'esquerda e direita' : marcada[0] ? 'esquerda' : 'direita')
          : (marcada[0] && marcada[1] ? 'fundo e frente' : marcada[0] ? 'fundo' : 'frente');
        embaixo.push(`${quais}: ${nome.toLowerCase()}`);
      }
      embaixo.forEach((txt, n) => {
        c += `<text class="lado" x="${x0}" y="${f(y0 + h + 15 + n * 13)}">${esc(txt)}</text>`;
        largura = Math.max(largura, x0 + txt.length * 5.5 + 4);
      });
      if (embaixo.length) altura = y0 + h + 8 + embaixo.length * 13;
    }
    return `<svg class="corte" width="${f(largura)}" height="${f(altura)}" viewBox="0 0 ${f(largura)} ${f(altura)}" role="img" aria-label="${esc(p.nome)}: ${esc(pt.nome)}, ${medida(pt.w)} por ${medida(pt.h)} cm">${c}</svg>`;
  });
  // tampo à esquerda, espelhos e saias agrupados ao lado
  return svgs[0] + (svgs.length > 1 ? `<div class="faixas">${svgs.slice(1).join('')}</div>` : '');
}
