// My Ads JavaScript - Správa vlastních inzerátů

let userAds = [];
let currentEditingAdId = null;

// Inicializace po načtení Firebase
document.addEventListener('DOMContentLoaded', () => {
    console.log('My Ads DOMContentLoaded');
    const checkFirebase = setInterval(() => {
        if (window.firebaseAuth && window.firebaseDb) {
            console.log('Firebase nalezen v My Ads, inicializuji');
            initMyAds();
            clearInterval(checkFirebase);
        } else {
            console.log('Čekám na Firebase v My Ads...');
        }
    }, 100);
});

// Inicializace stránky
function initMyAds() {
    console.log('Inicializuji My Ads stránku');
    // Import Firebase funkcí dynamicky
    import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js').then(({ onAuthStateChanged }) => {
        console.log('Firebase Auth importován');
        // Sledování stavu přihlášení
        onAuthStateChanged(window.firebaseAuth, (user) => {
            console.log('Auth state changed:', user);
            if (user) {
                console.log('Uživatel přihlášen, načítám UI a inzeráty');
                updateUI(user);
                loadUserAds();
                // Spustit periodickou kontrolu expirace TOP inzerátů
            } else {
                console.log('Uživatel není přihlášen');
                console.log('Firebase Auth objekt:', window.firebaseAuth);
                console.log('Aktuální URL:', window.location.href);
                
                // Zastavit periodickou kontrolu při odhlášení
                
                // Zobrazit zprávu místo okamžitého přesměrování
                const grid = document.getElementById('myAdsGrid');
                if (grid) {
                    grid.innerHTML = `
                        <div class="no-services">
                            <i class="fas fa-lock"></i>
                            <h3>Pro zobrazení vašich inzerátů se musíte přihlásit</h3>
                            <p>Přihlaste se pro správu vašich inzerátů.</p>
                            <div class="no-services-actions">
                                <button class="btn btn-primary" onclick="showAuthModal('login')">Přihlásit se</button>
                                <button class="btn btn-secondary" onclick="window.location.href='index.html'">Zpět na hlavní stránku</button>
                            </div>
                        </div>
                    `;
                }
                
                // Dříve zde bylo automatické přesměrování. Necháme uživatele rozhodnout tlačítkem.
            }
        });
    });

    // Event listenery pro filtry a vyhledávání
    setupEventListeners();
}

// Aktualizace UI podle stavu přihlášení
function updateUI(user) {
    const authSection = document.getElementById('authSection');
    const userProfileSection = document.getElementById('userProfileSection');
    
    if (user) {
        // Skrýt auth tlačítka a zobrazit user profil
        if (authSection) authSection.style.display = 'none';
        if (userProfileSection) {
            userProfileSection.style.display = 'block';
            
            // Aktualizovat email v user profilu
            const userEmail = userProfileSection.querySelector('.user-email');
            if (userEmail) {
                userEmail.textContent = user.email;
            }
            
            // Načíst a zobrazit profil uživatele
            loadUserProfile(user.uid).then(userProfile => {
                const userRole = userProfileSection.querySelector('.user-role');
                if (userRole) {
                    userRole.textContent = userProfile?.name || 'Uživatel';
                }
            });
        }
    } else {
        // Zobrazit auth tlačítka a skrýt user profil
        if (authSection) authSection.style.display = 'flex';
        if (userProfileSection) userProfileSection.style.display = 'none';
    }
}

// Načtení uživatelského profilu z Firestore (users/{uid}/profile/profile)
async function loadUserProfile(uid) {
    try {
        const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const profileRef = doc(window.firebaseDb, 'users', uid, 'profile', 'profile');
        const snap = await getDoc(profileRef);
        return snap.exists() ? snap.data() : null;
    } catch (error) {
        console.error('Chyba při načítání uživatelského profilu:', error);
        return null;
    }
}

// Načtení vlastních inzerátů uživatele
async function loadUserAds() {
    try {
        const currentUser = window.firebaseAuth.currentUser;
        console.log('Načítám inzeráty pro uživatele:', currentUser?.uid);
        if (!currentUser) {
            console.log('Uživatel není přihlášen');
            return;
        }

        const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        
        const adsCollection = collection(window.firebaseDb, 'users', currentUser.uid, 'inzeraty');
        console.log('Provádím dotaz na Firestore (users/{uid}/inzeraty)...');
        const querySnapshot = await getDocs(adsCollection);
        console.log('Dotaz dokončen, počet dokumentů:', querySnapshot.size);
        
        userAds = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            console.log('Načtený inzerát:', doc.id, data);
            userAds.push({ id: doc.id, ...data });
        });
        
        // Seřadit podle data vytvoření (nejnovější první)
        userAds.sort((a, b) => {
            const dateA = new Date(a.createdAt?.toDate?.() || a.createdAt);
            const dateB = new Date(b.createdAt?.toDate?.() || b.createdAt);
            return dateB - dateA;
        });
        
        console.log('Celkem načteno inzerátů:', userAds.length);
        updateStats();
        displayAds(userAds);
        
    } catch (error) {
        console.error('Chyba při načítání inzerátů:', error);
        showError('Nepodařilo se načíst vaše inzeráty: ' + error.message);
    }
}

// Aktualizace statistik
function updateStats() {
    const totalAds = userAds.length;
    const activeAds = userAds.filter(ad => ad.status === 'active').length;
    
    const totalAdsElement = document.getElementById('totalAds');
    const activeAdsElement = document.getElementById('activeAds');
    
    if (totalAdsElement) {
        totalAdsElement.textContent = totalAds;
    }
    
    if (activeAdsElement) {
        activeAdsElement.textContent = activeAds;
    }
}

// Zobrazení inzerátů
function displayAds(ads) {
    const grid = document.getElementById('myAdsGrid');
    
    if (ads.length === 0) {
        grid.innerHTML = `
            <div class="no-services">
                <i class="fas fa-plus-circle"></i>
                <h3>Zatím nemáte žádné inzeráty</h3>
                <p>Začněte tím, že přidáte svou první službu!</p>
                <div class="no-services-actions">
                    <a href="create-ad.html" class="btn-start-free" aria-label="Přidat inzerát">
                        <i class="fas fa-plus" aria-hidden="true"></i>
                        <span>Přidat inzerát</span>
                    </a>
                </div>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = ads.map(ad => createAdCard(ad)).join('');
}

// Vytvoření karty inzerátu
function createAdCard(ad) {
    const categoryNames = {
        'home_craftsmen': 'Domácnost & Řemeslníci',
        'auto_moto': 'Auto & Moto',
        'garden_exterior': 'Zahrada & Exteriér',
        'education_tutoring': 'Vzdělávání & Doučování',
        'it_technology': 'IT & technologie',
        'health_personal_care': 'Zdraví a Osobní péče',
        'gastronomy_catering': 'Gastronomie & Catering',
        'events_entertainment': 'Události & Zábava',
        'personal_small_jobs': 'Osobní služby & drobné práce',
        'auto_moto_transport': 'Auto - moto doprava',
        'hobby_creative': 'Hobby & kreativní služby',
        'law_finance_admin': 'Právo & finance & administrativa',
        'pets': 'Domácí zvířata',
        'specialized_custom': 'Specializované služby na přání'
    };
    
    const statusColors = {
        'active': '#28a745',
        'inactive': '#dc3545',
        'paused': '#ffc107'
    };
    
    const statusTexts = {
        'active': 'Aktivní',
        'inactive': 'Neaktivní',
        'paused': 'Pozastaveno'
    };
    
    // Kontrola, zda byl inzerát pozastaven kvůli vypršenému předplatnému
    const isPlanExpired = ad.inactiveReason === 'plan_expired';
    
    // Speciální text pro pozastavený kvůli předplatnému
    let statusText = statusTexts[ad.status] || ad.status;
    let statusColor = statusColors[ad.status] || '#dc3545';
    if (isPlanExpired) {
        statusText = 'Pozastaveno - Vypršelo předplatné';
        statusColor = '#ff6b35';
    }
    
    const topStyle = ad.isTop ? 'style="border: 3px solid #ff8a00 !important; box-shadow: 0 8px 28px rgba(255, 138, 0, 0.6), 0 0 0 2px rgba(255, 138, 0, 0.4) !important;"' : '';
    
    // Získání správné URL obrázku
    let imageUrl = 'fotky/team.jpg'; // default fallback
    if (ad.images && ad.images.length > 0) {
        if (ad.images[0].url) {
            imageUrl = ad.images[0].url;
        } else if (typeof ad.images[0] === 'string') {
            imageUrl = ad.images[0];
        }
    } else if (ad.image) {
        if (ad.image.url) {
            imageUrl = ad.image.url;
        } else if (typeof ad.image === 'string') {
            imageUrl = ad.image;
        }
    }
    
    // Tlačítko aktivace - speciální text pro vypršelé předplatné
    const activateButton = isPlanExpired 
        ? `<button class="btn-activate" onclick="toggleAdStatus('${ad.id}', 'active')" title="Pro aktivaci je potřeba obnovit předplatné" style="background:#ff6b35;">
            <i class="fas fa-crown"></i>
           </button>`
        : `<button class="btn-activate" onclick="toggleAdStatus('${ad.id}', 'active')" title="Aktivovat">
            <i class="fas fa-play"></i>
           </button>`;
    
    return `
        <article class="ad-card${ad.isTop ? ' is-top' : ''}" ${topStyle}>
            <div class="ad-thumb">
                <img src="${imageUrl}" alt="Inzerát" loading="lazy" decoding="async">
            </div>
            <div class="ad-body">
                <h3 class="ad-title">${ad.title}</h3>
                <div class="ad-meta"><span>${ad.location}</span> • <span>${categoryNames[ad.category] || ad.category}</span></div>
                <div class="ad-status" style="background-color: ${statusColor}; color: white; padding: 0.2rem 0.5rem; border-radius: 10px; font-size: 0.8rem; margin-top: 0.5rem; display: inline-block;">
                    ${statusText}
                </div>
                ${isPlanExpired ? `
                <div style="margin-top: 0.5rem; font-size: 0.75rem; color: #ff6b35;">
                    <i class="fas fa-info-circle"></i> <a href="packages.html" style="color:#ff6b35; text-decoration:underline;">Obnovit předplatné</a> pro aktivaci
                </div>
                ` : ''}
            </div>
            ${ad.isTop ? `
            <div class="ad-badge-top"><i class="fas fa-fire"></i> TOP</div>
            <div class="ad-flames" aria-hidden="true"></div>
            ` : ''}
            <div class="ad-actions">
                <button class="btn-edit" onclick="editAd('${ad.id}')" title="Upravit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-delete" onclick="deleteAd('${ad.id}')" title="Smazat">
                    <i class="fas fa-trash"></i>
                </button>
                ${ad.status === 'active' ? `
                <button class="btn-pause" onclick="toggleAdStatus('${ad.id}', 'paused')" title="Pozastavit">
                    <i class="fas fa-pause"></i>
                </button>
                ` : activateButton}
            </div>
        </article>
    `;
}

// Nastavení event listenerů
function setupEventListeners() {
    // Vyhledávání
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', filterAds);
    }
    
    // Filtry
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', filterAds);
    }
    
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', sortAds);
    }
    
    // Edit service form
    const editServiceForm = document.getElementById('editServiceForm');
    if (editServiceForm) {
        console.log('Edit service form nalezen, nastavuji event listener');
        editServiceForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Edit service form odeslán');
            await updateAd();
        });
    } else {
        console.log('Edit service form NENALEZEN');
    }
}

// Filtrování inzerátů
function filterAds() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter').value;
    
    let filteredAds = userAds.filter(ad => {
        const matchesSearch = ad.title.toLowerCase().includes(searchTerm) || 
                             ad.description.toLowerCase().includes(searchTerm);
        const matchesCategory = !categoryFilter || ad.category === categoryFilter;
        
        return matchesSearch && matchesCategory;
    });
    
    // TOP inzeráty vždy první
    filteredAds.sort((a, b) => {
        if (a.isTop && !b.isTop) return -1;
        if (!a.isTop && b.isTop) return 1;
        return 0;
    });
    displayAds(filteredAds);
}

// Řazení inzerátů
function sortAds() {
    const sortBy = document.getElementById('sortSelect').value;
    let sortedAds = [...userAds];
    
    switch (sortBy) {
        case 'newest':
            sortedAds.sort((a, b) => new Date(b.createdAt?.toDate?.() || b.createdAt) - new Date(a.createdAt?.toDate?.() || a.createdAt));
            break;
        case 'oldest':
            sortedAds.sort((a, b) => new Date(a.createdAt?.toDate?.() || a.createdAt) - new Date(b.createdAt?.toDate?.() || b.createdAt));
            break;
        case 'title':
            sortedAds.sort((a, b) => a.title.localeCompare(b.title));
            break;
    }
    
    // TOP inzeráty vždy první bez ohledu na vybrané řazení
    sortedAds.sort((a, b) => {
        if (a.isTop && !b.isTop) return -1;
        if (!a.isTop && b.isTop) return 1;
        return 0;
    });
    displayAds(sortedAds);
}

// Funkce pro získání zbývajícího času TOP
function getTopTimeRemaining(ad) {
    if (!ad.isTop || !ad.topExpiresAt) return '';
    
    const expiresAt = ad.topExpiresAt.toDate ? ad.topExpiresAt.toDate() : new Date(ad.topExpiresAt);
    const now = new Date();
    const remainingMs = expiresAt - now;
    
    if (remainingMs <= 0) return '(vypršel)';
    
    const remainingMinutes = Math.ceil(remainingMs / (1000 * 60));
    return `(${remainingMinutes}min)`;
}


// Úprava inzerátu
function editAd(adId) {
    console.log('EditAd volána s ID:', adId);
    const ad = userAds.find(a => a.id === adId);
    if (!ad) {
        console.log('Inzerát nenalezen:', adId);
        return;
    }
    
    console.log('Našel inzerát:', ad);
    currentEditingAdId = adId;
    
    // Vyplnit formulář
    document.getElementById('editServiceTitle').value = ad.title;
    document.getElementById('editServiceCategory').value = ad.category;
    document.getElementById('editServiceDescription').value = ad.description;
    document.getElementById('editServicePrice').value = ad.price || '';
    document.getElementById('editServiceLocation').value = ad.location;
    document.getElementById('editServiceStatus').value = ad.status;
    
    // Aktualizovat counter po naplnění hodnoty
    const editDescription = document.getElementById('editServiceDescription');
    const editCounter = document.getElementById('editServiceDescriptionCounter');
    if (editDescription && editCounter) {
        const remaining = 600 - editDescription.value.length;
        editCounter.textContent = remaining;
        if (editCounter.parentElement) {
            editCounter.parentElement.classList.remove('warning', 'error');
            if (remaining < 50) {
                editCounter.parentElement.classList.add('error');
            } else if (remaining < 100) {
                editCounter.parentElement.classList.add('warning');
            }
        }
    }
    
    // Zobrazit modal
    const modal = document.getElementById('editServiceModal');
    console.log('Modal element:', modal);
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    // Inicializace counteru pro editaci popisu (kdyby ještě nebyl inicializovaný)
    if (typeof initCharCounter === 'function') {
        setTimeout(() => {
            initCharCounter('editServiceDescription', 'editServiceDescriptionCounter', 600);
        }, 100);
    }
}

// Aktualizace inzerátu
async function updateAd() {
    try {
        console.log('UpdateAd volána, currentEditingAdId:', currentEditingAdId);
        if (!currentEditingAdId) {
            console.log('Žádné ID pro úpravu');
            return;
        }
        
        const { updateDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const formData = new FormData(document.getElementById('editServiceForm'));
        const updateData = {
            title: formData.get('title'),
            category: formData.get('category'),
            description: formData.get('description'),
            price: formData.get('price'),
            location: formData.get('location'),
            status: formData.get('status'),
            updatedAt: new Date()
        };
        
        console.log('Aktualizuji data:', updateData);
        await updateDoc(doc(window.firebaseDb, 'users', window.firebaseAuth.currentUser.uid, 'inzeraty', currentEditingAdId), updateData);
        
        showMessage('Inzerát byl úspěšně aktualizován!', 'success');
        closeEditServiceModal();
        loadUserAds(); // Obnovit seznam
        
    } catch (error) {
        console.error('Chyba při aktualizaci inzerátu:', error);
        showMessage('Nepodařilo se aktualizovat inzerát.', 'error');
    }
}

// Přepnutí stavu inzerátu
async function toggleAdStatus(adId, targetStatus) {
    try {
        const { updateDoc, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        // targetStatus je buď 'paused' nebo 'active'
        const newStatus = targetStatus === 'paused' ? 'inactive' : 'active';
        
        // Pokud se aktivuje inzerát, zkontrolovat předplatné
        if (newStatus === 'active') {
            // Zkontrolovat aktivní předplatné
            const profileRef = doc(window.firebaseDb, 'users', window.firebaseAuth.currentUser.uid, 'profile', 'profile');
            const profileSnap = await getDoc(profileRef);
            
            if (profileSnap.exists()) {
                const profile = profileSnap.data();
                const plan = profile.plan;
                
                // Zkontrolovat, zda má aktivní předplatné
                if (!plan || (plan !== 'hobby' && plan !== 'business')) {
                    showMessage('Pro aktivaci inzerátu potřebujete aktivní předplatné (Hobby nebo Firma).', 'error');
                    setTimeout(() => {
                        window.location.href = 'packages.html';
                    }, 2000);
                    return;
                }
                
                // Zkontrolovat, zda předplatné nevypršelo
                const planPeriodEnd = profile.planPeriodEnd;
                if (planPeriodEnd) {
                    const endDate = planPeriodEnd.toDate ? planPeriodEnd.toDate() : new Date(planPeriodEnd);
                    if (endDate < new Date()) {
                        showMessage('Vaše předplatné vypršelo. Pro aktivaci inzerátu si prosím obnovte balíček.', 'error');
                        setTimeout(() => {
                            window.location.href = 'packages.html';
                        }, 2000);
                        return;
                    }
                }
            } else {
                showMessage('Pro aktivaci inzerátu potřebujete aktivní předplatné (Hobby nebo Firma).', 'error');
                setTimeout(() => {
                    window.location.href = 'packages.html';
                }, 2000);
                return;
            }
        }
        
        // Připravit data pro aktualizaci
        const updateData = {
            status: newStatus,
            updatedAt: new Date()
        };
        
        // Při aktivaci vymazat inactiveReason a inactiveAt
        if (newStatus === 'active') {
            const { deleteField } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            updateData.inactiveReason = deleteField();
            updateData.inactiveAt = deleteField();
        }
        
        await updateDoc(doc(window.firebaseDb, 'users', window.firebaseAuth.currentUser.uid, 'inzeraty', adId), updateData);
        
        showMessage(`Inzerát byl ${newStatus === 'active' ? 'aktivován' : 'pozastaven'}!`, 'success');
        loadUserAds(); // Obnovit seznam
        
    } catch (error) {
        console.error('Chyba při změně stavu inzerátu:', error);
        showMessage('Nepodařilo se změnit stav inzerátu.', 'error');
    }
}

// Smazání inzerátu
async function deleteAd(adId) {
    if (!confirm('Opravdu chcete smazat tento inzerát? Tato akce je nevratná.')) {
        return;
    }
    
    try {
        const { deleteDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        await deleteDoc(doc(window.firebaseDb, 'users', window.firebaseAuth.currentUser.uid, 'inzeraty', adId));
        
        showMessage('Inzerát byl úspěšně smazán!', 'success');
        loadUserAds(); // Obnovit seznam
        
    } catch (error) {
        console.error('Chyba při mazání inzerátu:', error);
        showMessage('Nepodařilo se smazat inzerát.', 'error');
    }
}

// Zavření edit modalu
function closeEditServiceModal() {
    document.getElementById('editServiceModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    currentEditingAdId = null;
    
    // Vyčištění formuláře
    document.getElementById('editServiceForm').reset();
}

// Zobrazení zprávy
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

// Zobrazení chyby
function showError(message) {
    const grid = document.getElementById('myAdsGrid');
    grid.innerHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Chyba při načítání</h3>
            <p>${message}</p>
            <button class="btn btn-primary" onclick="loadUserAds()">Zkusit znovu</button>
        </div>
    `;
}

// Přepínání dropdown menu
function toggleUserDropdown() {
    const dropdown = document.querySelector('.user-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// Zavření dropdown menu při kliknutí mimo něj
function closeUserDropdown() {
    const dropdown = document.querySelector('.user-dropdown');
    if (dropdown) {
        dropdown.classList.remove('active');
    }
}

// Event listenery
document.addEventListener('DOMContentLoaded', () => {
    // Zavření modalu při kliknutí mimo něj
    window.addEventListener('click', (e) => {
        const editServiceModal = document.getElementById('editServiceModal');
        const userDropdown = document.querySelector('.user-dropdown');
        
        if (e.target === editServiceModal) {
            closeEditServiceModal();
        }
        
        if (userDropdown && !userDropdown.contains(e.target)) {
            closeUserDropdown();
        }
    });
});

// Export funkcí pro globální použití
window.toggleUserDropdown = toggleUserDropdown;
// Topování inzerátu
function topovatAd(adId) {
    console.log('⭐ Topování inzerátu s ID:', adId);
    
    // Přesměrovat na stránku topování s předvybraným inzerátem
    window.location.href = `top-ads.html?adId=${adId}`;
}

window.closeUserDropdown = closeUserDropdown;
window.closeEditServiceModal = closeEditServiceModal;
window.editAd = editAd;
window.toggleAdStatus = toggleAdStatus;
window.deleteAd = deleteAd;
window.topovatAd = topovatAd;
