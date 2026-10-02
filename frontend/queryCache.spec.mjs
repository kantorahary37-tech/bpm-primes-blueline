import assert from 'node:assert/strict';
import axios from 'axios';
import {
  installQueryCache,
  invalidateQueryCache,
  clearQueryCache,
  getQueryCacheStats,
  buildCacheKey,
} from './src/services/queryCache.js';

let calls = 0;
let payload = { v: 1 };

const ok = (config, data) => ({
  data: JSON.stringify(data),
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
  request: {},
});

function newClient() {
  calls = 0;
  payload = { v: 1 };
  clearQueryCache();
  const client = axios.create({ baseURL: '/api/v1' });
  client.defaults.adapter = async (config) => {
    calls += 1;
    return ok(config, { ...payload, url: config.url, params: config.params ?? null });
  };
  client.interceptors.request.use((config) => {
    if (!config.headers.Authorization) config.headers.Authorization = 'Bearer tokA';
    return config;
  });
  installQueryCache(client);
  return client;
}

const results = [];
const check = (name, fn) => results.push({ name, fn });

check('2e GET identique = 1 seule requete reseau', async () => {
  const api = newClient();
  const [a, b] = await Promise.all([api.get('/bonuses'), api.get('/bonuses')]);
  assert.equal(calls, 1, `attend 1 appel, recu ${calls}`);
  assert.deepEqual(a.data, b.data);
});

check('GET en cache ne refait pas de requete', async () => {
  const api = newClient();
  await api.get('/bonuses');
  await api.get('/bonuses');
  assert.equal(calls, 1);
});

check('params differents = entrees differentes', async () => {
  const api = newClient();
  await api.get('/bonuses', { params: { status: 'EN_ATTENTE_DG' } });
  await api.get('/bonuses', { params: { status: 'EN_ATTENTE_DIRECTEUR' } });
  assert.equal(calls, 2);
});

check('ordre des params indifferent pour la cle', () => {
  assert.equal(
    buildCacheKey({ url: '/x', params: { a: 1, b: 2 } }),
    buildCacheKey({ url: '/x', params: { b: 2, a: 1 } }),
  );
});

check('POST invalide le cache (donnees fraiches)', async () => {
  const api = newClient();
  await api.get('/bonuses');
  payload = { v: 2 };
  await api.post('/bonuses', { x: 1 });
  const after = await api.get('/bonuses');
  assert.equal(calls, 3, `attend 3 appels, recu ${calls}`);
  assert.equal(after.data.v, 2, 'donnees perimees servies apres POST');
});

check('PUT / DELETE invalident aussi', async () => {
  const api = newClient();
  await api.get('/bonuses');
  await api.put('/bonuses/1', { x: 1 });
  await api.get('/bonuses');
  await api.delete('/bonuses/1');
  await api.get('/bonuses');
  assert.equal(calls, 5, `attend 5 appels, recu ${calls}`);
});

check('/auth/* jamais en cache', async () => {
  const api = newClient();
  await api.get('/auth/me');
  await api.get('/auth/me');
  assert.equal(calls, 2, 'roles/permissions ne doivent jamais etre caches');
});

check('cacheTtl:0 contourne le cache (notifications)', async () => {
  const api = newClient();
  await api.get('/notifications', { cacheTtl: 0 });
  await api.get('/notifications', { cacheTtl: 0 });
  assert.equal(calls, 2, 'la cloche doit rester vivante');
});

check('responseType blob jamais en cache', async () => {
  const api = newClient();
  await api.get('/files/x.pdf', { responseType: 'blob' });
  await api.get('/files/x.pdf', { responseType: 'blob' });
  assert.equal(calls, 2);
});

check('jetons differents = pas de partage entre utilisateurs', async () => {
  const api = newClient();
  await api.get('/bonuses', { headers: { Authorization: 'Bearer AAA' } });
  await api.get('/bonuses', { headers: { Authorization: 'Bearer BBB' } });
  assert.equal(calls, 2, 'fuite de donnees entre comptes');
});

check('invalidation force une nouvelle requete', async () => {
  const api = newClient();
  await api.get('/bonuses');
  await api.get('/bonuses');
  assert.equal(calls, 1);
  invalidateQueryCache();
  await api.get('/bonuses');
  assert.equal(calls, 2);
});

check('lecture lancee avant ecriture ne peut pas polluer le cache', async () => {
  clearQueryCache();
  let release;
  const gate = new Promise((r) => { release = r; });
  let slowCalls = 0;
  const api = axios.create({ baseURL: '/api/v1' });
  api.defaults.adapter = async (config) => {
    if (config.url === '/slow') {
      slowCalls += 1;
      await gate;
      return ok(config, { v: 'OLD' });
    }
    return ok(config, { v: 'NEW' });
  };
  installQueryCache(api);

  const pending = api.get('/slow');
  invalidateQueryCache();
  release();
  await pending;

  payload = { v: 99 };
  const fresh = await api.get('/slow');
  assert.equal(slowCalls, 2, `la lecture lente a du re-echouer, slowCalls=${slowCalls}`);
  assert.equal(fresh.data.v, 'OLD', 'le cache aurait du servir la valeur reecrite');
});

check('clearQueryCache vide tout', async () => {
  const api = newClient();
  await api.get('/bonuses');
  clearQueryCache();
  await api.get('/bonuses');
  assert.equal(calls, 2);
});

check('requete partagee en echec : tous les appelants recoivent l erreur', async () => {
  clearQueryCache();
  let calls2 = 0;
  const api = axios.create({ baseURL: '/api/v1' });
  api.defaults.adapter = async (config) => {
    calls2 += 1;
    const err = new Error('boom');
    err.config = config;
    err.isAxiosError = true;
    throw err;
  };
  installQueryCache(api);

  const results2 = await Promise.allSettled([api.get('/x'), api.get('/x')]);
  assert.equal(calls2, 1, 'la requete aurait du ete partagee');
  assert.deepEqual(results2.map((r) => r.status), ['rejected', 'rejected']);
  assert.equal(results2[1].reason.message, 'boom', "l'appelant concurrent a recu autre chose que l'erreur");
});

check('erreur reseau non memorisee', async () => {
  let calls2 = 0;
  const api = axios.create({ baseURL: '/api/v1' });
  api.defaults.adapter = async (config) => {
    calls2 += 1;
    if (calls2 === 1) {
      const err = new Error('boom');
      err.config = config;
      err.isAxiosError = true;
      throw err;
    }
    return ok(config, { v: 'recovered' });
  };
  installQueryCache(api);

  await assert.rejects(() => api.get('/flaky'));
  const res = await api.get('/flaky');
  assert.equal(calls2, 2, 'une erreur ne doit pas rester en cache');
  assert.equal(res.data.v, 'recovered');
});

let failed = 0;
for (const { name, fn } of results) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`);
  }
}
console.log(`\n${results.length - failed}/${results.length} OK`);
console.log(`stats: ${JSON.stringify(getQueryCacheStats())}`);
process.exit(failed ? 1 : 0);