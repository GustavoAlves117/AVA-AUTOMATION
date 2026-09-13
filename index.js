const { chromium } = require('playwright');

(async () => {
  // O "headless: false" permite que você veja o navegador abrindo na tela
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Navega até o site
  await page.goto('https://pt.wikipedia.org');

  // Localiza a barra de pesquisa, digita o texto e pressiona Enter
  await page.fill('input[name="search"]', 'Navegador web');
  await page.press('input[name="search"]', 'Enter');

  // Aguarda a rede ficar ociosa e tira o print
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'resultado.png' });

  // Fecha o processo
  await browser.close();
})();