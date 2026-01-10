require('dotenv').config();
const https = require('https');

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

if (!API_KEY) {
    console.error("❌ No EXPO_PUBLIC_GEMINI_API_KEY found in .env");
    process.exit(1);
}

console.log(`🔑 Testing API Key: ${API_KEY.substring(0, 5)}... (Length: ${API_KEY.length})`);

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

https.get(url, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
                console.error("❌ API Error:", JSON.stringify(parsed.error, null, 2));
            } else {
                console.log("✅ API Success! Available Models:");

                const models = parsed.models || [];
                const fs = require('fs');

                // Write to file for reliable reading
                fs.writeFileSync('scripts/gemini_models.json', JSON.stringify(models, null, 2));
                console.log("✅ Models saved to scripts/gemini_models.json");

                const flashModels = models.filter(m => m.name.includes('flash'));

                if (flashModels.length > 0) {
                    console.log("\nFound Flash Models:");
                    flashModels.forEach(m => console.log(`- ${m.name}`));
                } else {
                    console.log("\nAll Models:");
                    models.forEach(m => console.log(`- ${m.name}`));
                }
            }
        } catch (e) {
            console.error("❌ JSON Parse Error:", e.message);
            console.log("Raw Response:", data);
        }
    });

}).on("error", (err) => {
    console.error("❌ Network Error:", err.message);
});
