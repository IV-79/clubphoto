const fs = require('fs');
const dir = './src/environments';

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const isProd = process.env.PRODUCTION !== 'false';

const content = `export const environment = {
  production: ${isProd},
  firebase: {
    apiKey: "${process.env.FIREBASE_API_KEY}",
    authDomain: "${process.env.FIREBASE_AUTH_DOMAIN}",
    projectId: "${process.env.FIREBASE_PROJECT_ID}",
    storageBucket: "${process.env.FIREBASE_STORAGE_BUCKET}",
    messagingSenderId: "${process.env.FIREBASE_MESSAGING_SENDER_ID}",
    appId: "${process.env.FIREBASE_APP_ID}",
    measurementId: "${process.env.FIREBASE_MEASUREMENT_ID}"
  }
};`;

fs.writeFileSync(`${dir}/environment.ts`, content);
fs.writeFileSync(`${dir}/environment.prod.ts`, content);
console.log('Fichiers d\'environnement Angular générés avec succès !');
