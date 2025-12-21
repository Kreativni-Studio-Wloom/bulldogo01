// Skript pro nastavení admin statusu pro uživatele
// Použití: node set-admin.js
// Nebo: cd functions && node ../set-admin.js

// Spustit z functions adresáře: cd functions && node ../set-admin.js
const path = require('path');
const admin = require(path.join(__dirname, 'functions', 'node_modules', 'firebase-admin'));

// Inicializace Firebase Admin SDK
// Použije default credentials z prostředí nebo Firebase CLI
if (!admin.apps.length) {
  try {
    // Zkus inicializovat s service account (pokud existuje)
    try {
      const serviceAccount = require('./functions/serviceAccountKey.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Inicializováno s service account key');
    } catch (e) {
      // Pokud nemáš service account, použij default credentials s explicitním project ID
      admin.initializeApp({
        projectId: 'inzerio-inzerce',
      });
      console.log('✅ Inicializováno s default credentials (project: inzerio-inzerce)');
    }
  } catch (e) {
    console.error('❌ Chyba při inicializaci Firebase Admin:', e.message);
    process.exit(1);
  }
}

const db = admin.firestore();

// UID admin uživatele
const ADMIN_UID = 'c8eMk8gNI9RZzLWucfBWRu8gYx42';

async function setAdminStatus() {
  try {
    console.log('🔧 Nastavuji admin status pro uživatele:', ADMIN_UID);
    
    const profileRef = db.collection('users').doc(ADMIN_UID).collection('profile').doc('profile');
    
    await profileRef.set(
      {
        isAdmin: true,
        role: 'admin',
        adminSetAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    
    console.log('✅ Admin status úspěšně nastaven!');
    console.log('📧 Email: admin@bulldogo.cz');
    console.log('🆔 UID:', ADMIN_UID);
    
    // Ověření
    const profileSnap = await profileRef.get();
    if (profileSnap.exists) {
      const data = profileSnap.data();
      console.log('✅ Ověření - Profil obsahuje:', {
        isAdmin: data?.isAdmin,
        role: data?.role,
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Chyba při nastavování admin statusu:', error);
    process.exit(1);
  }
}

setAdminStatus();

