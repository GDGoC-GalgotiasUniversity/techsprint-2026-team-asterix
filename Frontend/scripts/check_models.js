const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

if (!API_KEY) {
    console.error("API Key not found in env");
    process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        const response = JSON.parse(data);
        if (response.error) {
            console.error("Error:", response.error.message);
        } else {
            const modelNames = response.models.map(m => m.name).join('\n');
            const outputPath = path.join(__dirname, '..', 'available_models.txt');
            fs.writeFileSync(outputPath, modelNames);
            console.log(`Models written to ${outputPath}`);
            console.log(modelNames);
        }
    });
}).on('error', (e) => {
    console.error("Request error:", e);
});
