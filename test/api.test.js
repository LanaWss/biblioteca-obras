const test = require("node:test");
const assert = require("node:assert");

const { app } = require("../index");

let tokenTeste;
let servidorTeste;
let baseUrl;

test.before(async () => {
  servidorTeste = await new Promise((resolve) => {
    const servidor = app.listen(0, () => resolve(servidor));
  });
  baseUrl = `http://localhost:${servidorTeste.address().port}`;

  const email = `teste${Date.now()}@teste.com`;

  await fetch(`${baseUrl}/usuarios`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      nome: "Usuario Teste",
      email,
      senha: "123456",
      aceitouTermos: true,
    }),
  });

  const resposta = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      senha: "123456",
    }),
  });

  const resultado = await resposta.json();

  tokenTeste = resultado.token;
});

test.after(async () => {
  await new Promise((resolve) => servidorTeste.close(resolve));
});

function headersComToken() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${tokenTeste}`,
  };
}

async function criarObra(dados) {
  const resposta = await fetch(`${baseUrl}/obras`, {
    method: "POST",
    headers: headersComToken(),
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
    `${baseUrl}/obras/${criada.id}`,
    {
      headers: headersComToken(),
    },
  );

  const obra = await respostaConsulta.json();

  assert.strictEqual(respostaConsulta.status, 200);
  assert.strictEqual(obra.id, criada.id);
  assert.strictEqual(obra.title, "Obra para consultar");
  assert.strictEqual(obra.tipo, "manga");
  assert.strictEqual(obra.status, "completa");
});

test("POST /obras deve criar uma obra", async () => {
  const resposta = await fetch(`${baseUrl}/obras`, {
    method: "POST",
    headers: headersComToken(),
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

test("POST /obras deve criar uma obra com anime e mangá", async () => {
  const obra = await criarObra({
    title: "Obra combinada",
    tipo: "ambos",
    status: "lancando",
    imagem: "https://exemplo.com/imagem.jpg",
    temporadas: [{ numero: 1, episodios: 12 }],
    volumes: [{ numero: 1, inicio: 1, fim: 80 }],
  });

  assert.strictEqual(obra.tipo, "ambos");
  assert.strictEqual(obra.temporadas[0].episodios, 12);
  assert.strictEqual(obra.volumes[0].fim, 80);
});

test("POST /obras deve salvar múltiplos links de leitura", async () => {
  const obra = await criarObra({
    title: "Obra com links",
    tipo: "manga",
    status: "lancando",
    link_leituras: [
      { nome: "Site oficial", url: "https://exemplo.com/oficial" },
      { nome: "Alternativo", url: "https://exemplo.com/alternativo" },
    ],
  });

  assert.deepStrictEqual(obra.link_leituras, [
    { nome: "Site oficial", url: "https://exemplo.com/oficial" },
    { nome: "Alternativo", url: "https://exemplo.com/alternativo" },
  ]);
});

test("POST /obras deve retornar erro quando o nome não for informado", async () => {
  const resposta = await fetch(`${baseUrl}/obras`, {
    method: "POST",
    headers: headersComToken(),
    body: JSON.stringify({
      tipo: "anime",
      status: "lancando",
    }),
  });

  const resultado = await resposta.json();

  assert.strictEqual(resposta.status, 400);
  assert.strictEqual(resultado.erro, "O nome da obra é obrigatório");
});

test("rotas protegidas devem rejeitar token inválido", async () => {
  const resposta = await fetch(`${baseUrl}/obras`, {
    headers: {
      Authorization: "Bearer token-invalido",
    },
  });

  assert.strictEqual(resposta.status, 401);
});

test("respostas devem incluir headers básicos de proteção", async () => {
  const resposta = await fetch(`${baseUrl}/obras`, {
    headers: headersComToken(),
  });

  assert.strictEqual(resposta.headers.get("x-content-type-options"), "nosniff");
  assert.strictEqual(resposta.headers.get("x-frame-options"), "DENY");
  assert.match(
    resposta.headers.get("content-security-policy") || "",
    /frame-ancestors 'none'/,
  );
});

test("POST /obras deve rejeitar imagem apontando para endereço local", async () => {
  const resposta = await fetch(`${baseUrl}/obras`, {
    method: "POST",
    headers: headersComToken(),
    body: JSON.stringify({
      title: "Obra com imagem local bloqueada",
      tipo: "manga",
      imagem: "http://127.0.0.1:3000/segredo",
    }),
  });

  assert.strictEqual(resposta.status, 200);
  const obra = await resposta.json();
  assert.strictEqual(obra.imagem_arquivo, null);
});

test("PUT /obras/:id deve editar uma obra", async () => {
  const criada = await criarObra({
    title: "Obra para editar",
    tipo: "anime",
    status: "lancando",
    imagem: "https://exemplo.com/imagem.jpg",
  });

  const respostaEdicao = await fetch(
    `${baseUrl}/obras/${criada.id}`,
    {
      method: "PUT",
      headers: headersComToken(),
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

test("PUT /obras/:id deve respeitar a imagem preferida por URL", async () => {
  const criada = await criarObra({
    title: "Obra para testar capa",
    tipo: "manga",
    status: "lancando",
    imagem: "https://exemplo.com/capa-antiga.jpg",
    imagem_arquivo: "data:image/png;base64,imagem-antiga",
    imagem_preferencia: "arquivo",
  });

  const resposta = await fetch(`${baseUrl}/obras/${criada.id}`, {
    method: "PUT",
    headers: headersComToken(),
    body: JSON.stringify({
      title: criada.title,
      tipo: criada.tipo,
      status: criada.status,
      imagem: "https://exemplo.com/capa-nova.jpg",
      imagem_arquivo: criada.imagem_arquivo,
      imagem_preferencia: "url",
    }),
  });
  const obra = await resposta.json();

  assert.strictEqual(resposta.status, 200);
  assert.strictEqual(obra.imagem, "https://exemplo.com/capa-nova.jpg");
  assert.strictEqual(obra.imagem_preferencia, "url");
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

  await fetch(`${baseUrl}/obras/${criada.id}`, {
    method: "PUT",
    headers: headersComToken(),
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
    `${baseUrl}/obras/${criada.id}`,
    {
      headers: headersComToken(),
    },
  );

  const obraAtualizada = await respostaConsulta.json();

  assert.deepStrictEqual(
    JSON.parse(obraAtualizada.temporadas)[0].vistos,
    [1, 2, 3],
  );

  assert.strictEqual(
    obraAtualizada.link_leitura,
    "https://exemplo.com/ler",
  );
});

test("PUT /obras/:id deve salvar temporadas e volumes ao editar ambos", async () => {
  const criada = await criarObra({
    title: "Obra dupla para editar",
    tipo: "anime",
    status: "lancando",
    temporadas: [{ numero: 1, inicio: 1, episodios: 2 }],
  });

  const resposta = await fetch(`${baseUrl}/obras/${criada.id}`, {
    method: "PUT",
    headers: headersComToken(),
    body: JSON.stringify({
      title: criada.title,
      tipo: "ambos",
      status: criada.status,
      temporadas: [{ numero: 1, inicio: 1, episodios: 2 }],
      volumes: [{ numero: 1, inicio: 1, fim: 20 }],
    }),
  });

  const obra = await resposta.json();

  assert.strictEqual(resposta.status, 200);
  assert.strictEqual(obra.tipo, "ambos");
  assert.strictEqual(obra.temporadas[0].episodios, 2);
  assert.strictEqual(obra.volumes[0].fim, 20);
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
    `${baseUrl}/obras/${criada.id}`,
    {
      method: "PATCH",
      headers: headersComToken(),
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
    `${baseUrl}/obras/${criada.id}`,
    {
      headers: headersComToken(),
    },
  );

  const obraAtualizada = await respostaConsulta.json();

  assert.strictEqual(respostaConsulta.status, 200);
  assert.strictEqual(obraAtualizada.id, criada.id);

  const temporadas = JSON.parse(obraAtualizada.temporadas);

  assert.strictEqual(temporadas[0].assistidos, 5);
});

test("PATCH /obras/:id deve atualizar o progresso do mangá", async () => {
  const criada = await criarObra({
    title: "Mangá para progresso",
    tipo: "manga",
    status: "lancando",
    imagem: "https://exemplo.com/imagem.jpg",
    volumes: [{ numero: 1, inicio: 1, fim: 10, vistos: [1] }],
  });

  const resposta = await fetch(`${baseUrl}/obras/${criada.id}`, {
    method: "PATCH",
    headers: headersComToken(),
    body: JSON.stringify({
      volumes: [{ numero: 1, inicio: 1, fim: 11, vistos: [1, 2, 11] }],
    }),
  });

  assert.strictEqual(resposta.status, 200);

  const consulta = await fetch(`${baseUrl}/obras/${criada.id}`, {
    headers: headersComToken(),
  });
  const obra = await consulta.json();
  const volumes = JSON.parse(obra.volumes);

  assert.strictEqual(volumes[0].fim, 11);
  assert.deepStrictEqual(volumes[0].vistos, [1, 2, 11]);
});

test("PATCH /obras/:id deve atualizar anime e mangá juntos", async () => {
  const criada = await criarObra({
    title: "Obra dupla para progresso",
    tipo: "ambos",
    status: "lancando",
    temporadas: [{ numero: 1, inicio: 1, episodios: 2, vistos: [1] }],
    volumes: [{ numero: 1, inicio: 1, fim: 2, vistos: [1] }],
  });

  const resposta = await fetch(`${baseUrl}/obras/${criada.id}`, {
    method: "PATCH",
    headers: headersComToken(),
    body: JSON.stringify({
      temporadas: [{ numero: 1, inicio: 1, episodios: 3, vistos: [1, 2, 3] }],
      volumes: [{ numero: 1, inicio: 1, fim: 3, vistos: [1, 2, 3] }],
    }),
  });

  assert.strictEqual(resposta.status, 200);
});

test("PATCH /obras/:id/favorito deve atualizar o favorito", async () => {
  const criada = await criarObra({
    title: "Obra favorita",
    tipo: "manga",
    status: "completa",
    imagem: "https://exemplo.com/imagem.jpg",
  });

  const respostaFavoritar = await fetch(
    `${baseUrl}/obras/${criada.id}/favorito`,
    {
      method: "PATCH",
      headers: headersComToken(),
      body: JSON.stringify({ favorito: 1 }),
    },
  );

  const favorito = await respostaFavoritar.json();

  assert.strictEqual(respostaFavoritar.status, 200);
  assert.strictEqual(favorito.id, criada.id);
  assert.strictEqual(favorito.favorito, 1);

  const respostaConsulta = await fetch(
    `${baseUrl}/obras/${criada.id}`,
    {
      headers: headersComToken(),
    },
  );

  const obraAtualizada = await respostaConsulta.json();

  assert.strictEqual(obraAtualizada.favorito, 1);
});

test("DELETE /obras/:id deve apagar uma obra", async () => {
  const criada = await criarObra({
    title: "Obra para apagar",
    tipo: "anime",
    status: "lancando",
    imagem: "https://exemplo.com/imagem.jpg",
  });

  const respostaDelete = await fetch(
    `${baseUrl}/obras/${criada.id}`,
    {
      method: "DELETE",
      headers: headersComToken(),
    },
  );

  const resultado = await respostaDelete.json();

  assert.strictEqual(respostaDelete.status, 200);
  assert.strictEqual(resultado.mensagem, "Obra apagada");
});

test("Tabela usuarios deve existir", async () => {
  const Database = require("better-sqlite3");

  const db = new Database(process.env.DB_PATH || "obras.db");

  const tabela = db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      AND name = 'usuarios'
    `)
    .get();

  assert.ok(tabela);
  assert.strictEqual(tabela.name, "usuarios");

  const colunas = db
    .prepare("PRAGMA table_info(usuarios)")
    .all()
    .map((coluna) => coluna.name);

  assert.ok(colunas.includes("termos_aceitos"));
  assert.ok(colunas.includes("versao_termos"));
  assert.ok(colunas.includes("versao_privacidade"));
  assert.ok(colunas.includes("data_aceite"));

  db.close();
});

test("POST /usuarios deve exigir aceite dos documentos", async () => {
  const resposta = await fetch(`${baseUrl}/usuarios`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      nome: "Usuario sem aceite",
      email: `sem-aceite${Date.now()}@teste.com`,
      senha: "123456",
    }),
  });

  const resultado = await resposta.json();

  assert.strictEqual(resposta.status, 400);
  assert.strictEqual(
    resultado.erro,
    "Você precisa aceitar os Termos de Serviço e a Política de Privacidade.",
  );
});

test("POST /usuarios deve criar um usuário", async () => {
  const emailTeste = `usuario${Date.now()}@teste.com`;

  const resposta = await fetch(`${baseUrl}/usuarios`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      nome: "Usuario de teste",
      email: emailTeste,
      senha: "123456",
      aceitouTermos: true,
    }),
  });

  const usuario = await resposta.json();

  assert.strictEqual(resposta.status, 200);
  assert.strictEqual(usuario.nome, "Usuario de teste");
  assert.strictEqual(usuario.email, emailTeste);
  assert.ok(usuario.id);
});

test("POST /login deve fazer login", async () => {
  const emailTeste = `login${Date.now()}@teste.com`;

  await fetch(`${baseUrl}/usuarios`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      nome: "Usuario Login",
      email: emailTeste,
      senha: "123456",
      aceitouTermos: true,
    }),
  });

  const resposta = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: emailTeste,
      senha: "123456",
    }),
  });

  const usuario = await resposta.json();

  assert.strictEqual(resposta.status, 200);
  assert.ok(usuario.id);
  assert.strictEqual(usuario.nome, "Usuario Login");
  assert.strictEqual(usuario.email, emailTeste);
});