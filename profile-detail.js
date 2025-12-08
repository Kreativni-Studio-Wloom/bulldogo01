console.log('🚀 Profile detail page loaded');
console.log('🔍 Script loading check - profile-detail.js loaded');

// Global variables
let currentProfileUser = null;
let userProfile = null;
let userServices = [];
let userReviews = [];

// Category names mapping
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

// Získání názvu lokace s diakritikou
function getLocationName(location) {
    const locations = {
        'Praha': 'Hlavní město Praha',
        'Stredocesky': 'Středočeský kraj',
        'Jihocesky': 'Jihočeský kraj',
        'Plzensky': 'Plzeňský kraj',
        'Karlovarsky': 'Karlovarský kraj',
        'Ustecky': 'Ústecký kraj',
        'Liberecky': 'Liberecký kraj',
        'Kralovehradecky': 'Královéhradecký kraj',
        'Pardubicky': 'Pardubický kraj',
        'Vysocina': 'Kraj Vysočina',
        'Jihomoravsky': 'Jihomoravský kraj',
        'Olomoucky': 'Olomoucký kraj',
        'Zlinsky': 'Zlínský kraj',
        'Moravskoslezsky': 'Moravskoslezský kraj',
        'Bratislavsky': 'Bratislavský kraj',
        'Trnavsky': 'Trnavský kraj',
        'Trenciansky': 'Trenčianský kraj',
        'Nitriansky': 'Nitriansky kraj',
        'Zilinsky': 'Žilinský kraj',
        'Banskobystricky': 'Banskobystrický kraj',
        'Presovsky': 'Prešovský kraj',
        'Kosicky': 'Košický kraj'
    };
    return locations[location] || location;
}

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 Profile detail page DOM loaded');
    console.log('🔍 DOMContentLoaded listener triggered');
    
    // Check if back button exists and is clickable
    const backBtn = document.querySelector('.back-btn');
    if (backBtn) {
        console.log('✅ Back button found:', backBtn);
        console.log('✅ Back button onclick:', backBtn.onclick);
        
        // Add event listener as backup
        backBtn.addEventListener('click', function(e) {
            console.log('🔙 Back button clicked via event listener');
            e.preventDefault();
            goBack();
        });
        
        console.log('✅ Event listener added to back button');
    } else {
        console.error('❌ Back button not found');
    }
    
    // Get user ID from URL parameters with robust fallbacks
    const userId = getRequestedUserId();
    
    console.log('🔍 URL params:', window.location.search);
    console.log('🔍 userId from URL:', userId);
    
    if (userId) {
        console.log('👤 Loading profile for user:', userId);
        console.log('🖼️ About to call loadProfileDetail...');
        try {
            await loadProfileDetail(userId);
            console.log('🖼️ loadProfileDetail completed');
        } catch (error) {
            console.error('🖼️ Error in loadProfileDetail:', error);
        }
    } else {
        console.error('❌ Missing user ID in URL');
        showError('Chyba: Chybí ID uživatele');
    }
});

// Extract userId from URL or referrer
function getRequestedUserId() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        let uid = params.get('userId') || params.get('uid') || params.get('sellerId');
        if (uid) return uid;
        // Try hash
        if (window.location.hash) {
            const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            uid = hashParams.get('userId') || hashParams.get('uid') || hashParams.get('sellerId');
            if (uid) return uid;
        }
        // Try referrer (e.g., came from ad-detail.html?id=...&userId=...)
        if (document.referrer) {
            const refUrl = new URL(document.referrer, window.location.origin);
            const refParams = new URLSearchParams(refUrl.search || '');
            uid = refParams.get('userId') || refParams.get('uid') || refParams.get('sellerId');
            if (uid) return uid;
        }
    } catch (e) {
        console.warn('⚠️ getRequestedUserId fallback error:', e);
    }
    return null;
}

// Load profile detail
async function loadProfileDetail(userId) {
    try {
        console.log('🖼️ loadProfileDetail called for userId:', userId);
        showLoading();
        
        // Load user profile data
        console.log('🖼️ Loading user profile...');
        await loadUserProfile(userId);
        console.log('🖼️ User profile loaded');
        
        // Load user services
        console.log('🖼️ Loading user services...');
        await loadUserServices(userId);
        console.log('🖼️ User services loaded');
        
        // Load user reviews
        console.log('🖼️ Loading user reviews...');
        await loadUserReviews(userId);
        console.log('🖼️ User reviews loaded');
        
        // Display profile
        console.log('🖼️ Calling displayProfile...');
        displayProfile();
        console.log('🖼️ displayProfile called');
        
        hideLoading();
        console.log('🖼️ Profile loading completed');
        
    } catch (error) {
        console.error('❌ Error loading profile:', error);
        showError('Chyba při načítání profilu: ' + error.message);
    }
}

// Load user profile data
async function loadUserProfile(userId) {
    try {
        console.log('🖼️ loadUserProfile called for userId:', userId);
        const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        // Try to load from users/{userId}/profile/profile first
        const profileRef = doc(window.firebaseDb, 'users', userId, 'profile', 'profile');
        console.log('🖼️ Trying to load from users/{userId}/profile/profile');
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
            userProfile = profileSnap.data();
            console.log('✅ Profile loaded from users/{userId}/profile/profile:', userProfile);
        } else {
            console.log('🖼️ Profile not found in users/{userId}/profile/profile, trying fallback');
            // Fallback to users/{userId}
            const userRef = doc(window.firebaseDb, 'users', userId);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                userProfile = userSnap.data();
                console.log('✅ Profile loaded from users/{userId}:', userProfile);
            } else {
                console.error('❌ Profile not found in any location');
                throw new Error('Profil uživatele nebyl nalezen');
            }
        }
        
        // Load user basic info
        console.log('🖼️ Loading user basic info from users/{userId}');
        const userRef = doc(window.firebaseDb, 'users', userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            currentProfileUser = userSnap.data();
            currentProfileUser.id = userId;
            console.log('✅ User basic info loaded:', currentProfileUser);
            // Sloučit základní info s profilem pro lepší fallbacky při zobrazení
            // (pole z profilu mají přednost před polem ze základního dokumentu)
            userProfile = { ...currentProfileUser, ...userProfile };
            console.log('🧩 Merged userProfile for display:', userProfile);
        } else {
            console.error('❌ User basic info not found');
            throw new Error('Základní informace o uživateli nebyly nalezeny');
        }
        
        console.log('🖼️ loadUserProfile completed successfully');
        
    } catch (error) {
        console.error('❌ Error loading user profile:', error);
        throw error;
    }
}

// Load user services
async function loadUserServices(userId) {
    try {
        console.log('🔍 Loading services for user:', userId);
        const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        if (!window.firebaseDb) {
            throw new Error('Firebase DB není dostupný');
        }
        
        // Load user's services
        const servicesRef = collection(window.firebaseDb, 'users', userId, 'inzeraty');
        console.log('📁 Services reference:', servicesRef.path);
        
        const servicesSnap = await getDocs(servicesRef);
        console.log('📊 Services snapshot size:', servicesSnap.size);
        
        userServices = [];
        servicesSnap.forEach(doc => {
            const serviceData = doc.data();
            serviceData.id = doc.id;
            console.log('📄 Service data:', doc.id, {
                title: serviceData.title,
                category: serviceData.category,
                status: serviceData.status
            });
            userServices.push(serviceData);
        });
        
        console.log('✅ User services loaded:', userServices.length);
        
        if (userServices.length === 0) {
            console.warn('⚠️ Žádné služby nenalezeny pro uživatele:', userId);
            console.warn('⚠️ Zkontrolujte, zda existují dokumenty v: users/' + userId + '/inzeraty/');
        }
        
    } catch (error) {
        console.error('❌ Error loading user services:', error);
        console.error('Error details:', {
            code: error.code,
            message: error.message,
            stack: error.stack
        });
        userServices = [];
        
        // Zobrazit uživatelsky přívětivou chybu
        if (error.code === 'permission-denied') {
            console.error('❌ Permission denied - zkontrolujte Firestore pravidla!');
        }
    }
}

// Load user reviews
async function loadUserReviews(userId) {
    try {
        const { getDocs, collection, collectionGroup } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        userReviews = [];
        
        // 1. Načíst recenze na profilu uživatele (users/{userId}/reviews)
        try {
            const profileReviewsRef = collection(window.firebaseDb, 'users', userId, 'reviews');
            const profileReviewsSnap = await getDocs(profileReviewsRef);
            profileReviewsSnap.forEach(doc => {
                const reviewData = doc.data();
                reviewData.id = doc.id;
                reviewData.type = 'profile';
                userReviews.push(reviewData);
            });
            console.log('✅ Profile reviews loaded:', profileReviewsSnap.size);
        } catch (profileError) {
            console.warn('⚠️ Error loading profile reviews:', profileError);
        }
        
        // 2. Načíst recenze na inzerátech uživatele pomocí collectionGroup
        try {
            const adReviewsGroup = collectionGroup(window.firebaseDb, 'reviews');
            const adReviewsSnap = await getDocs(adReviewsGroup);
            adReviewsSnap.forEach(docSnap => {
                const reviewData = docSnap.data();
                // Zkontrolovat, zda recenze patří k inzerátu tohoto uživatele
                const parent = docSnap.ref.parent; // reviews collection
                const adDoc = parent?.parent; // adId document
                const inzeraty = adDoc?.parent; // 'inzeraty' collection
                const userDoc = inzeraty?.parent; // user uid document
                
                if (userDoc && userDoc.id === userId && inzeraty.id === 'inzeraty') {
                    reviewData.id = docSnap.id;
                    reviewData.type = 'ad';
                    reviewData.adId = adDoc.id;
                    userReviews.push(reviewData);
                }
            });
            console.log('✅ Ad reviews loaded from collectionGroup');
        } catch (adReviewsError) {
            console.warn('⚠️ Error loading ad reviews:', adReviewsError);
        }
        
        // 3. Fallback: zkusit root kolekci reviews (pokud existuje)
        try {
            const rootReviewsRef = collection(window.firebaseDb, 'reviews');
            const rootReviewsSnap = await getDocs(rootReviewsRef);
            rootReviewsSnap.forEach(doc => {
                const reviewData = doc.data();
                if (reviewData.reviewedUserId === userId) {
                    // Zkontrolovat, zda už není v seznamu
                    const exists = userReviews.some(r => r.id === doc.id);
                    if (!exists) {
                        reviewData.id = doc.id;
                        reviewData.type = reviewData.type || 'unknown';
                        userReviews.push(reviewData);
                    }
                }
            });
            console.log('✅ Root reviews checked');
        } catch (rootError) {
            console.warn('⚠️ Error loading root reviews (this is OK if collection doesn\'t exist):', rootError.message);
        }
        
        console.log('✅ Total user reviews loaded:', userReviews.length);
        
    } catch (error) {
        console.error('❌ Error loading user reviews:', error);
        console.error('Error details:', {
            code: error.code,
            message: error.message
        });
        userReviews = [];
    }
}

// Display profile
function displayProfile() {
    console.log('🖼️ displayProfile called');
    console.log('🖼️ currentProfileUser:', currentProfileUser);
    console.log('🖼️ userProfile:', userProfile);
    console.log('🖼️ userServices:', userServices);
    console.log('🖼️ userReviews:', userReviews);
    
    if (!currentProfileUser) {
        console.error('❌ currentProfileUser is missing');
        showError('Základní informace o uživateli nejsou dostupné');
        return;
    }
    
    if (!userProfile) {
        console.error('❌ userProfile is missing');
        showError('Profil uživatele není dostupný');
        return;
    }
    
    console.log('🖼️ All profile data available, proceeding with display');
    
    // Update profile information
    console.log('🖼️ Updating profile info');
    updateProfileInfo();
    
    // Update profile stats
    console.log('🖼️ Updating profile stats');
    updateProfileStats();
    
    // Display user services
    console.log('🖼️ Displaying user services');
    displayUserServices();
    
    // Display user reviews
    console.log('🖼️ Displaying user reviews');
    displayUserReviews().catch(error => {
        console.error('❌ Error displaying reviews:', error);
    });
    
    console.log('🖼️ displayProfile completed');
}

// Update profile information
function updateProfileInfo() {
    console.log('🖼️ updateProfileInfo called');
    console.log('🖼️ userProfile:', userProfile);
    console.log('🖼️ currentProfileUser:', currentProfileUser);
    
    // Profile display name
    const displayName = (userProfile.name && userProfile.name.trim())
        ? userProfile.name.trim()
        : (userProfile.firstName || userProfile.lastName)
            ? `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim()
            : (currentProfileUser.email || 'Uživatel');
    
    console.log('🖼️ displayName:', displayName);
    
    // Update main profile info
    const profileNameEl = document.getElementById('profileName');
    const profileEmailEl = document.getElementById('profileEmail');
    const profileLocationEl = document.getElementById('profileLocation');
    const profileBioEl = document.getElementById('profileBio');
    
    console.log('🖼️ Profile elements found:', {
        profileName: !!profileNameEl,
        profileEmail: !!profileEmailEl,
        profileLocation: !!profileLocationEl,
        profileBio: !!profileBioEl
    });
    
    if (profileNameEl) profileNameEl.textContent = displayName;
    if (profileEmailEl) profileEmailEl.textContent = userProfile.email || currentProfileUser.email || '';
    if (profileLocationEl) profileLocationEl.textContent = userProfile.city || userProfile.location || currentProfileUser.location || 'Lokace neuvedena';
    if (profileBioEl) {
        const bioText = userProfile.bio || userProfile.description || 'Uživatel nezadal žádný popis.';
        // Zachovat odřádkování - escapovat HTML a převést \n na <br>
        const escapedText = bioText
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        profileBioEl.innerHTML = escapedText.replace(/\n/g, '<br>');
    }
    
    // Update contact info
    const profileDisplayNameEl = document.getElementById('profileDisplayName');
    const profileDisplayEmailEl = document.getElementById('profileDisplayEmail');
    const profileDisplayPhoneEl = document.getElementById('profileDisplayPhone');
    
    console.log('🖼️ Contact elements found:', {
        profileDisplayName: !!profileDisplayNameEl,
        profileDisplayEmail: !!profileDisplayEmailEl,
        profileDisplayPhone: !!profileDisplayPhoneEl
    });
    
    if (profileDisplayNameEl) profileDisplayNameEl.textContent = displayName;
    
    // Kontaktní údaje s blur efektem pro nepřihlášené
    const fullEmail = userProfile.email || currentProfileUser.email || '';
    const fullPhone = userProfile.phone || currentProfileUser.phone || 'Telefon neuveden';
    const viewer = window.firebaseAuth?.currentUser;
    
    if (profileDisplayEmailEl) {
        profileDisplayEmailEl.textContent = fullEmail;
        if (!viewer) {
            profileDisplayEmailEl.classList.add('blurred-contact');
            profileDisplayEmailEl.onclick = () => {
                if (typeof window.showAuthModal === 'function') {
                    window.showAuthModal('login');
                }
            };
            profileDisplayEmailEl.style.cursor = 'pointer';
        } else {
            profileDisplayEmailEl.classList.remove('blurred-contact');
            profileDisplayEmailEl.onclick = null;
            profileDisplayEmailEl.style.cursor = 'default';
        }
    }
    
    if (profileDisplayPhoneEl) {
        profileDisplayPhoneEl.textContent = fullPhone;
        if (!viewer) {
            profileDisplayPhoneEl.classList.add('blurred-contact');
            profileDisplayPhoneEl.onclick = () => {
                if (typeof window.showAuthModal === 'function') {
                    window.showAuthModal('login');
                }
            };
            profileDisplayPhoneEl.style.cursor = 'pointer';
        } else {
            profileDisplayPhoneEl.classList.remove('blurred-contact');
            profileDisplayPhoneEl.onclick = null;
            profileDisplayPhoneEl.style.cursor = 'default';
        }
    }
    
    // Update join date
    let joinDate = new Date();
    const createdAtValue = userProfile.createdAt;
    try {
        if (createdAtValue && typeof createdAtValue.toDate === 'function') {
            joinDate = createdAtValue.toDate();
        } else if (createdAtValue) {
            const parsed = new Date(createdAtValue);
            if (!isNaN(parsed)) joinDate = parsed;
        }
    } catch (e) {
        console.warn('⚠️ Unable to parse join date, using current date');
    }
    const profileJoinDateEl = document.getElementById('profileJoinDate');
    if (profileJoinDateEl) profileJoinDateEl.textContent = joinDate.toLocaleDateString('cs-CZ');
    
    console.log('🖼️ Profile info updated successfully');
}

// Update profile stats
function updateProfileStats() {
    console.log('🖼️ updateProfileStats called');
    console.log('🖼️ userServices:', userServices);
    console.log('🖼️ userReviews:', userReviews);
    
    // Active services count
    const activeServices = userServices.filter(service => service.status === 'active');
    console.log('🖼️ activeServices:', activeServices);
    
    // Average rating
    let averageRating = '-';
    if (userReviews.length > 0) {
        const totalRating = userReviews.reduce((sum, review) => sum + (review.rating || 0), 0);
        averageRating = (totalRating / userReviews.length).toFixed(1);
    }
    
    console.log('🖼️ averageRating:', averageRating);
    
    // Update profile stats section
    const profileStatsEl = document.getElementById('profileStats');
    if (profileStatsEl) {
        profileStatsEl.textContent = `${activeServices.length} aktivních služeb`;
        console.log('🖼️ Profile stats updated:', profileStatsEl.textContent);
    } else {
        console.error('❌ Profile stats element not found');
    }
}

// Display user services
function displayUserServices() {
    console.log('🖼️ displayUserServices called');
    console.log('🖼️ userServices:', userServices);
    console.log('🖼️ userServices.length:', userServices.length);
    
    const servicesGrid = document.getElementById('userServicesGrid');
    console.log('🖼️ servicesGrid element:', servicesGrid);
    
    if (userServices.length === 0) {
        console.log('🖼️ No services found, showing message');
        servicesGrid.innerHTML = '<p class="no-services">Uživatel nemá žádné služby.</p>';
        return;
    }
    
    const activeServices = userServices.filter(service => service.status === 'active');
    console.log('🖼️ activeServices:', activeServices);
    console.log('🖼️ activeServices.length:', activeServices.length);
    
    if (activeServices.length === 0) {
        console.log('🖼️ No active services found, showing message');
        servicesGrid.innerHTML = '<p class="no-services">Uživatel nemá žádné aktivní služby.</p>';
        return;
    }
    
    console.log('🖼️ Creating service cards for:', activeServices.length, 'services');
    servicesGrid.innerHTML = activeServices.map(service => createServiceCard(service)).join('');
    console.log('🖼️ Service cards created and inserted');
}

// Create service card
function createServiceCard(service) {
    console.log('🖼️ Creating service card for:', service.title);
    console.log('🖼️ Full service data:', service);
    console.log('🖼️ Service images:', service.images);
    console.log('🖼️ Service image:', service.image);
    console.log('🖼️ Service photo:', service.photo);
    
    const categoryName = categoryNames[service.category] || service.category;
    const createdAt = service.createdAt ? service.createdAt.toDate() : new Date();
    const timeAgo = getTimeAgo(createdAt);
    
    // Check for images - same as services.js
    let imageUrl = './fotky/team.jpg'; // default fallback with explicit relative path
    
    if (service.images && service.images.length > 0) {
        if (service.images[0].url) {
            imageUrl = service.images[0].url;
            console.log('✅ Using images[0].url:', imageUrl);
        } else if (typeof service.images[0] === 'string') {
            imageUrl = service.images[0];
            console.log('✅ Using images[0] as string:', imageUrl);
        }
    } else if (service.image) {
        if (service.image.url) {
            imageUrl = service.image.url;
            console.log('✅ Using image.url:', imageUrl);
        } else if (typeof service.image === 'string') {
            imageUrl = service.image;
            console.log('✅ Using image as string:', imageUrl);
        }
    } else if (service.photo) {
        if (service.photo.url) {
            imageUrl = service.photo.url;
            console.log('✅ Using photo.url:', imageUrl);
        } else if (typeof service.photo === 'string') {
            imageUrl = service.photo;
            console.log('✅ Using photo as string:', imageUrl);
        }
    }
    
    console.log('🎯 Final image URL:', imageUrl);
    console.log('🔗 Image URL type:', typeof imageUrl);
    console.log('🔗 Image URL length:', imageUrl.length);
    
    let imageHtml = `<img src="${imageUrl}" alt="${service.title}" loading="lazy" decoding="async" onerror="console.error('❌ Image failed to load:', this.src); this.style.display='none'; this.nextElementSibling.style.display='block';">`;
    imageHtml += '<div class="no-image" style="display:none;"><i class="fas fa-image"></i></div>';
    
    return `
        <div class="ad-card" onclick="viewService('${service.id}', '${currentProfileUser.id}')">
            <div class="ad-thumb">
                ${imageHtml}
            </div>
            <div class="ad-body">
                <h3 class="ad-title">${service.title}</h3>
                <div class="ad-meta-details">
                    <div class="ad-meta-item">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${getLocationName(service.location) || 'Lokace neuvedena'}</span>
                    </div>
                    <div class="ad-meta-item">
                        <i class="fas fa-tags"></i>
                        <span>${categoryName}</span>
                    </div>
                    <div class="ad-meta-item">
                        <i class="fas fa-tag"></i>
                        <span class="ad-price-value">${service.price || 'Cena na dotaz'}</span>
                    </div>
                    <div class="ad-meta-item">
                        <i class="fas fa-calendar"></i>
                        <span>${timeAgo}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Display user reviews
async function displayUserReviews() {
    const reviewsGrid = document.getElementById('userReviewsGrid');
    
    if (userReviews.length === 0) {
        reviewsGrid.innerHTML = `
            <div style="
                text-align: center;
                padding: 60px 20px;
                background: white;
                border-radius: 16px;
                border: 2px dashed #e5e7eb;
            ">
                <i class="fas fa-star" style="font-size: 48px; color: #d1d5db; margin-bottom: 16px;"></i>
                <p style="
                    font-size: 16px;
                    color: #6b7280;
                    margin: 0;
                    font-weight: 500;
                ">Uživatel zatím nemá žádné recenze.</p>
            </div>
        `;
        return;
    }
    
    // Načíst jména recenzentů
    const reviewsWithNames = await Promise.all(
        userReviews.map(async (review) => {
            let reviewerName = review.reviewerName || review.reviewerEmail || 'Anonymní';
            
            // Pokud máme reviewerEmail, zkus načíst jméno z profilu
            if (review.reviewerId && !review.reviewerName) {
                try {
                    const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                    const reviewerProfileRef = doc(window.firebaseDb, 'users', review.reviewerId);
                    const reviewerProfileSnap = await getDoc(reviewerProfileRef);
                    
                    if (reviewerProfileSnap.exists()) {
                        const reviewerData = reviewerProfileSnap.data();
                        reviewerName = reviewerData.name || 
                                       (reviewerData.firstName && reviewerData.lastName 
                                        ? `${reviewerData.firstName} ${reviewerData.lastName}`.trim()
                                        : reviewerData.email?.split('@')[0] || reviewerName);
                    }
                } catch (error) {
                    console.warn('⚠️ Nepodařilo se načíst jméno recenzenta:', error);
                }
            }
            
            return {
                ...review,
                reviewerName: reviewerName
            };
        })
    );
    
    reviewsGrid.innerHTML = reviewsWithNames.map(review => createReviewCard(review)).join('');
}

// Create review card
function createReviewCard(review) {
    const stars = '★'.repeat(review.rating || 0) + '☆'.repeat(5 - (review.rating || 0));
    
    // Zpracovat createdAt (může být Timestamp nebo Date)
    let createdAt;
    if (review.createdAt) {
        if (typeof review.createdAt.toDate === 'function') {
            createdAt = review.createdAt.toDate();
        } else if (review.createdAt instanceof Date) {
            createdAt = review.createdAt;
        } else {
            createdAt = new Date(review.createdAt);
        }
    } else {
        createdAt = new Date();
    }
    
    const timeAgo = getTimeAgo(createdAt);
    
    // Použít správná pole: text místo comment, reviewerName (už načtené)
    const reviewText = review.text || review.comment || 'Recenze bez komentáře.';
    const reviewerName = review.reviewerName || review.reviewerEmail?.split('@')[0] || 'Anonymní';
    
    // Vytvořit hvězdičky s lepším designem
    const filledStars = '★'.repeat(review.rating || 0);
    const emptyStars = '☆'.repeat(5 - (review.rating || 0));
    
    return `
        <div class="review-card-modern">
            <div class="review-card-header">
                <div class="reviewer-info-modern">
                    <div class="reviewer-avatar-modern">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="reviewer-details-modern">
                        <h4 class="reviewer-name">${reviewerName}</h4>
                        <span class="review-date-modern">${timeAgo}</span>
                    </div>
                </div>
                <div class="review-rating-modern">
                    <div class="stars-container">
                        <span class="stars-filled">${filledStars}</span>
                        <span class="stars-empty">${emptyStars}</span>
                    </div>
                </div>
            </div>
            <div class="review-card-content">
                <p class="review-text">${reviewText}</p>
            </div>
        </div>
    `;
}

// View service
window.viewService = function(serviceId, userId) {
    window.location.href = `ad-detail.html?id=${serviceId}&userId=${userId}`;
};

// Show auth required modal
window.showAuthRequiredModal = function() {
    // Check if modal already exists
    let modal = document.getElementById('authRequiredModal');
    if (modal) {
        modal.style.display = 'flex';
        return;
    }
    
    // Create modal
    modal = document.createElement('div');
    modal.id = 'authRequiredModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px; text-align: center;">
            <div class="modal-header">
                <h2 style="margin: 0;">Přihlášení vyžadováno</h2>
                <span class="close" onclick="this.closest('.modal').style.display='none'">&times;</span>
            </div>
            <div class="modal-body" style="padding: 2rem;">
                <i class="fas fa-lock" style="font-size: 3rem; color: var(--primary-color); margin-bottom: 1rem;"></i>
                <p style="margin-bottom: 2rem;">Pro posílání zpráv v chatu se musíte přihlásit nebo registrovat.</p>
                <div style="display: flex; flex-direction: column; gap: 1rem; align-items: center;">
                    <button class="btn" onclick="showAuthModal('login'); document.getElementById('authRequiredModal').style.display='none';" style="background: linear-gradient(135deg, #f77c00 0%, #fdf002 100%); color: white; border: none; padding: 0.75rem 2rem; border-radius: 8px; font-size: 1rem; cursor: pointer; font-weight: 600;">
                        <i class="fas fa-sign-in-alt"></i>
                        Přihlásit se
                    </button>
                    <button class="btn" onclick="showAuthModal('register'); document.getElementById('authRequiredModal').style.display='none';" style="background: linear-gradient(135deg, #f77c00 0%, #fdf002 100%); color: white; border: none; padding: 0.75rem 2rem; border-radius: 8px; font-size: 1rem; cursor: pointer; font-weight: 600;">
                        <i class="fas fa-user-plus"></i>
                        Registrovat se
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
};

// Start chat
window.startChat = async function() {
    console.log('💬 Starting chat...');
    console.log('👤 Current profile user:', currentProfileUser);
    
    if (!currentProfileUser) {
        console.error('❌ No current profile user available');
        showError('Chyba: Uživatel není načten');
        return;
    }
    
    if (!currentProfileUser.id) {
        console.error('❌ No user ID in profile');
        showError('Chyba: ID uživatele není dostupné');
        return;
    }
    
    // Kontrola přihlášení
    const authUser = window.firebaseAuth?.currentUser;
    console.log('👤 Current user:', authUser);
    if (!authUser) {
        // Zobrazit modal pro přihlášení/registraci
        showAuthRequiredModal();
        return;
    }
    
    // Kontrola, že uživatel nekontaktuje sám sebe
    if (currentProfileUser.id === authUser.uid) {
        showError('Nemůžete kontaktovat sami sebe');
        return;
    }
    
    console.log('✅ Login check passed, contacting user...');
    
    // Redirect to chat with user
    window.location.href = `chat.html?userId=${currentProfileUser.id}`;
};

// Go back
window.goBack = function() {
    console.log('🔙 goBack called');
    console.log('🔙 History length:', window.history.length);
    console.log('🔙 Current URL:', window.location.href);
    
    try {
        // Check if we have history to go back to
        if (window.history.length > 1) {
            console.log('🔙 Going back in history');
            window.history.back();
        } else {
            console.log('🔙 No history, redirecting to services');
            // If no history, redirect to services page
            window.location.href = 'services.html';
        }
    } catch (error) {
        console.error('❌ Error in goBack:', error);
        // Fallback: redirect to services page
        window.location.href = 'services.html';
    }
};

// Alternative back function with more robust logic
window.goBackAlternative = function() {
    console.log('🔙 goBackAlternative called');
    
    // Try to get referrer
    const referrer = document.referrer;
    console.log('🔙 Referrer:', referrer);
    
    if (referrer && referrer.includes(window.location.origin)) {
        console.log('🔙 Going back to referrer');
        window.location.href = referrer;
    } else {
        console.log('🔙 No valid referrer, going to services');
        window.location.href = 'services.html';
    }
};

// Utility functions
function showLoading() {
    // Hide content and show loading
    const content = document.querySelector('.ad-detail-content');
    if (content) {
        content.style.opacity = '0.5';
    }
}

function hideLoading() {
    // Show content
    const content = document.querySelector('.ad-detail-content');
    if (content) {
        content.style.opacity = '1';
    }
}

function showError(message) {
    alert(message);
}

function getTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Dnes';
    if (days === 1) return 'Včera';
    if (days < 7) return `Před ${days} dny`;
    if (days < 30) return `Před ${Math.floor(days / 7)} týdny`;
    if (days < 365) return `Před ${Math.floor(days / 30)} měsíci`;
    return `Před ${Math.floor(days / 365)} lety`;
}

// ===== RECENZE FUNKCE =====

let selectedRating = 0;

// Zobrazit/skrýt formulář pro recenzi
function toggleReviewForm() {
    const form = document.getElementById('reviewFormSection');
    if (form) {
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
        
        // Scroll k formuláři pokud se zobrazuje
        if (form.style.display === 'block') {
            form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

// Zvýraznit hvězdičky při hover
function highlightStars(rating) {
    const stars = document.querySelectorAll('#reviewStars i');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.className = 'fas fa-star';
            star.style.color = '#f77c00';
        } else {
            star.className = 'far fa-star';
            star.style.color = '#d1d5db';
        }
    });
}

// Vybrat hodnocení
function selectRating(rating) {
    selectedRating = rating;
    highlightStars(rating);
    console.log('⭐ Vybráno hodnocení:', rating);
}

// Odeslat recenzi
async function submitReview() {
    // Zkontrolovat přihlášení
    const currentUser = window.firebaseAuth?.currentUser;
    if (!currentUser) {
        alert('Pro napsání recenze se musíte přihlásit');
        return;
    }
    
    // Zkontrolovat, že uživatel nehodnotí sám sebe
    if (!currentProfileUser || currentUser.uid === currentProfileUser.uid) {
        alert('Nemůžete hodnotit sami sebe');
        return;
    }
    
    // Zkontrolovat hodnocení
    if (selectedRating === 0) {
        alert('Prosím vyberte hodnocení (1-5 hvězdiček)');
        return;
    }
    
    // Získat text recenze
    const reviewText = document.getElementById('reviewText')?.value?.trim();
    if (!reviewText) {
        alert('Prosím napište text recenze');
        return;
    }
    
    try {
        console.log('💾 Ukládám recenzi...');
        
        // Import Firestore funkcí
        const { addDoc, collection, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        // Uložit recenzi do Firestore
        const reviewData = {
            reviewerId: currentUser.uid,
            reviewerEmail: currentUser.email,
            rating: selectedRating,
            text: reviewText,
            createdAt: serverTimestamp()
        };
        
        await addDoc(
            collection(window.firebaseDb, 'users', currentProfileUser.uid, 'reviews'),
            reviewData
        );
        
        console.log('✅ Recenze uložena');
        
        // Zobrazit úspěšnou zprávu
        alert('✅ Děkujeme! Vaše recenze byla úspěšně přidána.');
        
        // Resetovat formulář
        selectedRating = 0;
        document.getElementById('reviewText').value = '';
        highlightStars(0);
        toggleReviewForm();
        
        // Znovu načíst recenze
        await loadUserReviews(currentProfileUser.uid);
        await displayUserReviews();
        
    } catch (error) {
        console.error('❌ Chyba při ukládání recenze:', error);
        alert('Nepodařilo se uložit recenzi: ' + error.message);
    }
}

// Export funkcí pro globální použití
window.toggleReviewForm = toggleReviewForm;
window.highlightStars = highlightStars;
window.selectRating = selectRating;
window.submitReview = submitReview;

