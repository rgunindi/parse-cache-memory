const net = require('net');
const { MongoMemoryServer } = require('mongodb-memory-server');

function getAvailablePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, () => {
            const port = server.address().port;
            server.close(() => {
                resolve(port);
            });
        });
    });
}

async function createMongoServer() {
    try {
        // Try to create MongoDB Memory Server without system binary
        return await MongoMemoryServer.create({
            binary: {
                version: '6.0.2',
                downloadDir: './.mongodb-binaries',
                skipMD5: true
            },
            instance: {
                storageEngine: 'wiredTiger',
                args: []  // Remove quiet flag
            },
            autoStart: true  // Ensure server starts
        });
    } catch (error) {
        console.warn('MongoDB Memory Server creation warning:', error.message);
        // Try with minimal config
        try {
            return await MongoMemoryServer.create({
                instance: { storageEngine: 'ephemeralForTest' }
            });
        } catch (fallbackError) {
            console.error('All MongoDB attempts failed:', fallbackError);
            throw new Error('Could not start MongoDB server');
        }
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
        serverURL: `http://localhost:${port}/parse`,
        javascriptKey: 'test-js-key',
        allowClientClassCreation: true,
        directAccess: true,
        enforcePrivateUsers: false,
        silent: true, // Suppress Parse Server logs
        enableAnonymousUsers: false,
        maxUploadSize: '5mb'
    });

    // Mount Parse Server
    app.use('/parse', parseServer);
    
    // Start server with timeout
    const httpServer = await Promise.race([
        new Promise((resolve, reject) => {
            const server = app.listen(port, () => resolve(server));
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
        const timeout = setTimeout(() => {
            console.log('Server shutdown timed out, forcing close');
            resolve();
        }, 5000);

        // Handle shutdown sequence
        const handleShutdown = async () => {
            try {
                if (parseServer && typeof parseServer.handleShutdown === 'function') {
                    await parseServer.handleShutdown();
                }

                if (httpServer) {
                    // Force close all connections
                    httpServer.unref();
                    httpServer.close(() => {
                        clearTimeout(timeout);
                        resolve();
                    });

                    // Force close after timeout
                    setTimeout(() => {
                        httpServer.emit('close');
                        resolve();
                    }, 1000);
                } else {
                    clearTimeout(timeout);
                    resolve();
                }
            } catch (error) {
                console.warn('Server shutdown warning:', error.message);
                clearTimeout(timeout);
                resolve();
            }
        };

        // Start shutdown sequence
        handleShutdown().catch(error => {
            console.error('Shutdown sequence failed:', error);
            clearTimeout(timeout);
            resolve();
        });
    });
}

module.exports = { 
    getAvailablePort,
    createMongoServer,
    startParseServer,
    stopParseServer
}; 