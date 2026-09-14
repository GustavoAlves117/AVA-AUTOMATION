require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 500 });
    const page = await browser.newPage();

    await page.goto('https://sga.uniube.br/login/');
    await page.fill('#usuarioLogin', process.env.UNIUBE_USER);
    await page.fill('#senhaView', process.env.UNIUBE_SENHA);
    await page.click('.loginButton');
    await page.waitForURL('https://sga.uniube.br/academico/cursos2.php?acesso=1');
    await page.click('.cartaoCurso .btn');
    await page.waitForURL('https://ava3.uniube.br/ava/1/destaques/');
    await page.goto('https://ava3.uniube.br/ava/1/cursos/');
    await page.waitForURL('https://ava3.uniube.br/ava/1/cursos/');
    await page.click('.btnAltoContraste');
    await page.waitForURL('https://ava3.uniube.br/ava/2/componentes/');

    await page.waitForSelector('.component-card');
    let quantidadeDisciplinas = await page.locator('.component-card').count();
    
    // Array estruturado para armazenar todo o banco de questões
    let bancoDeQuestoes = [];

    console.log(`Iniciando varredura em ${quantidadeDisciplinas} disciplinas...`);

    for (let i = 0; i < quantidadeDisciplinas; i++) {
        const cards = page.locator('.component-card');
        const card = cards.nth(i);
        
        const nomeDisciplina = await card.locator('.component-card-title').textContent();
        const indicadorObjetivas = card.locator('.component-indicator-content', { hasText: 'Questões Objetivas' });
        
        let numQuestoes = 0;
        if (await indicadorObjetivas.isVisible()) {
            const textoNumero = await indicadorObjetivas.locator('.component-indicator-value').textContent();
            numQuestoes = parseInt(textoNumero.trim(), 10) || 0;
        }

        if (numQuestoes > 0) {
            console.log(`\n[DISCIPLINA] Extraindo: ${nomeDisciplina.trim()}`);
            
            const btnUniubePlus = card.locator('.component-card-footer button', { hasText: 'UNIUBE+' });
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'load' }),
                btnUniubePlus.click()
            ]);
            
            await page.waitForSelector('.semanaItem');
            
            let avaliacoes = page.locator('.tableDescSemRow.ABERTO', { has: page.locator('.fa-list-ul') });
            let totalSemanasAbertas = await avaliacoes.count();
            
            for (let j = 0; j < totalSemanasAbertas; j++) {
                avaliacoes = page.locator('.tableDescSemRow.ABERTO', { has: page.locator('.fa-list-ul') });
                const btnAvaliacao = avaliacoes.nth(j);
                
                // Extrai o ciclo/semana exato do atributo onclick do botão da avaliação
                let onclickAttr = await btnAvaliacao.getAttribute('onclick') || "";
                let matchCiclo = onclickAttr.match(/submitWithEvent\s*\(\s*(\d+)/i);
                let numeroSemana = matchCiclo ? matchCiclo[1] : (j + 1).toString();
                let nomeAvaliacaoReal = `Avaliação ${numeroSemana}`;

                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'load' }),
                    btnAvaliacao.click()
                ]);
                
                await page.waitForSelector('.questao-container');
                const questoes = page.locator('.questao-container');
                const totalQuestoes = await questoes.count();

                let questoesDessaAvaliacao = [];

                for (let k = 0; k < totalQuestoes; k++) {
                    const blocoQuestao = questoes.nth(k);
                    const titulo = await blocoQuestao.locator('.questao-titulo').textContent();
                    const enunciadoLoc = blocoQuestao.locator('.questao-enunciado');
                    const enunciado = await enunciadoLoc.innerText();
                    
                    let imagensBase64 = [];
                    const temGrafico = await blocoQuestao.locator('img, svg, canvas').count();

                    if (temGrafico > 0) {
                        try {
                            const screenshotBuffer = await blocoQuestao.screenshot({ type: 'png' });
                            const base64Image = screenshotBuffer.toString('base64');
                            imagensBase64.push(`data:image/png;base64,${base64Image}`);
                            console.log(`[VISUAL DETECTADO] Screenshot capturado para ${titulo}`);
                        } catch (err) {
                            console.log(`[AVISO] Falha ao capturar imagem da ${titulo}`);
                        }
                    }

                    let alternativasTexto = [];
                    const alternativas = blocoQuestao.locator('.alternativa-item');
                    const totalAlternativas = await alternativas.count();
                    
                    for (let a = 0; a < totalAlternativas; a++) {
                        const textoAlternativa = await alternativas.nth(a).innerText();
                        alternativasTexto.push(textoAlternativa.trim());
                    }

                    questoesDessaAvaliacao.push({
                        titulo: titulo.trim(),
                        enunciado: enunciado.trim(),
                        imagens: imagensBase64,
                        alternativas: alternativasTexto
                    });
                }

                bancoDeQuestoes.push({
                    disciplina: nomeDisciplina.trim(),
                    avaliacao: nomeAvaliacaoReal, // Grava o nome real (ex: Avaliação 3, Avaliação 5)
                    questoes: questoesDessaAvaliacao
                });
                
                await page.goBack(); 
                await page.waitForSelector('.semanaItem');
            }
            
            await page.goBack(); 
            await page.waitForSelector('.component-card');
            quantidadeDisciplinas = await page.locator('.component-card').count();
        }
    }

    // ==========================================================
    // CRIAÇÃO DO ARQUIVO JSON
    // ==========================================================
    console.log('\n>> Todas as questões extraídas. Salvando arquivo JSON...');
    fs.writeFileSync('questoes_extraidas.json', JSON.stringify(bancoDeQuestoes, null, 2));
    console.log('Sucesso! O arquivo "questoes_extraidas.json" foi salvo na pasta do seu projeto.');

    await browser.close();
})();