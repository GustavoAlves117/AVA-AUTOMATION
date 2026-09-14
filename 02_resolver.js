require('dotenv').config();
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function prepararImagem(src) {
    if (src && src.startsWith('data:image')) {
        const mimeType = src.split(';')[0].split(':')[1];
        const base64Data = src.split(',')[1];
        return {
            inlineData: {
                mimeType: mimeType,
                data: base64Data
            }
        };
    }
    return null;
}

async function processarTudoDeUmaVez() {
    if (!fs.existsSync('questoes_extraidas.json')) {
        console.log("Arquivo 'questoes_extraidas.json' não encontrado. Execute o raspador primeiro!");
        return;
    }

    const conteudoJsonBruto = fs.readFileSync('questoes_extraidas.json', 'utf8');
    let dadosJson = JSON.parse(conteudoJsonBruto);

    console.log("Lendo o banco de questões e estruturando o pacote multimodal para a IA...");

    let contentsArray = [];

    const promptTexto = `Você é um especialista resolvendo provas acadêmicas de ensino superior. 
Abaixo e anexadas estão as informações contendo disciplinas, respectivas avaliações e questões de múltipla escolha (algumas contendo prints visuais de enunciados ou gráficos).
Analise todas as questões de todas as disciplinas e avaliações. 
Retorne a resposta EXATAMENTE no formato de un JSON puro (sem blocos de código markdown como \`\`\`json, apenas o texto do JSON válido), estruturado da seguinte forma:
[
  {
    "disciplina": "NOME DA DISCIPLINA",
    "avaliacao": "Avaliação X",
    "respostas": [
      {"titulo": "Questão 1", "resposta": "Número ou texto da alternativa correta"},
      {"titulo": "Questão 2", "resposta": "Número ou texto da alternativa correta"}
    ]
  }
]

Aqui estão os dados textuais das provas:
${conteudoJsonBruto}`;

    // Adiciona o texto principal da requisição
    contentsArray.push({ text: promptTexto });

    // Varre buscando as imagens em base64 nas questões e injeta no formato inlineData correto
    let contadorImagens = 0;
    dadosJson.forEach(disc => {
        disc.questoes.forEach(q => {
            if (q.imagens && q.imagens.length > 0) {
                q.imagens.forEach(imgSrc => {
                    const imgObj = prepararImagem(imgSrc);
                    if (imgObj) {
                        contentsArray.push(imgObj);
                        contadorImagens++;
                    }
                });
            }
        });
    });

    console.log(`[PACOTE] Encontradas ${contadorImagens} imagens/prints anexados no total.`);

    try {
        console.log("[IA] Enviando o pacote completo para o Gemini...");
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash', // Atualizado para um modelo flash estável com suporte multimodal
            contents: contentsArray,
        });

        let respostaIA = response.text ? response.text.trim() : "[]";
        
        // Remove eventuais marcações de bloco de código que a IA insira
        respostaIA = respostaIA.replace(/```json/g, '').replace(/```/g, '').trim();

        fs.writeFileSync('gabarito_geral_final.json', respostaIA);
        console.log('\nSucesso total! O gabarito completo de todas as disciplinas foi salvo em "gabarito_geral_final.json".');

    } catch (error) {
        console.error("[ERRO] Falha ao processar o pacote completo na API:", error.message);
    }
}

processarTudoDeUmaVez();