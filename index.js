const Parse = require('parse/node');
const LRUCache = require('lru-cache');
const objectHash = require('object-hash');

let options = {}
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
                return 1
            },
        };
        this.cache = new Map();
    }

    async get(query, ...args) {
        const className = query.className;
        const cacheKey = this.generateCacheKey(query, ...args);

        if (!this.cache.has(className)) {
            this.cache.set(className, new LRUCache(options));
        }

        return this.cache.get(className)?.get(cacheKey);
    }

    set(className, cacheKey, data) {
        if (!this.cache.has(className)) {
            this.cache.set(className, new LRUCache(options));
        }
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
            args: args,
        }
        return objectHash(JSON.stringify(key));
    }

}
const originalSave = Parse.Object.prototype.save;
const originalSaveAll = Parse.Object.saveAll;
const originalDestroy = Parse.Object.prototype.destroy;
const originalDestroyAll = Parse.Object.destroyAll;

global.Parse.Object.destroyAll = async function (...args) {
    const result = await originalDestroyAll.apply(this, args);
    if (result) {
        // Clear cache
        cache.clear(result[0].className);
        return result;
    }
}
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
}
global.Parse.Object.prototype.save = async function (...args) {
    const result = await originalSave.apply(this, args);
    // Clear cache
    cache.clear(this.className);
    return result;
};
//("get", "find", "findAll", "count", "distinct", "aggregate", "first", "eachBatch", "each", "map", "reduce", "filter", "subscribe")
global.Parse.Query.prototype.getCache = async function (objectId, options) {
    const cacheKey = cache.generateCacheKey(this, objectId, options);
    let cachedData = await cache.get(this, objectId, options);

    if (!cachedData) {
        cachedData = await this.get(objectId, options);
        if (cachedData)
            cache.set(this.className, cacheKey, cachedData);
    }

    return cachedData;
};
global.Parse.Query.prototype.findCache = async function (options) {
    const cacheKey = cache.generateCacheKey(this, options);
    let cachedData = await cache.get(this, options);

    if (!cachedData) {
        cachedData = await this.find(options);
        if (cachedData)
            cache.set(this.className, cacheKey, cachedData);
    }

    return cachedData;
};
global.Parse.Query.prototype.findAllCache = async function (options) {
    const cacheKey = cache.generateCacheKey(this, options);
    let cachedData = await cache.get(this, options);

    if (!cachedData) {
        cachedData = await this.findAll(options);
        if (cachedData)
            cache.set(this.className, cacheKey, cachedData);
    }

    return cachedData;
};
global.Parse.Query.prototype.countCache = async function (options) {
    const cacheKey = cache.generateCacheKey(this, options);
    let cachedData = await cache.get(this, options);

    if (!cachedData) {
        cachedData = await this.count(options);
        if (cachedData)
            cache.set(this.className, cacheKey, cachedData);
    }

    return cachedData;
};
global.Parse.Query.prototype.distinctCache = async function (key, options) {
    const cacheKey = cache.generateCacheKey(this, key, options);
    let cachedData = await cache.get(this, key, options);

    if (!cachedData) {
        cachedData = await this.distinct(key, options);
        if (cachedData)
            cache.set(this.className, cacheKey, cachedData);
    }

    return cachedData;
};
global.Parse.Query.prototype.aggregateCache = async function (pipeline, options) {
    const cacheKey = cache.generateCacheKey(this, pipeline, options);
    let cachedData = await cache.get(this, pipeline, options);

    if (!cachedData) {
        cachedData = await this.aggregate(pipeline, options);
        if (cachedData)
            cache.set(this.className, cacheKey, cachedData);
    }

    return cachedData;
};
global.Parse.Query.prototype.firstCache = async function (options) {
    const cacheKey = cache.generateCacheKey(this, options);
    let cachedData = await cache.get(this, options);

    if (!cachedData) {
        cachedData = await this.first(options);
        if (cachedData)
            cache.set(this.className, cacheKey, cachedData);
    }

    return cachedData;
};
global.Parse.Query.prototype.eachBatchCache = async function (callback, options) {
    const cacheKey = cache.generateCacheKey(this, callback, options);
    let cachedData = await cache.get(this, callback, options);

    if (!cachedData) {
        cachedData = await this.eachBatch(callback, options);
        if (cachedData)
            cache.set(this.className, cacheKey, cachedData);
    }

    return cachedData;
};
global.Parse.Query.prototype.eachCache = async function (callback, options) {
    const cacheKey = cache.generateCacheKey(this, callback, options);
    let cachedData = await cache.get(this, callback, options);

    if (!cachedData) {
        cachedData = await this.each(callback, options);
        if (cachedData)
            cache.set(this.className, cacheKey, cachedData);
    }

    return cachedData;
};
global.Parse.Query.prototype.mapCache = async function (callback, options) {
    const cacheKey = cache.generateCacheKey(this, callback, options);
    let cachedData = await cache.get(this, callback, options);

    if (!cachedData) {
        cachedData = await this.map(callback, options);
        if (cachedData)
            cache.set(this.className, cacheKey, cachedData);
    }

    return cachedData;
};
global.Parse.Query.prototype.reduceCache = async function (callback, initialValue, options) {
    const cacheKey = cache.generateCacheKey(this, callback, initialValue, options);
    let cachedData = await cache.get(this, callback, initialValue, options);

    if (!cachedData) {
        cachedData = await this.reduce(callback, initialValue, options);
        if (cachedData)
            cache.set(this.className, cacheKey, cachedData);
    }

    return cachedData;
};
global.Parse.Query.prototype.filterCache = async function (callback, options) {
    const cacheKey = cache.generateCacheKey(this, callback, options);
    let cachedData = await cache.get(this, callback, options);

    if (!cachedData) {
        cachedData = await this.filter(callback, options);
        if (cachedData)
            cache.set(this.className, cacheKey, cachedData);
    }

    return cachedData;
};
global.Parse.Query.prototype.subscribeCache = async function (options) {
    const cacheKey = cache.generateCacheKey(this, options);
    let cachedData = await cache.get(this, options);

    if (!cachedData) {
        cachedData = await this.subscribe(options);
        if (cachedData)
            cache.set(this.className, cacheKey, cachedData);
    }

    return cachedData;
};

const cache = new ParseCache();

module.exports = ParseCache;