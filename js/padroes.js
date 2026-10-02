// Dados iniciais gravados na primeira vez que o sistema abre.
// Preços, custos e percentuais são de exemplo: ajuste nos cadastros.

export const MATERIAIS = [
  { id: 'm1', nome: 'Granito Cinza Andorinha', preco: 300, custo: 160, cor: '#9b9b98', textura: 'granulado' },
  { id: 'm2', nome: 'Granito Verde Ubatuba', preco: 380, custo: 210, cor: '#1f2a22', textura: 'granulado' },
  { id: 'm3', nome: 'Granito Preto São Gabriel', preco: 450, custo: 250, cor: '#1c1c1e', textura: 'granulado' },
  { id: 'm4', nome: 'Granito Branco Itaúnas', preco: 520, custo: 290, cor: '#e9e4d8', textura: 'granulado' },
  { id: 'm5', nome: 'Mármore Branco Carrara', preco: 950, custo: 560, cor: '#f1f1ef', textura: 'veios' },
  { id: 'm6', nome: 'Quartzo Branco', preco: 1200, custo: 720, cor: '#f6f5f2', textura: 'liso' },
];

// perc = % de mão de obra sobre o valor do material da peça
export const ACABAMENTOS = [
  { id: 'a1', nome: 'Reto simples', desc: 'Borda polida na espessura da chapa', perc: 20 },
  { id: 'a2', nome: 'Reto duplo', desc: 'Borda engrossada com duas camadas coladas', perc: 30 },
  { id: 'a3', nome: 'Meio boleado', desc: 'Só a quina de cima arredondada', perc: 25 },
  { id: 'a4', nome: 'Boleado', desc: 'Borda toda arredondada', perc: 30 },
  { id: 'a5', nome: 'Boleado duplo', desc: 'Borda engrossada e arredondada', perc: 40 },
  { id: 'a6', nome: 'Chanfrado', desc: 'Quina cortada em ângulo', perc: 30 },
  { id: 'a7', nome: 'Bisotê', desc: 'Corte diagonal largo na quina de cima', perc: 35 },
  { id: 'a8', nome: 'Peito de pombo', desc: 'Perfil em curva, usado em lavatórios e aparadores', perc: 40 },
  { id: 'a9', nome: 'Meia esquadria', desc: 'Corte a 45° que esconde a emenda', perc: 30 },
];

export const CATALOGO = [
  { id: 'c1', tipo: 'produto', nome: 'Cuba inox de embutir', custo: 140, preco: 220 },
  { id: 'c2', tipo: 'produto', nome: 'Cuba de louça de embutir', custo: 110, preco: 180 },
  { id: 'c3', tipo: 'produto', nome: 'Cuba de louça de apoio', custo: 160, preco: 260 },
  { id: 'c4', tipo: 'produto', nome: 'Tanque inox', custo: 250, preco: 380 },
  { id: 'c5', tipo: 'produto', nome: 'Suporte para bancada', custo: 18, preco: 35 },
  { id: 'c6', tipo: 'servico', nome: 'Furo para torneira', custo: 0, preco: 25 },
  { id: 'c7', tipo: 'servico', nome: 'Recorte para cuba', custo: 0, preco: 80 },
  { id: 'c8', tipo: 'servico', nome: 'Recorte para cooktop', custo: 0, preco: 90 },
  { id: 'c9', tipo: 'servico', nome: 'Cuba esculpida', custo: 0, preco: 650 },
];

// Modelos de peça: medidas (cm) e bordas que já vêm marcadas.
// Em cada lado: 'nenhum', 'espelho', 'saia' ou 'acabamento'. Altura 0 usa a altura padrão dos ajustes.
const lado = (tipo = 'nenhum', altura = 0) => ({ tipo, altura });
export const TIPOS = [
  { id: 't1', nome: 'Bancada', comp: 200, larg: 60, bordas: { fundo: lado('espelho'), frente: lado('saia'), esquerda: lado(), direita: lado() } },
  { id: 't2', nome: 'Pia', comp: 150, larg: 55, bordas: { fundo: lado('espelho'), frente: lado('saia'), esquerda: lado(), direita: lado() } },
  { id: 't3', nome: 'Lavatório', comp: 80, larg: 50, bordas: { fundo: lado('espelho'), frente: lado('saia'), esquerda: lado(), direita: lado() } },
  { id: 't4', nome: 'Balcão', comp: 180, larg: 40, bordas: { fundo: lado(), frente: lado('saia'), esquerda: lado(), direita: lado() } },
  { id: 't5', nome: 'Soleira', comp: 80, larg: 15, bordas: { fundo: lado(), frente: lado(), esquerda: lado(), direita: lado() } },
  { id: 't6', nome: 'Peitoril', comp: 120, larg: 18, bordas: { fundo: lado(), frente: lado(), esquerda: lado(), direita: lado() } },
  { id: 't7', nome: 'Prateleira', comp: 60, larg: 30, bordas: { fundo: lado(), frente: lado('acabamento'), esquerda: lado(), direita: lado() } },
  { id: 't8', nome: 'Outra peça', comp: 100, larg: 50, bordas: { fundo: lado(), frente: lado(), esquerda: lado(), direita: lado() } },
];

export const CONFIG = {
  id: 'config',
  empresa: 'Sua Marmoraria',
  telefone: '',
  endereco: '',
  documento: '',
  validadeDias: 15,
  alturaEspelho: 10,
  alturaSaia: 4,
  proximoNumero: 1,
};
