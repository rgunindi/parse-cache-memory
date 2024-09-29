# parse-cache-memory

[![Known Vulnerabilities](https://snyk.io/test/github/rgunindi/parse-cache-memory/badge.svg)](https://snyk.io/test/github/rgunindi/parse-cache-memory)
[![npm version](https://badge.fury.io/js/parse-cache-memory.svg)](https://badge.fury.io/js/parse-cache-memory)
[![GitHub license](https://img.shields.io/github/license/rgunindi/parse-cache-memory)]()

A caching utility for Parse Server queries.

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
