# Formulários da Comdei na Lapa (backend)

Um único Worker e um único Apps Script atendem três formulários, cada um gravando na sua aba:
| Página | Campo `form` | Aba da planilha |
|---|---|---|
| `crisma-adultos.html` | `crisma-adultos` | Crisma de adultos |
| `catequese-infantil.html` (inscrição) | `catequese-infantil` | Catequese infantil |
| `catequese-infantil.html` (pergunta) | `pergunta` | Perguntas |
A ação do Turnstile de cada widget é o próprio nome do formulário, e o Worker confere isso.
O Worker se chama `comdei-lapa-formularios` (em `infra/crisma-adultos/worker`).

## Crisma de adultos: lista de interessados

Página: `crisma-adultos.html` → `comdei.org/crisma-adultos` (cleanUrls do Firebase Hosting).
Enquanto `CRISMA_ENDPOINT` e `TURNSTILE_SITEKEY` estiverem vazios na página, ela fica em
**modo prévia**: valida o formulário e mostra o agradecimento, mas não envia nem guarda nada.

**Nada aqui é criado ou implantado sem GO escrito do Lucas.** Custo: zero (planos grátis).

## Arquitetura recomendada (custo zero)

```
comdei.org/crisma-adultos  --POST JSON-->  Cloudflare Worker (Free)  --POST + segredo-->  Apps Script (Free)  -->  Google Sheets
                                             - Origin só comdei.org                          - confere segredo
                                             - rate limit 3/min por IP                       - 5/h por IP (hash), 200/dia
                                             - honeypot, tamanho, campos                     - anti-fórmula, LockService
                                             - Turnstile Siteverify
```

Por que Worker + Apps Script, e não só um dos dois:
- **Só Apps Script** não vê o IP nem o cabeçalho Origin da requisição, então não dá para fazer rate limit
  por IP nem travar a origem. Também tem CORS ruim (redirect 302).
- **Só Worker** gravando direto no Sheets exigiria uma service account do GCP com chave guardada no Worker
  (mais um recurso e mais um segredo sensível). O Apps Script grava na planilha com a própria conta
  lucas@comdei.org, sem chave de service account.
- Limites grátis: Workers Free = 100 mil requisições/dia; Turnstile = grátis; Apps Script = cota de
  consumidor do Google Workspace, muito acima do volume esperado.

### Comparação: Formspree (já existe, `formspree.io/f/xyeyllry`)
- Plano grátis: **50 envios/mês somando todos os formulários da conta** (a lista geral do comdei.org
  já consome dessa cota). Passou disso, os envios ficam retidos sem e-mail.
- Não aceita Turnstile validado no servidor, não deixa limitar por IP nem travar a origem; só honeypot
  `_gotcha` e reCAPTCHA próprio. Guarda 30 dias de histórico e não grava em planilha no grátis.
- Serve como plano B de emergência (zero recurso novo), mas não cumpre as exigências de segurança.

## Passo a passo depois do GO (o que o Lucas clica ou loga)

1. **Planilha** (lucas@comdei.org): criar "Comdei na Lapa — cadastros" no Google Drive.
   Compartilhar só com quem for atender os interessados.
2. **Apps Script**: na planilha, Extensões > Apps Script; colar `infra/crisma-adultos/apps-script/Code.gs`.
   Em Configurações do projeto > Propriedades do script, criar `SHARED_SECRET` (texto aleatório longo).
   Implantar > Nova implantação > App da Web: executar como **eu**, acesso **qualquer pessoa**
   (o segredo protege). Autorizar com lucas@comdei.org. Copiar a URL `/exec`.
3. **Turnstile** (painel Cloudflare, conta que já tem a zona comdei.org): Turnstile > Adicionar widget,
   hostnames `comdei.org` e `www.comdei.org`, modo Gerenciado. Copiar a chave do site (pública) e a
   chave secreta.
4. **Worker**: na pasta `infra/crisma-adultos/worker`, com `npx wrangler login` (conta Cloudflare do Lucas):
   ```
   npx wrangler secret put TURNSTILE_SECRET
   npx wrangler secret put SHEETS_WEBHOOK_URL
   npx wrangler secret put SHEETS_SHARED_SECRET
   npx wrangler secret put IP_SALT
   npx wrangler deploy
   ```
   Endereço resultante: `https://comdei-lapa-formularios.<subdominio>.workers.dev/inscricao`.
5. **Páginas**: em `crisma-adultos.html` (`CRISMA_ENDPOINT`) e `catequese-infantil.html` (`ENDPOINT`), preencher o endereço e `TURNSTILE_SITEKEY`, mergear
   no main (o GitHub Actions publica no Firebase Hosting).
6. **Smoke**: um cadastro de teste, conferir a linha na planilha e apagar a linha de teste.

## Desfazer
- Página: reverter o commit no main (ou apagar `crisma-adultos.html`) e deixar o Actions republicar.
- Worker: `npx wrangler delete comdei-lapa-formularios`. Turnstile: apagar o widget.
- Apps Script: Implantar > Gerenciar implantações > Arquivar. A planilha fica com o Lucas.

## LGPD
- Campos mínimos. Crisma: nome, WhatsApp, e-mail opcional, paróquia opcional, batizado, primeira comunhão. Catequese: só o responsável (nome, WhatsApp, e-mail opcional) e a idade da criança, sem nome nem foto da criança. Pergunta: nome, WhatsApp, e-mail opcional, texto.
- Consentimento por checkbox desmarcado; o Worker recusa sem ele.
- IP não é guardado em claro: só um hash com sal (para o limite por IP e para investigar abuso).
- Exclusão/correção: pedido pelo WhatsApp (21) 98145-4569; apagar a linha na planilha.
- Retenção proposta: até o fim da preparação da turma (a confirmar com o Lucas).

## Teste local do Worker
`cd infra/crisma-adultos/worker && node test.mjs` (simula Turnstile e Apps Script; nada sai da máquina).
