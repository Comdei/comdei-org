# Worker comdei-catequese (comdei.org/catequese-adultos)

Fonte do Worker Cloudflare que atende `comdei.org/catequese-adultos*` e `POST /api/catequese-adultos-espera`.
Fica em `infra/` e por isso **não** é publicado pelo Firebase (ver `firebase.json` → `ignore`).

- Merge neste repo **não** publica o Worker. Deploy só com GO escrito do Lucas, e só depois do SQL manual, nesta ordem:
  1. `migrations/20261102_aviso_privacidade.sql` (se ainda não aplicada) e `migrations/20261122_lgpd_v2_busca_horario.sql` (não aplicar pelo CI; não mexe em inscrição já gravada; ativa `lgpd-v2` e mantém `lgpd-v1` ativa);
  2. deploy do Worker, com GO escrito;
  3. desativar `lgpd-v1` (comando comentado no fim da migração).
  O texto `lgpd-v2` promete parar as mensagens com SAIR: não fazer o deploy antes de o atendimento de SAIR existir.
  `cd infra/catequese-adultos/worker && npx wrangler deploy -c wrangler.jsonc`
- Rollback: `cd infra/catequese-adultos/worker && npx wrangler rollback -c wrangler.jsonc`
- Segredos ficam só no Worker (wrangler secret); nada de segredo neste repo.
- WhatsApp de confirmação: flag `WHATSAPP_BOAS_VINDAS` desligada no código. Transporte WuzAPI pelas envs `WUZAPI_BASE_URL` e `WUZAPI_TOKEN` (sem valores aqui). Só inscrição nova criada depois do deploy. Teste de uma mensagem: `node enviar-teste-whatsapp.mjs` nesta pasta `worker/`.
- `site/catequese-adultos/regra.js`: regra única da conversa, do formulário e do servidor (funções puras, módulo ES; o Worker e os testes importam o mesmo arquivo). O batismo é a porta dos outros sacramentos: batizado = não implica primeira comunhão = não.
- `site/catequese-adultos/triagem.js`: conversa rápida. As respostas ficam só na memória da página (sem rede, sem armazenamento, sem PostHog). No fim ela preenche o formulário (maioridade, batizado, primeira comunhão, o que procura, horário); a pessoa confere e corrige. O consentimento nunca é marcado por ela. Só é guardado o que a pessoa enviar na inscrição.
- Consentimento: uma caixa só (`lgpd-v2`), que cobre também o contato por WhatsApp e e-mail. A caixa opcional `msg_optin` foi removida; o Worker ignora `msg_optin` do cliente e manda sempre `false`. Colunas `msg_optin*` ficam como registro dos inscritos antigos.
- O catálogo `interno.consent_versions` guarda o sha256 do texto (`texto_hash`); o teste confere que bate com o `index.html`.
