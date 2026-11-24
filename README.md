# Casa N&Y · Lista de presentes

Site estático (Next.js `output: "export"`) publicado no GitHub Pages em `nyhome.github.io`. Os dados ficam no Firestore (plano Spark, grátis), lido e escrito direto do navegador. Toda a segurança está em [`firestore.rules`](firestore.rules).

- `/`: o catálogo. Convidados reservam por 72h com nome, e-mail e parentesco. Item reservado ou comprado aparece como esgotado, com "Presente de Maria · Prima" ou "Dos noivos".
- `/reserva?t=…`: o link pessoal do convidado, com os botões **Já comprei** e **Desistir**.
- `/admin`: o painel dos noivos (login com Google). Dá pra adicionar, editar, publicar, marcar comprado, "comprado por nós", liberar reserva, corrigir parentesco e editar o endereço de entrega.
- `scripts/mailer.mjs`: roda a cada 15 min no GitHub Actions ([`mailer.yml`](.github/workflows/mailer.yml)). Manda o e-mail de reserva, o lembrete de 48h, o aviso de expiração em 72h (e devolve o presente pra lista) e o aviso de compra para os noivos, tudo pelo Gmail.
- `scripts/importar.mjs`: transforma links de anúncio em rascunhos (Playwright + Ollama local).

## Desenvolvimento local

Precisa de Java no PATH (o emulador do Firestore usa): `brew install openjdk` e `export PATH=/opt/homebrew/opt/openjdk/bin:$PATH`.

```bash
npm run emulators                                    # Firestore :8177 + Auth :9099
FIRESTORE_EMULATOR_HOST=127.0.0.1:8177 npm run seed  # presentes e reservas de exemplo
NEXT_PUBLIC_EMULATOR=1 npm run dev
```

No emulador, o login Google abre uma tela falsa de contas. Os UIDs de admin nas regras (`ADMIN_UID_1`/`ADMIN_UID_2`) valem enquanto não forem trocados pelos reais.

```bash
npm test             # catálogo, mailer e importador
npm run test:rules   # regras de segurança no emulador
FIRESTORE_EMULATOR_HOST=127.0.0.1:8177 DRY_RUN=1 ADMIN_EMAILS=a@b.c npm run mailer   # e-mails sem enviar
```

## Importar anúncios

```bash
brew install ollama && ollama serve &   # uma vez
ollama pull qwen2.5:7b                  # ~4,7 GB
npm run importar -- --dry <url>         # só mostra o que extraiu
npm run importar -- <url> <url> ...     # salva como rascunho (precisa do service-account.json)
```

O navegador abre de verdade. Se a loja pedir login ou captcha, resolva lá e aperte Enter no terminal; o perfil fica salvo em `.playwright-profile/`. Depois revise o rascunho em `/admin` e publique.

## Produção

1. **Admins:** entre em `/admin` com cada conta Google; a tela mostra o UID. Troque `ADMIN_UID_1`/`ADMIN_UID_2` em `firestore.rules` e em `src/lib/firebase.ts` e rode `npx firebase deploy --only firestore:rules`.
2. **Variável do repositório (pública):** `NEXT_PUBLIC_FIREBASE_CONFIG`, com o JSON de `npx firebase apps:sdkconfig WEB`.
3. **Variável:** `SITE_URL=https://nyhome.github.io`.
4. **Secrets:** `FIREBASE_SERVICE_ACCOUNT` (o JSON da service account), `GMAIL_USER`, `GMAIL_APP_PASSWORD` (senha de app; exige verificação em 2 etapas) e `ADMIN_EMAILS` (os dois e-mails, separados por vírgula).

O cron do GitHub atrasa às vezes, e é desligado depois de 60 dias sem commit no repo; qualquer push religa.

### Login no iPhone (Safari)

O login usa `authDomain: nyhome.github.io` (variável `NEXT_PUBLIC_FIREBASE_CONFIG` do repositório) e serve os arquivos de login do Firebase em `public/__/auth/`. Sem isso, o Safari bloqueia o armazenamento do domínio `firebaseapp.com` e o login falha com "missing initial state". Pra atualizar esses arquivos de vez em quando:

```bash
for f in handler iframe; do curl -s https://casa-ny-lista.firebaseapp.com/__/auth/$f -o public/__/auth/$f.html; done
for f in handler.js iframe.js experiments.js; do curl -s https://casa-ny-lista.firebaseapp.com/__/auth/$f -o public/__/auth/$f; done
```

O endereço `https://nyhome.github.io/__/auth/handler` precisa estar nos URIs de redirecionamento autorizados do cliente OAuth "Web client (auto created by Google Service)", no Google Cloud Console.
