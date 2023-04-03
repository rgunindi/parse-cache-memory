# parse-cache-memory
   
[![Known Vulnerabilities](https://snyk.io/test/github/rgunindi/parse-cache-memory/badge.svg)](https://snyk.io/test/github/rgunindi/parse-cache-memory) 
[![npm version](https://badge.fury.io/js/parse-cache-memory.svg)](https://badge.fury.io/js/parse-cache-memory) 
[![GitHub license](https://img.shields.io/github/license/rgunindi/parse-cache-memory)]()
[![Node.js Package](https://github.com/rgunindi/parse-cache-memory/actions/workflows/release.yml/badge.svg)](https://github.com/rgunindi/parse-cache-memory/actions/workflows/release.yml)

A caching utility for Parse Server queries.

## Installation
```bash
npm install parse-cache-memory
```

-------------------
Simple Usage
-------------------

 ```js
    require('parse-cache-memory');
    const query = new Parse.Query('GameScore');
    query.equalTo('playerName', 'Dan Stemkoski');
    const data = await query.findCache();
```
-------------------
## Advanced Usage

First, require the package and create an instance of `ParseCache`:

```js
const ParseCache = require('parse-cache-memory');

const cache = new ParseCache();
```
> or you can pass options to the constructor

```js
/*
const customOptions = {
    max: 1000, // maximum number of items that can be stored for each class (className)
    maxSize: 10000, // total maximum number of items that can be stored across all classes
    ttl: 1000 * 60 * 10, // time-to-live for items in the cache, here set to 10 minutes
    allowStale: true, // determines whether items can be used after their ttl has expired
    updateAgeOnGet: true, // determines whether an item's age is updated when it's retrieved using "get"
    updateAgeOnHas: true, // determines whether an item's age is updated when it's checked using "has"
};
const cache = new ParseCache(customOptions);
*/
```

Then, use the cache instance to get and set cached query results:

```js
// Example Parse query
const query = new Parse.Query('GameScore');
query.equalTo('playerName', 'Dan Stemkoski');

//Get data from cache or Parse Server! If there is no data in cache, it will be cached automatically!
const data = await cache.get(query);

// Set data to cache
cache.set(query.className, cache.generateCacheKey(query), data);

You can also use the findCache() method to automatically cache the results of a find() query:

// Example Parse query
const query = new Parse.Query('GameScore');
query.equalTo('playerName', 'Dan Stemkoski');

// Get data from cache or Parse Server
const data = await query.findCache({ useMasterKey: true });
```

## Some backside features

- Updating Cache with hooks

>  By using the save, saveAll, destroy, and destroyAll functions, we can ensure that the cache of a collection utilizing the following functions are constantly updated. This allows for the most recent data to be available in the cache at all times.

You can also use the ready-made functions `findCache()`, `getCache()`, `countCache()`, `distinctCache()`, `aggregateCache()`, `firstCache()`, `eachBatchCache()`, `eachCache()`, `mapCache()`, `reduceCache()`, `filterCache()`, and `subscribeCache()`. As the names suggest, they behave like their respective functions, but execute the queries through the cache to ensure that the cached data is always up to date.

parse-cache-memory uses the `lru-cache` library for its caching mechanism. This allows for efficient caching of frequently accessed data, while also providing options for controlling the size of the cache and handling evictions.

* Options are also evaluated separately in the cache key generation process. For example, the same query executed with or without the masterKey option will result in different cache keys. This ensures that the results of your authorized queries are kept separate, in addition to preventing the mixing of argument objects.