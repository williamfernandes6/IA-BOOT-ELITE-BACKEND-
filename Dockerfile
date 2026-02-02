FROM node:18
RUN apt-get update && apt-get install -y tesseract-ocr tesseract-ocr-por libtesseract-dev && apt-get clean
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
