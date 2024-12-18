const Parse = require('parse/node');
const LRUCache = require('lru-cache');
const objectHash = require('object-hash');

let options = {};
class ParseCache {
    constructor(option = {}) {
        options = {
            max: option.max || 500,
            ttl: option.ttl || 1000 * 60 * 5,
            allowStale: option.allowStale || false,
            updateAgeOnGet: option.updateAgeOnGet || false,
            updateAgeOnHas: option.updateAgeOnHas || false,
            resetCacheOnSaveAndDestroy: option.resetCacheOnSaveAndDestroy || false,
            maxClassCaches: option.maxClassCaches || 50,
            debug: option.debug || false,
        };
        this.logger = new CacheLogger(options.debug);
        this.cache = new Map();
        this.classCount = 0;
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0
        };
    }

    async get(query, cacheKey) {
        try {
            const className = query.className;
            if (!className) {
                this.logger.warn('No className provided for query');
                this.stats.misses++;
                return null;
            }

            if (!this.cache.has(className)) {
                this.logger.log(`Creating new cache for class: ${className}`);
                this.stats.misses++;
                this.cache.set(className, new LRUCache(options));
                return null;
            }

            const classCache = this.cache.get(className);
            const cachedValue = classCache.get(cacheKey);

            if (cachedValue) {
                this.logger.log(`Cache hit for ${className}`, { cacheKey });
                this.stats.hits++;
                return cachedValue;
            }
            
            this.logger.log(`Cache miss for ${className}`, { cacheKey });
            this.stats.misses++;
            return null;
        } catch (error) {
            this.logger.error('Error getting from cache:', error);
            this.stats.misses++;
            return null;
        }
    }

    set(className, cacheKey, data) {
        if (!this.cache.has(className)) {
            if (this.classCount >= options.maxClassCaches) {
                const oldestClass = Array.from(this.cache.keys())[0];
                this.cache.delete(oldestClass);
                this.classCount--;
            }
            this.cache.set(className, new LRUCache(options));
            this.classCount++;
        }
        const classCache = this.cache.get(className);
        classCache.set(cacheKey, data);
        this.stats.sets++;
    }

    clear(className) {
        if (this.cache.has(className)) {
            this.cache.delete(className);
            this.classCount--;
        }
    }
    generateCacheKey(query, ...args) {
        const key = {
            className: query.className,
            query: query.toJSON(),
            args: args,
        };
        return objectHash(JSON.stringify(key));
    }

    getStats() {
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            sets: this.stats.sets,
            hitRate: (this.stats.hits + this.stats.misses) > 0 
                ? this.stats.hits / (this.stats.hits + this.stats.misses) 
                : 0,
            cacheSize: this.cache.size
        };
    }

    resetEverything() {
        this.cache = new Map();
        this.classCount = 0;
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0
        };
    }
}

const fNames = {
    getCache: "get",
    findCache: "find",
    findAllCache: "findAll",
    countCache: "count",
    distinctCache: "distinct",
    aggregateCache: "aggregate",
    firstCache: "first",
    eachBatchCache: "eachBatch",
    eachCache: "each",
    mapCache: "map",
    reduceCache: "reduce",
    filterCache: "filter",
    subscribeCache: "subscribe"
};

function parseCacheInit(options = {}) {
    const cache = new ParseCache(options);
    const logger = new CacheLogger(options.debug);
    const originalSave = Parse.Object.prototype.save;
    const originalSaveAll = Parse.Object.saveAll;
    const originalDestroy = Parse.Object.prototype.destroy;
    const originalDestroyAll = Parse.Object.destroyAll;

    // Ensure we have Parse globally
    const ParseInstance = global.Parse || Parse;

    // Add cache methods to Parse.Query.prototype
    Object.entries(fNames).forEach(([cacheMethod, originalMethod]) => {
        if (!ParseInstance.Query.prototype[cacheMethod]) {
            ParseInstance.Query.prototype[cacheMethod] = async function(...args) {
                const cacheKey = cache.generateCacheKey(this, ...args, originalMethod);
                logger.log(`Cache lookup for ${this.className}`, { 
                    method: cacheMethod,
                    cacheKey 
                });
                
                let cachedData = await cache.get(this, cacheKey);
                logger.log(`Cache ${cachedData ? 'hit' : 'miss'} for ${this.className}`);

                if (!cachedData) {
                    cachedData = await this[originalMethod](...args);
                    if (cachedData) {
                        cache.set(this.className, cacheKey, cachedData);
                        logger.log(`Cached data for ${this.className}`, {
                            size: Array.isArray(cachedData) ? cachedData.length : 1
                        });
                    }
                }

                logger.log(`Cache stats after ${cacheMethod}:`, cache.getStats());

                return cachedData;
            };
        }
    });

    if (options.resetCacheOnSaveAndDestroy) {
        ParseInstance.Object.prototype.save = async function (...args) {
            const result = await originalSave.call(this, ...args);
            if (result) {
                logger.log('Clearing cache for save:', this.className);
                cache.clear(this.className);
            }
            return result;
        };

        ParseInstance.Object.saveAll = async function (...args) {
            const result = await originalSaveAll.apply(this, args);
            if (result && result.length > 0) {
                logger.log('Clearing cache for saveAll:', result[0].className);
                cache.clear(result[0].className);
            }
            return result;
        };

        ParseInstance.Object.prototype.destroy = async function (...args) {
            const className = this.className;
            const result = await originalDestroy.apply(this, args);
            if (result) {
                logger.log('Clearing cache for destroy:', className);
                cache.clear(className);
            }
            return result;
        };

        ParseInstance.Object.destroyAll = async function (...args) {
            const result = await originalDestroyAll.apply(this, args);
            if (result && result.length > 0) {
                logger.log('Clearing cache for destroyAll:', result[0].className);
                cache.clear(result[0].className);
            }
            return result;
        };
    }

    return cache;
}

class CacheLogger {
    constructor(enabled = false) {
        this.enabled = enabled;
    }

    log(message, data) {
        if (this.enabled) {
            console.log(`[ParseCache] ${message}`, data ? data : '');
        }
    }

    warn(message, error) {
        if (this.enabled) {
            console.warn(`[ParseCache] Warning: ${message}`, error ? error : '');
        }
    }

    error(message, error) {
        if (this.enabled) {
            console.error(`[ParseCache] Error: ${message}`, error ? error : '');
        }
    }
}

module.exports = { parseCacheInit };