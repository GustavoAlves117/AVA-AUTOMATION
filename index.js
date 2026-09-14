require('dotenv').config();
const { chromium } = require('playwright');

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
    
    // Variável que vai acumular todo o código do PDF
    let conteudoPDF = `
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h2 { color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 5px; margin-top: 40px;}
                .questao { background: #f9f9f9; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
                .alternativas { list-style-type: none; padding-left: 0; }
                .alternativas li { margin-bottom: 8px; }
                img { max-width: 400px; display: block; margin-top: 10px; border: 1px solid #ccc; }
            </style>
        </head>
        <body>
            <h1>Banco de Questões - Uniube AVA</h1>
    `;

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
                
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'load' }),
                    btnAvaliacao.click()
                ]);
                
                // ==========================================================
                // EXTRAÇÃO E MONTAGEM DO HTML PARA O PDF
                // ==========================================================
                await page.waitForSelector('.questao-container');
                const questoes = page.locator('.questao-container');
                const totalQuestoes = await questoes.count();

                conteudoPDF += `<h2>${nomeDisciplina.trim()} - Avaliação ${j + 1}</h2>`;

                for (let k = 0; k < totalQuestoes; k++) {
                    const blocoQuestao = questoes.nth(k);
                    const titulo = await blocoQuestao.locator('.questao-titulo').textContent();
                    const enunciadoLoc = blocoQuestao.locator('.questao-enunciado');
                    const enunciado = await enunciadoLoc.innerText();
                    
                    conteudoPDF += `<div class="questao">`;
                    conteudoPDF += `<h3>${titulo.trim()}</h3>`;
                    
                    // .replace transforma quebras de linha normais em tags HTML <br>
                    conteudoPDF += `<p><strong>Enunciado:</strong><br>${enunciado.replace(/\n/g, '<br>')}</p>`;

                    const imagens = enunciadoLoc.locator('img');
                    const qtdImagens = await imagens.count();
                    for (let img = 0; img < qtdImagens; img++) {
                        const src = await imagens.nth(img).getAttribute('src');
                        if (src) conteudoPDF += `<img src="${src}">`;
                    }

                    conteudoPDF += `<ul class="alternativas">`;
                    const alternativas = blocoQuestao.locator('.alternativa-item');
                    const totalAlternativas = await alternativas.count();
                    
                    for (let a = 0; a < totalAlternativas; a++) {
                        const textoAlternativa = await alternativas.nth(a).innerText();
                        const letra = String.fromCharCode(65 + a);
                        conteudoPDF += `<li><strong>${letra})</strong> ${textoAlternativa.trim()}</li>`;
                    }
                    conteudoPDF += `</ul></div>`;
                }
                
                await page.goBack(); 
                await page.waitForSelector('.semanaItem');
            }
            
            await page.goBack(); 
            await page.waitForSelector('.component-card');
            quantidadeDisciplinas = await page.locator('.component-card').count();
            
        }
    }

    // Fechamento das tags HTML
    conteudoPDF += `</body></html>`;

    // ==========================================================
    // CRIAÇÃO DO ARQUIVO PDF NATIVO NO PLAYWRIGHT
    // ==========================================================
    console.log('\n>> Todas as questões extraídas. Gerando arquivo PDF...');
    
    // Abre uma página em branco e injeta nosso HTML raspado nela
    const pdfPage = await browser.newPage();
    await pdfPage.setContent(conteudoPDF);
    
    // Manda o Playwright "imprimir" essa página
    await pdfPage.pdf({ 
        path: 'Todas_Questoes.pdf', 
        format: 'A4', 
        printBackground: true,
        margin: { top: '20px', bottom: '20px' }
    });
    
    console.log('Sucesso! O arquivo "Todas_Questoes.pdf" foi salvo na pasta do seu projeto.');

    await browser.close();
})();