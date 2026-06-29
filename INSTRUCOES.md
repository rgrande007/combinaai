# Instruções — Disponibilidade de Horários

## Estrutura dos arquivos

```
agenda de horarios/
├── index.html          → Tela do participante
├── admin.html          → Tela do administrador
├── style.css           → Estilos compartilhados
├── app.js              → Lógica do participante
├── admin.js            → Lógica do administrador (inclui o PIN)
└── firebase-config.js  → Configuração do Firebase (preencher antes de usar)
```

---

## 1. Configurar o Firebase Firestore

### 1.1 Criar o projeto
1. Acesse https://console.firebase.google.com
2. Clique em **Adicionar projeto** e siga os passos (Analytics é opcional).

### 1.2 Adicionar um app Web
1. Na tela inicial do projeto, clique no ícone **`</>`** (Web).
2. Dê um apelido ao app (ex: `agenda-horarios`) e clique em **Registrar app**.
3. Copie o objeto `firebaseConfig` exibido.

### 1.3 Preencher `firebase-config.js`
Abra `firebase-config.js` e substitua os valores placeholder pelos seus:

```js
var firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "meu-projeto.firebaseapp.com",
  projectId:         "meu-projeto",
  storageBucket:     "meu-projeto.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123...:web:abc..."
};
```

### 1.4 Criar o banco de dados Firestore
1. No menu lateral: **Build → Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Escolha **Iniciar no modo de teste** (permite leitura/gravação por 30 dias).
4. Selecione a região mais próxima (ex: `southamerica-east1`).

> **Após 30 dias**, as regras de teste expiram. Para manter o acesso, vá em
> **Firestore → Regras** e substitua pelo conteúdo abaixo:
>
> ```
> rules_version = '2';
> service cloud.firestore {
>   match /databases/{database}/documents {
>     match /availability/{doc} {
>       allow read, write: if true;
>     }
>   }
> }
> ```
>
> Isso é suficiente para uso interno. Para um app público, use
> autenticação Firebase Auth.

### 1.5 Alterar o PIN do administrador (opcional)
Abra `admin.js` e altere a linha:
```js
var ADMIN_PIN = '1234'; // ← coloque o PIN desejado
```

---

## 2. Rodar localmente

Como os arquivos usam o Firebase SDK via CDN, você precisa de um servidor HTTP
local (abrir o `index.html` diretamente como `file://` pode ser bloqueado pelo
navegador por políticas de CORS).

### Opção A — VS Code Live Server
1. Instale a extensão **Live Server** no VS Code.
2. Clique com o botão direito em `index.html` → **Open with Live Server**.

### Opção B — Python (já instalado na maioria dos sistemas)
```bash
# Na pasta do projeto:
python -m http.server 8080
# Acesse: http://localhost:8080
```

### Opção C — Node.js / npx
```bash
npx serve .
# Acesse o endereço exibido no terminal
```

Páginas:
- Participante: `http://localhost:8080/index.html`
- Administrador: `http://localhost:8080/admin.html`

---

## 3. Publicar online

### Opção A — GitHub Pages (gratuito)
1. Crie um repositório no GitHub e envie os arquivos.
2. Vá em **Settings → Pages**.
3. Em **Source**, selecione a branch `main` e pasta `/root`.
4. O site ficará em `https://<seu-usuario>.github.io/<repo>/`

### Opção B — Netlify (gratuito, arrasta e solta)
1. Acesse https://app.netlify.com
2. Arraste a pasta do projeto para a área de **Deploy** na tela inicial.
3. O Netlify gera um link público instantaneamente.
4. Você pode configurar um domínio personalizado depois.

### Opção C — Vercel (gratuito)
1. Instale o Vercel CLI: `npm i -g vercel`
2. Na pasta do projeto: `vercel`
3. Siga os passos do assistente.

> Em todos os casos, os dados ficam no **Firebase Firestore** — não no servidor
> de hospedagem. Você pode trocar de hospedagem a qualquer momento sem perder
> as respostas.

---

## 4. Uso

### Participantes
- Abram o link do `index.html`.
- Informam o nome e selecionam os horários (clique ou arraste).
- Clicam em **Salvar disponibilidade**.
- Se enviarem novamente com o mesmo nome, a resposta anterior é substituída.

### Administrador
- Abrem o link do `admin.html`.
- Inserem o PIN (padrão: `1234`).
- A tabela atualiza automaticamente em tempo real.
- Botões disponíveis:
  - **Copiar resumo** — copia os melhores horários para a área de transferência.
  - **Exportar CSV** — baixa todas as respostas em planilha.
  - **Limpar todas as respostas** — apaga tudo do Firestore (irreversível).
