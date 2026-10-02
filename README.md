# Bíblia Viva — Aprenda a Palavra de Deus

PWA para ler, ouvir e estudar a **Bíblia Sagrada completa** (66 livros, 1.189 capítulos, 31.102 versículos) em português. Feito com HTML, CSS e JavaScript puros, funciona offline e sincroniza favoritos, anotações e progresso entre aparelhos com login Google (Firebase).

## Tecnologias
HTML5, CSS3 (variáveis, tema claro/escuro), JavaScript ES modules, Service Worker, Web App Manifest, LocalStorage, Web Speech API (voz pt-BR do aparelho), Firebase Authentication + Cloud Firestore (opcional).

## Estrutura
```
biblia-viva/
├── index.html, manifest.json, service-worker.js
├── css/        style.css · components.css · responsive.css
├── js/
│   ├── app.bundle.js     app empacotado (é o que o index.html carrega)
│   ├── firebase-config.js configuração do Firebase (pode editar direto)
│   └── src/              código-fonte em módulos:
│   ├── app.js            interface, navegação (#hash) e ações
│   ├── bible.js          BibleDataProvider: livros, capítulos, busca, versículo do dia
│   ├── audio.js          AudioManager: speakVerse, pauseSpeech, resumeSpeech, stopSpeech
│   ├── search.js         busca com debounce
│   ├── favorites.js · notes.js · progress.js · plans.js
│   ├── store.js          dados locais (localStorage)
│   ├── sync.js           sincronização com Firebase (mesclagem entre aparelhos)
│   └── pwa.js            instalação e download offline
├── data/index.js         lista de livros (capítulos e versículos por capítulo)
├── data/books/<id>.js    texto de cada livro
├── Abrir Biblia Viva.bat + servidor.ps1   atalho para abrir no Windows
├── audio/manifest.json   narrações licenciadas (opcional)
├── firestore.rules       regras de segurança do banco
└── assets/icons/         ícones (SVG e PNG)
```

## Como abrir
**Jeito mais simples:** dê dois cliques em **`Abrir Biblia Viva.bat`**. Ele liga um pequeno servidor com o PowerShell do Windows (não precisa instalar Python nem nada) e abre o app no navegador em `http://localhost:8080`. Deixe a janela preta aberta enquanto usa; feche-a para parar. Assim tudo funciona: login Google, instalação como app e uso offline.

**Também funciona** dando dois cliques direto no `index.html`: leitura, áudio, busca, favoritos, anotações e planos funcionam normalmente. Só o login Google, a instalação e o modo offline exigem o atalho acima (o navegador bloqueia esses recursos em arquivos abertos direto).

Alternativa com Python: `python -m http.server 8080` dentro da pasta.

## Instalar como PWA
- **Chrome/Edge (PC e Android):** ícone ⊕ “Instalar” na barra de endereço, menu ⋮ › Instalar, ou **Mais › Instalar aplicativo** dentro do app.
- **iPhone/iPad:** Safari › Compartilhar › Adicionar à Tela de Início.
- Em produção é obrigatório HTTPS (Netlify, Vercel e Firebase Hosting já fornecem).

## Offline
O app e os livros já abertos ficam no cache. Em **Mais › Configurações de áudio › Offline** há o botão “Baixar Bíblia completa” (~4 MB).

## Texto bíblico (licença)
Bíblia Livre (BLIVRE), Textus Receptus, versão de fevereiro de 2018 — Copyright © Diego Santos, Mario Sérgio e Marco Teles, licença **Creative Commons Atribuição 3.0 Brasil**. A licença permite distribuir, **desde que o crédito seja mantido** (já aparece em Sobre e no rodapé do leitor). Fonte: https://github.com/blivre/BibliaLivre

Traduções como ARA, ARC, NVI, NAA, NTLH e ACF são protegidas e só podem ser usadas com licença da editora.

### Trocar ou adicionar uma tradução autorizada
Gere arquivos no mesmo formato:
```json
// data/index.js
window.BV_INDEX = {"translation":"…","credit":"…","books":[{"id":"joao","name":"João","abbrev":"Jo","testament":"Novo Testamento","chapters":21,"verses":[51,25,36,…]}]}
// data/books/joao.js
(window.BV_BOOKS=window.BV_BOOKS||{})["joao"] = {"id":"joao","name":"João","testament":"Novo Testamento","chapters":{"3":[[16,"Porque Deus amou o mundo…"],[17,"…"]]},"titles":{}}
```
Cada versículo guarda **seu número real** (`[número, texto]`), então trechos parciais nunca ficam com numeração errada.

## Voz e música de fundo
- **Voz:** o app escolhe automaticamente uma voz masculina em português, se o aparelho tiver uma (ex.: Microsoft Antonio/Daniel no Windows; no Edge as vozes “Online (Natural)” soam melhor). Estilos: **Cinematográfico** (padrão: grave, com pausa entre versículos), **Solene** ou **Natural** em Configurações › Áudio.
- **Música de fundo:** trilha original gerada pelo próprio app (`js/src/music.js`, Web Audio API), sem arquivos nem direitos de terceiros. Estilos **Cinematográfica** (cordas, coral e nota grave de fundo — padrão) ou **Suave**. Liga/desliga no botão 🎵 do player ou em Configurações › Música de fundo, com controle de volume.

## Narrações licenciadas
O app usa a voz do aparelho. Para usar gravações que você tenha licença para distribuir:
1. Coloque os arquivos em `audio/mateus/5.mp3`, `audio/joao/3.mp3` etc.
2. Liste-os em `audio/manifest.json`: `{"joao/3": "audio/joao/3.mp3", "mateus/5": "audio/mateus/5.mp3"}`
O player passa a tocar o arquivo nesses capítulos (avançar/voltar pulam 15 s). Não inclua gravações, roteiros ou músicas de terceiros (por exemplo, da série “A Vida de Jesus Cristo”) sem autorização.

## Firebase (login e sincronização)
- Projeto: **biblia-viva-e1364** (plano Spark, gratuito). Login: Google. Banco: Firestore em `southamerica-east1` (São Paulo).
- Cada usuário tem um documento `users/{uid}`; as regras (`firestore.rules`) só permitem que o próprio usuário leia/grave o seu.
- O app funciona sem login; ao entrar, os dados do aparelho e da nuvem são mesclados.
- Ao publicar em um domínio novo (ex.: `biblia-viva.netlify.app`), adicione-o em **Firebase › Authentication › Configurações › Domínios autorizados**, senão o login Google é bloqueado. `localhost` já vem autorizado.
- A chave em `firebase-config.js` não é secreta; a segurança vem das regras.

## Publicar gratuitamente
- **Netlify:** app.netlify.com/drop › arraste a pasta `biblia-viva`.
- **Vercel:** importe o repositório, Framework “Other”, sem comando de build, diretório raiz = esta pasta.
- **Firebase Hosting:** `npm i -g firebase-tools`, `firebase login`, `firebase deploy` dentro da pasta (o `firebase.json` e o `.firebaserc` já estão prontos; o comando também publica as regras do Firestore). Endereço: https://biblia-viva-e1364.web.app

## Testar o PWA
Chrome › F12 › **Application**: Manifest (sem erros), Service Workers (ativo), Cache Storage. Para testar offline: aba Network › “Offline” e recarregue. **Lighthouse** › categoria PWA.

## Android e iOS (lojas)
Use **Capacitor** sobre esta mesma pasta: `npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios`, `npx cap init "Bíblia Viva" br.com.bibliaviva --web-dir .`, `npx cap add android` (e `ios` num Mac), `npx cap open android`. Para o login Google nativo use o plugin `@capacitor-firebase/authentication`. Alternativa só para Android: TWA com o **Bubblewrap** a partir do site publicado.

## Alterar o código
Edite os arquivos em `js/src/` e gere de novo o pacote (precisa do Node.js):
```
npx esbuild js/src/app.js --bundle --format=iife --outfile=js/app.bundle.js
```

## Atalhos
Alt+← / Alt+→ capítulo anterior/próximo · Enter no versículo abre as ações · Esc sai do modo foco.
