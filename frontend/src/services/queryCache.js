/**
 * Cache HTTP en mémoire pour les requêtes GET (installé sur l'instance axios
 * de `services/api.js`).
 *
 * Objectif : accélérer la navigation entre les menus sans changer le
 * comportement des pages (aucune page n'est modifiée) et sans jamais servir
 * de données périmées au-delà d'un court délai.
 *
 * Garanties de fraîcheur :
 *   1. TTL court par défaut (30 s, comme le rythme de rafraîchissement que
 *      l'application utilise déjà pour les notifications).
 *   2. TOUTE requête mutante (POST/PUT/PATCH/DELETE) vide le cache, donc les
 *      écritures de l'utilisateur sont toujours visibles immédiatement.
 *   3. Compteur de génération : une lecture lancée avant une écriture ne peut
 *      pas réécrire son résultat périmé dans le cache après l'invalidation.
 *   4. `/auth/*` n'est jamais mis en cache (rôles, permissions, session).
 *   5. Les réponses non JSON (PDF/XLSX) et les requêtes annulables ne sont
 *      jamais mises en cache.
 *   6. Le cache est vidé à la connexion et à la déconnexion : jamais de
 *      données d'un utilisateur visibles par un autre dans le même onglet.
 *   7. Le jeton d'authentification fait partie de la clé : deux utilisateurs
 *      ne peuvent pas partager une entrée.
 */

import axios from 'axios';

const DEFAULT_TTL_MS = 30_000;
const MAX_ENTRIES = 300;

const store = new Map();
const inflight = new Map();

let defaultTtlMs = DEFAULT_TTL_MS;
let generation = 0;
let stats = { hits: 0, misses: 0, dedup: 0, bypassed: 0 };

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) ?? '';
  const wanted = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === wanted) return headers[key];
  }
  return '';
}

function stableValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${k}:${stableValue(value[k])}`).join(',')}}`;
}

export function buildCacheKey(config) {
  const base = config.baseURL || '';
  const url = `${base}${config.url || ''}`;
  const params = stableValue(config.params || null);
  const token = headerValue(config.headers, 'Authorization');
  return `${url}|${params}|${token}`;
}

const JSON_RESPONSE_TYPES = new Set([undefined, null, '', 'json']);
const AUTH_PATH = /(^|\/)auth\//;

function ttlFor(config) {
  return config.cacheTtl === undefined ? defaultTtlMs : config.cacheTtl;
}

function isCacheable(config) {
  if ((config.method || 'get').toLowerCase() !== 'get') return false;
  if (!JSON_RESPONSE_TYPES.has(config.responseType)) return false;
  if (AUTH_PATH.test(config.url || '')) return false;
  if (config.signal) return false;
  return ttlFor(config) > 0;
}

function write(key, meta) {
  store.delete(key);
  store.set(key, meta);
  while (store.size > MAX_ENTRIES) {
    store.delete(store.keys().next().value);
  }
}

function replay(config, meta) {
  return {
    data: meta.raw,
    status: meta.status,
    statusText: meta.statusText,
    headers: meta.headers,
    config,
    request: null,
  };
}

function snapshot(response) {
  return {
    raw: response.data,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  };
}

export function invalidateQueryCache() {
  generation += 1;
  store.clear();
}

export function clearQueryCache() {
  invalidateQueryCache();
  inflight.clear();
}

export function getQueryCacheStats() {
  return { ...stats, entries: store.size, ttlMs: defaultTtlMs };
}

function cachedAdapter(networkAdapter) {
  return async function cachedAdapter(config) {
    if (!isCacheable(config)) {
      stats.bypassed += 1;
      return networkAdapter(config);
    }

    const key = buildCacheKey(config);
    const entry = store.get(key);
    const now = Date.now();

    if (entry) {
      if (entry.expiresAt > now) {
        store.delete(key);
        store.set(key, entry);
        stats.hits += 1;
        return replay(config, entry);
      }
      store.delete(key);
    }

    const pending = inflight.get(key);
    if (pending) {
      stats.dedup += 1;
      return replay(config, await pending);
    }

    stats.misses += 1;
    const startedAt = generation;
    const request = networkAdapter(config).then((response) => {
      if (generation === startedAt) {
        write(key, { ...snapshot(response), expiresAt: Date.now() + ttlFor(config) });
      }
      return response;
    });

    inflight.set(key, request.then((response) => snapshot(response)));
    // Sans ce catch, un échec de requête partagée déclencherait un
    // "unhandled rejection" quand aucun appelant concurrent n'attend.
    inflight.get(key).catch(() => {});

    try {
      return await request;
    } finally {
      inflight.delete(key);
    }
  };
}

export function installQueryCache(axiosInstance) {
  const networkAdapter = axios.getAdapter(axiosInstance.defaults.adapter);
  axiosInstance.defaults.adapter = cachedAdapter(networkAdapter);

  const isMutation = (config) => (config?.method || 'get').toLowerCase() !== 'get';
  const onResponse = (response) => {
    if (isMutation(response?.config)) invalidateQueryCache();
    return response;
  };
  const onError = (error) => {
    if (isMutation(error?.config)) invalidateQueryCache();
    return Promise.reject(error);
  };

  axiosInstance.interceptors.response.use(onResponse, onError);
}