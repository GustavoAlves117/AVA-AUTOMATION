require('dotenv').config();
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
    if (!fs.existsSync('gabarito_geral_final.json')) {
        console.log("Arquivo 'gabarito_geral_final.json' não encontrado! Gere o gabarito com a IA primeiro.");
        return;
    }

    const gabaritoGeral = JSON.parse(fs.readFileSync('gabarito_geral_final.json', 'utf8'));

    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const page = await browser.newPage();

    // Oculta rastros de automação do navegador
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Intercepta automaticamente qualquer alerta nativo (window.confirm)
    page.on('dialog', async dialog => {
        console.log(`[POP-UP NATIVO] ${dialog.message()} -> Aceitando automaticamente.`);
        await dialog.accept();
    });

    console.log("Realizando login no AVA...");
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

    console.log(`\nIniciando preenchimento e submissão em lote para ${quantidadeDisciplinas} disciplinas...`);

    for (let i = 0; i < quantidadeDisciplinas; i++) {
        const cards = page.locator('.component-card');
        const card = cards.nth(i);
        
        const nomeDisciplina = (await card.locator('.component-card-title').textContent()).trim();
        const indicadorObjetivas = card.locator('.component-indicator-content', { hasText: 'Questões Objetivas' });
        
        let numQuestoes = 0;
        if (await indicadorObjetivas.isVisible()) {
            const textoNumero = await indicadorObjetivas.locator('.component-indicator-value').textContent();
            numQuestoes = parseInt(textoNumero.trim(), 10) || 0;
        }

        if (numQuestoes > 0) {
            console.log(`\n========================================`);
            console.log(`[DISCIPLINA] Processando: ${nomeDisciplina}`);
            console.log(`========================================`);
            
            const btnUniubePlus = card.locator('.component-card-footer button', { hasText: 'UNIUBE+' });
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'load' }),
                btnUniubePlus.click()
            ]);
            
            await page.waitForSelector('.semanaItem');
            
            let avaliacaoContador = 1;
            while (true) {
                let avaliacoesAbertas = page.locator('.tableDescSemRow.ABERTO', { has: page.locator('.fa-list-ul') });
                let totalAbertas = await avaliacoesAbertas.count();
                
                if (totalAbertas === 0) break;

                // Sempre clica na primeira avaliação aberta disponível na tela
                const btnAvaliacao = avaliacoesAbertas.nth(0);
                
                // Extrai exatamente o mesmo número de ciclo/semana que o scraper utilizou
                let onclickAttr = await btnAvaliacao.getAttribute('onclick') || "";
                let matchCiclo = onclickAttr.match(/submitWithEvent\s*\(\s*(\d+)/i);
                let numeroSemana = matchCiclo ? matchCiclo[1] : avaliacaoContador.toString();
                const nomeAvaliacaoAtual = `Avaliação ${numeroSemana}`;

                console.log(`\n--- Abrindo ${nomeAvaliacaoAtual} (Semana Real) ---`);
                
                await Promise.all([
                    btnAvaliacao.click(),
                    page.waitForSelector('.questao-container', { timeout: 10000 }).catch(() => {})
                ]);
                
                await page.waitForSelector('.questao-container');
                const questoes = page.locator('.questao-container');
                const totalQuestoes = await questoes.count();

                // Busca o gabarito utilizando o nome exato da avaliação baseado no ciclo da semana
                const avaliacaoGabarito = gabaritoGeral.find(item => 
                    item && 
                    item.disciplina && item.disciplina.trim().toUpperCase() === nomeDisciplina.trim().toUpperCase() &&
                    item.avaliacao && item.avaliacao.trim().toUpperCase() === nomeAvaliacaoAtual.toUpperCase()
                );
                
                const listaRespostas = avaliacaoGabarito ? avaliacaoGabarito.respostas : [];

                for (let k = 0; k < totalQuestoes; k++) {
                    const blocoQuestao = questoes.nth(k);
                    const tituloQuestao = (await blocoQuestao.locator('.questao-titulo').textContent()).trim();
                    const enunciadoTela = (await blocoQuestao.locator('.questao-enunciado').innerText()).trim();

                    let respostaEncontrada = null;
                    let match = listaRespostas.find(q => {
                        return q && ((q.titulo && q.titulo.toUpperCase() === tituloQuestao.toUpperCase()) || 
                               (q.enunciadoResumo && enunciadoTela.includes(q.enunciadoResumo.substring(0, 30))));
                    });

                    if (match) {
                        respostaEncontrada = match.respostaCorreta || match.resposta;
                    }

                    if (respostaEncontrada) {
                        let respostaStr = respostaEncontrada.toString().trim();
                        const alternativas = blocoQuestao.locator('.alternativa-item');
                        const totalAlternativas = await alternativas.count();

                        let indiceClique = -1;

                        if (!isNaN(respostaStr)) {
                            indiceClique = parseInt(respostaStr, 10) - 1;
                        } else {
                            const respostaLimpa = respostaStr.toLowerCase().trim();
                            
                            // 1. Correspondência exata de texto
                            for (let a = 0; a < totalAlternativas; a++) {
                                const textoAlt = (await alternativas.nth(a).innerText()).toLowerCase().trim();
                                if (textoAlt === respostaLimpa) {
                                    indiceClique = a;
                                    break;
                                }
                            }

                            // 2. Contém a resposta de forma íntegra
                            if (indiceClique === -1) {
                                for (let a = 0; a < totalAlternativas; a++) {
                                    const textoAlt = (await alternativas.nth(a).innerText()).toLowerCase().trim();
                                    if (textoAlt.includes(respostaLimpa)) {
                                        indiceClique = a;
                                        break;
                                    }
                                }
                            }

                            // 3. Fallback reverso
                            if (indiceClique === -1) {
                                for (let a = 0; a < totalAlternativas; a++) {
                                    const textoAlt = (await alternativas.nth(a).innerText()).toLowerCase().trim();
                                    if (textoAlt.length > 5 && respostaLimpa.includes(textoAlt)) {
                                        indiceClique = a;
                                        break;
                                    }
                                }
                            }
                        }

                        if (indiceClique >= 0 && indiceClique < totalAlternativas) {
                            const radio = alternativas.nth(indiceClique).locator('input[type="radio"]');
                            if (await radio.isVisible()) {
                                await radio.click();
                                console.log(`✔ [MARCADO] ${tituloQuestao} -> Alternativa ${indiceClique + 1}`);
                            } else {
                                await alternativas.nth(indiceClique).click();
                                console.log(`✔ [MARCADO (Alternativa)] ${tituloQuestao} -> Item ${indiceClique + 1}`);
                            }
                        } else {
                            console.log(`❌ [AVISO] Resposta "${respostaStr}" não mapeada para ${tituloQuestao}`);
                        }
                    } else {
                        console.log(`❌ [AVISO] Questão "${tituloQuestao}" não encontrada no JSON.`);
                    }
                    await page.waitForTimeout(600);
                }

                // Finalização e envio da avaliação atual
                console.log("Finalizando avaliação atual...");
                await page.locator('button', { hasText: 'FINALIZAR AVALIAÇÃO' }).click();

                const modalAtivo = page.locator('#overlayPag #modalConfirmAvaliacao');
                await modalAtivo.waitFor({ state: 'visible', timeout: 5000 });

                await page.evaluate(() => {
                    const modalDiv = document.querySelector('#overlayPag #modalConfirmAvaliacao');
                    if (modalDiv) {
                        const botoes = Array.from(modalDiv.querySelectorAll('button'));
                        const btnSim = botoes.find(b => b.textContent.trim() === 'Sim');
                        if (btnSim) btnSim.click();
                    }
                });

                console.log("✔ [ENVIADO] Avaliação finalizada com sucesso!");
                await page.waitForTimeout(3000);

                // Volta para a lista de semanas da disciplina
                await page.goBack(); 
                await page.waitForSelector('.semanaItem');

                avaliacaoContador++;
            }
            
            // Retorna para a tela principal de componentes/disciplinas
            await page.goBack(); 
            await page.waitForSelector('.component-card');
            quantidadeDisciplinas = await page.locator('.component-card').count();
        }
    }

    console.log('\nProcesso completo em lote finalizado com sucesso!');
})();