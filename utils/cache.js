const cache = new Map();

// Middleware to return cached response if it exists, or intercept response and cache it
const cacheMiddleware = (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
        return next();
    }

    const key = req.originalUrl || req.url;
    if (cache.has(key)) {
        return res.json(cache.get(key));
    }

    const originalJson = res.json;
    res.json = (body) => {
        // Only cache successful responses
        if (res.statusCode === 200) {
            cache.set(key, body);
        }
        originalJson.call(res, body);
    };
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
    clearCacheMiddleware,
    clearCache,
    cache
};
