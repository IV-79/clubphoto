/**
 * Dump Firestore collections to local JSON files for debugging.
 * Usage: node scripts/dump-firestore.js [collections...]
 * Example: node scripts/dump-firestore.js users
 *          node scripts/dump-firestore.js users photos themes
 *
 * Output: scripts/data/dump-<collection>-<date>.json
 * Credentials: prompted at runtime (never stored).
 */

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, signOut } = require('firebase/auth');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const firebaseConfig = {
  apiKey: 'AIzaSyDy6urVKbJVWoe-DSXvd_xN8s9iTMtipig',
  authDomain: 'clubphotopj.firebaseapp.com',
  projectId: 'clubphotopj',
  storageBucket: 'clubphotopj.firebasestorage.app',
  messagingSenderId: '709257643260',
  appId: '1:709257643260:web:97c29a7e8a52b1850c8379',
};

const COLLECTIONS_TO_DUMP = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['users'];

async function prompt(question, hidden = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (hidden) {
    // Mask password input
    rl.stdoutMuted = true;
    rl._writeToOutput = (s) => { if (!rl.stdoutMuted) rl.output.write(s); };
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      if (hidden) process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

async function dumpCollection(db, name, outDir) {
  console.log(`  Fetching ${name}...`);
  const snap = await getDocs(collection(db, name));
  const docs = snap.docs.map((d) => ({ _id: d.id, ...d.data() }));
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(outDir, `dump-${name}-${date}.json`);
  fs.writeFileSync(file, JSON.stringify(docs, null, 2), 'utf8');
  console.log(`  → ${file} (${docs.length} docs)`);
  return file;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const outDir = path.join(__dirname, 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  console.log('=== Firestore Dump ===');
  console.log('Collections:', COLLECTIONS_TO_DUMP.join(', '));
  console.log('');

  const email = await prompt('Email admin: ');
  const password = await prompt('Mot de passe: ', true);

  console.log('\nConnexion...');
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password);
    console.log('Connecté.\n');
  } catch (e) {
    console.error('Erreur connexion:', e.message);
    process.exit(1);
  }

  const files = [];
  for (const col of COLLECTIONS_TO_DUMP) {
    try {
      files.push(await dumpCollection(db, col, outDir));
    } catch (e) {
      console.error(`  Erreur sur ${col}:`, e.message);
    }
  }

  await signOut(auth);
  console.log('\nDéconnecté.');
  console.log('\nFichiers générés :');
  files.forEach((f) => console.log(' ', f));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
