// Worker "comdei-catequese": serve comdei.org/catequese-adultos/ (arquivos estáticos) e
// POST comdei.org/api/catequese-adultos-espera (mesma função da prévia, agora via RPC).
// Rotas da zona comdei.org (só estes caminhos); todo o resto continua indo ao Firebase Hosting.
import { handle } from '../../functions/api/catequese-adultos-espera.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/catequese-adultos-espera') return handle(request, env);
    if (url.pathname === '/catequese-adultos' || url.pathname.startsWith('/catequese-adultos/')) {
      return env.ASSETS.fetch(request);
    }
    // caminho casou com a rota mas não é nosso (ex.: /catequese-adultos-x): devolve ao Firebase
    return fetch(request);
  },
};
