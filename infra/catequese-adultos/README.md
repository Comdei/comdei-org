# Worker comdei-catequese (comdei.org/catequese-adultos)

Fonte do Worker Cloudflare que atende `comdei.org/catequese-adultos*` e `POST /api/catequese-adultos-espera`.
Fica em `infra/` e por isso **não** é publicado pelo Firebase (ver `firebase.json` → `ignore`).

- Merge neste repo **não** publica o Worker. Deploy só com GO escrito do Lucas, e só depois do SQL manual:
  `infra/catequese-adultos/migrations/20261102_aviso_privacidade.sql` (não aplicar pelo CI; não mexe em inscrição já gravada).
  `cd infra/catequese-adultos/worker && npx wrangler deploy -c wrangler.jsonc`
- Rollback: `cd infra/catequese-adultos/worker && npx wrangler rollback -c wrangler.jsonc`
- Segredos ficam só no Worker (wrangler secret); nada de segredo neste repo.
- WhatsApp de confirmação: flag `WHATSAPP_BOAS_VINDAS` desligada no código. Transporte WuzAPI pelas envs `WUZAPI_BASE_URL` e `WUZAPI_TOKEN` (sem valores aqui). Só inscrição nova criada depois do deploy. Teste de uma mensagem: `node enviar-teste-whatsapp.mjs` nesta pasta `worker/`.
- `site/catequese-adultos/triagem.js`: conversa rápida 100% no navegador; nada é enviado ao servidor nem gravado. No fim o botão aponta para `#inscricao`.
