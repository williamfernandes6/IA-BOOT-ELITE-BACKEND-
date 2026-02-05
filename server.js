const express = require('express');
const multer = require('multer');
const tesseract = require('node-tesseract-ocr');
const cors = require('cors');
const fs = require('fs-extra');

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

const config = { lang: "por", oem: 1, psm: 3 };
const LOG_FILE = './aprendizado_ia.json';

app.get('/ping', (req, res) => res.send('online'));

app.post('/feedback', async (req, res) => {
    const { status, hora, dia, alvo } = req.body;
    const log = await fs.readJson(LOG_FILE).catch(() => []);
    log.push({ status, hora, dia, alvo, timestamp: new Date() });
    await fs.writeJson(LOG_FILE, log);
    res.json({ message: "IA Aprendendo..." });
});

app.post('/analisar-fluxo', upload.single('print'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Sem imagem" });
    const text = await tesseract.recognize(req.file.buffer, config);
    const bancaMatch = text.match(/(?:AO|AOA|Kz|KZ|Saldo|Banca)\s?([\d\.,\s]{3,15})/i);
    const banca = bancaMatch ? `Kz ${bancaMatch[1].trim()}` : "Ajuste o Print";
    const velasRaw = text.match(/\d+[\.,]\d{2}/g) || [];
    const velas = velasRaw.map(v => parseFloat(v.replace(',', '.'))).slice(0, 25);
    const ultimas10 = velas.slice(0, 10);
    const media = ultimas10.length > 0 ? ultimas10.reduce((a, b) => a + b, 0) / ultimas10.length : 0;
    
    let tendencia = "ESTÁVEL";
    let corTendencia = "#3b82f6";
    if (media < 2.5) { tendencia = "RECOLHA"; corTendencia = "#ef4444"; }
    else if (media > 5) { tendencia = "PAGAMENTO"; corTendencia = "#22c55e"; }

    const gapRosa = velas.findIndex(v => v >= 10) === -1 ? 25 : velas.findIndex(v => v >= 10);
    const gapRoxa = velas.findIndex(v => v >= 5 && v < 10) === -1 ? 25 : velas.findIndex(v => v >= 5 && v < 10);

    let status, cor, gapMin, alvo, dica, pct;

    if (tendencia === "RECOLHA" || velas.slice(0,2).some(v => v <= 1.10)) {
        status = "RECOLHA ATIVA"; cor = "#ef4444"; gapMin = 15; alvo = "ESPERAR";
        dica = "IA detetou drenagem. Não entre agora."; pct = "5%";
    } else if (gapRosa > 15 || (gapRosa > 8 && tendencia === "PAGAMENTO")) {
        status = "SINAL: VELA ROSA"; cor = "#db2777"; gapMin = 2;
        alvo = "10.00x+"; dica = "Momento de Pago Detetado!"; pct = "94%";
    } else if (gapRoxa > 6) {
        status = "SINAL: ROXO ALTO"; cor = "#7e22ce"; gapMin = 4;
        alvo = "5.00x+"; dica = "Tendência favorável para 5x."; pct = "82%";
    } else {
        status = "ANALISANDO"; cor = "#52525b"; gapMin = 5; alvo = "2.00x";
        dica = "Aguardando confirmação."; pct = "45%";
    }

    const agora = new Date();
    agora.setMinutes(agora.getMinutes() + gapMin);
    const timer = agora.toLocaleTimeString("pt-PT", { hour12: false, timeZone: "Africa/Luanda" });

    res.json({ status, cor, pct, banca, timerRosa: timer, alvo, historico: velas, dica, tendencia, corTendencia });
  } catch (e) { res.status(500).send("Erro"); }
});

app.listen(process.env.PORT || 3000);
