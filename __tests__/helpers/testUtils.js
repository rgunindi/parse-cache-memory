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
        return await MongoMemoryServer.create({
            binary: {
                version: '4.0.3'
            }
        });
    } catch (error) {
        console.error('MongoDB Memory Server creation failed:', error);
        // Fallback to local MongoDB
        return {
            getUri: () => 'mongodb://localhost:27017/test'
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