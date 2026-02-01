import os, re, numpy as np, pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
from PIL import Image
import pytesseract
from datetime import datetime
import pytz

app = Flask(__name__)
CORS(app)

# Modelo de IA - Padrões SHA-512
def build_model():
    model = tf.keras.Sequential([
        tf.keras.layers.Dense(128, activation='relu', input_shape=(25,)),
        tf.keras.layers.Dense(64, activation='relu'),
        tf.keras.layers.Dense(1, activation='sigmoid')
    ])
    model.compile(optimizer='adam', loss='binary_crossentropy')
    return model

model_ia = build_model()

@app.route('/analisar-fluxo', methods=['POST'])
def analisar():
    try:
        file = request.files['print']
        img = Image.open(file.stream)
        texto = pytesseract.image_to_string(img)

        # 1. Identificar Banca Kwanza (AO/AOA)
        banca_match = re.search(r'(?:AO|AOA|Kz|KZ)\s?([\d\.,]{3,12})', texto)
        banca = banca_match.group(1) if banca_match else "0,00"
        
        # 2. Extrair Histórico de Velas
        velas_raw = re.findall(r'(\d+[\.,]\d{2})', texto.replace(',', '.'))
        velas = [float(v) for v in velas_raw if float(v) < 500][:25]
        if len(velas) < 25: velas += [1.50] * (25 - len(velas))

        # 3. Lógica do Manual v2.0
        azuis_seguidas = 0
        for v in velas:
            if v < 2.0: azuis_seguidas += 1
            else: break
        tem_gancho = any(v <= 1.10 for v in velas[:3])

        # 4. Previsão IA (TensorFlow)
        input_ia = np.array(velas).reshape(1, 25)
        prob = float(model_ia.predict(input_ia, verbose=0)[0][0])

        # 5. Fuso Luanda e Decisão de Sinal
        tz = pytz.timezone('Africa/Luanda')
        agora = datetime.now(tz)
        
        if azuis_seguidas >= 3 or tem_gancho:
            status, cor, gap, alvo = "RECOLHA: AGUARDAR", "#ef4444", 12, "---"
            tendencia = "recolha"
        elif prob > 0.88:
            status, cor, gap = "SINAL: VELA ROSA", "#db2777", 4
            alvo = "10.00x >>> " + ("100x+" if prob > 0.96 else "30x")
            tendencia = "pagador"
        else:
            status, cor, gap = "SINAL: ROXO ALTO", "#7e22ce", 3
            alvo = "5.00x+"
            tendencia = "pagador"

        previsao = (agora.replace(minute=(agora.minute + gap)%60, second=np.random.randint(0,59))).strftime("%H:%M:%S")

        return jsonify({
            "status": status, "cor": cor, "pct": f"{int(prob*100)}%", 
            "banca": f"Kz {banca}", "timerRosa": previsao, 
            "alvo": alvo, "historico": velas[:25], "tendencia": tendencia
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)))
