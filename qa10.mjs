export default async function run(page, ui) {
  // As funções do script estão em escopo de módulo? Verificar de onde vem o valor url(origin)
  return await page.evaluate(() => {
    const fundo = document.querySelector(".cards .fundo-card");
    // O valor é url("http://127.0.0.1:3000/") — isso é o resultado de new URL("", origin).href
    // Provável: urlExternaSegura("data:...") retornando "" e algo convertendo. Ou o código antigo
    // Testar: recarregar e observar novamente o fundo final
    return {
      fundo: fundo.style.backgroundImage.slice(0, 60),
    };
  });
}
