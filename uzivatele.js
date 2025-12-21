// Uživatelé - Admin stránka
let allUsers = [];
let allAds = [];

// Inicializace
document.addEventListener('DOMContentLoaded', () => {
    const checkFirebase = setInterval(() => {
        if (window.firebaseAuth && window.firebaseDb) {
            initUsersPage();
            clearInterval(checkFirebase);
        }
    }, 100);
});

async function initUsersPage() {
    console.log('Inicializuji stránku uživatelů...');
    
    const auth = window.firebaseAuth;
    if (!auth) {
        console.error('Firebase Auth není dostupné');
        window.location.href = 'dashboard.html';
        return;
    }
    
    // Počkat na přihlášení uživatele pomocí onAuthStateChanged
    const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    
    onAuthStateChanged(auth, async (user) => {
        console.log('Auth state changed na uzivatele.html:', user ? user.email : 'Odhlášen');
        
        if (!user) {
            console.log('Uživatel není přihlášen, přesměrovávám na dashboard');
            window.location.href = 'dashboard.html';
            return;
        }
        
        // Zkontrolovat admin status
        const isAdmin = await checkAdminStatus(user.uid);
        console.log('Admin status pro', user.email, ':', isAdmin);
        
        if (!isAdmin) {
            console.log('Uživatel není admin, přesměrovávám na dashboard');
            window.location.href = 'dashboard.html';
            return;
        }
        
        // Načíst data
        try {
            await loadAllUsers();
            await loadAllAds();
            displayUsers(allUsers);
            
            // Zobrazit admin menu
            if (typeof window.checkAndShowAdminMenu === 'function') {
                setTimeout(() => window.checkAndShowAdminMenu(), 500);
            }
        } catch (error) {
            console.error('Chyba při načítání dat:', error);
            showMessage('Nepodařilo se načíst data.', 'error');
        }
    });
}

// Kontrola admin statusu
async function checkAdminStatus(uid) {
    if (!uid) return false;
    try {
        const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const profileRef = doc(window.firebaseDb, 'users', uid, 'profile', 'profile');
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            if (profileData.isAdmin === true || profileData.role === 'admin') {
                return true;
            }
        }
        const adminEmails = ['admin@bulldogo.cz', 'support@bulldogo.cz'];
        if (window.firebaseAuth?.currentUser?.email && adminEmails.includes(window.firebaseAuth.currentUser.email.toLowerCase())) {
            return true;
        }
        return false;
    } catch (error) {
        console.error('Chyba při kontrole admin statusu:', error);
        return false;
    }
}

// Načtení všech uživatelů
async function loadAllUsers() {
    try {
        const { getDocs, getDoc, collection, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const usersSnapshot = await getDocs(collection(window.firebaseDb, 'users'));
        allUsers = [];
        
        for (const userDoc of usersSnapshot.docs) {
            const userData = { 
                id: userDoc.id, 
                uid: userDoc.id,
                ...userDoc.data() 
            };
            const profileRef = doc(window.firebaseDb, 'users', userDoc.id, 'profile', 'profile');
            const profileSnap = await getDoc(profileRef);
            if (profileSnap.exists()) {
                const profileData = profileSnap.data();
                userData.name = profileData.name || userData.name || userDoc.data().email || 'Bez jména';
                userData.email = profileData.email || userData.email || userDoc.data().email || 'Bez emailu';
                userData.balance = profileData.balance || 0;
                userData.profileCreatedAt = profileData.createdAt || userDoc.data().createdAt || null;
            } else {
                userData.name = userData.name || userData.email || 'Bez jména';
                userData.email = userData.email || 'Bez emailu';
                userData.balance = 0;
            }
            allUsers.push(userData);
        }
        
        console.log('Načteno uživatelů:', allUsers.length);
    } catch (error) {
        console.error('Chyba při načítání uživatelů:', error);
        showMessage('Nepodařilo se načíst uživatele.', 'error');
    }
}

// Načtení všech inzerátů
async function loadAllAds() {
    try {
        const { getDocs, collection, collectionGroup } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        console.log('Načítám inzeráty přes collectionGroup("inzeraty")...');
        
        allAds = [];
        
        // Zkusit collectionGroup pro users/{uid}/inzeraty
        try {
            const cgSnapshot = await getDocs(collectionGroup(window.firebaseDb, 'inzeraty'));
            console.log('CollectionGroup výsledek:', cgSnapshot.size, 'dokumentů');
            
            cgSnapshot.forEach((docSnap) => {
                const data = docSnap.data() || {};
                const userIdFromPath = docSnap.ref.parent && docSnap.ref.parent.parent ? docSnap.ref.parent.parent.id : undefined;
                if (!data.userId && userIdFromPath) data.userId = userIdFromPath;
                allAds.push({ 
                    id: docSnap.id, 
                    userId: data.userId || userIdFromPath,
                    ...data 
                });
            });
            
            console.log('Načteno inzerátů z users/{uid}/inzeraty:', allAds.length);
        } catch (cgError) {
            console.warn('Chyba při načítání přes collectionGroup:', cgError);
        }
        
        // Fallback: zkusit starou kolekci 'services'
        if (allAds.length === 0) {
            console.warn('Nenalezeny žádné inzeráty v users/{uid}/inzeraty, zkouším fallback na kolekci "services"');
            try {
                const servicesSnapshot = await getDocs(collection(window.firebaseDb, 'services'));
                console.log('Services kolekce výsledek:', servicesSnapshot.size, 'dokumentů');
                
                servicesSnapshot.forEach((docSnap) => {
                    const data = docSnap.data() || {};
                    allAds.push({ 
                        id: docSnap.id, 
                        ...data 
                    });
                });
                
                console.log('Načteno inzerátů z fallback kolekce services:', allAds.length);
            } catch (servicesError) {
                console.error('Chyba při načítání z kolekce services:', servicesError);
            }
        }
        
        // Pokud stále nic, zkusit projít všechny uživatele a načíst jejich inzeráty
        if (allAds.length === 0) {
            console.warn('Stále žádné inzeráty, zkouším projít všechny uživatele...');
            try {
                const usersSnapshot = await getDocs(collection(window.firebaseDb, 'users'));
                let totalAds = 0;
                
                for (const userDoc of usersSnapshot.docs) {
                    const userId = userDoc.id;
                    const userAdsRef = collection(window.firebaseDb, 'users', userId, 'inzeraty');
                    const userAdsSnapshot = await getDocs(userAdsRef);
                    
                    userAdsSnapshot.forEach((adDoc) => {
                        const data = adDoc.data() || {};
                        allAds.push({
                            id: adDoc.id,
                            userId: userId,
                            ...data
                        });
                        totalAds++;
                    });
                }
                
                console.log('Načteno inzerátů procházením uživatelů:', totalAds);
            } catch (usersError) {
                console.error('Chyba při procházení uživatelů:', usersError);
            }
        }
        
        console.log('Celkem načteno inzerátů:', allAds.length);
        
        if (allAds.length === 0) {
            console.warn('⚠️ Nebyly nalezeny žádné inzeráty v databázi');
        }
        
    } catch (error) {
        console.error('Chyba při načítání inzerátů:', error);
        showMessage('Nepodařilo se načíst inzeráty.', 'error');
    }
}

// Zobrazení uživatelů
function displayUsers(users) {
    const grid = document.getElementById('usersGrid');
    
    if (users.length === 0) {
        grid.innerHTML = `
            <div class="no-users">
                <i class="fas fa-users"></i>
                <h3>Žádní uživatelé</h3>
                <p>V systému nejsou žádní registrovaní uživatelé.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = users.map(user => createUserCard(user)).join('');
}

// Vytvoření karty uživatele
function createUserCard(user) {
    const userId = user.uid || user.id;
    const userAds = allAds.filter(ad => (ad.userId === userId) || (ad.userId === user.id));
    const activeAds = userAds.filter(ad => ad.status === 'active' || !ad.status).length;
    const joinDate = user.createdAt?.toDate?.() || user.createdAt || user.profileCreatedAt?.toDate?.() || user.profileCreatedAt;
    const formattedDate = joinDate ? new Date(joinDate).toLocaleDateString('cs-CZ') : 'Neznámé';
    
    return `
        <div class="user-card">
            <div class="user-card-header">
                <div class="user-avatar">
                    <i class="fas fa-user-circle"></i>
                </div>
                <div class="user-info">
                    <h3>${user.name || 'Bez jména'}</h3>
                    <p>${user.email || 'Bez emailu'}</p>
                </div>
            </div>
            <div class="user-card-stats">
                <div class="stat-item">
                    <i class="fas fa-list"></i>
                    <span>${userAds.length} inzerátů</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-check-circle"></i>
                    <span>${activeAds} aktivních</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-calendar"></i>
                    <span>${formattedDate}</span>
                </div>
            </div>
            <div class="user-card-actions">
                <button class="btn btn-danger" onclick="deleteUser('${userId}')">
                    <i class="fas fa-trash"></i> Smazat
                </button>
            </div>
        </div>
    `;
}

// Filtrování uživatelů
function filterUsers() {
    const searchTerm = document.getElementById('userSearch').value.toLowerCase();
    const filterValue = document.getElementById('userFilter').value;
    
    let filteredUsers = allUsers.filter(user => {
        const userId = user.uid || user.id;
        const matchesSearch = (user.name?.toLowerCase() || '').includes(searchTerm) || 
                             (user.email?.toLowerCase() || '').includes(searchTerm);
        
        let matchesFilter = true;
        if (filterValue === 'withAds') {
            const userAds = allAds.filter(ad => (ad.userId === userId) || (ad.userId === user.id));
            matchesFilter = userAds.length > 0;
        } else if (filterValue === 'withoutAds') {
            const userAds = allAds.filter(ad => (ad.userId === userId) || (ad.userId === user.id));
            matchesFilter = userAds.length === 0;
        }
        
        return matchesSearch && matchesFilter;
    });
    
    displayUsers(filteredUsers);
}

// Mazání uživatele
async function deleteUser(userId) {
    if (!confirm('Opravdu chcete smazat tohoto uživatele? Tato akce je nevratná a smaže všechny jeho data včetně inzerátů.')) {
        return;
    }
    
    try {
        const { deleteDoc, doc, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        // Smazat všechny inzeráty uživatele
        const adsRef = collection(window.firebaseDb, 'users', userId, 'inzeraty');
        const adsSnapshot = await getDocs(adsRef);
        for (const adDoc of adsSnapshot.docs) {
            await deleteDoc(adDoc.ref);
        }
        
        // Smazat profil
        const profileRef = doc(window.firebaseDb, 'users', userId, 'profile', 'profile');
        await deleteDoc(profileRef);
        
        // Smazat root dokument
        const userRef = doc(window.firebaseDb, 'users', userId);
        await deleteDoc(userRef);
        
        // Odstranit z lokálních dat
        allUsers = allUsers.filter(u => (u.uid || u.id) !== userId);
        allAds = allAds.filter(ad => ad.userId !== userId);
        
        displayUsers(allUsers);
        showMessage('Uživatel úspěšně smazán!', 'success');
    } catch (error) {
        console.error('Chyba při mazání uživatele:', error);
        showMessage('Nepodařilo se smazat uživatele.', 'error');
    }
}

// Helper funkce pro zobrazení zprávy
function showMessage(message, type = 'info') {
    if (typeof window.showMessage === 'function') {
        window.showMessage(message, type);
    } else {
        alert(message);
    }
}

