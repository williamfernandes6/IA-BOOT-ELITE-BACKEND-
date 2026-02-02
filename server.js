const express = require('express');
const multer = require('multer');
const tesseract = require('node-tesseract-ocr');
const cors = require('cors');

const app = express();
app.use(cors());
const upload = multer({ storage: multer.memoryStorage() });

const config = { lang: "por", oem: 1, psm: 3 };

// --- MOTOR DE IA: DETECÇÃO DE PADRÕES ---
function analisarPadroes(velas) {
    if (velas.length < 5) return { peso: 0, nome: "Dados Insuficientes" };
    
    // Padrão Xadrez (Azul, Roxo, Azul, Roxo)
    if (velas[0] < 2 && velas[1] >= 2 && velas[2] < 2 && velas[3] >= 2) 
        return { peso: 0.25, nome: "Xadrez Detectado" };

    // Padrão Espelho (Repetição de sequência anterior)
    if (velas[0] === velas[4] && velas[1] === velas[5]) 
        return { peso: 0.30, nome: "Espelhamento Confirmado" };

    return { peso: 0, nome: "Ciclo Normal" };
}

app.post('/analisar-fluxo', upload.single('print'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Sem imagem" });
    const text = await tesseract.recognize(req.file.buffer, config);

    const bancaMatch = text.match(/(?:AO|AOA|Kz|KZ)\s?([\d\.,]{3,12})/i);
    const banca = bancaMatch ? `Kz ${bancaMatch[1]}` : "Aguardando Print...";
    
    const velasRaw = text.match(/\d+[\.,]\d{2}/g) || [];
    const velas = velasRaw.map(v => parseFloat(v.replace(',', '.'))).slice(0, 25);

    // Cálculos de Gap
    const gapRosa = velas.findIndex(v => v >= 10) === -1 ? 25 : velas.findIndex(v => v >= 10);
    const gapRoxa = velas.findIndex(v => v >= 5 && v < 10) === -1 ? 25 : velas.findIndex(v => v >= 5 && v < 10);

    // Execução da Super IA
    const padraoIA = analisarPadroes(velas);
    let probBase = 0.40 + (gapRosa * 0.03) + padraoIA.peso;

    let status, cor, gapMin, alvo, dica;

    if (velas.slice(0,3).some(v => v <= 1.10) || velas.filter((v,i) => i < 4 && v < 2).length >= 3) {
        status = "RECOLHA ATIVA"; cor = "#ef4444"; gapMin = 15; alvo = "---";
        dica = "IA detectou drenagem de banca. Aguarde 3 ciclos.";
    } else if (probBase > 0.85 || gapRosa > 18) {
        status = "SINAL: VELA ROSA"; cor = "#db2777"; gapMin = 2;
        alvo = probBase > 0.95 ? "15.00x >>> 100x+" : "10.00x >>> 35x";
        dica = `${padraoIA.nome}: Ciclo de alta probabilidade para Rosa!`;
    } else if (gapRoxa > 7 || padraoIA.peso > 0) {
        status = "SINAL: ROXO ALTO"; cor = "#7e22ce"; gapMin = 4;
        alvo = "5.00x+"; 
        dica = "Padrão de sequência favorável para multiplicador 5x.";
    } else {
        status = "AGUARDANDO CICLO"; cor = "#52525b"; gapMin = 5; alvo = "2.00x";
        dica = "IA em busca de novos padrões. Não entre agora.";
    }

    const agora = new Date();
    agora.setMinutes(agora.getMinutes() + gapMin);
    const timer = agora.toLocaleTimeString("pt-PT", { hour12: false, timeZone: "Africa/Luanda" });

    res.json({ status, cor, pct: `${Math.min(Math.round(probBase * 100), 99)}%`, banca, timerRosa: timer, alvo, historico: velas, dica });
  } catch (e) { res.status(500).send("Erro de Processamento"); }
});

app.listen(process.env.PORT || 3000);
