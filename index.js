const Parse = require('parse/node');
const LRUCache = require('lru-cache');
const objectHash = require('object-hash');

let options = {};
class ParseCache {
    constructor(option = {}) {
        options = {
            max: option.max || 500,
            maxSize: option.maxSize || 5000,
            ttl: option.ttl || 1000 * 60 * 5,
            allowStale: option.allowStale || false,
            updateAgeOnGet: option.updateAgeOnGet || false,
            updateAgeOnHas: option.updateAgeOnHas || false,
            sizeCalculation: (value, key) => {
                if (Array.isArray(value)) {
                    return value.length;
                } else if (typeof value === 'object') {
                    return JSON.stringify(value).length;
                }
                return 1;
            },
            resetCacheOnSaveAndDestroy: option.resetCacheOnSaveAndDestroy || false,
            maxClassCaches: option.maxClassCaches || 50,
        };
        this.cache = new Map();
        this.classCount = 0;
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
        };
    }

    async get(query, cacheKey) {
        try {
            const className = query.className;
            if (!className) {
                throw new Error('Query must have a className');
            }

            if (!this.cache.has(className)) {
                this.cache.set(className, new LRUCache(options));
            }

            const cachedValue = this.cache.get(className)?.get(cacheKey);
            if (cachedValue) {
                this.stats.hits++;
            } else {
                this.stats.misses++;
            }
            return cachedValue;
        } catch (error) {
            console.error('Cache get error:', error);
            return null;
        }
    }

    set(className, cacheKey, data) {
        if (!this.cache.has(className)) {
            if (this.classCount >= options.maxClassCaches) {
                const oldestClass = Array.from(this.cache.keys())[0];
                this.cache.delete(oldestClass);
            } else {
                this.classCount++;
            }
            this.cache.set(className, new LRUCache(options));
        }
        this.stats.sets++;
        this.cache.get(className).set(cacheKey, data);
    }

    clear(className) {
        if (this.cache.has(className)) {
            this.cache.delete(className);
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
            ...this.stats,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses),
            cacheSize: this.cache.size,
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
    const originalSave = Parse.Object.prototype.save;
    const originalSaveAll = Parse.Object.saveAll;
    const originalDestroy = Parse.Object.prototype.destroy;
    const originalDestroyAll = Parse.Object.destroyAll;
    if (options.resetCacheOnSaveAndDestroy) {
        global.Parse.Object.destroyAll = async function (...args) {
            const result = await originalDestroyAll.apply(this, args);
            if (result) {
                // Clear cache
                cache.clear(result[0].className);
                return result;
            }
        };
        global.Parse.Object.prototype.destroy = async function (...args) {
            const result = await originalDestroy.apply(this, args);
            // Clear cache
            cache.clear(this.className);
            return result;
        };
        global.Parse.Object.saveAll = async function (...args) {
            const result = await originalSaveAll.apply(this, args);
            if (result) {
                // Clear cache
                cache.clear(result[0].className);
                return result;
            }
        };
        global.Parse.Object.prototype.save = async function (...args) {
            // const result = await originalSave.apply(this, args);
            const result = await originalSave.call(this, ...args);
            // Clear cache
            cache.clear(this.className);
            return result;
        };
    }

    //("get", "find", "findAll", "count", "distinct", "aggregate", "first", "eachBatch", "each", "map", "reduce", "filter", "subscribe")
    global.Parse.Query.prototype.getCache = async function (objectId, options) {
        const cacheKey = cache.generateCacheKey(this, objectId, options, fNames.getCache);
        let cachedData = await cache.get(this, cacheKey);

        if (!cachedData) {
            cachedData = await this.get(objectId, options);
            if (cachedData)
                cache.set(this.className, cacheKey, cachedData);
        }

        return cachedData;
    };
    global.Parse.Query.prototype.findCache = async function (options) {
        const cacheKey = cache.generateCacheKey(this, options, fNames.findCache);
        let cachedData = await cache.get(this, cacheKey);

        if (!cachedData) {
            cachedData = await this.find(options);
            if (cachedData)
                cache.set(this.className, cacheKey, cachedData);
        }

        return cachedData;
    };
    global.Parse.Query.prototype.findAllCache = async function (options) {
        const cacheKey = cache.generateCacheKey(this, options, fNames.findAllCache);
        let cachedData = await cache.get(this, cacheKey);

        if (!cachedData) {
            cachedData = await this.findAll(options);
            if (cachedData) {
                cache.set(this.className, cacheKey, cachedData);
            }
        }

        return cachedData;
    };
    global.Parse.Query.prototype.countCache = async function (options) {
        const cacheKey = cache.generateCacheKey(this, options,fNames.countCache);
        let cachedData = await cache.get(this,cacheKey);

        if (!cachedData) {
            cachedData = await this.count(options);
            if (cachedData)
                cache.set(this.className, cacheKey, cachedData);
        }

        return cachedData;
    };
    global.Parse.Query.prototype.distinctCache = async function (key, options) {
        const cacheKey = cache.generateCacheKey(this, key, options, fNames.distinctCache);
        let cachedData = await cache.get(this,cacheKey);

        if (!cachedData) {
            cachedData = await this.distinct(key, options);
            if (cachedData)
                cache.set(this.className, cacheKey, cachedData);
        }

        return cachedData;
    };
    global.Parse.Query.prototype.aggregateCache = async function (pipeline, options) {
        const cacheKey = cache.generateCacheKey(this, pipeline, options, fNames.aggregateCache);
        let cachedData = await cache.get(this,cacheKey);

        if (!cachedData) {
            cachedData = await this.aggregate(pipeline, options);
            if (cachedData)
                cache.set(this.className, cacheKey, cachedData);
        }

        return cachedData;
    };
    global.Parse.Query.prototype.firstCache = async function (options) {
        const cacheKey = cache.generateCacheKey(this, options, fNames.firstCache);
        let cachedData = await cache.get(this,cacheKey);

        if (!cachedData) {
            cachedData = await this.first(options);
            if (cachedData)
                cache.set(this.className, cacheKey, cachedData);
        }

        return cachedData;
    };
    global.Parse.Query.prototype.eachBatchCache = async function (callback, options) {
        const cacheKey = cache.generateCacheKey(this, callback, options, fNames.eachBatchCache);
        let cachedData = await cache.get(this,cacheKey);

        if (!cachedData) {
            cachedData = await this.eachBatch(callback, options);
            if (cachedData)
                cache.set(this.className, cacheKey, cachedData);
        }

        return cachedData;
    };
    global.Parse.Query.prototype.eachCache = async function (callback, options) {
        const cacheKey = cache.generateCacheKey(this, callback, options, fNames.eachCache);
        let cachedData = await cache.get(this, cacheKey);

        if (!cachedData) {
            cachedData = await this.each(callback, options);
            if (cachedData)
                cache.set(this.className, cacheKey, cachedData);
        }

        return cachedData;
    };
    global.Parse.Query.prototype.mapCache = async function (callback, options) {
        const cacheKey = cache.generateCacheKey(this, callback, options, fNames.mapCache);
        let cachedData = await cache.get(this,cacheKey);

        if (!cachedData) {
            cachedData = await this.map(callback, options);
            if (cachedData)
                cache.set(this.className, cacheKey, cachedData);
        }

        return cachedData;
    };
    global.Parse.Query.prototype.reduceCache = async function (callback, initialValue, options) {
        const cacheKey = cache.generateCacheKey(this, callback, initialValue, options, fNames.reduceCache);
        let cachedData = await cache.get(this, cacheKey);

        if (!cachedData) {
            cachedData = await this.reduce(callback, initialValue, options);
            if (cachedData)
                cache.set(this.className, cacheKey, cachedData);
        }

        return cachedData;
    };
    global.Parse.Query.prototype.filterCache = async function (callback, options) {
        const cacheKey = cache.generateCacheKey(this, callback, options, fNames.filterCache);
        let cachedData = await cache.get(this, cacheKey);

        if (!cachedData) {
            cachedData = await this.filter(callback, options);
            if (cachedData)
                cache.set(this.className, cacheKey, cachedData);
        }

        return cachedData;
    };
    global.Parse.Query.prototype.subscribeCache = async function (options) {
        const cacheKey = cache.generateCacheKey(this, options, fNames.subscribeCache);
        let cachedData = await cache.get(this, cacheKey);

        if (!cachedData) {
            cachedData = await this.subscribe(options);
            if (cachedData)
                cache.set(this.className, cacheKey, cachedData);
        }

        return cachedData;
    };

    return cache;
}


module.exports = { parseCacheInit };