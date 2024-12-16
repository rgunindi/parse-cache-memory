const { parseCacheInit } = require('../index');
const { ParseServer } = require('parse-server');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Parse = require('parse/node');
const express = require('express');
const { getAvailablePort, createMongoServer, startParseServer, stopParseServer } = require('./helpers/testUtils');

describe('ParseCacheMemory', () => {
    let cache;
    let parseServer;
    let mongod;
    let app;
    let httpServer;

    beforeAll(async () => {
        try {
            mongod = await createMongoServer();
            const mongoUri = mongod.getUri();
            const port = await getAvailablePort();

            const result = await startParseServer(
                mongoUri,
                port,
                'test-app-id',
                'test-master-key'
            );

            parseServer = result.parseServer;
            httpServer = result.httpServer;
            app = result.app;

            // Initialize Parse SDK
            global.Parse = Parse;
            Parse.initialize('test-app-id', 'test-js-key', 'test-master-key');
            Parse.serverURL = `http://localhost:${port}/parse`;

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
            // Set longer timeout for cleanup
            jest.setTimeout(30000);

            // Delete schema with timeout
            await Promise.race([
                new Parse.Schema('TestClass')
                    .delete({ useMasterKey: true })
                    .catch(() => {}),
                new Promise(resolve => setTimeout(resolve, 5000))
            ]);
        } catch (error) {
            console.log('Schema cleanup error:', error.message);
        }

        try {
            // Cleanup Parse Server
            if (parseServer) {
                // Remove event listeners
                parseServer.expressApp?.removeAllListeners();
            }

            // Stop servers with timeout
            await Promise.race([
                Promise.all([
                    new Promise(resolve => {
                        if (httpServer) {
                            httpServer.close(resolve);
                        } else {
                            resolve();
                        }
                    }),
                    mongod?.stop()
                ]),
                new Promise(resolve => setTimeout(resolve, 10000))
            ]);
        } catch (error) {
            console.warn('Cleanup warning:', error.message);
        } finally {
            // Force cleanup
            process.removeAllListeners();
            global.Parse = undefined;
        }
    }, 30000);

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