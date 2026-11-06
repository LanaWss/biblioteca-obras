const formulario = document.getElementById("form-login");
const campoEmail = document.getElementById("email");
const campoSenha = document.getElementById("senha");
const botaoEntrar = document.getElementById("botao-entrar");
const mensagem = document.getElementById("mensagem-login");
const alternarSenha = document.getElementById("alternar-senha");
const formCadastro = document.getElementById("form-cadastro");
const formRecuperacao = document.getElementById("form-recuperacao");
const esqueciSenha = document.getElementById("esqueci-senha");
const voltarLogin = document.getElementById("voltar-login");
const botaoRecuperar = document.getElementById("botao-recuperar");
const campoEmailRecuperacao = document.getElementById("email-recuperacao");
const alternarCadastro = document.getElementById("alternar-cadastro");
const cabecalhoLogin = document.querySelector(".login-cabecalho");
let modoCadastro = false;

if (localStorage.getItem("token")) {
  window.location.replace("/");
}

alternarSenha.addEventListener("click", () => {
  const senhaVisivel = campoSenha.type === "text";

  campoSenha.type = senhaVisivel ? "password" : "text";
  alternarSenha.textContent = senhaVisivel ? "Mostrar" : "Ocultar";
  alternarSenha.setAttribute(
    "aria-label",
    senhaVisivel ? "Mostrar senha" : "Ocultar senha",
  );
});

function mostrarMensagem(texto) {
  mensagem.textContent = texto;
  mensagem.classList.add("visivel");
}

function definirCarregamento(ativo) {
  botaoEntrar.disabled = ativo;
  botaoEntrar.classList.toggle("carregando", ativo);
  botaoEntrar.setAttribute("aria-busy", String(ativo));
}

function alternarModoCadastro() {
  modoCadastro = !modoCadastro;
  formulario.hidden = modoCadastro;
  formRecuperacao.hidden = true;
  formCadastro.hidden = !modoCadastro;
  esqueciSenha.hidden = modoCadastro;
  alternarCadastro.textContent = modoCadastro
    ? "Já tenho uma conta"
    : "Ainda não tenho uma conta";
  cabecalhoLogin.querySelector("h2").textContent = modoCadastro
    ? "Criar uma conta"
    : "Entrar na conta";
  cabecalhoLogin.querySelector("p").textContent = modoCadastro
    ? "Crie seu acesso para organizar sua biblioteca pessoal."
    : "Acesse sua biblioteca para continuar acompanhando suas obras.";
  mensagem.classList.remove("visivel");
}

alternarCadastro.addEventListener("click", alternarModoCadastro);

esqueciSenha.addEventListener("click", () => {
  formulario.hidden = true;
  formCadastro.hidden = true;
  formRecuperacao.hidden = false;
  alternarCadastro.hidden = true;
  cabecalhoLogin.querySelector("h2").textContent = "Recuperar senha";
  cabecalhoLogin.querySelector("p").textContent =
    "Informe o email cadastrado para receber uma senha temporária.";
  mensagem.classList.remove("visivel");
  campoEmailRecuperacao.value = campoEmail.value;
  campoEmailRecuperacao.focus();
});

voltarLogin.addEventListener("click", () => {
  formRecuperacao.hidden = true;
  formulario.hidden = false;
  alternarCadastro.hidden = false;
  esqueciSenha.hidden = false;
  cabecalhoLogin.querySelector("h2").textContent = "Entrar na conta";
  cabecalhoLogin.querySelector("p").textContent =
    "Acesse sua biblioteca para continuar acompanhando suas obras.";
  mensagem.classList.remove("visivel");
  campoEmail.focus();
});

formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const email = campoEmail.value.trim();
  const senha = campoSenha.value;

  mensagem.classList.remove("visivel");

  if (!formulario.checkValidity()) {
    mostrarMensagem("Informe um email válido e uma senha com pelo menos 6 caracteres.");
    return;
  }

  definirCarregamento(true);

  try {
    const resposta = await fetch("/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        senha,
      }),
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      mostrarMensagem(resultado.erro || "Não foi possível entrar. Confira seus dados.");
      campoSenha.focus();
      return;
    }

    localStorage.setItem("token", resultado.token);
    localStorage.setItem("nomeUsuario", resultado.nome || "");
    sessionStorage.setItem("mostrarBoasVindas", "true");
    window.location.replace("/");
  } catch (erro) {
    mostrarMensagem("Não foi possível conectar ao servidor. Tente novamente.");
  } finally {
    definirCarregamento(false);
  }
});

formRecuperacao.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const email = campoEmailRecuperacao.value.trim();
  mensagem.classList.remove("visivel");

  if (!formRecuperacao.checkValidity()) {
    mostrarMensagem("Informe um email válido.");
    campoEmailRecuperacao.focus();
    return;
  }

  botaoRecuperar.disabled = true;
  botaoRecuperar.classList.add("carregando");
  botaoRecuperar.setAttribute("aria-busy", "true");

  try {
    const resposta = await fetch("/recuperar-senha", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
    const resultado = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      mostrarMensagem(resultado.erro || "Não foi possível solicitar a recuperação.");
      return;
    }

    mostrarMensagem(
      "Se o email estiver cadastrado, enviaremos uma senha temporária. Confira sua caixa de entrada.",
    );
    formRecuperacao.reset();
  } catch (erro) {
    mostrarMensagem("Não foi possível conectar ao servidor. Tente novamente.");
  } finally {
    botaoRecuperar.disabled = false;
    botaoRecuperar.classList.remove("carregando");
    botaoRecuperar.setAttribute("aria-busy", "false");
  }
});

formCadastro.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const nome = document.getElementById("nome-cadastro").value.trim();
  const email = document.getElementById("email-cadastro").value.trim();
  const senha = document.getElementById("senha-cadastro").value;
  const confirmarSenha = document.getElementById("confirmar-senha").value;
  const aceiteDocumentos = document.getElementById("aceite-documentos");
  const botaoCadastro = document.getElementById("botao-cadastrar");

  mensagem.classList.remove("visivel");

  if (!formCadastro.checkValidity()) {
    if (!aceiteDocumentos.checked) {
      mostrarMensagem("Você precisa aceitar os Termos de Serviço e a Política de Privacidade.");
      aceiteDocumentos.focus();
      return;
    }

    mostrarMensagem("Preencha todos os campos e use uma senha com pelo menos 6 caracteres.");
    return;
  }

  if (senha !== confirmarSenha) {
    mostrarMensagem("As senhas não conferem.");
    return;
  }

  botaoCadastro.disabled = true;
  botaoCadastro.classList.add("carregando");

  try {
    const cadastro = await fetch("/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, email, senha, aceitouTermos: true }),
    });

    const resultadoCadastro = await cadastro.json();

    if (!cadastro.ok) {
      mostrarMensagem(resultadoCadastro.erro || "Não foi possível criar a conta.");
      return;
    }

    const login = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });
    const resultadoLogin = await login.json();

    if (!login.ok) {
      mostrarMensagem("Conta criada. Faça login para continuar.");
      alternarModoCadastro();
      campoEmail.value = email;
      return;
    }

    localStorage.setItem("token", resultadoLogin.token);
    localStorage.setItem("nomeUsuario", resultadoLogin.nome || nome);
    sessionStorage.setItem("mostrarBoasVindas", "true");

    await fetch("/obras/migrar-legadas", {
      method: "POST",
      headers: { Authorization: `Bearer ${resultadoLogin.token}` },
    });

    window.location.replace("/");
  } catch (erro) {
    mostrarMensagem("Não foi possível conectar ao servidor. Tente novamente.");
  } finally {
    botaoCadastro.disabled = false;
    botaoCadastro.classList.remove("carregando");
  }
});
