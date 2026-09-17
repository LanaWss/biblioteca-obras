const formulario = document.getElementById("form-login");

formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const email = document.getElementById("email").value;
  const senha = document.getElementById("senha").value;

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

  localStorage.setItem("token", resultado.token);

  if (resposta.ok) {
    localStorage.setItem("token", resultado.token);

    window.location.href = "/";
  } else {
    alert(resultado.erro);
  }
});
