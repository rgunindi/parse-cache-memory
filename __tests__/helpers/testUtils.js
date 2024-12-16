const net = require('net');
const { MongoMemoryServer } = require('mongodb-memory-server');

function getAvailablePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => {
                resolve(port);
            });
        });
    });
}

async function createMongoServer() {
    try {
        // Use real MongoDB in CI
        if (process.env.CI) {
            return {
                getUri: () => process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test'
            };
        }

        // Use MongoDB Memory Server for local development
        return await MongoMemoryServer.create({
            binary: {
                version: '6.0.2',
                downloadDir: './.mongodb-binaries',
                skipMD5: true
            },
            instance: {
                storageEngine: 'wiredTiger',
                ip: '127.0.0.1'
            }
        });
    } catch (error) {
        console.warn('MongoDB setup warning:', error.message);
        // Fallback to local MongoDB with IPv4
        return {
            getUri: () => 'mongodb://127.0.0.1:27017/test'
        };
    }
}

async function startParseServer(mongoUri, port, appId, masterKey) {
    const express = require('express');
    const { ParseServer } = require('parse-server');
    
    const app = express();
    
    const parseServer = new ParseServer({
        databaseURI: mongoUri,
        appId: appId,
        masterKey: masterKey,
        serverURL: `http://127.0.0.1:${port}/parse`,
        javascriptKey: 'test-js-key',
        allowClientClassCreation: true,
        directAccess: true,
        enforcePrivateUsers: false,
        silent: true,
        enableAnonymousUsers: false,
        maxUploadSize: '5mb'
    });

    app.use('/parse', parseServer);
    
    // Start server with timeout and explicit IPv4
    const httpServer = await Promise.race([
        new Promise((resolve, reject) => {
            const server = app.listen(port, '127.0.0.1', () => resolve(server));
            server.on('error', reject);
        }),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Server start timeout')), 5000)
        )
    ]);

    return { parseServer, httpServer, app };
}

async function stopParseServer(httpServer, parseServer) {
    return new Promise((resolve) => {
        if (httpServer) {
            httpServer.close(() => {
                if (parseServer && typeof parseServer.handleShutdown === 'function') {
                    parseServer.handleShutdown().then(resolve);
                } else {
                    resolve();
                }
            });
        } else {
            resolve();
        }
    });
}

module.exports = { 
    getAvailablePort,
    createMongoServer,
    startParseServer,
    stopParseServer
}; 