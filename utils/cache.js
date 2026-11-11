const cache = new Map();

// Cada proceso de Node tiene su propia copia de esta cache y solo se vacia
// cuando ESE proceso atiende un POST/PUT/DELETE. Con varios procesos (LiteSpeed
// levanta mas de uno bajo carga) y con las tiendas escribiendo en la misma base
// de datos sin pasar por aqui, una entrada sin caducidad podia quedarse vieja
// indefinidamente. Por eso toda entrada caduca.
const TTL_MS = Number(process.env.CACHE_TTL_MS) || 60 * 1000;

// Middleware to return cached response if it exists, or intercept response and cache it
const cacheMiddleware = (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
        return next();
    }

    const key = req.originalUrl || req.url;
    const hit = cache.get(key);
    if (hit && hit.expira > Date.now()) {
        return res.json(hit.body);
    }
    if (hit) cache.delete(key);

    const originalJson = res.json;
    res.json = (body) => {
        // Only cache successful responses
        if (res.statusCode === 200) {
            cache.set(key, { body, expira: Date.now() + TTL_MS });
        }
        originalJson.call(res, body);
    };
    next();
};

// Para rutas cuyo dato cambia con cada venta (productos, ventas): no se guarda
// en memoria y se le pide al navegador/proxy que tampoco lo guarde.
const sinCache = (req, res, next) => {
    if (req.method === 'GET') res.set('Cache-Control', 'no-store');
    next();
};

// Middleware to clear cache (use on POST/PUT/DELETE routes)
const clearCacheMiddleware = (req, res, next) => {
    cache.clear();
    next();
};

// Function to programmatically clear the cache if needed elsewhere
const clearCache = () => {
    cache.clear();
};

module.exports = {
    cacheMiddleware,
    sinCache,
    clearCacheMiddleware,
    clearCache,
    cache
};
