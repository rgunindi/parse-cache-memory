const { parseCacheInit } = require('../../index');
const { ParseServer } = require('parse-server');
const Parse = require('parse/node');
const express = require('express');
const { 
    getAvailablePort, 
    createMongoServer, 
    startParseServer, 
    stopParseServer 
} = require('../helpers/testUtils');

// Add expected methods list at the top of the file
const CACHE_METHODS = [
    'findCache',
    'getCache',
    'countCache',
    'distinctCache',
    'aggregateCache',
    'firstCache',
    'eachBatchCache',
    'eachCache',
    'mapCache',
    'reduceCache',
    'filterCache',
    'subscribeCache'
];

function verifyCacheMethods() {
    const addedMethods = Object.keys(Parse.Query.prototype)
        .filter(key => key.includes('Cache'));
    
    // Check if all expected methods are present
    const missingMethods = CACHE_METHODS.filter(method => !addedMethods.includes(method));
    if (missingMethods.length > 0) {
        console.log('Missing methods:', missingMethods);
    }
    
    return CACHE_METHODS.every(method => addedMethods.includes(method));
}

function assertStats(stats, expected, message = '') {
    console.log('Stats:', stats);
    console.log('Expected:', expected);
    expect(stats.hits).toBe(expected.hits, `${message} - hits`);
    expect(stats.misses).toBe(expected.misses, `${message} - misses`);
    expect(stats.sets).toBe(expected.sets, `${message} - sets`);
}

describe('Parse Cache Memory Unit Tests', () => {
    let cache;
    let parseServer;
    let mongod;
    let app;
    let httpServer;

    beforeAll(async () => {
        try {
            mongod = await createMongoServer();
            if (!mongod) {
                throw new Error('Failed to create MongoDB server');
            }

            const mongoUri = mongod.getUri();
            console.log('MongoDB URI:', mongoUri); // Debug log

            const masterKey = process.env.PARSE_MASTER_KEY || 'test-master-key';
            const appId = process.env.PARSE_APP_ID || 'test-app-id';

            // Setup Express
            app = express();
            
            const port = await getAvailablePort();

            // Create Parse Server instance
            parseServer = new ParseServer({
                databaseURI: mongoUri,
                appId: appId,
                masterKey: masterKey,
                serverURL: `http://localhost:${port}/parse`,
                javascriptKey: 'test-js-key',
                allowClientClassCreation: true,
                directAccess: true,
                enforcePrivateUsers: false
            });

            // Mount Parse Server
            app.use('/parse', parseServer);
            
            // Start Express server
            httpServer = await new Promise((resolve, reject) => {
                try {
                    const server = app.listen(port, () => resolve(server));
                    server.on('error', reject);
                } catch (error) {
                    reject(error);
                }
            });

            // Initialize Parse SDK with master key
            global.Parse = Parse;  // Make Parse explicitly global
            Parse.initialize(appId, 'test-js-key', masterKey);
            Parse.serverURL = `http://localhost:${port}/parse`;

            // Set master key for all requests
            const originalController = Parse.CoreManager.getRESTController();
            Parse.CoreManager.setRESTController({
                ...originalController,
                request: function(method, path, data, options) {
                    options = options || {};
                    options.useMasterKey = true;
                    return originalController.request(method, path, data, options);
                }
            });

            // Initialize cache
            cache = parseCacheInit({
                max: 500,
                ttl: 60 * 1000,
                resetCacheOnSaveAndDestroy: true
            });

            // Verify cache methods were added
            const addedMethods = Object.keys(Parse.Query.prototype)
                .filter(key => key.includes('Cache'));

            // Create TestClass schema
            const schema = new Parse.Schema('TestClass');
            try {
                await schema.save();
            } catch (error) {
                if (!error.message.includes('already exists')) {
                    console.log('Schema creation error:', error.message);
                }
            }
        } catch (error) {
            console.error('Test setup failed:', error);
            process.exit(1); // Force exit on setup failure
        }
    });

    beforeEach(async () => {
        // Create a test object to ensure the class exists
        const TestClass = Parse.Object.extend('TestClass');
        const testObj = new TestClass();
        await testObj.save({ field: 'value' }, { useMasterKey: true });
    });

    afterEach(async () => {
        // Clean up test data
        const query = new Parse.Query('TestClass');
        const objects = await query.find({ useMasterKey: true });
        await Parse.Object.destroyAll(objects, { useMasterKey: true });
    });

    afterAll(async () => {
        try {
            // Clean up schema
            const schema = new Parse.Schema('TestClass');
            await schema.delete({ useMasterKey: true });
        } catch (error) {
            console.log('Schema cleanup error:', error.message);
        }

        // Proper cleanup sequence
        try {
            await Promise.all([
                new Promise(resolve => httpServer?.close(resolve)),
                parseServer?.handleShutdown?.()
            ]);
        } catch (error) {
            console.error('Cleanup error:', error);
        }

        // Force close any remaining connections
        await new Promise(resolve => setTimeout(resolve, 500));
        process.removeAllListeners();
    });

    describe('Query Caching', () => {
        it('should cache find query results', async () => {
            const query = new Parse.Query('TestClass');
            query.equalTo('field', 'value');

            // First call should miss cache
            const firstResult = await query.findCache({ useMasterKey: true });
            
            // Second call should hit cache
            const secondResult = await query.findCache({ useMasterKey: true });
            
            expect(firstResult).toEqual(secondResult);
        });

        it('should cache get query results', async () => {
            // First create an object to get
            const TestClass = Parse.Object.extend('TestClass');
            const testObj = new TestClass();
            await testObj.save({ field: 'test' }, { useMasterKey: true });

            const query = new Parse.Query('TestClass');
            
            // First call should miss cache
            const firstResult = await query.getCache(testObj.id, { useMasterKey: true });
            
            // Second call should hit cache
            const secondResult = await query.getCache(testObj.id, { useMasterKey: true });
            
            // Compare relevant data instead of entire Parse Object
            expect(firstResult.id).toBe(secondResult.id);
            expect(firstResult.get('field')).toBe('test');
            expect(secondResult.get('field')).toBe('test');
            expect(firstResult.className).toBe(secondResult.className);
        });

        it('should cache count query results', async () => {
            const query = new Parse.Query('TestClass');
            query.equalTo('field', 'value');

            // First call should miss cache
            const firstCount = await query.countCache({ useMasterKey: true });
            
            // Second call should hit cache
            const secondCount = await query.countCache({ useMasterKey: true });
            
            expect(firstCount).toBe(secondCount);
        });
    });

    describe('Cache Invalidation', () => {
        beforeEach(() => {
            cache.resetEverything();
        });
          it('should clear cache on save', async () => {
            const TestClass = Parse.Object.extend('TestClass');
            const testObj = new TestClass();
            const query = new Parse.Query('TestClass');
            
            console.log('Making first query...');
            await query.findCache({ useMasterKey: true });
            
            let stats = cache.getStats();
            console.log('Stats after first query:', stats);
            assertStats(stats, {
                hits: 0,
                misses: 1,
                sets: 1
            }, 'After first query');

            await testObj.save({ field: 'value' }, { useMasterKey: true });
            assertStats(stats, {
                hits: 0,
                misses: 1,
                sets: 1
            }, 'After save');

            console.log('Making second query...');
             await query.findCache({ useMasterKey: true });
            
            stats = cache.getStats();
            console.log('Stats after second query:', stats);
            assertStats(stats, {
                hits: 0,
                misses: 2,
                sets: 2
            }, 'After save and second query');
        });
    });

    describe('Cache Statistics', () => {
        it('should track cache statistics correctly', async () => {
           cache.resetEverything();

            const query = new Parse.Query('TestClass');
            const TestClass = Parse.Object.extend('TestClass');
            
            // First query - should be a miss
            const firstResult = await query.findCache({ useMasterKey: true });
            let stats = cache.getStats();
            console.log('Stats after first query:', stats);
            expect(stats.misses).toBe(1, 'First query should be a miss');

            // Second query - should be a hit
            const secondResult = await query.findCache({ useMasterKey: true });
            stats = cache.getStats();
            expect(stats.hits).toBe(1, 'Second query should be a hit');
            expect(stats.misses).toBe(1, 'Misses should not increase');

            // Third query - should be another hit
            const thirdResult = await query.findCache({ useMasterKey: true });
            stats = cache.getStats();
            expect(stats.hits).toBe(2, 'Third query should be another hit');
            expect(stats.misses).toBe(1, 'Misses should still not increase');
        });
    });

    describe('Cache Initialization', () => {
        beforeEach(() => {
            cache.resetEverything();
        });

        it('should properly add cache methods to Parse.Query.prototype', () => {
            const verified = verifyCacheMethods();
            if (!verified) {
                const currentMethods = Object.keys(Parse.Query.prototype)
                    .filter(key => key.includes('Cache'));
                console.log('Current Parse.Query.prototype methods:', currentMethods);
                console.log('Parse.Query.prototype:', Object.keys(Parse.Query.prototype));
            }
            expect(verified).toBe(true);

            // Additional verification
            CACHE_METHODS.forEach(method => {
                const hasMethod = typeof Parse.Query.prototype[method] === 'function';
                if (!hasMethod) {
                    console.log(`Missing method: ${method}`);
                }
                expect(hasMethod).toBe(true);
            });
        });
    });
}); 