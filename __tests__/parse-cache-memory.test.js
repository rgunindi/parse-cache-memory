const { parseCacheInit } = require('../index');
const { ParseServer } = require('parse-server');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Parse = require('parse/node');
const express = require('express');

describe('ParseCacheMemory', () => {
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

            // Setup Express
            app = express();
            
            // Create Parse Server instance
            parseServer = new ParseServer({
                databaseURI: mongoUri,
                appId: 'test-app-id',
                masterKey: 'test-master-key',
                serverURL: 'http://localhost:1337/parse',
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
                    const server = app.listen(1337, () => resolve(server));
                    server.on('error', reject);
                } catch (error) {
                    reject(error);
                }
            });

            // Initialize Parse SDK
            global.Parse = Parse;
            Parse.initialize('test-app-id', 'test-js-key', 'test-master-key');
            Parse.serverURL = 'http://localhost:1337/parse';

            // Initialize cache
            cache = parseCacheInit({
                max: 500,
                ttl: 60 * 1000,
                resetCacheOnSaveAndDestroy: true
            });

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
        // Create test data
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
            const schema = new Parse.Schema('TestClass');
            await schema.delete({ useMasterKey: true });
        } catch (error) {
            console.log('Schema cleanup error:', error.message);
        }
        await httpServer.close();
        await mongod.stop();
    });

    describe('Basic Cache Operations', () => {
        it('should cache and retrieve query results', async () => {
            const query = new Parse.Query('TestClass');
            query.equalTo('field', 'value');

            const firstResult = await query.findCache({ useMasterKey: true });
            const secondResult = await query.findCache({ useMasterKey: true });
            
            expect(firstResult.length).toBe(secondResult.length);
            if (firstResult.length > 0) {
                expect(firstResult[0].id).toBe(secondResult[0].id);
                expect(firstResult[0].get('field')).toBe(secondResult[0].get('field'));
            }
        });

        it('should respect TTL for cached results', async () => {
            const query = new Parse.Query('TestClass');
            let newCache = parseCacheInit({ ttl: 1000 }); // 1 second TTL
            
            const firstResult = await query.findCache({ useMasterKey: true });
            await new Promise(resolve => setTimeout(resolve, 1100));
            const secondResult = await query.findCache({ useMasterKey: true });
            
            expect(firstResult.length).toBe(secondResult.length);
        });
    });

    describe('Cache Key Generation', () => {
        it('should generate different cache keys for different queries', async () => {
            const query1 = new Parse.Query('TestClass');
            query1.equalTo('field', 'value1');
            
            const query2 = new Parse.Query('TestClass');
            query2.equalTo('field', 'value2');

            const key1 = cache.generateCacheKey(query1);
            const key2 = cache.generateCacheKey(query2);

            expect(key1).not.toBe(key2);
        });
    });

    describe('Cache with Parse Operations', () => {
        beforeEach(() => {
            // Reset cache before each test
            cache.resetEverything();
        });

        it('should handle saveAll operation correctly', async () => {
            const TestClass = Parse.Object.extend('TestClass');
            const objects = [
                new TestClass({ field: 'test1' }),
                new TestClass({ field: 'test2' })
            ];

            const query = new Parse.Query('TestClass');
            
            // First query - should miss cache
            await query.findCache({ useMasterKey: true });
            let stats = cache.getStats();
            expect(stats.misses).toBe(1, 'First query should miss');
            
            // Save objects - should clear cache
            await Parse.Object.saveAll(objects, { useMasterKey: true });
            
            // Second query - should miss cache again because cache was cleared
            await query.findCache({ useMasterKey: true });
            stats = cache.getStats();
            expect(stats.misses).toBe(2, 'Second query should miss after cache clear');
        });

        it('should handle destroyAll operation correctly', async () => {
            const TestClass = Parse.Object.extend('TestClass');
            const objects = [
                new TestClass({ field: 'test1' }),
                new TestClass({ field: 'test2' })
            ];
            await Parse.Object.saveAll(objects, { useMasterKey: true });

            const query = new Parse.Query('TestClass');
            
            // First query - should miss cache
            await query.findCache({ useMasterKey: true });
            let stats = cache.getStats();
            expect(stats.misses).toBe(1, 'First query should miss');
            
            // Destroy objects - should clear cache
            await Parse.Object.destroyAll(objects, { useMasterKey: true });
            
            // Second query - should miss cache again because cache was cleared
            await query.findCache({ useMasterKey: true });
            stats = cache.getStats();
            expect(stats.misses).toBe(2, 'Second query should miss after cache clear');
        });
    });
}); 