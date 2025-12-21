// Inzeráty - Admin stránka
let allAds = [];

// Inicializace
document.addEventListener('DOMContentLoaded', () => {
    const checkFirebase = setInterval(() => {
        if (window.firebaseAuth && window.firebaseDb) {
            initAdsPage();
            clearInterval(checkFirebase);
        }
    }, 100);
});

async function initAdsPage() {
    console.log('Inicializuji stránku inzerátů...');
    
    // Zkontrolovat admin status
    const auth = window.firebaseAuth;
    if (!auth || !auth.currentUser) {
        window.location.href = 'dashboard.html';
        return;
    }
    
    const isAdmin = await checkAdminStatus(auth.currentUser.uid);
    if (!isAdmin) {
        window.location.href = 'dashboard.html';
        return;
    }
    
    // Načíst data
    await loadAllAds();
    displayAllAds();
    
    // Zobrazit admin menu
    if (typeof window.checkAndShowAdminMenu === 'function') {
        setTimeout(() => window.checkAndShowAdminMenu(), 500);
    }
    
    // Event listener pro formulář
    const adEditForm = document.getElementById('adEditForm');
    if (adEditForm) {
        adEditForm.addEventListener('submit', saveAdChanges);
    }
    
    // Close modal on outside click
    window.onclick = function(event) {
        const modal = document.getElementById('adEditModal');
        if (event.target === modal) {
            closeAdEditModal();
        }
    }
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

// Načtení všech inzerátů
async function loadAllAds() {
    try {
        const { getDocs, collection, collectionGroup } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        console.log('Načítám inzeráty...');
        
        const cgSnapshot = await getDocs(collectionGroup(window.firebaseDb, 'inzeraty'));
        allAds = [];
        
        cgSnapshot.forEach((docSnap) => {
            const data = docSnap.data() || {};
            const userIdFromPath = docSnap.ref.parent && docSnap.ref.parent.parent ? docSnap.ref.parent.parent.id : undefined;
            if (!data.userId && userIdFromPath) data.userId = userIdFromPath;
            allAds.push({ 
                id: docSnap.id, 
                ref: docSnap.ref,  // Uložit referenci pro pozdější použití
                userId: data.userId || userIdFromPath,
                ...data 
            });
        });
        
        console.log('Načteno inzerátů z users/{uid}/inzeraty:', allAds.length);
        
        // Fallback na starou kolekci
        if (allAds.length === 0) {
            console.warn('Zkouším fallback na kolekci "services"');
            const servicesSnapshot = await getDocs(collection(window.firebaseDb, 'services'));
            servicesSnapshot.forEach((docSnap) => {
                const data = docSnap.data() || {};
                allAds.push({ 
                    id: docSnap.id, 
                    ref: docSnap.ref,
                    ...data 
                });
            });
            console.log('Načteno inzerátů z fallback kolekce services:', allAds.length);
        }
        
    } catch (error) {
        console.error('Chyba při načítání inzerátů:', error);
        showMessage('Nepodařilo se načíst inzeráty.', 'error');
    }
}

// Zobrazení všech inzerátů
function displayAllAds() {
    const grid = document.getElementById('adsGrid');
    
    if (allAds.length === 0) {
        grid.innerHTML = `
            <div class="no-ads">
                <i class="fas fa-list"></i>
                <h3>Žádné inzeráty</h3>
                <p>V systému nejsou žádné inzeráty.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = allAds.map(ad => createAdCard(ad)).join('');
}

// Vytvoření karty inzerátu
function createAdCard(ad) {
    const statusClass = ad.status === 'active' ? 'active' : 'inactive';
    const statusText = ad.status === 'active' ? 'Aktivní' : ad.status === 'inactive' ? 'Neaktivní' : 'Čekající';
    const topBadge = ad.isTop ? '<span class="top-badge"><i class="fas fa-fire"></i> TOP</span>' : '';
    const createdAt = ad.createdAt?.toDate ? ad.createdAt.toDate().toLocaleDateString('cs-CZ') : 
                     ad.createdAt ? new Date(ad.createdAt).toLocaleDateString('cs-CZ') : 'Neznámé';
    
    return `
        <div class="ad-card-admin">
            <div class="ad-card-header">
                <h3>${ad.title || 'Bez názvu'}</h3>
                ${topBadge}
            </div>
            <div class="ad-card-body">
                <p class="ad-description">${(ad.description || '').substring(0, 150)}${ad.description?.length > 150 ? '...' : ''}</p>
                <div class="ad-meta">
                    <span><i class="fas fa-map-marker-alt"></i> ${ad.location || 'Neuvedeno'}</span>
                    <span><i class="fas fa-tag"></i> ${ad.category || 'Neuvedeno'}</span>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="ad-stats">
                    <span><i class="fas fa-eye"></i> ${ad.views || 0} zobrazení</span>
                    <span><i class="fas fa-comments"></i> ${ad.contacts || 0} kontaktů</span>
                    <span><i class="fas fa-calendar"></i> ${createdAt}</span>
                </div>
            </div>
            <div class="ad-card-actions">
                <button class="btn btn-primary" onclick="editAd('${ad.id}', '${ad.userId || ''}')">
                    <i class="fas fa-edit"></i> Upravit
                </button>
                <button class="btn btn-danger" onclick="deleteAd('${ad.id}', '${ad.userId || ''}')">
                    <i class="fas fa-trash"></i> Smazat
                </button>
            </div>
        </div>
    `;
}

// Filtrování inzerátů
function filterAds() {
    const searchTerm = document.getElementById('adsSearch').value.toLowerCase();
    const statusFilter = document.getElementById('adsStatusFilter').value;
    
    let filteredAds = allAds.filter(ad => {
        const matchesSearch = (ad.title || '').toLowerCase().includes(searchTerm) ||
                             (ad.description || '').toLowerCase().includes(searchTerm);
        const matchesStatus = !statusFilter || ad.status === statusFilter;
        return matchesSearch && matchesStatus;
    });
    
    const grid = document.getElementById('adsGrid');
    if (filteredAds.length === 0) {
        grid.innerHTML = `
            <div class="no-ads">
                <i class="fas fa-list"></i>
                <h3>Žádné inzeráty</h3>
                <p>Nebyly nalezeny žádné inzeráty odpovídající filtru.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = filteredAds.map(ad => createAdCard(ad)).join('');
}

// Editace inzerátu
async function editAd(adId, userId) {
    const ad = allAds.find(a => a.id === adId);
    if (!ad) return;
    
    document.getElementById('editAdId').value = adId;
    document.getElementById('editAdUserId').value = userId || '';
    document.getElementById('editAdTitle').value = ad.title || '';
    document.getElementById('editAdDescription').value = ad.description || '';
    document.getElementById('editAdStatus').value = ad.status || 'active';
    document.getElementById('editAdCategory').value = ad.category || '';
    document.getElementById('editAdLocation').value = ad.location || '';
    
    document.getElementById('adEditModal').style.display = 'block';
}

// Zavření modalu
function closeAdEditModal() {
    document.getElementById('adEditModal').style.display = 'none';
}

// Uložení změn
async function saveAdChanges(e) {
    e.preventDefault();
    const adId = document.getElementById('editAdId').value;
    const userId = document.getElementById('editAdUserId').value;
    const formData = new FormData(e.target);
    
    try {
        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        // Najít ad dokument
        let adRef = null;
        if (userId) {
            adRef = doc(window.firebaseDb, 'users', userId, 'inzeraty', adId);
        } else {
            // Fallback na starou strukturu
            adRef = doc(window.firebaseDb, 'services', adId);
        }
        
        await updateDoc(adRef, {
            title: formData.get('title'),
            description: formData.get('description'),
            status: formData.get('status'),
            category: formData.get('category'),
            location: formData.get('location'),
            updatedAt: new Date()
        });
        
        // Aktualizovat lokální data
        const adIndex = allAds.findIndex(a => a.id === adId);
        if (adIndex !== -1) {
            allAds[adIndex] = { 
                ...allAds[adIndex], 
                title: formData.get('title'),
                description: formData.get('description'),
                status: formData.get('status'),
                category: formData.get('category'),
                location: formData.get('location')
            };
        }
        
        closeAdEditModal();
        displayAllAds();
        showMessage('Inzerát úspěšně upraven!', 'success');
    } catch (error) {
        console.error('Chyba při ukládání inzerátu:', error);
        showMessage('Nepodařilo se uložit změny inzerátu.', 'error');
    }
}

// Mazání inzerátu
async function deleteAd(adId, userId) {
    if (!confirm('Opravdu chcete smazat tento inzerát? Tato akce je nevratná.')) {
        return;
    }
    
    try {
        const { deleteDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        // Najít ad dokument
        let adRef = null;
        if (userId) {
            adRef = doc(window.firebaseDb, 'users', userId, 'inzeraty', adId);
        } else {
            adRef = doc(window.firebaseDb, 'services', adId);
        }
        
        await deleteDoc(adRef);
        
        // Odstranit z lokálních dat
        allAds = allAds.filter(a => a.id !== adId);
        
        displayAllAds();
        showMessage('Inzerát úspěšně smazán!', 'success');
    } catch (error) {
        console.error('Chyba při mazání inzerátu:', error);
        showMessage('Nepodařilo se smazat inzerát.', 'error');
    }
}

// Helper funkce
function showMessage(message, type = 'info') {
    if (typeof window.showMessage === 'function') {
        window.showMessage(message, type);
    } else {
        alert(message);
    }
}

