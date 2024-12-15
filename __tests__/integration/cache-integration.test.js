const { parseCacheInit } = require('../../index');
const { ParseServer } = require('parse-server');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Parse = require('parse/node');
const express = require('express');

describe('Parse Cache Memory Integration', () => {
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
                max: 100,
                ttl: 1000 * 60,
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
        await testObj.save({ 
            field1: 'value1',
            field2: 150,
            field3: 'a',
            category: 'test',
            amount: 100
        }, { useMasterKey: true });
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

    describe('Complex Query Scenarios', () => {
        it('should handle complex queries with multiple conditions', async () => {
            const query = new Parse.Query('TestClass');
            query.equalTo('field1', 'value1');
            query.greaterThan('field2', 100);
            query.containedIn('field3', ['a', 'b', 'c']);

            const firstResult = await query.findCache({ useMasterKey: true });
            const secondResult = await query.findCache({ useMasterKey: true });
            
            expect(firstResult.length).toBe(secondResult.length);
            if (firstResult.length > 0) {
                expect(firstResult[0].id).toBe(secondResult[0].id);
                expect(firstResult[0].get('field1')).toBe(secondResult[0].get('field1'));
            }
        });

        it('should handle aggregate queries', async () => {
            const query = new Parse.Query('TestClass');
            const pipeline = [
                { group: { objectId: '$category', total: { $sum: '$amount' } } }
            ];

            const firstResult = await query.aggregateCache(pipeline, { useMasterKey: true });
            const secondResult = await query.aggregateCache(pipeline, { useMasterKey: true });

            expect(firstResult).toEqual(secondResult);
        });
    });

    describe('Cache Behavior with Parse Objects', () => {
        it('should handle Parse Object updates correctly', async () => {
            const TestClass = Parse.Object.extend('TestClass');
            const obj = new TestClass();
            await obj.save({ field: 'initial' }, { useMasterKey: true });

            const query = new Parse.Query('TestClass');
            
            const initial = await query.getCache(obj.id, { useMasterKey: true });
            await obj.save({ field: 'updated' }, { useMasterKey: true });
            const updated = await query.getCache(obj.id, { useMasterKey: true });
            
            expect(initial.get('field')).toBe('initial');
            expect(updated.get('field')).toBe('updated');
            expect(initial.id).toBe(updated.id);
        });
    });
}); 