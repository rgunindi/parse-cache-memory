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

module.exports = { 
    getAvailablePort,
    createMongoServer
}; 