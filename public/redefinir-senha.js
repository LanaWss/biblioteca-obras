const formulario = document.getElementById("form-redefinir");
const mensagem = document.getElementById("mensagem-redefinir");
const token = new URLSearchParams(window.location.search).get("token") || "";

function mostrarMensagem(texto) {
  mensagem.textContent = texto;
  mensagem.classList.add("visivel");
}

formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const novaSenha = document.getElementById("nova-senha").value;
  const confirmarSenha = document.getElementById("confirmar-senha").value;

  if (!token) {
    mostrarMensagem("O link de recuperação é inválido.");
    return;
  }
  if (!formulario.checkValidity() || novaSenha !== confirmarSenha) {
    mostrarMensagem("Informe duas senhas iguais com pelo menos 6 caracteres.");
    return;
  }

  try {
    const resposta = await fetch("/redefinir-senha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, novaSenha }),
    });
    const resultado = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      mostrarMensagem(resultado.erro || "Não foi possível redefinir a senha.");
      return;
    }

    mostrarMensagem("Senha redefinida com sucesso. Redirecionando para o login...");
    formulario.reset();
    setTimeout(() => window.location.replace("/login.html"), 1200);
  } catch (erro) {
    mostrarMensagem("Não foi possível conectar ao servidor. Tente novamente.");
  }
});
