const test = require("node:test");
const assert = require("node:assert");

const { app } = require("../index");

async function criarObra(dados) {
  const resposta = await fetch("http://localhost:3000/obras", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(dados),
  });

  return resposta.json();
}

test("GET /obras/:id deve retornar uma obra", async () => {
  const criada = await criarObra({
    title: "Obra para consultar",
    tipo: "manga",
    status: "completa",
    imagem: "https://exemplo.com/imagem.jpg",
  });

  const respostaConsulta = await fetch(
    `http://localhost:3000/obras/${criada.id}`,
  );

  const obra = await respostaConsulta.json();

  assert.strictEqual(respostaConsulta.status, 200);
  assert.strictEqual(obra.id, criada.id);
  assert.strictEqual(obra.title, "Obra para consultar");
  assert.strictEqual(obra.tipo, "manga");
  assert.strictEqual(obra.status, "completa");
});

test("POST /obras deve criar uma obra", async () => {
  const resposta = await fetch("http://localhost:3000/obras", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: "Obra de teste",
      tipo: "anime",
      status: "lancando",
      imagem: "https://exemplo.com/imagem.jpg",
      temporadas: [
        {
          temporada: 1,
          episodios: 12,
        },
      ],
    }),
  });

  const obra = await resposta.json();

  assert.strictEqual(resposta.status, 200);
  assert.strictEqual(obra.title, "Obra de teste");
  assert.strictEqual(obra.tipo, "anime");
});

test("POST /obras deve retornar erro quando o nome não for informado", async () => {
  const resposta = await fetch("http://localhost:3000/obras", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tipo: "anime",
      status: "lancando",
    }),
  });

  const resultado = await resposta.json();

  assert.strictEqual(resposta.status, 400);
  assert.strictEqual(resultado.erro, "O nome da obra é obrigatório");
});

test("PUT /obras/:id deve editar uma obra", async () => {
  const criada = await criarObra({
    title: "Obra para editar",
    tipo: "anime",
    status: "lancando",
    imagem: "https://exemplo.com/imagem.jpg",
  });

  const respostaEdicao = await fetch(
    `http://localhost:3000/obras/${criada.id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Obra editada",
        tipo: "manga",
        status: "completa",
        imagem: "https://exemplo.com/nova-imagem.jpg",
      }),
    },
  );

  const obra = await respostaEdicao.json();

  assert.strictEqual(respostaEdicao.status, 200);
  assert.strictEqual(obra.title, "Obra editada");
  assert.strictEqual(obra.tipo, "manga");
  assert.strictEqual(obra.status, "completa");
});

test("PUT /obras/:id deve preservar o progresso ao editar o link", async () => {
  const criada = await criarObra({
    title: "Obra com progresso",
    tipo: "anime",
    status: "lancando",
    imagem: "https://exemplo.com/imagem.jpg",
    temporadas: [
      {
        numero: 1,
        episodios: 12,
        vistos: [1, 2, 3],
      },
    ],
  });

  await fetch(`http://localhost:3000/obras/${criada.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: criada.title,
      tipo: criada.tipo,
      status: criada.status,
      imagem: criada.imagem,
      link_leitura: "https://exemplo.com/ler",
      temporadas: [
        {
          numero: 1,
          episodios: 12,
        },
      ],
    }),
  });

  const respostaConsulta = await fetch(
    `http://localhost:3000/obras/${criada.id}`,
  );
  const obraAtualizada = await respostaConsulta.json();

  assert.deepStrictEqual(
    JSON.parse(obraAtualizada.temporadas)[0].vistos,
    [1, 2, 3],
  );
  assert.strictEqual(obraAtualizada.link_leitura, "https://exemplo.com/ler");
});

test("PATCH /obras/:id deve atualizar o progresso", async () => {
  const criada = await criarObra({
    title: "Obra para progresso",
    tipo: "anime",
    status: "lancando",
    imagem: "https://exemplo.com/imagem.jpg",
    temporadas: [
      {
        temporada: 1,
        episodios: 12,
      },
    ],
  });

  const respostaProgresso = await fetch(
    `http://localhost:3000/obras/${criada.id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        temporadas: [
          {
            temporada: 1,
            episodios: 12,
            assistidos: 5,
          },
        ],
      }),
    },
  );

  const progresso = await respostaProgresso.json();

  assert.strictEqual(respostaProgresso.status, 200);
  assert.strictEqual(progresso.id, criada.id);

  const respostaConsulta = await fetch(
    `http://localhost:3000/obras/${criada.id}`,
  );

  const obraAtualizada = await respostaConsulta.json();

  assert.strictEqual(respostaConsulta.status, 200);
  assert.strictEqual(obraAtualizada.id, criada.id);

  const temporadas = JSON.parse(obraAtualizada.temporadas);

  assert.strictEqual(temporadas[0].assistidos, 5);
});

test("DELETE /obras/:id deve apagar uma obra", async () => {
  const criada = await criarObra({
    title: "Obra para apagar",
    tipo: "anime",
    status: "lancando",
    imagem: "https://exemplo.com/imagem.jpg",
  });

  const respostaDelete = await fetch(
    `http://localhost:3000/obras/${criada.id}`,
    {
      method: "DELETE",
    },
  );

  const resultado = await respostaDelete.json();

  assert.strictEqual(respostaDelete.status, 200);
  assert.strictEqual(resultado.mensagem, "Obra apagada");
});
