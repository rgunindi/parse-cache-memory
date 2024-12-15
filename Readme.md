# Parse Server Cache

[![npm version](https://badge.fury.io/js/parse-cache-memory.svg)](https://badge.fury.io/js/parse-cache-memory)
[![Known Vulnerabilities](https://snyk.io/test/github/rgunindi/parse-cache-memory/badge.svg)](https://snyk.io/test/github/rgunindi/parse-cache-memory)

A caching layer for Parse Server queries that improves performance by caching query results in memory using LRU cache.

## Features

- Automatic caching for all Parse Query methods
- 💾 LRU (Least Recently Used) cache implementation
- ⚡ Configurable cache options (size, TTL, etc.)
- 🔄 Automatic cache invalidation on data mutations
- 📊 Cache statistics tracking
- 🛠️ Supports all these Parse Query methods:
  - `getCache`
  - `findCache`
  - `findAllCache`
  - `countCache`
  - `distinctCache`
  - `aggregateCache`
  - `firstCache`
  - `eachBatchCache`
  - `eachCache`
  - `mapCache`
  - `reduceCache`
  - `filterCache`
  - `subscribeCache`

## Installation

```bash
npm install parse-cache-memory
```

---

## Simple Usage

```js
require('parse-cache-memory').parseCacheInit();
const query = new Parse.Query("GameScore");
query.equalTo("playerName", "Dan Stemkoski");
const data = await query.findCache();
```

---

## Advanced Usage

First, require the package and create an instance of `ParseCache`:

```js
const customOptions = {
  max: 1000, // maximum number of items that can be stored for each class (className)
  maxSize: 10000, // total maximum number of items that can be stored across all classes
  ttl: 1000 * 60 * 10, // time-to-live for items in the cache, here set to 10 minutes
  allowStale: true, // determines whether items can be used after their ttl has expired
  updateAgeOnGet: true, // determines whether an item's age is updated when it's retrieved using "get"
  updateAgeOnHas: true, // determines whether an item's age is updated when it's checked using "has"
  resetCacheOnSaveAndDestroy: false, // determines whether the cache is reset when an object is saved or destroyed
};
const ParseCache = require('parse-cache-memory').parseCacheInit(customOptions);
```

> If you want you can use the cache methods manually, but this is not recommended because parse-cache-memory will do it for you automatically.

```js
// Example Parse query
const query = new Parse.Query('GameScore');
query.equalTo('playerName', 'Dan Stemkoski');

// Get data from cache or Parse Server some example
const find = await query.findCache({ useMasterKey: true });
const get = await query.getCache();
const count = await query.countCache();
const first = await query.firstCache();
...
```

## Some backside features

### Updating Cache with Hooks

By using the `save`, `saveAll`, `destroy`, and `destroyAll` functions, we can ensure that the cache of a collection utilizing the following functions are constantly updated. This allows for the most recent data to be available in the cache at all times.

By default, the cache will not be reset on `save` and `destroy` operations (`resetCacheOnSaveAndDestroy` is set to `false`). However, if you want to activate the `save` and `destroy` hooks to reset the cache automatically, you can pass the option `{resetCacheOnSaveAndDestroy: true}` to the ParseCache constructor to enable the hooks.

- Note: Keep in mind that enabling the hooks to reset the cache after every save and destroy operation might have an impact on performance. Carefully consider your application's requirements and caching strategy when deciding whether to enable this option.

### Using the Cache with Parse Functions

You can also use the ready-made functions `findCache()`, `getCache()`, `countCache()`, `distinctCache()`, `aggregateCache()`, `firstCache()`, `eachBatchCache()`, `eachCache()`, `mapCache()`, `reduceCache()`, `filterCache()`, and `subscribeCache()`. As the names suggest, they behave like their respective functions, but execute the queries through the cache to ensure that the cached data is always up to date.

parse-cache-memory uses the `lru-cache` library for its caching mechanism. This allows for efficient caching of frequently accessed data, while also providing options for controlling the size of the cache and handling evictions.

- Options are also evaluated separately in the cache key generation process. For example, the same query executed with or without the masterKey option will result in different cache keys. This ensures that the results of your authorized queries are kept separate, in addition to preventing the mixing of argument objects.

## Cache Invalidation

When `resetCacheOnSaveAndDestroy` is enabled, the cache is automatically cleared for a class when:
- An object is saved (`save()`)
- Multiple objects are saved (`saveAll()`)
- An object is destroyed (`destroy()`)
- Multiple objects are destroyed (`destroyAll()`)

### Recommendations for Cache Invalidation

Consider enabling cache invalidation (`resetCacheOnSaveAndDestroy: true`) when:
- You have frequently updated collections that require real-time accuracy
- Your application relies heavily on specific Parse classes that need immediate data consistency
- You want to ensure that queries always return the most recent data for certain classes

Example of selective cache invalidation:
```js
// Initialize cache with automatic invalidation
const cache = parseCacheInit({
    resetCacheOnSaveAndDestroy: true
});

// For specific classes where you need to manually control cache:
const query = new Parse.Query('FrequentlyUpdatedClass');
cache.clear('FrequentlyUpdatedClass'); // Manually clear cache for this class
await query.findCache(); // Get fresh data

```

> **Note**: Enabling cache invalidation can impact performance if you have high-frequency write operations. Consider your application's specific needs and data update patterns when deciding whether to enable this feature.

## Cache Statistics Tracking

The cache provides built-in statistics tracking to help monitor its performance and usage. You can access these statistics using the `getStats()` method:

```js
// Later in your code, get cache statistics
const stats = cache.getStats();
console.log(stats);
/* Output:
{
    hits: 127,        // Number of successful cache retrievals
    misses: 23,       // Number of cache misses
    sets: 45,         // Number of items added to cache
    hitRate: 0.847,   // Cache hit rate (hits / total attempts)
    cacheSize: 172    // Current number of items in cache
}
*/
```

### Using Statistics for Monitoring

You can use these statistics to:
- Monitor cache effectiveness
- Optimize cache settings
- Identify potential performance issues
- Make data-driven decisions about cache configuration

Example of periodic cache monitoring:
```js
// Monitor cache performance every 5 minutes
setInterval(() => {
    const stats = cache.getStats();
    const hitRatePercentage = (stats.hitRate * 100).toFixed(2);
    
    console.log(`Cache Performance Metrics:
    - Hit Rate: ${hitRatePercentage}%
    - Total Hits: ${stats.hits}
    - Total Misses: ${stats.misses}
    - Cache Size: ${stats.cacheSize}
    `);
    
    // Alert if hit rate is too low
    if (stats.hitRate < 0.5) {
        console.warn('Warning: Cache hit rate is below 50%');
    }
}, 5 * 60 * 1000);
```

> **Note**: Statistics are reset when the application restarts. Consider implementing persistent storage for long-term cache performance monitoring.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
