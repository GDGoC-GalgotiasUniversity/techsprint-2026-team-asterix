const https = require('http');

function checkUrl(url) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            console.log(`${url}: ${res.statusCode}`);
            resolve();
        }).on('error', (e) => {
            console.log(`${url}: Error - ${e.message}`);
            resolve();
        });
    });
}

async function run() {
    await checkUrl('http://10.10.181.126:8082/api/sos/trigger');
    await checkUrl('http://10.10.181.126:8082/api/contacts');
}

run();
