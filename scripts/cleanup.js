const fs = require('fs').promises;
const path = require('path');

async function cleanup() {
    try {
        // Clean up temp files
        const tempDirs = [
            '.jest',
            'coverage',
            'node_modules/.cache'
        ];

        for (const dir of tempDirs) {
            try {
                await fs.rm(path.join(process.cwd(), dir), { recursive: true, force: true });
                console.log(`Cleaned up ${dir}`);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.warn(`Warning cleaning ${dir}:`, error.message);
                }
            }
        }

        // Clean up MongoDB data
        const mongoDbPath = path.join(process.cwd(), '.mongodb-data');
        try {
            await fs.rm(mongoDbPath, { recursive: true, force: true });
            console.log('Cleaned up MongoDB data');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('Warning cleaning MongoDB data:', error.message);
            }
        }

        // Clean up any lingering Parse Server files
        const parseServerFiles = [
            'parse-server.log',
            'parse-server.pid'
        ];

        for (const file of parseServerFiles) {
            try {
                await fs.unlink(path.join(process.cwd(), file));
                console.log(`Cleaned up ${file}`);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.warn(`Warning cleaning ${file}:`, error.message);
                }
            }
        }

        console.log('Cleanup completed successfully');
    } catch (error) {
        console.error('Cleanup failed:', error);
        process.exit(1);
    }
}

// Run cleanup
cleanup().catch(error => {
    console.error('Fatal cleanup error:', error);
    process.exit(1);
}); 