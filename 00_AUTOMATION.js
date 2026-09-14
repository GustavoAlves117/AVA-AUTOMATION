const { execSync } = require('child_process');
const fs = require('fs');

const scripts = [
    { nome: 'Passo 1: Coleta de Questões', arquivo: '01_scraper.js' },
    { nome: 'Passo 2: Geração do Gabarito', arquivo: '02_resolver.js' },
    { nome: 'Passo 3: Marcador e Envio em Lote', arquivo: '03_marcador.js' }
];

(async () => {
    console.log("==========================================");
    console.log("INICIANDO PIPELINE DE AUTOMAÇÃO COMPLETA");
    console.log("==========================================\n");

    for (const etapa of scripts) {
        if (!fs.existsSync(etapa.arquivo)) {
            console.error(`[ERRO CRÍTICO] O arquivo "${etapa.arquivo}" não foi encontrado.`);
            process.exit(1);
        }

        console.log(`[EXECUTANDO] ${etapa.nome} (${etapa.arquivo})...`);
        try {
            // stdio: 'inherit' faz o erro do script filho ser propagado corretamente para cá
            execSync(`node ${etapa.arquivo}`, { stdio: 'inherit' });
            console.log(`[SUCESSO] ${etapa.nome} finalizado.\n`);
        } catch (error) {
            console.error(`\n[FALHA CRÍTICA] O pipeline foi interrompido porque o script "${etapa.arquivo}" falhou.`);
            console.error("Corrija o erro acima antes de rodar novamente.");
            process.exit(1);
        }
    }

    console.log("==========================================");
    console.log("PIPELINE FINALIZADO COM SUCESSO!");
    console.log("==========================================");
})();