# Worker comdei-catequese (comdei.org/catequese-adultos)

Fonte do Worker Cloudflare que atende `comdei.org/catequese-adultos*` e `POST /api/catequese-adultos-espera`.
Fica em `infra/` e por isso **não** é publicado pelo Firebase (ver `firebase.json` → `ignore`).

- Merge neste repo **não** publica o Worker. Deploy só com GO escrito do Lucas:
  `cd infra/catequese-adultos/worker && npx wrangler deploy -c wrangler.jsonc`
- Rollback: redeploy da versão anterior (`npx wrangler rollback`) ou apagar as rotas (o Firebase volta a responder).
- Segredos ficam só no Worker (wrangler secret); nada de segredo neste repo.
- `site/catequese-adultos/triagem.js`: conversa rápida 100% no navegador; nada é enviado ao servidor nem gravado. Termina num link wa.me com mensagem pronta.
