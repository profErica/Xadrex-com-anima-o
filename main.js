// ═══════════════════════════════════════════════════════
// main.js
//
// O QUE É ESTE ARQUIVO?
// O MAESTRO do jogo — não executa nada diretamente,
// mas orquestra todos os módulos para funcionarem juntos.
//
// ANALOGIA:
// Pense num restaurante:
//   core/    → a cozinha (regras, lógica, dados)
//   render/  → o prato (como as coisas aparecem)
//   ui/      → o garçom (interação com o usuário)
//   main.js  → o gerente (coordena tudo)
//
// O gerente não cozinha nem serve — ele garante que
// cada parte faz seu trabalho na hora certa.
//
// POR QUE type="module" NO HTML?
// ES Modules permite dividir o código em arquivos usando
// import/export. Sem ele, o browser não entende 'import'.
// Por isso não funciona abrindo o HTML diretamente —
// precisa de um servidor (Live Server, Python, etc).
//
// FLUXO DO JOGO:
//   1. Página carrega → modal aparece
//   2. Usuário configura → startGame() é chamada
//   3. Board é criado → tabuleiro é desenhado
//   4. Usuário clica → selecionaPeca() ou movePeca()
//   5. Após cada jogada → renderiza + atualiza sidebar
// ═══════════════════════════════════════════════════════

// ── IMPORTS ───────────────────────────────────────────────
// Cada import traz apenas o que precisamos de cada módulo.
// O browser carrega os arquivos automaticamente quando
// encontra estes imports.

import { Board } from './core/board.js';
import { renderizar, desenharAvisoXeque } from './render/drawBoard.js';
import { abrirModal, fecharModal, lerConfiguracoes } from './ui/modal.js';
import {
  mostrarNav,
  atualizarTurno,
  atualizarPlacar,
  animarPlacar,
  atualizarCapturadas,
  adicionarHistorico,
  setStatus  
} from './ui/nav.js';
import { mostrarXequeMate } from './ui/xequeMate.js';
import { posicaoParaNotacao } from './core/utils.js';
import { sincronizarConfiguracoesIniciais } from './ui/nav.js';


// ── ESTADO DO JOGO ────────────────────────────────────────
// Todas as variáveis que descrevem a situação atual da partida.
// Ficam aqui no main.js porque pertencem ao jogo como um todo,
// não a nenhum módulo específico.
//
// TODO: futuramente podemos criar um core/game.js para
//       encapsular esse estado e a lógica de turno/xeque.
const estado = {
  board: null,         // instância de Board
  config: null,         // configurações da partida
  turnoAtual: 'white',      // 'white' | 'black'
  selecionado: null,         // { row, col } ou null
  movValidos: [],           // array de { row, col }
  placar: { white: 0, black: 0 },
  captPorBrancas: [],        // símbolos das peças capturadas pelas brancas
  captPorPretas: [],        // símbolos das peças capturadas pelas pretas
  numeroTurno: 1,            // contador de turnos para o histórico
  animacoesAtivas: true,
  jogoFinalizado: false,
};

// ── CANVAS ────────────────────────────────────────────────
// Pegamos o canvas e seu contexto 2D uma vez.
// O contexto (ctx) é o objeto com todos os métodos de desenho.
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

// ── INICIAR JOGO ──────────────────────────────────────────
// Chamada pelo botão do modal. Lê as configurações,
// monta o tabuleiro e prepara a interface.
//
// Por que window.startGame?
// O onclick no HTML chama startGame() — como estamos em
// um ES Module, precisamos expor a função globalmente.
window.startGame = function () {
  // Lê as escolhas do modal
  estado.config = lerConfiguracoes();
  estado.animacoesAtivas = estado.config.animacoes;
  fecharModal();

  // Mostra o app e a nav com animações CSS
  document.getElementById('app').classList.add('visible');
  document.querySelector('.board-wrapper').classList.add('visible');
  mostrarNav();

  // Reinicia o estado
  estado.board = new Board();
  estado.turnoAtual = 'white';
  estado.selecionado = null;
  estado.movValidos = [];
  estado.placar = { white: 0, black: 0 };
  estado.captPorBrancas = [];
  estado.captPorPretas = [];
  estado.numeroTurno = 1;

  // Atualiza a sidebar
  atualizarTurno('white');
  atualizarPlacar(estado.placar);
  atualizarModoDisplay();
  sincronizarConfiguracoesIniciais(estado.config);

  // Sincroniza a Sidebar com o que veio do Modal
  sincronizarConfiguracoesIniciais(estado.config);

  // Desenha o tabuleiro inicial
  renderizar(ctx, estado.board.grid, null, []);
  setStatus('Brancas começam — selecione uma peça');
};

// ── CLIQUE NO CANVAS ──────────────────────────────────────
// Converte coordenadas do clique (pixels) para posição
// no grid (row, col) e decide o que fazer.
canvas.addEventListener('click', (evento) => {
  if (estado.bloqueado) return;// ignora cliques enquanto pisca o aviso de xeque
  // getBoundingClientRect retorna tamanho e posição do canvas
  // na tela. Precisamos disso porque o canvas pode estar
  // redimensionado por CSS — os pixels CSS e do canvas podem
  // ser diferentes.
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const pixelX = (evento.clientX - rect.left) * scaleX;
  const pixelY = (evento.clientY - rect.top) * scaleY;

  // Divide pelo tamanho da casa (60px) para obter o índice
  const col = Math.floor(pixelX / 60);
  const row = Math.floor(pixelY / 60);

  // Garante que o clique foi dentro do tabuleiro
  if (col < 0 || col > 7 || row < 0 || row > 7) return;

  processarClique(row, col);
});

// ── PROCESSAR CLIQUE ──────────────────────────────────────
// Lógica principal de interação:
//   - Se há peça selecionada e clicou em movimento válido → move
//   - Se clicou em peça do turno atual → seleciona
//   - Caso contrário → deseleciona
function processarClique(row, col) {

  if (estado.jogoFinalizado) return;
  const peca = estado.board.grid[row][col];

  // --- [DIFERENÇA 1] BUSCAR O ESTADO DO SWITCH DE ALERTAS ---
  // Criamos essa variável logo no início para usar em todo o clique
  const elAlerts = document.getElementById('configAlerts');
  const modoAlertas = elAlerts ? elAlerts.checked : true;

  // 1. TENTAR MOVER
  const ehMovimentoValido = estado.movValidos.find(m => m.row === row && m.col === col);

  if (estado.selecionado && ehMovimentoValido) {
    const pecaSendoMovida = estado.board.grid[estado.selecionado.row][estado.selecionado.col];

    // --- [DIFERENÇA 2] LÓGICA DO REI (BLOQUEIO) ---
    // Se for o REI indo para o risco, é proibido.
    if (ehMovimentoValido.isRisk && pecaSendoMovida.type === 'king') {
      if (modoAlertas) alert("❌ Movimento Ilegal: Rei em Xeque!");

      // Mesmo sem alerta, limpamos a seleção porque o lance não pode ocorrer
      estado.selecionado = null;
      estado.movValidos = [];
      renderizarEstado();
      return;
    }

    // --- [DIFERENÇA 3] LÓGICA DO SACRIFÍCIO (SILENCIOSA) ---
    if (ehMovimentoValido.isRisk) {
      // Se modoAlertas for FALSE, ele ignora o IF e move direto
      if (modoAlertas) {
        const confirmar = confirm("⚠️ Esta casa está sob ataque! Deseja mover mesmo assim?");
        if (!confirmar) return;
      }
    }

    executarMovimento(estado.selecionado.row, estado.selecionado.col, row, col);
    return;
  }

  // --- [DIFERENÇA 4] DIAGNÓSTICO SÓ APARECE SE VOCÊ QUISER ---
  if (estado.selecionado) {
    const pecaSel = estado.board.grid[estado.selecionado.row][estado.selecionado.col];
    // Adicionamos "&& modoAlertas" na condição
    if (pecaSel && pecaSel.type === 'king' && (col === 2 || col === 6) && modoAlertas) {
      const motivo = explicarBloqueioRoque(estado.selecionado.row, estado.selecionado.col, col);
      if (motivo) {
        alert("⚠️ Roque Inválido\n" + motivo);
        estado.selecionado = null;
        estado.movValidos = [];
        renderizarEstado();
        return;
      }
    }
  }

  // 2. SELECIONAR PEÇA
  if (peca && peca.color === estado.turnoAtual) {
    estado.selecionado = { row, col };
    const checkboxRisco = document.getElementById('configRisk');
    const mostrarRisco = checkboxRisco ? checkboxRisco.checked : false;
    const brutos = estado.board.getValidMoves(row, col);

    estado.movValidos = brutos.filter(m => {
      // [NOVO] SIMULAÇÃO DE JOGADA PARA VALIDAR XEQUE
      const boardSimulado = estado.board.clonar();
      boardSimulado.moverPeca(row, col, m.row, m.col);

      // Se após esse movimento o Rei continua em xeque, o movimento é proibido
      if (boardSimulado.estaEmXeque(estado.turnoAtual)) return false;

      // Regra do Roque (não pode passar por xeque)
      if (m.isCastling && m.isRisk) return false;

      return true;
    }).map(m => ({
      ...m,
      isRisk: estado.board.estaSendoAtacada(m.row, m.col, peca.color),
      isCapture: estado.board.grid[m.row][m.col] !== null
    }));

    const qtd = estado.movValidos.length;
    // --- [NOVO] AVISO DE PEÇA PRESA (PINNED) ---
    // Se a peça tinha movimentos possíveis "no papel" (brutos.length > 0),
    // mas todos foram filtrados pela simulação de xeque, ela está presa
    // protegendo o Rei — e o jogador merece saber o motivo.
    if (qtd === 0 && brutos.length > 0) {
      if (modoAlertas) {
        alert(`⚠️ ${peca.symbol} está presa!\nMover essa peça deixaria seu Rei em xeque.`);
      }
      setStatus("Peça presa - protegendo o Rei", 'alerta');
    } else {
      setStatus(qtd > 0 ? `${peca.symbol} selecionado` : "Sem movimentos");
    }

    renderizarEstado();
    return;
  }

  // 3. DESSELECIONAR
  estado.selecionado = null;
  estado.movValidos = [];
  setStatus(`${estado.turnoAtual === 'white' ? 'Brancas' : 'Pretas'} — selecione uma peça`);
  renderizarEstado();
}

// ── EXECUTAR MOVIMENTO ────────────────────────────────────
// Aplica o movimento ao board, atualiza o estado e a UI.
function executarMovimento(deRow, deCol, paraRow, paraCol) {

  // Buscamos os dados extras do movimento que o jogador escolheu
  const movimentoData = estado.movValidos.find(m => m.row === paraRow && m.col === paraCol);

  if (movimentoData && movimentoData.isCastling) {
    const { rookFromCol, rookToCol } = movimentoData;
    // Movemos a Torre manualmente junto com o Rei
    const torre = estado.board.grid[deRow][rookFromCol];
    estado.board.grid[deRow][rookToCol] = torre;
    estado.board.grid[deRow][rookFromCol] = null;
    if (torre) torre.moveu = true;
  }

  const capturada = estado.board.moverPeca(deRow, deCol, paraRow, paraCol);

  // Atualiza capturadas e placar se houve captura
  if (capturada) {
    if (capturada.color === 'black') {
      estado.captPorBrancas.push(capturada.symbol);
      estado.placar.white++;
      animarPlacar('white');
    } else {
      estado.captPorPretas.push(capturada.symbol);
      estado.placar.black++;
      animarPlacar('black');
    }
    atualizarPlacar(estado.placar);
    atualizarCapturadas(estado.captPorBrancas, estado.captPorPretas);
  }

  // Registra no histórico
  const notacao = `${posicaoParaNotacao(deRow, deCol)}→${posicaoParaNotacao(paraRow, paraCol)}`;
  adicionarHistorico(notacao, estado.turnoAtual, estado.numeroTurno);

  // 1. Troca o turno e limpa seleções
  const proximoTurno = estado.turnoAtual === 'white' ? 'black' : 'white';
  if (estado.turnoAtual === 'black') estado.numeroTurno++;
  estado.turnoAtual = proximoTurno;
  estado.selecionado = null;
  estado.movValidos = [];

  // 2. Verifica XEQUE / MATE / AFOGAMENTO
  const estaEmXeque = estado.board.estaEmXeque(proximoTurno);
  const temJogadas = estado.board.temMovimentosLegais(proximoTurno);

  // 3. Atualiza a Sidebar e o Status
  atualizarTurno(proximoTurno);

  if (estaEmXeque) {
    estado.avisoXequePendente = true;
    if (temJogadas) {
      // XEQUE, mas ainda há movimentos
      setStatus(`XEQUE! Vez das ${proximoTurno === 'white' ? 'Brancas' : 'Pretas'}`, 'alerta');
      estado.jogoFinalizado = false;
    } else {
      // XEQUE-MATE: está em xeque e não há movimentos legais
      const vencedor = proximoTurno === 'white' ? 'Pretas' : 'Brancas';
      setStatus(`XEQUE-MATE! Vitória das ${vencedor}!`, 'alerta');
      estado.jogoFinalizado = true;
      mostrarXequeMate();
    }
  } else {
    if (!temJogadas) {
      // AFOGAMENTO: não está em xeque, mas não tem movimentos
      setStatus("EMPATE! Afogamento (Stalemate)", 'alerta');
      estado.jogoFinalizado = true;
    } else {
      // Jogo normal
      setStatus(`${proximoTurno === 'white' ? 'Brancas' : 'Pretas'} - sua vez`);
      estado.jogoFinalizado = false;
    }
  }
  // 4. Renderiza tudo (agora com o aviso de xeque, se houver)
  renderizarEstado();
}

// ── RENDERIZAR ESTADO ─────────────────────────────────────
// Desenha o tabuleiro com o estado atual.
// Centraliza a chamada para não repetir em vários lugares.

// Variável para controlar se precisamos do loop de animação
let loopAnimaçãoAtivo = false;
let piscadasRestantes = 0;
let visívelAnterior = null;

function renderizarEstado() {
  // Verifica se os elementos existem antes de pegar o .checked para evitar novos erros
  const elMove = document.getElementById('configShowMoves');
  const elRisk = document.getElementById('configRisk');
  // Lê os valores atuais dos switches na sidebar
  const mostrarMovimentos = elMove ? elMove.checked : true;
  const mostrarRisco = elRisk ? elRisk.checked : true;

  // Renderiza o tabuleiro e as peças
  renderizar(
    ctx,
    estado.board.grid,
    estado.selecionado,
    estado.movValidos,
    mostrarMovimentos,
    mostrarRisco
  );

  // Verifica se o turno atual está em xeque  e desenha o aviso
  const estaEmXeque = estado.board.estaEmXeque(estado.turnoAtual);

  // Só inicia a animação se: está em xeque, o loop não está rodando,
  // E ainda não avisamos sobre ESTE xeque específico.
  if (estaEmXeque && !loopAnimaçãoAtivo && estado.avisoXequePendente) {
    loopAnimaçãoAtivo = true;
    estado.bloqueado = true;      // trava o tabuleiro durante a piscada
    piscadasRestantes = 3;
    visívelAnterior = null;
    estado.avisoXequePendente = false; // já vamos avisar, não repetir
    requestAnimationFrame(animarXeque);
  }
}
// Função específica para o "piscar" do Xeque
// Loop dedicado do "pisca-pisca" do Xeque
function animarXeque() {
  if (!loopAnimaçãoAtivo) return;

  renderizar(
    ctx,
    estado.board.grid,
    estado.selecionado,
    estado.movValidos,
    true,
    true
  );

  const blink = Math.floor(Date.now() / 300) % 2 === 0;
  desenharAvisoXeque(ctx, blink);

  // Conta uma piscada completa a cada transição visível -> invisível
  if (visívelAnterior === true && blink === false) {
    piscadasRestantes--;
  }
  visívelAnterior = blink;

  if (piscadasRestantes > 0) {
    requestAnimationFrame(animarXeque);
  } else {
    // Terminou de piscar: libera o tabuleiro e faz o render final
    loopAnimaçãoAtivo = false;
    estado.bloqueado = false;
    renderizar(
      ctx,
      estado.board.grid,
      estado.selecionado,
      estado.movValidos,
      true,
      true
    );
  }
}

// ── HELPERS DE UI ───────────────────────────────────────── 
function atualizarModoDisplay() {
  const el = document.getElementById('modeDisplay');
  if (!el) return;

  const { modo, dificuldade, corJogador } = estado.config;
  if (modo === 'ai') {
    const cor = corJogador === 'white' ? 'Brancas' : 'Pretas';
    const diff = dificuldade === 'easy' ? 'Fácil' : 'Difícil';
    el.textContent = `Você (${cor}) × IA (${diff})`;
  } else {
    el.textContent = 'Dois jogadores';
  }
}

// ── AÇÕES GLOBAIS (chamadas pelo HTML) ────────────────────
window.openModal = function () {
  document.getElementById('app').classList.remove('visible');
  document.querySelector('.board-wrapper').classList.remove('visible');
  document.getElementById('sidebar').classList.remove('visible');
  abrirModal();
};

// TODO: implementar desfazer jogada
// Precisará de um array de estados anteriores (histórico de boards)
window.undoMove = function () {
  setStatus('Desfazer ainda não implementado', 'alerta');
};

// ── INICIALIZAÇÃO ─────────────────────────────────────────
// Quando o módulo carrega, abrimos o modal imediatamente.
// Nenhum jogo existe ainda — o usuário precisa configurar.
abrirModal();

// --- LISTENERS DE CONFIGURAÇÃO NA SIDEBAR ---
// 1. Lógica das Coordenadas
document.getElementById('configCoords').addEventListener('change', (e) => {
  const coords = document.querySelectorAll('.coord-row, .coord-col');
  coords.forEach(el => el.style.opacity = e.target.checked ? '1' : '0');
});
// 2. Lógica de Mostrar/Esconder Movimentos
document.getElementById('configShowMoves').addEventListener('change', () => {
  renderizarEstado(); // Redesenha com as novas permissões
});

// 3. Sincronizar o Risco
document.getElementById('configRisk').addEventListener('change', () => {
  renderizarEstado(); // Redesenha com as novas permissões
});

function explicarBloqueioRoque(reiRow, reiCol, destinoCol) {
  const rei = estado.board.grid[reiRow][reiCol];
  const cor = rei.color;
  const ehRoquePequeno = (destinoCol === 6); // Coluna G
  const torreCol = ehRoquePequeno ? 7 : 0;
  const torre = estado.board.grid[reiRow][torreCol];

  // 1. Verificar se o Rei moveu
  if (rei.moveu) return "O Roque não é permitido porque o Rei já se moveu nesta partida.";

  // 2. Verificar a Torre
  if (!torre || torre.type !== 'rook' || torre.moveu) {
    return `O Roque deste lado não é permitido porque a Torre na coluna ${ehRoquePequeno ? 'H' : 'A'} já se moveu ou foi capturada.`;
  }

  // 3. Verificar se está em Xeque agora
  if (estado.board.estaEmXeque(cor)) {
    return "Você não pode fazer o Roque enquanto o seu Rei estiver em Xeque!";
  }

  // 4. Verificar se o caminho está livre
  const inicio = Math.min(reiCol, torreCol) + 1;
  const fim = Math.max(reiCol, torreCol);
  for (let c = inicio; c < fim; c++) {
    if (estado.board.grid[reiRow][c] !== null) {
      return "O Roque está bloqueado por peças no caminho.";
    }
  }

  // 5. Verificar se o Rei passará por uma casa atacada
  // No roque pequeno, ele passa pela coluna 5. No grande, pela coluna 3.
  const casaPassagem = ehRoquePequeno ? 5 : 3;
  if (estado.board.estaSendoAtacada(reiRow, casaPassagem, cor)) {
    return "O Roque não é permitido porque o Rei passaria por uma casa sob ataque.";
  }

  if (estado.board.estaSendoAtacada(reiRow, destinoCol, cor)) {
    return "O Roque não é permitido porque a casa de destino do Rei está sendo atacada.";
  }

  return null; // Se chegou aqui, não há erro óbvio (não deveria acontecer se o clique falhou)
}
