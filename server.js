const express = require('express');
const multer = require('multer');
const tesseract = require('node-tesseract-ocr');
const cors = require('cors');

const app = express();
app.use(cors());
const upload = multer({ storage: multer.memoryStorage() });

const config = { lang: "por", oem: 1, psm: 3 };

// --- MOTOR DE INTELIGÊNCIA AVANÇADA ---
function analisarProvedor(velas) {
    if (velas.length < 10) return { fase: "ANALISANDO", risco: 50 };
    
    // Cálculo de Densidade (Média real das últimas 10 velas)
    const soma = velas.slice(0, 10).reduce((a, b) => a + b, 0);
    const media = soma / 10;
    
    // Identificação de Fase do Provedor Spribe
    let fase = "DISTRIBUIÇÃO"; // Pagando
    let risco = 20;

    if (media < 2.5) {
        fase = "RECOLHA (DRENAGEM)";
        risco = 80;
    } else if (media > 8) {
        fase = "SURF DE ROSAS";
        risco = 10;
    }

    return { fase, media: media.toFixed(2), risco };
}

app.post('/analisar-fluxo', upload.single('print'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Sem imagem" });
    const text = await tesseract.recognize(req.file.buffer, config);

    const bancaMatch = text.match(/(?:AO|AOA|Kz|KZ)\s?([\d\.,]{3,12})/i);
    const banca = bancaMatch ? `Kz ${bancaMatch[1]}` : "Ajuste o Print";
    
    const velasRaw = text.match(/\d+[\.,]\d{2}/g) || [];
    const velas = velasRaw.map(v => parseFloat(v.replace(',', '.'))).slice(0, 25);

    // 1. Análise de Provedor (O Próximo Nível)
    const intel = analisarProvedor(velas);

    // 2. Gaps de Roxo 5x e Rosa 10x
    const gapRosa = velas.findIndex(v => v >= 10) === -1 ? 25 : velas.findIndex(v => v >= 10);
    const gapRoxa = velas.findIndex(v => v >= 5 && v < 10) === -1 ? 25 : velas.findIndex(v => v >= 5 && v < 10);

    let status, cor, gapMin, alvo, dica, pct;

    // 3. LÓGICA DE DECISÃO "SMART"
    if (intel.risco > 70 || velas.slice(0,3).some(v => v <= 1.15)) {
        status = "ALERTA: RECOLHA";
        cor = "#ef4444";
        gapMin = 15;
        alvo = "0.00x";
        pct = "10%";
        dica = `Provedor em modo ${intel.fase}. Média baixa (${intel.media}x). NÃO ENTRE!`;
    } 
    else if (gapRosa > 15 || (gapRosa > 10 && intel.fase === "SURF DE ROSAS")) {
        status = "SINAL: VELA ROSA";
        cor = "#db2777";
        gapMin = 2;
        alvo = "10.00x >>> 50x";
        pct = (90 - intel.risco) + "%";
        dica = `Ciclo de Rosa detectado. Provedor pagando acima da média!`;
    }
    else if (gapRoxa > 6) {
        status = "SINAL: ROXO ALTO";
        cor = "#7e22ce";
        gapMin = 4;
        alvo = "5.00x+";
        pct = "85%";
        dica = `Estabilidade detectada em ${intel.media}x. Alvo seguro em 5x.`;
    }
    else {
        status = "PADRÃO EM FORMAÇÃO";
        cor = "#52525b";
        gapMin = 6;
        alvo = "2.00x";
        pct = "50%";
        dica = "IA aguardando confirmação de saída do ciclo azul.";
    }

    const agora = new Date();
    agora.setMinutes(agora.getMinutes() + gapMin);
    const timer = agora.toLocaleTimeString("pt-PT", { hour12: false, timeZone: "Africa/Luanda" });

    res.json({ status, cor, pct, banca, timerRosa: timer, alvo, historico: velas, dica });
  } catch (e) { res.status(500).send("Erro de IA"); }
});

app.listen(process.env.PORT || 3000);
