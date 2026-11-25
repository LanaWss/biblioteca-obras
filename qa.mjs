export default async function run(page, ui) {
  const email = `qa${Date.now()}@teste.com`;
  const senha = "senha123";

  // ir para cadastro
  await ui.click("@e6");
  await page.waitForTimeout(300);

  const snap = await ui.snapshot();
  const campoNome = snap.match(/@(e\d+) textbox "Nome/i)?.[1];
  const campoEmail = snap.match(/@(e\d+) textbox "Email/i)?.[1];
  const campoSenha = snap.match(/@(e\d+) textbox "Senha/i)?.[1];
  const campoConfirmar = snap.match(/@(e\d+) textbox "Confirmar/i)?.[1];
  const botaoCriar = snap.match(
    /@(e\d+) button "(?:Criar conta|Cadastrar)/i,
  )?.[1];

  if (!campoEmail || !campoSenha) {
    return { erro: "campos de cadastro nao encontrados", snap };
  }

  await ui.fill(campoNome, "QA Teste");
  await ui.fill(campoEmail, email);
  await ui.fill(campoSenha, senha);
  if (campoConfirmar) await ui.fill(campoConfirmar, senha);

  // aceite dos termos se existir checkbox
  const snap2 = await ui.snapshot();
  const aceite = snap2.match(/@(e\d+) checkbox/i)?.[1];
  if (aceite) await ui.click(aceite);

  await ui.click(botaoCriar || "@e5");
  await page.waitForTimeout(2500);

  return { email, url: page.url() };
}
