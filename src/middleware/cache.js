// src/middleware/cache.middleware.js
let listingsCache = {
  data: [],
  lastUpdate: null
};

const cacheMiddleware = async (req, res, next) => {
  try {
    const cacheAge = listingsCache.lastUpdate 
      ? (new Date() - listingsCache.lastUpdate) / 1000 / 60 
      : Infinity;

    // Force refresh if parameters are provided
    const hasQueryParams = Object.keys(req.query).length > 0;
    
    if (hasQueryParams || cacheAge > 5 || !listingsCache.data.length) {
      console.log('Cache miss or forced refresh'); // Debug log
      req.shouldRefreshCache = true;
    } else {
      console.log('Using cached data'); // Debug log
    }

    req.cache = listingsCache;
    req.cacheAge = cacheAge;
    
    next();
  } catch (error) {
    console.error('Cache middleware error:', error);
    next(error);
  }
};

module.exports = {
  cacheMiddleware,
  listingsCache
};