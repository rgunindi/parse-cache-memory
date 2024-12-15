const { parseCacheInit } = require('../../index');
const { ParseServer } = require('parse-server');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Parse = require('parse/node');
const express = require('express');
const { getAvailablePort } = require('../helpers/testUtils');

// Add expected methods list at the top of the file
const expectedMethods = [
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

describe('Parse Cache Memory Unit Tests', () => {
    let cache;
    let parseServer;
    let mongod;
    let app;
    let httpServer;

    beforeAll(async () => {
        try {
            // Setup MongoDB Memory Server
            mongod = await MongoMemoryServer.create();
            const mongoUri = mongod.getUri();

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
            global.Parse = Parse;  // Make Parse global
            Parse.initialize(appId, 'test-js-key', masterKey);
            Parse.serverURL = `http://localhost:${port}/parse`;

            // Initialize cache and ensure it's added to global Parse
            cache = parseCacheInit({
                max: 500,
                ttl: 60 * 1000,
                resetCacheOnSaveAndDestroy: true
            });

            // Wait a bit for cache methods to be initialized
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify cache methods are available
            const cacheMethods = Object.keys(Parse.Query.prototype).filter(key => key.includes('Cache'));
            console.log('Available cache methods:', cacheMethods);
            
            if (!cacheMethods.includes('findCache')) {
                console.error('Cache methods missing from Parse.Query.prototype:', 
                    expectedMethods.filter(m => !cacheMethods.includes(m)));
                throw new Error('Cache methods not properly initialized');
            }

            // Create TestClass schema
            const schema = new Parse.Schema('TestClass');
            try {
                await schema.save();
            } catch (error) {
                console.log('Schema might already exist:', error.message);
            }
        } catch (error) {
            console.error('Setup failed:', error);
            throw error;
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
                parseServer?.handleShutdown?.(),
                mongod?.stop()
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
            // Reset cache for each invalidation test
            cache = parseCacheInit({
                max: 500,
                ttl: 60 * 1000,
                resetCacheOnSaveAndDestroy: true
            });
        });

        it('should clear cache on save', async () => {
            const TestClass = Parse.Object.extend('TestClass');
            const testObj = new TestClass();
            
            const query = new Parse.Query('TestClass');
            
            // Cache some data
            await query.findCache({ useMasterKey: true });
            
            // Save should clear cache
            await testObj.save({ field: 'value' }, { useMasterKey: true });
            
            // Next query should miss cache
            await query.findCache({ useMasterKey: true });
            
            const stats = cache.getStats();
            expect(stats.misses).toBe(2); // Initial + after clear
        });

        it('should clear cache on destroy', async () => {
            const TestClass = Parse.Object.extend('TestClass');
            const testObj = new TestClass();
            testObj.set('field', 'value');
            await testObj.save();

            const query = new Parse.Query('TestClass');
            
            // Cache some data
            await query.findCache();
            
            // Destroy should clear cache
            await testObj.destroy();
            
            // Next query should miss cache
            await query.findCache();
            
            const stats = cache.getStats();
            expect(stats.misses).toBe(2); // Initial + after clear
        });
    });

    describe('Cache Statistics', () => {
        it('should track cache statistics correctly', async () => {
            const query = new Parse.Query('TestClass');
            
            // Reset stats for this test
            cache = parseCacheInit({
                max: 500,
                ttl: 60 * 1000,
                resetCacheOnSaveAndDestroy: true
            });
            
            // Should be a miss
            await query.findCache({ useMasterKey: true });
            
            // Should be a hit
            await query.findCache({ useMasterKey: true });
            
            // Should be a hit
            await query.findCache({ useMasterKey: true });

            const stats = cache.getStats();
            expect(stats.hits).toBe(2);
            expect(stats.misses).toBe(1);
            expect(stats.hitRate).toBeCloseTo(2/3, 2);
        });
    });

    describe('Cache Initialization', () => {
        it('should properly add cache methods to Parse.Query.prototype', () => {
            const expectedMethods = [
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

            expectedMethods.forEach(method => {
                expect(typeof Parse.Query.prototype[method]).toBe('function');
            });
        });
    });
}); 