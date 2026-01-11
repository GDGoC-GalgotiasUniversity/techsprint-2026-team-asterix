const https = require('https');

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
    await checkUrl('https://safety-login.onrender.com/auth/me');
    await checkUrl('https://safety-login.onrender.com/sos');
    await checkUrl('https://safety-login.onrender.com/contacts');
}

run();
