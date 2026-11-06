# Biblioteca de Obras

Aplicação web para organizar, acompanhar e descobrir obras como animes e mangás. Cada usuário pode manter sua própria biblioteca, registrar o progresso, configurar lembretes, favoritar obras e compartilhar a biblioteca com amigos.

O projeto utiliza Node.js, Express, SQLite e uma interface web sem etapa de build.

## Funcionalidades

- Cadastro e login de usuários;
- Criação, edição e exclusão de obras;
- Suporte para anime, mangá ou anime e mangá;
- Controle de temporadas, episódios, volumes e capítulos;
- Links para leitura;
- Filtros, busca, favoritos e organização da biblioteca;
- Lembretes por notificação Push;
- Perfil com personalização visual;
- Biblioteca pública e sistema de amizades;
- Catálogo de obras para adicionar rapidamente à biblioteca;
- Sugestões de obras enviadas pelos usuários;
- Aprovação ou recusa de sugestões por uma conta administradora.

## Requisitos

- [Node.js](https://nodejs.org/) 18 ou superior;
- npm, instalado junto com o Node.js;
- Um navegador moderno, como Chrome, Edge ou Firefox.

Não é necessário instalar ou configurar um servidor SQLite separadamente. O banco é criado localmente pelo aplicativo.

## Instalação

Clone o repositório e entre na pasta do projeto:

```bash
git clone https://github.com/LanaWss/biblioteca-obras.git
cd biblioteca-obras
```

Instale as dependências:

```bash
npm install
```

O repositório não inclui `node_modules`. As dependências devem ser instaladas no ambiente de execução com `npm install`; isso também evita enviar binários específicos do sistema local para plataformas de deploy.

## Configuração

Crie um arquivo `.env` na raiz do projeto. Ele não deve ser enviado para o GitHub:

```env
PORT=3000
NODE_ENV=development
ADMIN_EMAIL=seu-email@exemplo.com
SMTP_HOST=smtp.exemplo.com
SMTP_PORT=587
SMTP_USER=seu-email@exemplo.com
SMTP_PASS=sua-senha-ou-chave-de-app
SMTP_FROM=seu-email@exemplo.com
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

As chaves VAPID são usadas para os lembretes Push. Gere um par de chaves com:

```bash
node gerar-vapid.js
```

Copie a chave pública para `VAPID_PUBLIC_KEY` e a chave privada para `VAPID_PRIVATE_KEY`.

### Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---:|---|
| `VAPID_PUBLIC_KEY` | Sim | Chave pública usada pelas notificações Push |
| `VAPID_PRIVATE_KEY` | Sim | Chave privada usada pelo servidor para enviar notificações |
| `ADMIN_EMAIL` | Recomendada | Email da conta que poderá revisar sugestões de obras |
| `JWT_SECRET` | Recomendada | Segredo estável usado para validar as sessões de login |
| `SMTP_HOST` | Para recuperação de senha | Servidor SMTP usado para enviar emails |
| `SMTP_PORT` | Para recuperação de senha | Porta SMTP. O padrão é `587` |
| `SMTP_USER` | Para recuperação de senha | Usuário da conta SMTP |
| `SMTP_PASS` | Para recuperação de senha | Senha ou chave de aplicativo da conta SMTP |
| `SMTP_FROM` | Para recuperação de senha | Endereço exibido como remetente |
| `PORT` | Não | Porta do servidor. O padrão é `3000` |
| `NODE_ENV` | Não | Ambiente da aplicação. O padrão é `development` |
| `DB_PATH` | Não | Caminho alternativo para o arquivo SQLite |

> **Importante:** nunca publique as chaves VAPID, senhas ou qualquer outro segredo no repositório. O arquivo `.env` deve permanecer fora do controle de versão.

## Executando localmente

Inicie o servidor:

```bash
node index.js
```

Quando o servidor estiver ativo, abra:

<http://localhost:3000>

Na primeira utilização:

1. Crie uma conta;
2. Faça login;
3. Crie uma obra ou use **Obter obra**;
4. Configure seu perfil e, se desejar, os lembretes.

O banco local será salvo como `obras.db`, caso `DB_PATH` não seja informado. Esse arquivo contém os dados da instalação local e não deve ser compartilhado.

## Fluxo de sugestões de obras

Para permitir que usuários contribuam com o catálogo:

1. Configure `ADMIN_EMAIL` com o email da conta administradora;
2. O usuário abre **Obter obra** e seleciona **Sugerir uma obra**;
3. Ele preenche o formulário completo e envia a sugestão;
4. A conta administradora abre seu perfil e acessa a aba **Sugestões**;
5. A sugestão pode ser aceita ou recusada;
6. Uma recusa exige uma mensagem explicando o problema;
7. Uma obra aceita passa a aparecer no catálogo de **Obter obra** para todos os usuários.

O email configurado em `ADMIN_EMAIL` deve ser exatamente o mesmo usado no cadastro da conta.

## Testes

Execute os testes da API com:

```bash
npm test
```

Os testes utilizam o banco configurado pela aplicação. Para evitar alterar o banco principal durante testes locais, é possível definir um banco temporário:

```bash
DB_PATH=./obras-teste.db npm test
```

No PowerShell:

```powershell
$env:DB_PATH = ".\obras-teste.db"
npm test
```

Depois dos testes, o arquivo temporário pode ser removido.

## Estrutura principal

```text
.
├── index.js             # Servidor Express e rotas da API
├── banco.js             # Script auxiliar de atualização do banco
├── gerar-vapid.js       # Geração das chaves VAPID
├── obras.db             # Banco SQLite local
├── public/
│   ├── index.html       # Página principal
│   ├── login.html       # Tela de login e cadastro
│   ├── script.js        # Comportamento da aplicação
│   ├── style.css        # Estilos da aplicação
│   └── service-worker.js# Suporte a notificações Push
└── test/
    └── api.test.js      # Testes da API
```

## Uso com outras pessoas

Para disponibilizar o projeto na internet, publique o servidor Node.js em uma plataforma compatível e configure:

- `PORT`, conforme a porta fornecida pela plataforma;
- `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`;
- `ADMIN_EMAIL`;
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `SMTP_FROM`, para habilitar a recuperação de senha;
- um armazenamento persistente para o SQLite;
- HTTPS, necessário para notificações Push e recomendado para login.

Não use o arquivo `obras.db` deste repositório como banco compartilhado entre ambientes. Cada instalação deve utilizar seu próprio banco persistente. Em produção, faça backups regulares do arquivo SQLite.

## Desenvolvimento

Para contribuir:

1. Crie um fork do projeto;
2. Crie uma branch para sua alteração;
3. Instale as dependências com `npm install`;
4. Execute os testes com `npm test`;
5. Envie um Pull Request descrevendo a alteração.

## Licença

Este projeto utiliza a licença definida no arquivo `package.json`. Consulte esse arquivo antes de redistribuir ou publicar uma versão modificada.
