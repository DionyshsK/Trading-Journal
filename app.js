import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, deleteUser, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, setDoc, doc, getDoc, updateDoc, deleteDoc, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// ΝΕΟ: Προσθήκη Storage Imports
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// === FIREBASE CONFIG ===
const firebaseConfig = {
    apiKey: "AIzaSyDLqWiGvAMwzjhAZCfrqMVQz2_4F4s7nAc",
    authDomain: "trading-journal-db-eb6e1.firebaseapp.com",
    projectId: "trading-journal-db-eb6e1",
    storageBucket: "trading-journal-db-eb6e1.firebasestorage.app", // Βεβαιώσου ότι είναι ενεργό στο Firebase Console
    messagingSenderId: "672967817566",
    appId: "1:672967817566:web:10c873bf5726f3424cf7cf"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app); // ΝΕΟ: Init Storage

// ==========================================
// 🌍 GLOBAL VARIABLES & STATE
// ==========================================
// Συνδέουμε το auth στο window για debugging αν χρειαστεί
window.auth = auth;

let currentUserId = null;
let currentAccountId = null;
let currentAccountData = null;
let tradeUnsubscribe = null;
let chartInstance = null;
let latestBalance = 0;
let wizMarketType = '';
let wizAccountType = 'Live';

// Variables για το Calendar
let calDate = new Date();
window.currentTrades = []; // Αποθηκεύουμε τα trades εδώ για να τα βλέπει το calendar

// ==========================================
// 🛠️ HELPER FUNCTIONS (WINDOW BINDINGS)
// ==========================================

window.logout = async () => {
    await signOut(auth);
    window.location.reload();
};

window.deleteUserProfile = async () => {
    if (confirm("DANGER: Delete Profile?")) {
        await deleteDoc(doc(db, "users", auth.currentUser.uid));
        await deleteUser(auth.currentUser);
        window.location.reload();
    }
};

window.togglePass = (id) => {
    const input = document.getElementById(id);
    input.type = input.type === "password" ? "text" : "password";
};

// ==========================================
// 🔐 AUTHENTICATION LOGIC
// ==========================================
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const forgotForm = document.getElementById('forgot-form');
const loginError = document.getElementById('login-error');
const regError = document.getElementById('reg-error');
const forgotMsg = document.getElementById('forgot-msg');

function hideAllForms() {
    loginForm.classList.add('hidden');
    registerForm.classList.add('hidden');
    forgotForm.classList.add('hidden');
    loginError.classList.add('hidden');
    regError.classList.add('hidden');
    forgotMsg.classList.add('hidden');
}

// Navigation between Auth Forms
document.getElementById('go-to-register').addEventListener('click', () => {
    hideAllForms();
    registerForm.classList.remove('hidden');
});

document.getElementById('go-to-login').addEventListener('click', () => {
    hideAllForms();
    loginForm.classList.remove('hidden');
});

document.getElementById('forgot-pass-link').addEventListener('click', () => {
    hideAllForms();
    forgotForm.classList.remove('hidden');
});

document.getElementById('back-from-forgot').addEventListener('click', () => {
    hideAllForms();
    loginForm.classList.remove('hidden');
});

// --- Login Handler ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
        loginError.textContent = "Login Failed: " + err.message;
        loginError.classList.remove('hidden');
    }
});

// --- Register Handler ---
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    regError.classList.add('hidden');
    
    const fname = document.getElementById('reg-fname').value;
    const lname = document.getElementById('reg-lname').value;
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    if (pass !== confirm) {
        regError.textContent = "Passwords do not match!";
        regError.classList.remove('hidden');
        return;
    }

    const strongRegex = /^(?=.*[A-Z])(?=.*\d).{6,}$/;
    if (!strongRegex.test(pass)) {
        regError.textContent = "Password must have 1 Capital, 1 Number, 6+ chars.";
        regError.classList.remove('hidden');
        return;
    }

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "users", cred.user.uid), {
            firstName: fname,
            lastName: lname,
            username: username,
            email: email,
            onboardingComplete: false,
            createdAt: Date.now()
        });
    } catch (err) {
        regError.textContent = err.message;
        regError.classList.remove('hidden');
    }
});

// --- Forgot Password Handler ---
forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value;
    
    try {
        await sendPasswordResetEmail(auth, email);
        forgotMsg.textContent = "Reset link sent!";
        forgotMsg.className = "text-center text-sm font-bold text-green-500 p-2";
        forgotMsg.classList.remove('hidden');
    } catch (err) {
        forgotMsg.textContent = err.message;
        forgotMsg.className = "text-center text-sm font-bold text-red-500 p-2";
        forgotMsg.classList.remove('hidden');
    }
});

// --- Auth State Listener ---
onAuthStateChanged(auth, async (u) => {
    if (u) {
        currentUserId = u.uid;
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('app-layout').classList.remove('hidden');

        loginForm.reset();
        registerForm.reset();

        const d = await getDoc(doc(db, "users", currentUserId));
        if (d.exists()) {
            const data = d.data();
            document.getElementById('header-name').textContent = data.username || "Trader";
            
            if (!data.onboardingComplete) {
                document.getElementById('persona-wizard').classList.remove('hidden');
            }

            // Fill Profile Data
            document.getElementById('prof-fname').value = data.firstName || "";
            document.getElementById('prof-lname').value = data.lastName || "";
            document.getElementById('prof-email').value = data.email || "";
            document.getElementById('prof-dob').value = data.dob || "";
            document.getElementById('prof-bio').value = data.bio || "";
            document.getElementById('prof-exp').value = data.experience || "0-1";
            
            (data.markets || []).forEach(v => {
                const el = document.querySelector(`.market-chk[value="${v}"]`);
                if (el) el.checked = true;
            });
            (data.strategies || []).forEach(v => {
                const el = document.querySelector(`.strat-chk[value="${v}"]`);
                if (el) el.checked = true;
            });
        }
        loadAccountsList();
    } else {
        currentUserId = null;
        document.getElementById('auth-container').classList.remove('hidden');
        document.getElementById('app-layout').classList.add('hidden');
    }
});

// ==========================================
// 🧙‍♂️ WIZARDS (Persona & Account)
// ==========================================

// Persona Wizard Navigation
window.nextPersonaStep = (s) => {
    for (let i = 1; i <= 4; i++) {
        document.getElementById(`p-step-${i}`).classList.add('hidden-step');
    }
    document.getElementById(`p-step-${s}`).classList.remove('hidden-step');
    for (let i = 2; i <= s; i++) {
        document.getElementById(`prog-${i}`).classList.add('bg-indigo-600');
    }
};

document.getElementById('persona-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const exp = document.querySelector('input[name="exp"]:checked')?.value;
    const markets = Array.from(document.querySelectorAll('.p-chk:checked')).map(c => c.value);
    const strategies = Array.from(document.querySelectorAll('.s-chk:checked')).map(c => c.value);
    let reason = document.querySelector('input[name="why"]:checked')?.value;
    
    if (reason === 'other') reason = document.getElementById('why-other-text').value;

    await updateDoc(doc(db, "users", currentUserId), {
        experience: exp,
        markets,
        strategies,
        reason,
        onboardingComplete: true
    });
    
    document.getElementById('persona-wizard').classList.add('hidden');
    setTimeout(window.openAccountWizard, 500);
});

// Account Wizard Functions
window.openAccountWizard = () => {
    document.getElementById('account-wizard').classList.remove('hidden');
    document.getElementById('aw-step-1').classList.remove('hidden-step');
    document.getElementById('aw-step-2').classList.add('hidden-step');
};

window.closeAccountWizard = () => {
    document.getElementById('account-wizard').classList.add('hidden');
};

window.selectMarketType = (t) => {
    wizMarketType = t;
    document.getElementById('aw-step-1').classList.add('hidden-step');
    document.getElementById('aw-step-2').classList.remove('hidden-step');
    
    const fb = document.getElementById('type-funded');
    if (t === 'Crypto') {
        fb.style.display = 'none';
        window.setWizType('Live');
    } else {
        fb.style.display = 'block';
        window.setWizType('Live');
    }
};

window.setWizType = (t) => {
    wizAccountType = t;
    const l = document.getElementById('type-live');
    const f = document.getElementById('type-funded');
    
    if (t === 'Live') {
        l.className = 'flex-1 py-2 rounded bg-indigo-600 text-white';
        f.className = 'flex-1 py-2 rounded text-gray-500';
        document.getElementById('wiz-funded-opts').classList.add('hidden-step');
    } else {
        f.className = 'flex-1 py-2 rounded bg-indigo-600 text-white';
        l.className = 'flex-1 py-2 rounded text-gray-500';
        document.getElementById('wiz-funded-opts').classList.remove('hidden-step');
    }
};

window.togglePhaseInputs = () => {
    const t = document.getElementById('wiz-challenge-type').value;
    const p2 = document.getElementById('wiz-target-p2');
    if (t === '1step') {
        p2.classList.add('hidden');
        p2.value = '';
    } else {
        p2.classList.remove('hidden');
    }
};

// Account Wizard Submit
document.getElementById('wiz-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = {
        name: document.getElementById('wiz-name').value,
        type: wizAccountType,
        marketType: wizMarketType,
        initialBalance: parseFloat(document.getElementById('wiz-balance').value),
        createdAt: Date.now()
    };
    
    if (wizAccountType === 'Funded') {
        d.propFirm = document.getElementById('wiz-prop').value;
        d.challengeType = document.getElementById('wiz-challenge-type').value;
        d.targetP1 = parseFloat(document.getElementById('wiz-target-p1').value) || 0;
        d.targetP2 = parseFloat(document.getElementById('wiz-target-p2').value) || 0;
        d.dailyDD = parseFloat(document.getElementById('wiz-daily-dd').value) || 0;
        d.totalDD = parseFloat(document.getElementById('wiz-total-dd').value) || 0;
        d.status = 'Phase 1';
    }
    
    const ref = await addDoc(collection(db, `users/${currentUserId}/accounts`), d);
    window.closeAccountWizard();
    document.getElementById('wiz-form').reset();
    loadAccountsList();
    window.selectAccount(ref.id);
});

// ==========================================
// 📊 DASHBOARD & ACCOUNT LOGIC
// ==========================================

// Στο app.js, αντικατέστησε την παλιά loadAccountsList με αυτήν:
async function loadAccountsList() {
    const q = query(collection(db, `users/${currentUserId}/accounts`), orderBy('createdAt', 'desc'));
    const s = await getDocs(q);
    const l = document.getElementById('accounts-list');
    l.innerHTML = '';

    if (s.empty) {
        document.getElementById('no-accounts-msg').classList.remove('hidden');
        document.getElementById('dashboard-content').classList.add('hidden');
        return;
    }
    
    document.getElementById('no-accounts-msg').classList.add('hidden');
    s.forEach(d => {
        const a = d.data();
        const div = document.createElement('div');
        div.className = "bg-white dark:bg-gray-800 p-6 rounded-2xl shadow flex justify-between items-center";
        div.innerHTML = `
            <div>
                <h4 class="font-bold dark:text-white text-lg">${a.name}</h4>
                <p class="text-xs text-gray-500">${a.marketType} • ${a.type}</p>
            </div>
            <div class="flex gap-2">
                <button onclick="window.selectAccount('${d.id}')" class="bg-indigo-600 text-white px-4 py-2 rounded font-bold">Open</button>
                <button onclick="window.deleteAccount('${d.id}')" class="text-red-500 px-3 py-2">Delete</button>
            </div>`;
        l.appendChild(div);
    });

    // --- FIX ΓΙΑ STATE LOSS ---
    // Ελέγχουμε αν υπάρχει αποθηκευμένο ID στο localStorage
    const savedId = localStorage.getItem('lastAccountId');
    
    // Αν υπάρχει ΚΑΙ είναι έγκυρο (υπάρχει στη λίστα που μόλις φέραμε), το ανοίγουμε
    if (savedId && s.docs.find(d => d.id === savedId)) {
        window.selectAccount(savedId);
    } 
    // Αλλιώς, αν δεν έχουμε ανοιχτό λογαριασμό, ανοίγουμε τον πρώτο διαθέσιμο
    else if (!currentAccountId && s.docs.length > 0) {
        window.selectAccount(s.docs[0].id);
    }
}
window.selectAccount = async (id) => {
    // 1. Καθαρισμός προηγούμενου listener
    if (tradeUnsubscribe) {
        tradeUnsubscribe();
        tradeUnsubscribe = null;
    }

    currentAccountId = id;
    localStorage.setItem('lastAccountId', id);

    // 2. Ανάκτηση δεδομένων λογαριασμού
    const snap = await getDoc(doc(db, `users/${currentUserId}/accounts/${id}`));

    if (snap.exists()) {
        currentAccountData = snap.data();

        // 3. Ενημέρωση UI
        document.getElementById('menu-current-acc').textContent = currentAccountData.name;
        document.getElementById('dash-acc-name').textContent = currentAccountData.name;
        document.getElementById('dash-prop-name').textContent = currentAccountData.type === 'Funded' ? currentAccountData.propFirm : 'Live';
        document.getElementById('dashboard-content').classList.remove('hidden');

        // 4. Καθαρισμός γραφήματος
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }

        // 5. Διαμόρφωση Funded Stats (αν χρειάζεται)
        if (currentAccountData.type === 'Funded') {
            document.getElementById('funded-stats-container').classList.remove('hidden');
            
            const initBal = currentAccountData.initialBalance;
            const maxDDVal = initBal * (currentAccountData.totalDD / 100);
            const dailyDDVal = initBal * (currentAccountData.dailyDD / 100);
            
            document.getElementById('mdd-val').textContent = `$${maxDDVal.toFixed(0)}`;
            document.getElementById('ddd-val').textContent = `$${dailyDDVal.toFixed(0)}`;
            
            // Reset bars until trades load
            document.getElementById('bar-mdd').style.width = '0%';
            document.getElementById('bar-ddd').style.width = '0%';
            document.getElementById('bar-target').style.width = '0%';
            
            const status = currentAccountData.status || 'Phase 1';
            const badge = document.getElementById('dash-phase');
            badge.textContent = status;
            
            if (status.includes('CANCELLED') || status.includes('FAILED')) 
                badge.className = 'bg-red-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg text-white';
            else if (status.includes('FUNDED')) 
                badge.className = 'bg-green-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg text-white';
            else 
                badge.className = 'bg-indigo-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg text-white';

        } else {
            document.getElementById('funded-stats-container').classList.add('hidden');
        }
        
        window.switchTab('dashboard');
        
        // 6. Εκκίνηση παρακολούθησης trades
        setupTradeListener(id);
    }
};

window.deleteAccount = async (id) => {
    if (!confirm("DELETE ACCOUNT & ALL TRADES? Irreversible.")) return;
    
    // 1. Βρες όλα τα trades του λογαριασμού
    const tradesRef = collection(db, `users/${currentUserId}/accounts/${id}/trades`);
    const snap = await getDocs(tradesRef);
    
    // 2. Διέγραψε κάθε trade ΚΑΙ την εικόνα του (αν υπάρχει)
    const deletions = snap.docs.map(async (docSnap) => {
        const t = docSnap.data();
        if(t.image && t.image.includes('firebasestorage')) {
            try { 
                // Εξαγωγή του path από το URL για διαγραφή
                const storageRef = ref(storage, t.image);
                await deleteObject(storageRef); 
            } catch(e) { console.log('Image cleanup err', e); }
        }
        return deleteDoc(docSnap.ref);
    });
    
    await Promise.all(deletions); // Περίμενε να σβηστούν όλα
    
    // 3. Διέγραψε τον ίδιο τον λογαριασμό
    await deleteDoc(doc(db, `users/${currentUserId}/accounts/${id}`));
    
    if(currentAccountId === id) {
        currentAccountId = null;
        document.getElementById('dashboard-content').classList.add('hidden');
    }
    loadAccountsList();
};

// ==========================================
// 📈 TRADE LISTENER & METRICS CALCULATIONS
// ==========================================

function setupTradeListener(accId) {
    if (tradeUnsubscribe) tradeUnsubscribe();
    
    const q = query(collection(db, `users/${currentUserId}/accounts/${accId}/trades`), orderBy('date', 'asc'));
    
    tradeUnsubscribe = onSnapshot(q, (s) => {
        const trades = s.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Αποθήκευση στο global για χρήση από το Calendar
        window.currentTrades = trades;
        updateSymbolFilterOptions(trades);
        
        renderTrades([...trades].reverse());
        calcMetrics(trades);
        
        // Αν το calendar είναι ανοιχτό, κάνε update
        if (!document.getElementById('tab-calendar').classList.contains('hidden')) {
            renderCalendar();
        }
    });
}

async function calcMetrics(trades) {
    const offset = currentAccountData.pnlOffset || 0;
    const initBal = currentAccountData.initialBalance;
    
    let netPnL = 0;
    let wins = 0;
    let tradeCount = 0;
    
    const today = new Date().toISOString().split('T')[0];
    let todayPnL = 0;

    const labels = ['Start'];
    const data = [initBal];

    trades.forEach(t => {
        netPnL += t.pnl;
        
        if (t.type !== 'Withdrawal') {
            if (t.pnl > 0) wins++;
            if (t.date === today) todayPnL += t.pnl;
            tradeCount++;
        }
        
        labels.push(t.date);
        const phaseAdjustedBalance = initBal + (netPnL - offset);
        data.push(phaseAdjustedBalance);
    });

    const activeBal = initBal + (netPnL - offset);
    let currentPhaseProfit = netPnL - offset;
    latestBalance = activeBal;

    // --- FUNDED ACCOUNTS LOGIC ---
    if (currentAccountData.type === 'Funded') {
        const totalDDLimit = initBal * (currentAccountData.totalDD / 100);
        const dailyDDLimit = initBal * (currentAccountData.dailyDD / 100);
        
        let status = currentAccountData.status || 'Phase 1';

        // A. Failure Checks
        const breachedTotal = activeBal <= (initBal - totalDDLimit);
        const breachedDaily = todayPnL <= -dailyDDLimit;

        if (!status.includes('CANCELLED') && (breachedTotal || breachedDaily)) {
            status = 'CANCELLED';
            if (breachedTotal) status += ' (Max DD)';
            if (breachedDaily) status += ' (Daily DD)';
            await updateDoc(doc(db, `users/${currentUserId}/accounts/${currentAccountId}`), { status: status });
            currentAccountData.status = status;
        }
        
        // B. Success Checks
        else if (!status.includes('CANCELLED') && !status.includes('FUNDED')) {
            const t1Amt = initBal * (currentAccountData.targetP1 / 100);
            const t2Amt = initBal * (currentAccountData.targetP2 / 100);

            if (status === 'Phase 1' && currentPhaseProfit >= t1Amt) {
                const next = currentAccountData.challengeType === '2step' ? 'Phase 2' : 'FUNDED';
                await updateDoc(doc(db, `users/${currentUserId}/accounts/${currentAccountId}`), { 
                    status: next, pnlOffset: netPnL 
                });
                window.location.reload(); return;
            }
            else if (status === 'Phase 2' && currentPhaseProfit >= t2Amt) {
                await updateDoc(doc(db, `users/${currentUserId}/accounts/${currentAccountId}`), { 
                    status: 'FUNDED', pnlOffset: netPnL 
                });
                window.location.reload(); return;
            }
        }

        // C. Update UI Badges & Bars
        const badge = document.getElementById('dash-phase');
        badge.textContent = status;
        badge.className = status.includes('CANCELLED') ? 'bg-red-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg text-white' : 
                          status.includes('FUNDED') ? 'bg-green-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg text-white' : 
                          'bg-indigo-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg text-white';

        if (status.includes('Phase')) {
            const target = status === 'Phase 1' ? currentAccountData.targetP1 : currentAccountData.targetP2;
            const targetAmt = initBal * (target / 100);
            document.getElementById('target-val').textContent = `$${targetAmt.toFixed(0)}`;
            document.getElementById('bar-target').style.width = `${Math.min((Math.max(0, currentPhaseProfit)/targetAmt)*100, 100)}%`;
        } else if (status.includes('FUNDED')) {
            const available = Math.max(0, activeBal - initBal);
            const targetEl = document.getElementById('target-val');
            if(targetEl) {
                targetEl.parentElement.innerHTML = `
                    <div class="flex justify-between items-end mb-1">
                        <span class="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Available</span>
                        <span class="text-white font-mono text-sm">$${available.toFixed(2)}</span>
                    </div>
                    <button onclick="window.openWithdrawModal(${available})" class="w-full border border-green-600 text-green-500 hover:bg-green-500/10 text-[10px] font-bold py-1 rounded transition uppercase tracking-widest">Request Payout</button>
                `;
            }
        }

        const breachLevel = initBal - totalDDLimit;
        const distToBreach = activeBal - breachLevel;
        const totalDDPct = Math.max(0, 100 - (distToBreach / totalDDLimit) * 100); 
        document.getElementById('mdd-val').textContent = `$${totalDDLimit.toFixed(0)}`;
        document.getElementById('bar-mdd').style.width = `${totalDDPct}%`;
        document.getElementById('bar-mdd').className = totalDDPct > 90 ? 'bg-red-600 h-3 rounded-full' : 'bg-blue-500 h-3 rounded-full';

        const dayDDPct = (Math.abs(Math.min(0, todayPnL)) / dailyDDLimit) * 100;
        document.getElementById('ddd-val').textContent = `$${dailyDDLimit.toFixed(0)}`;
        document.getElementById('bar-ddd').style.width = `${Math.min(dayDDPct, 100)}%`;
    }

    // --- CHART & METRICS UI ---
    updateChart(document.getElementById('growthChart').getContext('2d'), labels, data, document.documentElement.classList.contains('dark'));

    document.getElementById('metric-balance').textContent = `$${activeBal.toFixed(2)}`;
    
    const displayPnL = (currentAccountData.type === 'Funded' && !currentAccountData.status.includes('FUNDED')) ? currentPhaseProfit : (netPnL - offset);
    document.getElementById('metric-pnl').textContent = `$${displayPnL.toFixed(2)}`;
    document.getElementById('metric-pnl').className = `text-2xl font-extrabold mt-1 ${displayPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    
    const tradeOnly = trades.filter(t => t.type !== 'Withdrawal');
    document.getElementById('metric-trades').textContent = tradeOnly.length;
    document.getElementById('metric-winrate').textContent = tradeOnly.length ? ((wins/tradeOnly.length)*100).toFixed(0)+'%' : '0%';
}

// ==========================================
// 📉 CHART CONFIG
// ==========================================

function updateChart(ctx, labels, data, isDark) {
    // --- FIX: Ασφαλής έλεγχος DOM ---
    const chartCanvas = document.getElementById('growthChart');
    if (!chartCanvas) return; // Αν δεν υπάρχει το canvas (π.χ. είμαστε σε άλλο tab), σταμάτα εδώ.

    // Αν το ctx που περάστηκε δεν είναι valid context object (συμβαίνει καμιά φορά στο resize), ξαναπάρτο
    const context = chartCanvas.getContext('2d');

    const zoom = parseFloat(document.getElementById('chart-zoom-level').value) || 0.1;
    const currentBal = data[data.length - 1];
    
    // --- FIX: Ασφαλής καταστροφή παλιού γραφήματος ---
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
    
    // Δημιουργία νέου γραφήματος
    chartInstance = new Chart(context, { 
        type: 'line', 
        data: { 
            labels, 
            datasets: [{
                label: 'Balance', 
                data: data, 
                borderColor: '#4f46e5', 
                backgroundColor: 'rgba(79,70,229,0.1)', 
                stepped: 'middle', 
                fill: true, 
                pointRadius: 0
            }] 
        }, 
        options: {
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: false }
            }, 
            scales: { 
                x: { display: false }, 
                y: { 
                    suggestedMin: currentBal * (1 - zoom), 
                    suggestedMax: currentBal * (1 + zoom), 
                    grid: { color: isDark ? '#374151' : '#e5e7eb' }, 
                    ticks: { color: isDark ? '#9ca3af' : '#4b5563' } 
                } 
            } 
        } 
    });
}

// ==========================================
// 💸 WITHDRAWAL & TRADING LOGIC
// ==========================================

window.openWithdrawModal = (avail) => {
    if(avail <= 0) return alert("No profits available to withdraw.");
    document.getElementById('withdraw-modal').classList.remove('hidden');
    document.getElementById('w-max-msg').textContent = `Max: $${avail.toFixed(2)}`;
    document.getElementById('w-amount').max = avail;
};

document.getElementById('withdraw-form').addEventListener('submit', async(e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('w-amount').value);
    const max = parseFloat(document.getElementById('w-max-msg').textContent.replace('Max: $',''));
    
    if(amount > max) return alert("Cannot withdraw more than available profit.");
    
    await addDoc(collection(db,`users/${currentUserId}/accounts/${currentAccountId}/trades`),{
        date: new Date().toISOString().split('T')[0],
        symbol: 'WITHDRAWAL', type: 'Withdrawal',
        entry: 0, sl: 0, tp: 0, exit: 0,
        pnl: -amount,
        notes: `Payout of $${amount}`, confidence: 0, createdAt: Date.now()
    });
    
    document.getElementById('withdraw-modal').classList.add('hidden');
    document.getElementById('withdraw-form').reset();
});

// Calculator Logic
document.querySelectorAll('.calc-trigger').forEach(el => el.addEventListener('input', calculateMath));

function calculateMath() {
    const entry = parseFloat(document.getElementById('t-entry').value) || 0;
    const sl = parseFloat(document.getElementById('t-sl').value) || 0;
    const tp = parseFloat(document.getElementById('t-tp').value) || 0;
    const exit = parseFloat(document.getElementById('t-exit').value) || 0;
    const lots = parseFloat(document.getElementById('t-size').value) || 0;
    const fees = parseFloat(document.getElementById('t-fees').value) || 0;
    const type = document.getElementById('t-type').value;

    if (entry && sl) {
        const riskDist = Math.abs(entry - sl);
        document.getElementById('disp-risk-pips').textContent = `Risk: ${(riskDist * 10000).toFixed(1)} pips`;

        if (tp) {
            const rewardDist = Math.abs(tp - entry);
            const rr = riskDist > 0 ? (rewardDist / riskDist) : 0;
            document.getElementById('disp-r-multiple').textContent = `${rr.toFixed(1)}:1`;
        } else {
            document.getElementById('disp-r-multiple').textContent = "--";
        }

        if (exit && lots > 0) {
            let priceDiff = type === 'Long' ? (exit - entry) : (entry - exit);
                
            priceDiff = Math.round(priceDiff * 100000) / 100000;
                
            const grossPnL = priceDiff * lots * 100000;
            const netPnL = grossPnL + fees;
                
            const netEl = document.getElementById('t-net-pnl');
            netEl.value = netPnL.toFixed(2);
            netEl.className = netPnL >= 0 
                ? "w-full rounded-lg bg-green-900/30 border border-green-600 text-green-400 p-2.5 font-mono text-center font-bold text-lg" 
                : "w-full rounded-lg bg-red-900/30 border border-red-600 text-red-400 p-2.5 font-mono text-center font-bold text-lg";
        }
    }
}

// Add Trade Logic
document.getElementById('trade-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.querySelector('#trade-form button[type="submit"]');
    btn.disabled = true; btn.textContent = "Saving..."; // UX βελτίωση

    if (currentAccountData.status && currentAccountData.status.includes('CANCELLED')) {
        alert("⛔ ACCOUNT CANCELLED. You cannot place new trades."); 
        btn.disabled = false; btn.textContent = "Add Trade";
        return;
    }

    const file = document.getElementById('t-img').files[0];
    let imgUrl = null;
    
    // ΝΕΑ ΛΟΓΙΚΗ: Upload στο Firebase Storage
    if (file) {
        try {
            // Δημιουργία μοναδικού ονόματος αρχείου
            const storageRef = ref(storage, `users/${currentUserId}/${currentAccountId}/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            imgUrl = await getDownloadURL(storageRef); // Παίρνουμε το Link, όχι το αρχείο
        } catch(err) {
            alert("Image Upload Failed: " + err.message);
            btn.disabled = false; return;
        }
    }
    
    const finalPnL = parseFloat(document.getElementById('t-net-pnl').value) || 0;

    await addDoc(collection(db, `users/${currentUserId}/accounts/${currentAccountId}/trades`), {
        date: document.getElementById('t-date').value, 
        symbol: document.getElementById('t-symbol').value.toUpperCase(), 
        type: document.getElementById('t-type').value, 
        size: parseFloat(document.getElementById('t-size').value) || 0,
        entry: parseFloat(document.getElementById('t-entry').value), 
        sl: parseFloat(document.getElementById('t-sl').value), 
        tp: parseFloat(document.getElementById('t-tp').value), 
        exit: parseFloat(document.getElementById('t-exit').value),
        fees: parseFloat(document.getElementById('t-fees').value) || 0,
        pnl: finalPnL, 
        notes: document.getElementById('t-notes').value, 
        confidence: document.getElementById('t-conf').value, 
        image: imgUrl, // Αποθηκεύουμε URL πλέον
        createdAt: Date.now()
    });
    
    document.getElementById('trade-form').reset(); 
    document.getElementById('conf-val').textContent = '5'; 
    document.getElementById('file-name-display').textContent = 'Upload Screenshot';
    document.getElementById('t-net-pnl').className = "w-full rounded-lg bg-gray-900 border border-gray-600 text-white p-2.5 font-mono cursor-not-allowed text-center font-bold text-lg";
    
    btn.disabled = false; btn.textContent = "Add Trade";
});

// Render Trade List
function renderTrades(trades) {
    const l = document.getElementById('trade-list'); 
    l.innerHTML = '';
    
    trades.forEach(t => {
        const tr = document.createElement('tr'); 
        tr.className = "border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition";
        
        let rrStr = "-"; 
        if (t.entry && t.sl && t.tp && t.type !== 'Withdrawal') {
            const risk = Math.abs(t.entry - t.sl); 
            const reward = Math.abs(t.tp - t.entry); 
            if (risk > 0) rrStr = (reward / risk).toFixed(1) + ":1";
        }

        if (t.type === 'Withdrawal') {
             tr.innerHTML = `
                <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">${t.date}</td>
                <td class="px-6 py-4 text-sm font-bold text-green-500 uppercase tracking-widest">PAYOUT</td>
                <td class="px-6 py-4 text-sm text-right text-gray-500">-</td>
                <td class="px-6 py-4 text-sm text-right font-bold text-gray-500">${t.pnl.toFixed(2)}</td>
                <td class="px-6 py-4 text-sm text-right"><button onclick="window.deleteTrade('${t.id}')" class="text-gray-400 hover:text-red-500 transition">✕</button></td>`;
        } else {
            tr.innerHTML = `
                <td class="px-6 py-4 text-sm text-gray-900 dark:text-white whitespace-nowrap">${t.date}</td>
                <td class="px-6 py-4 text-sm font-bold text-gray-700 dark:text-gray-200">${t.symbol} <span class="text-xs font-normal text-gray-500">(${t.type})</span></td>
                <td class="px-6 py-4 text-sm text-right font-mono text-indigo-500 font-bold">${rrStr}</td>
                <td class="px-6 py-4 text-sm text-right font-bold ${t.pnl >= 0 ? 'text-green-500' : 'text-red-500'}">${t.pnl.toFixed(2)}</td>
                <td class="px-6 py-4 text-sm text-right">
                    <select onchange="window.handleAction(this, '${t.id}')" class="bg-gray-700 border border-gray-600 text-white text-xs rounded-lg block w-full p-1.5 outline-none cursor-pointer">
                        <option value="action" disabled selected>•••</option>
                        <option value="view" class="bg-gray-700 text-white">📂 View</option>
                        <option value="delete" class="bg-gray-700 text-white">✕ Delete</option>
                    </select>
                </td>`;
        }
        l.appendChild(tr);
    });
}

window.handleAction = (el, id) => { 
    if (el.value === 'view') window.viewTrade(id); 
    if (el.value === 'delete') window.deleteTrade(id); 
    el.value = 'action'; 
};

window.deleteTrade = async (id) => {
    if(!confirm("Are you sure?")) return;
    
    // 1. Πρώτα παίρνουμε τα δεδομένα για να βρούμε την εικόνα
    const docRef = doc(db, `users/${currentUserId}/accounts/${currentAccountId}/trades/${id}`);
    const snap = await getDoc(docRef);
    
    if (snap.exists()) {
        const data = snap.data();
        // 2. Αν υπάρχει εικόνα στο Storage, σβήσε την
        if (data.image && data.image.includes('firebasestorage')) {
             try { await deleteObject(ref(storage, data.image)); } catch(e) { console.log(e); }
        }
        // 3. Σβήσε το έγγραφο
        await deleteDoc(docRef);
    }
};

window.viewTrade = async (id) => {
    const docRef = doc(db, `users/${currentUserId}/accounts/${currentAccountId}/trades/${id}`);
    const snap = await getDoc(docRef);
    
    if (snap.exists()) {
        const trade = snap.data();
        let rrString = "-";
        if (trade.sl && trade.entry && trade.tp) {
            const risk = Math.abs(trade.entry - trade.sl);
            const reward = Math.abs(trade.tp - trade.entry);
            if(risk > 0) rrString = (reward / risk).toFixed(1) + ":1";
        }

        const el = document.getElementById('modal-content');
        el.innerHTML = `
            <div class="grid grid-cols-2 gap-4 text-sm mb-4">
                <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl space-y-1">
                    <span class="text-xs text-gray-500 uppercase font-bold">Symbol</span>
                    <p class="text-xl font-bold text-gray-900 dark:text-white">${trade.symbol} <span class="${trade.type === 'Long' ? 'text-green-500' : 'text-red-500'} text-base">(${trade.type})</span></p>
                </div>
                <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl space-y-1">
                    <span class="text-xs text-gray-500 uppercase font-bold">Result PnL</span>
                    <p class="text-xl font-bold ${trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}">${parseFloat(trade.pnl).toFixed(2)}</p>
                </div>
            </div>
            
            <div class="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800 mb-4">
                <div class="grid grid-cols-3 gap-4 text-center mb-3">
                    <div><span class="block text-xs text-gray-500 uppercase font-bold">Entry</span><span class="font-mono font-bold dark:text-white">${trade.entry}</span></div>
                    <div><span class="block text-xs text-red-500 uppercase font-bold">Stop Loss</span><span class="font-mono font-bold dark:text-gray-300">${trade.sl}</span></div>
                    <div><span class="block text-xs text-green-500 uppercase font-bold">Take Profit</span><span class="font-mono font-bold dark:text-gray-300">${trade.tp || '-'}</span></div>
                </div>
            </div>

            <div class="mb-4">
                <span class="block text-xs text-gray-500 uppercase font-bold mb-2">Notes</span>
                <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl text-gray-700 dark:text-gray-300 italic border border-gray-100 dark:border-gray-600">"${trade.notes || 'No notes added.'}"</div>
            </div>

            ${trade.image ? `<div><span class="block text-xs text-gray-500 uppercase font-bold mb-2 mt-4">Screenshot</span><img src="${trade.image}" class="w-full rounded-xl border dark:border-gray-600 shadow-sm"></div>` : ''}
        `;
        document.getElementById('details-modal').classList.remove('hidden');
    }
};

// ==========================================
// 📅 CALENDAR LOGIC
// ==========================================

window.changeMonth = (dir) => {
    calDate.setMonth(calDate.getMonth() + dir);
    renderCalendar();
};

function renderCalendar() {
    if (!currentAccountData) return;

    const year = calDate.getFullYear();
    const month = calDate.getMonth();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    document.getElementById('cal-month-year').textContent = `${monthNames[month]} ${year}`;
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];

    // Prepare Data
    const dailyStats = {};
    const sortedTrades = [...(window.currentTrades || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    let runningBalance = currentAccountData.initialBalance;
    const t1Amt = currentAccountData.initialBalance * (1 + (currentAccountData.targetP1 / 100));
    const t2Amt = currentAccountData.initialBalance * (1 + (currentAccountData.targetP2 / 100));
    let passedP1 = false;
    let passedP2 = false;

    sortedTrades.forEach(t => {
        const d = t.date;
        if (!dailyStats[d]) dailyStats[d] = { pnl: 0, events: [], count: 0 };

        dailyStats[d].pnl += t.pnl;
        runningBalance += t.pnl;

        if (t.type !== 'Withdrawal') dailyStats[d].count++;
        else dailyStats[d].events.push({ label: 'PAYOUT', color: 'text-green-400' });

        if (currentAccountData.type === 'Funded' && !currentAccountData.status.includes('FUNDED')) {
            if (!passedP1 && runningBalance >= t1Amt && currentAccountData.status.includes('Phase 1')) {
                dailyStats[d].events.push({ label: 'PHASE 1 PASS', color: 'text-indigo-400' });
                passedP1 = true;
            }
            if (!passedP2 && runningBalance >= t2Amt && currentAccountData.status.includes('Phase 2')) {
                dailyStats[d].events.push({ label: 'PHASE 2 PASS', color: 'text-indigo-400' });
                passedP2 = true;
            }
        }
    });

    // Render Empty Cells
    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div');
        div.className = "h-24 md:h-32 bg-gray-50 dark:bg-gray-800/50 rounded-lg";
        grid.appendChild(div);
    }

    // Render Days
    for (let day = 1; day <= daysInMonth; day++) {
        const dObj = new Date(year, month, day);
        const dStr = dObj.toLocaleDateString('en-CA');
        const data = dailyStats[dStr] || { pnl: 0, events: [], count: 0 };
        
        const cell = document.createElement('div');
        cell.className = `h-24 md:h-32 border dark:border-gray-700 rounded-lg p-2 flex flex-col justify-between transition hover:bg-gray-50 dark:hover:bg-gray-700/50 ${dStr === todayStr ? 'ring-2 ring-indigo-500' : ''} bg-white dark:bg-gray-800`;
        
        let pnlColor = 'text-gray-400';
        if (data.pnl > 0) pnlColor = 'text-green-500';
        if (data.pnl < 0) pnlColor = 'text-red-500';

        let eventsHtml = '';
        data.events.forEach(ev => {
            eventsHtml += `<div class="text-[9px] md:text-[10px] font-bold ${ev.color} uppercase tracking-tighter border border-gray-600 rounded px-1 mb-0.5 w-fit">${ev.label}</div>`;
        });

        cell.innerHTML = `
            <div class="text-xs text-gray-500 font-bold">${day}</div>
            <div class="flex-grow flex flex-col justify-center items-center">
                ${data.count > 0 || data.pnl !== 0 ? `
                    <div class="${pnlColor} font-bold text-sm md:text-lg tracking-tight">
                        ${data.pnl > 0 ? '+' : ''}${data.pnl.toFixed(2)}
                    </div>
                    <div class="text-[10px] text-gray-500">${data.count} Trades</div>
                ` : ''}
            </div>
            <div class="flex flex-col gap-0.5">${eventsHtml}</div>
        `;
        grid.appendChild(cell);
    }
}

// ==========================================
// 🛠️ UTILITIES & SETTINGS
// ==========================================

window.switchTab = (t) => {
    ['dashboard', 'accounts', 'profile', 'calendar'].forEach(i => document.getElementById(`tab-${i}`).classList.add('hidden'));
    document.getElementById(`tab-${t}`).classList.remove('hidden');
    document.getElementById('dropdown-content').classList.add('hidden-menu');
    document.getElementById('dropdown-content').classList.remove('visible-menu');
    
    if (t === 'calendar' && currentAccountData) renderCalendar();
};

// Dropdown Logic
const mb = document.getElementById('menu-btn');
const dc = document.getElementById('dropdown-content');
mb.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dc.classList.contains('visible-menu')) {
        dc.classList.remove('visible-menu');
        dc.classList.add('hidden-menu');
    } else {
        dc.classList.remove('hidden-menu');
        dc.classList.add('visible-menu');
    }
});
document.addEventListener('click', () => {
    dc.classList.remove('visible-menu');
    dc.classList.add('hidden-menu');
});

document.getElementById('theme-toggle').addEventListener('click', () => document.documentElement.classList.toggle('dark'));

document.getElementById('t-img').addEventListener('change', function() {
    document.getElementById('file-name-display').textContent = this.files[0] ? this.files[0].name : "Upload Screenshot";
});

const sl = document.getElementById('t-conf');
const out = document.getElementById('conf-val');
sl.oninput = function() { out.innerHTML = this.value; };

document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = Array.from(document.querySelectorAll('.market-chk:checked')).map(c => c.value);
    const s = Array.from(document.querySelectorAll('.strat-chk:checked')).map(c => c.value);
    await updateDoc(doc(db, "users", currentUserId), {
        firstName: document.getElementById('prof-fname').value,
        lastName: document.getElementById('prof-lname').value,
        dob: document.getElementById('prof-dob').value,
        bio: document.getElementById('prof-bio').value,
        experience: document.getElementById('prof-exp').value,
        markets: m, strategies: s
    });
    alert("Profile Saved!");
});

document.getElementById('chart-zoom-level').addEventListener('change', () => {
    if (currentAccountId) setupTradeListener(currentAccountId);
});
// Αντικατάστησε το υπάρχον theme toggle listener με αυτό:
const themeToggleBtn = document.getElementById('theme-toggle');
if (localStorage.getItem('theme') === 'light') {
    document.documentElement.classList.remove('dark');
}

themeToggleBtn.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    if (document.documentElement.classList.contains('dark')) {
        localStorage.setItem('theme', 'dark');
    } else {
        localStorage.setItem('theme', 'light');
    }
});
// ==========================================
// 🔍 FILTERING LOGIC (NEW FEATURE)
// ==========================================

window.applyFilters = () => {
    const sym = document.getElementById('filter-symbol').value;
    const side = document.getElementById('filter-side').value;
    const res = document.getElementById('filter-result').value;

    // Φιλτράρισμα από το global array window.currentTrades
    let filtered = window.currentTrades.filter(t => {
        if (t.type === 'Withdrawal') return true; // Πάντα δείχνουμε τις αναλήψεις ή φτιάξε δικό σου logic
        
        const matchSym = sym === 'ALL' || t.symbol === sym;
        const matchSide = side === 'ALL' || t.type === side;
        let matchRes = true;
        
        if (res === 'Win') matchRes = t.pnl > 0;
        if (res === 'Loss') matchRes = t.pnl <= 0;
        
        return matchSym && matchSide && matchRes;
    });

    // Ξαναζωγράφισε τον πίνακα με τα φιλτραρισμένα
    renderTrades([...filtered].reverse()); // Reverse για να δείχνει τα νέα πρώτα
    
    // Προαιρετικά: Θα μπορούσες να καλείς και την calcMetrics(filtered) 
    // αν θέλεις τα στατιστικά (Winrate/PnL) να αλλάζουν βάσει φίλτρων!
    // calcMetrics(filtered); <--- Ξε-σχολίασε αυτό αν θες δυναμικά στατιστικά
};

// Αυτή η συνάρτηση πρέπει να καλείται μέσα στην setupTradeListener
// για να γεμίζει το Dropdown των συμβόλων όταν φορτώνονται τα trades.
function updateSymbolFilterOptions(trades) {
    const select = document.getElementById('filter-symbol');
    const currentVal = select.value;
    const symbols = [...new Set(trades.filter(t => t.type !== 'Withdrawal').map(t => t.symbol))].sort();
    
    select.innerHTML = '<option value="ALL">All Symbols</option>';
    symbols.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        select.appendChild(opt);
    });
    select.value = currentVal; // Διατήρηση επιλογής αν γίνει refresh
}