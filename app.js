import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, deleteUser, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, setDoc, doc, getDoc, updateDoc, deleteDoc, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// === FIREBASE CONFIG ===
const firebaseConfig = {
    apiKey: "AIzaSyDLqWiGvAMwzjhAZCfrqMVQz2_4F4s7nAc",
    authDomain: "trading-journal-db-eb6e1.firebaseapp.com",
    projectId: "trading-journal-db-eb6e1",
    storageBucket: "trading-journal-db-eb6e1.firebasestorage.app",
    messagingSenderId: "672967817566",
    appId: "1:672967817566:web:10c873bf5726f3424cf7cf"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// 🌍 GLOBAL VARIABLES & STATE
// ==========================================
window.auth = auth;

let symbolChartInstance = null;
let currentUserId = null;
let currentAccountId = null;
let currentAccountData = null;
let tradeUnsubscribe = null;
let chartInstance = null;
let latestBalance = 0;
let wizMarketType = '';
let wizAccountType = 'Live';
let dayChartInstance = null;
let hourChartInstance = null;

// Calendar Variables
let calDate = new Date();
window.currentTrades = []; 

// Helpers
const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
    });
};

const getFriendlyErrorMessage = (errorCode) => {
    switch(errorCode) {
        case 'auth/invalid-credential': return "Invalid email or password.";
        case 'auth/user-not-found': return "No user found with this email.";
        case 'auth/wrong-password': return "Incorrect password.";
        case 'auth/email-already-in-use': return "Email is already in use.";
        case 'auth/weak-password': return "Password must be at least 6 characters.";
        case 'auth/invalid-email': return "Invalid email format.";
        case 'auth/too-many-requests': return "Too many failed attempts. Please try again later.";
        default: return "An error occurred. Please try again.";
    }
};

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

// Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
        loginError.textContent = getFriendlyErrorMessage(err.code);
        loginError.classList.remove('hidden');
    }
});

// Register
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
        regError.textContent = getFriendlyErrorMessage(err.code);
        regError.classList.remove('hidden');
    }
});

// Forgot Password
forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value;
    
    try {
        await sendPasswordResetEmail(auth, email);
        forgotMsg.textContent = "Reset link sent!";
        forgotMsg.className = "text-center text-sm font-bold text-green-500 p-2";
        forgotMsg.classList.remove('hidden');
    } catch (err) {
        forgotMsg.textContent = getFriendlyErrorMessage(err.code);
        forgotMsg.className = "text-center text-sm font-bold text-red-500 p-2";
        forgotMsg.classList.remove('hidden');
    }
});

// Auth State Listener
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
            
            // Markets no longer exist in profile logic
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
// 🧙‍♂️ WIZARDS
// ==========================================

// Persona Wizard Navigation (3 Steps)
window.nextPersonaStep = (s) => {
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById(`p-step-${i}`);
        if(el) el.classList.add('hidden-step');
    }
    const current = document.getElementById(`p-step-${s}`);
    if(current) current.classList.remove('hidden-step');

    for (let i = 2; i <= s; i++) {
        const prog = document.getElementById(`prog-${i}`);
        if(prog) prog.classList.add('bg-indigo-600');
    }
};

document.getElementById('persona-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const exp = document.querySelector('input[name="exp"]:checked')?.value;
    const strategies = Array.from(document.querySelectorAll('.s-chk:checked')).map(c => c.value);
    let reason = document.querySelector('input[name="why"]:checked')?.value;
    
    if (reason === 'other') reason = document.getElementById('why-other-text').value;

    await updateDoc(doc(db, "users", currentUserId), {
        experience: exp,
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
    wizMarketType = 'Forex'; 
    window.setWizType('Live');
};

window.closeAccountWizard = () => {
    document.getElementById('account-wizard').classList.add('hidden');
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
        marketType: 'Forex',
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

    const savedId = localStorage.getItem('lastAccountId');
    if (savedId && s.docs.find(d => d.id === savedId)) {
        window.selectAccount(savedId);
    } else if (!currentAccountId && s.docs.length > 0) {
        window.selectAccount(s.docs[0].id);
    }
}

// app.js: ~ γραμμή 466

async function updateSettingsAccountsList() {
    // Χρησιμοποιούμε την ίδια λογική με την loadAccountsList, αλλά στο νέο container
    const q = query(collection(db, `users/${currentUserId}/accounts`), orderBy('createdAt', 'desc'));
    const s = await getDocs(q);
    const l = document.getElementById('settings-accounts-list');
    
    // Αφαιρούμε το κουμπί 'Add New Account' προσωρινά
    l.innerHTML = ''; 

    if (s.empty) {
        l.innerHTML = '<p class="text-center text-gray-500 italic py-8">No accounts found. Start by adding one!</p>';
    }
    
    s.forEach(d => {
        const a = d.data();
        const div = document.createElement('div');
        div.className = "bg-gray-50 dark:bg-gray-700 p-4 rounded-xl shadow flex justify-between items-center border border-gray-100 dark:border-gray-600";
        div.innerHTML = `
            <div>
                <h4 class="font-bold dark:text-white text-md">${a.name} <span class="text-xs text-indigo-500">(${d.id === currentAccountId ? 'Active' : 'Inactive'})</span></h4>
                <p class="text-xs text-gray-500">${a.marketType} • ${a.type}</p>
            </div>
            <div class="flex gap-2">
                <button onclick="window.selectAccount('${d.id}')" class="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm font-bold hover:bg-indigo-700">Switch</button>
                <button onclick="window.deleteAccount('${d.id}')" class="text-red-500 px-3 py-1.5 text-sm">Delete</button>
            </div>`;
        l.appendChild(div);
    });
    
    // Επανατοποθετούμε το κουμπί
    l.innerHTML += '<div class="flex justify-center py-4"><button onclick="window.openAccountWizard()" class="bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-indigo-700 shadow-lg transition flex items-center"><svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>Add New Account</button></div>';
}

window.selectAccount = async (id) => {
    if (tradeUnsubscribe) {
        tradeUnsubscribe();
        tradeUnsubscribe = null;
    }

    currentAccountId = id;
    localStorage.setItem('lastAccountId', id);

    const snap = await getDoc(doc(db, `users/${currentUserId}/accounts/${id}`));

    if (snap.exists()) {
        currentAccountData = snap.data();

        document.getElementById('menu-current-acc').textContent = currentAccountData.name;
        document.getElementById('dash-acc-name').textContent = currentAccountData.name;
        document.getElementById('dash-prop-name').textContent = currentAccountData.type === 'Funded' ? currentAccountData.propFirm : 'Live';
        document.getElementById('dashboard-content').classList.remove('hidden');

        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }

        if (currentAccountData.type === 'Funded') {
            document.getElementById('funded-stats-container').classList.remove('hidden');
            
            const initBal = currentAccountData.initialBalance;
            const maxDDVal = initBal * (currentAccountData.totalDD / 100);
            const dailyDDVal = initBal * (currentAccountData.dailyDD / 100);
            
            document.getElementById('mdd-val').textContent = `$${maxDDVal.toFixed(0)}`;
            document.getElementById('ddd-val').textContent = `$${dailyDDVal.toFixed(0)}`;
            
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
        setupTradeListener(id);
    }
};

window.deleteAccount = async (id) => {
    if (!confirm("DELETE ACCOUNT & ALL TRADES? Irreversible.")) return;
    
    const tradesRef = collection(db, `users/${currentUserId}/accounts/${id}/trades`);
    const snap = await getDocs(tradesRef);
    const deletions = snap.docs.map(docSnap => deleteDoc(docSnap.ref)); 
    
    await Promise.all(deletions);
    await deleteDoc(doc(db, `users/${currentUserId}/accounts/${id}`));
    
    if (currentAccountId === id) {
        currentAccountId = null;
        document.getElementById('dashboard-content').classList.add('hidden');
    }
    loadAccountsList();
};

// ==========================================
// 📈 TRADE LISTENER & METRICS
// ==========================================

function setupTradeListener(accId) {
    if (tradeUnsubscribe) tradeUnsubscribe();
    
    const q = query(collection(db, `users/${currentUserId}/accounts/${accId}/trades`), orderBy('date', 'asc'));
    
    tradeUnsubscribe = onSnapshot(q, (s) => {
        let trades = s.docs.map(d => ({ id: d.id, ...d.data() }));
        
        trades.sort((a, b) => {
            const timeA = a.time ? a.time : '00:00';
            const timeB = b.time ? b.time : '00:00';
            const dateA = new Date(`${a.date}T${timeA}`);
            const dateB = new Date(`${b.date}T${timeB}`);
            return dateA - dateB;
        });

        window.currentTrades = trades;
        updateSymbolFilterOptions(trades);
        
        // Στον πίνακα τα δείχνουμε ανάποδα (το πιο πρόσφατο πάνω), 
        // αλλά στο γράφημα (calcMetrics) πάνε με τη σωστή χρονική σειρά.
        renderTrades([...trades].reverse());
        calcMetrics(trades);
        
        if (!document.getElementById('tab-calendar').classList.contains('hidden')) {
            renderCalendar();
        }
    });
}

async function calcMetrics(trades, isFilterMode = false) {
    // 1. ΔΕΔΟΜΕΝΑ ΛΟΓΑΡΙΑΣΜΟΥ (Real Balance)
    const allTrades = window.currentTrades || [];
    const initBal = currentAccountData.initialBalance;
    const offset = currentAccountData.pnlOffset || 0;
    
    let totalForBalance = 0; // PnL + Fees (Για το Balance)
    let totalProfitsOnly = 0; // Μόνο PnL (Για Phase Targets αν χρειαστεί)
    
    allTrades.forEach(t => {
        const tFees = t.fees || 0;
        totalForBalance += (t.pnl + tFees); // Το Balance περιέχει τα πάντα
        totalProfitsOnly += t.pnl;          // Τα Profits είναι καθαρά
    });

    const realActiveBal = initBal + totalForBalance - offset;
    let realPhaseProfit = totalForBalance - offset; // Στα funded συνήθως μετράει το Equity (PnL+Fees)
    
    latestBalance = realActiveBal;

    // 2. ΔΕΔΟΜΕΝΑ ΠΡΟΒΟΛΗΣ
    let viewProfits = 0;   // ΜΟΝΟ ΤΟ PNL
    let viewFeesSum = 0;   // ΜΟΝΟ ΤΑ FEES
    let wins = 0;
    
    const labels = ['Start'];
    const data = [initBal];
    const dailyPnLMap = {};

    trades.forEach(t => {
        const tFees = t.fees || 0;
        const tPnL = t.pnl; 
        const tEquityChange = tPnL + tFees; // Αυτό πάει στο γράφημα Balance

        viewProfits += tPnL;      // <--- ΕΔΩ: Αθροίζουμε μόνο το PnL
        viewFeesSum += tFees;

        if (t.type !== 'Withdrawal' && tPnL > 0) wins++; 

        // Το γράφημα δείχνει την πορεία του Balance
        if (!dailyPnLMap[t.date]) dailyPnLMap[t.date] = 0;
        dailyPnLMap[t.date] += tEquityChange;
    });

    // Γράφημα
    let runningBal = initBal;
    const sortedDates = Object.keys(dailyPnLMap).sort((a, b) => new Date(a) - new Date(b));
    sortedDates.forEach(date => {
        runningBal += dailyPnLMap[date];
        labels.push(date);
        data.push(runningBal);
    });
    
    // 3. ΕΝΗΜΕΡΩΣΗ UI
    document.getElementById('metric-balance').textContent = `$${realActiveBal.toFixed(2)}`;

    // PROFITS DISPLAY: Δείχνουμε ΚΑΘΑΡΟ PnL (χωρίς fees)
    // Αν θες στα Funded να βλέπεις το Equity (μαζί με fees) για τον στόχο, άσε το realPhaseProfit.
    // Αν θες να βλέπεις ΠΑΝΤΑ μόνο το Trade PnL, βάλε: const displayVal = viewProfits;
    const displayVal = (currentAccountData.type === 'Funded' && !isFilterMode && !currentAccountData.status.includes('FUNDED')) 
                        ? realPhaseProfit 
                        : viewProfits;

    const pnlElem = document.getElementById('metric-pnl');
    pnlElem.textContent = `$${displayVal.toFixed(2)}`;
    pnlElem.className = `text-2xl font-extrabold mt-1 ${displayVal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    
    // FEES DISPLAY
    if(document.getElementById('metric-fees')) {
    // Τα fees είναι έξοδα, άρα συνήθως αρνητικά (π.χ. -4.13)
    // Αν είναι αρνητικά, τα δείχνουμε κόκκινα. Αν είναι θετικά (rebate), πράσινα.
    const isPositiveFee = viewFeesSum > 0; 
    const feeColor = isPositiveFee ? 'text-emerald-400' : 'text-rose-400';
    
    // Το viewFeesSum περιέχει ήδη το πρόσημο (-) αν είναι αρνητικό
    // Προσθέτουμε το (+) μόνο αν είναι πάνω από μηδέν
    const sign = isPositiveFee ? '+' : '';
    
    document.getElementById('metric-fees').textContent = `${sign}${viewFeesSum.toFixed(2)}`;
    document.getElementById('metric-fees').className = `text-2xl font-extrabold mt-1 ${feeColor}`;
    }
    const tradeOnly = trades.filter(t => t.type !== 'Withdrawal');
    document.getElementById('metric-trades').textContent = tradeOnly.length;
    document.getElementById('metric-winrate').textContent = tradeOnly.length ? ((wins/tradeOnly.length)*100).toFixed(0)+'%' : '0%';

    // 4. STATUS CHECK (Funded)
    if (currentAccountData.type === 'Funded') {
        // ... (Status Logic remains as is, using Balance/Equity) ...
        updateFundedUI(realActiveBal, realPhaseProfit, allTrades, initBal);
    }

    updateChart(document.getElementById('growthChart').getContext('2d'), labels, data, document.documentElement.classList.contains('dark'));
    updateAnalysisCharts(trades);
}

// Βοηθητική για να μην γεμίζουμε την calcMetrics (αν δεν την έχεις, βάλε τον κώδικα status check μέσα στην calcMetrics όπως ήταν πριν)
function updateFundedUI(bal, profit, trades, init, off) {
   // Επανάφερε τη λογική ελέγχου Status που είχες, χρησιμοποιώντας το 'bal' (που είναι το Net Balance)
   // ... (ο κώδικας ελέγχου status παραμένει ως είχε στο προηγούμενο βήμα)
}

// ==========================================
// 📉 CHART CONFIG
// ==========================================

function updateChart(ctx, labels, data, isDark) {
    const chartCanvas = document.getElementById('growthChart');
    if (!chartCanvas) return;
    
    const timeData = labels.map((dateStr, index) => ({
        x: new Date(dateStr), // Μετατροπή σε Date object που περιέχει ΚΑΙ την ώρα
        y: data[index]
    }));

    // Προσθήκη του "Τώρα"
    if (timeData.length > 0) {
        const lastBalance = timeData[timeData.length - 1].y;
        timeData.push({
            x: new Date(), 
            y: lastBalance 
        });
    }

    const context = chartCanvas.getContext('2d');
    const zoomLvl = 0.1;
    
    const allValues = timeData.map(p => p.y);
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const padding = (maxVal - minVal) * zoomLvl || (maxVal * 0.05);

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    chartInstance = new Chart(context, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Balance',
                data: timeData, 
                borderColor: '#4f46e5',
                backgroundColor: 'rgba(79,70,229,0.1)',
                borderWidth: 2,
                fill: true,
                stepped: true, // Σκαλοπάτια
                pointRadius: (ctx) => {
                    const index = ctx.dataIndex;
                    const data = ctx.dataset.data;

                    if (index === data.length - 1) return 3;

                    if (data[index + 1] && data[index].x.getTime() === data[index + 1].x.getTime()) {
                        return 0;
                    }
                    return 3; 
                },
                pointHoverRadius: 6,
                tension: 0 
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (context) => {
                            const date = new Date(context[0].parsed.x);
                            // ΑΛΛΑΓΗ: Εμφανίζουμε και την ώρα στο Tooltip
                            return date.toLocaleDateString('en-US', { 
                                month: 'short', day: 'numeric', year: 'numeric', 
                                hour: '2-digit', minute:'2-digit' 
                            });
                        },
                        label: (context) => {
                            if (context.dataIndex === context.dataset.data.length - 1) {
                                return `Current: $${context.parsed.y.toFixed(2)}`;
                            }
                            return `Balance: $${context.parsed.y.toFixed(2)}`;
                        }
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        // ΑΛΛΑΓΗ: Αφαιρέσαμε το unit: 'day' για να διαλέγει μόνο του (μέρα ή ώρα)
                        // ή μπορούμε να βάλουμε minUnit: 'minute' αν θέλουμε πολλή λεπτομέρεια
                        tooltipFormat: 'MMM dd, HH:mm',
                        displayFormats: {
                            hour: 'MMM dd HH:mm', // Πώς φαίνεται όταν κάνεις zoom
                            day: 'MMM dd'
                        }
                    },
                    grid: {
                        color: isDark ? '#374151' : '#e5e7eb',
                        display: false 
                    },
                    ticks: {
                        color: isDark ? '#9ca3af' : '#4b5563',
                        maxRotation: 0,
                        autoSkip: true
                    }
                },
                y: {
                    suggestedMin: minVal - padding,
                    suggestedMax: maxVal + padding,
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

// Calculator
document.querySelectorAll('.calc-trigger').forEach(el => el.addEventListener('input', calculateMath));

function calculateMath() {
    const entry = parseFloat(document.getElementById('t-entry').value) || 0;
    const sl = parseFloat(document.getElementById('t-sl').value) || 0;
    const tp = parseFloat(document.getElementById('t-tp').value) || 0;
    
    if (entry && sl) {
        const riskDist = Math.abs(entry - sl);
        document.getElementById('disp-risk-pips').textContent = `Risk: ${(riskDist * 10000).toFixed(1)} pips`;

        if (tp) {
            const rewardDist = Math.abs(tp - entry);
            const rr = riskDist > 0 ? (rewardDist / riskDist) : 0;
            // ΑΛΛΑΓΗ: Ενημερώνουμε το value του input
            document.getElementById('t-rr').value = rr.toFixed(1);
        }
    }
}

// Add/Edit Trade
document.getElementById('trade-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('add-trade-btn'); 
    btn.disabled = true; 
    btn.textContent = "Processing...";

    const editId = document.getElementById('edit-trade-id').value;

    if (currentAccountData.status && currentAccountData.status.includes('CANCELLED')) {
        alert("⛔ ACCOUNT CANCELLED. You cannot place new trades."); 
        btn.disabled = false; btn.textContent = editId ? "Update Trade" : "Add Trade"; 
        return;
    }

    const file = document.getElementById('t-img').files[0];
    let imgBase64 = null;

    if (file) {
        if (file.size > 800 * 1024) { 
            alert("Image too large! Please upload images smaller than 800KB.");
            btn.disabled = false; btn.textContent = editId ? "Update Trade" : "Add Trade"; 
            return;
        }
        try {
            imgBase64 = await convertToBase64(file);
        } catch(err) { 
            alert("Image Error: " + err.message); 
            btn.disabled = false; 
            return; 
        }
    }

    const tradeData = {
        date: document.getElementById('t-date').value, 
        time: document.getElementById('t-time').value,
        symbol: document.getElementById('t-symbol').value.toUpperCase(), 
        type: document.getElementById('t-type').value,
        size: parseFloat(document.getElementById('t-size').value) || 0, 
        entry: parseFloat(document.getElementById('t-entry').value),
        sl: parseFloat(document.getElementById('t-sl').value), 
        tp: parseFloat(document.getElementById('t-tp').value),
        exit: parseFloat(document.getElementById('t-exit').value),
        rr: parseFloat(document.getElementById('t-rr').value) || 0, 
        fees: parseFloat(document.getElementById('t-fees').value) || 0,
        pnl: parseFloat(document.getElementById('t-net-pnl').value) || 0, 
        notes: document.getElementById('t-notes').value,
        confidence: document.getElementById('t-conf').value, 
        mistake: (document.getElementById('t-mistake').value === 'Other' 
                 ? document.getElementById('t-mistake-other-text').value 
                 : document.getElementById('t-mistake').value),
    };

    if (imgBase64) tradeData.image = imgBase64;

    try {
        if (editId) {
            await updateDoc(doc(db, `users/${currentUserId}/accounts/${currentAccountId}/trades/${editId}`), tradeData);
            alert("Trade Updated!");
        } else {
            tradeData.createdAt = Date.now();
            await addDoc(collection(db, `users/${currentUserId}/accounts/${currentAccountId}/trades`), tradeData);
        }
        window.resetForm();
    } catch (error) { 
        console.error("Error saving trade:", error); 
        alert("Error saving trade: " + error.message); 
    }
    btn.disabled = false;
});

window.resetForm = () => {
    document.getElementById('trade-form').reset();
    document.getElementById('edit-trade-id').value = ""; 
    document.getElementById('add-trade-btn').textContent = "Add Trade";
    document.getElementById('cancel-edit-btn').classList.add('hidden');
    
    const pnlInput = document.getElementById('t-net-pnl');
    pnlInput.className = "w-full rounded-lg bg-gray-700 border border-gray-500 text-white p-2.5 font-mono text-center font-bold text-lg focus:ring-2 focus:ring-indigo-500 outline-none";
    
    document.getElementById('file-name-display').textContent = 'Upload Screenshot';
    document.getElementById('conf-val').textContent = "5"; 
};

// Render Trades
function renderTrades(trades) {
    const l = document.getElementById('trade-list'); 
    l.innerHTML = '';
    
    trades.forEach(t => {
        const tr = document.createElement('tr'); 
        tr.className = "border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition relative"; // Πρόσθεσα relative
        
        // ... (Ο κώδικας για το rrStr και το Withdrawal μένει ίδιος μέχρι το else) ...
        let rrStr = "-"; 
        if (t.entry && t.sl && t.tp && t.type !== 'Withdrawal') {
            const risk = Math.abs(t.entry - t.sl); 
            const reward = Math.abs(t.tp - t.entry); 
            if (risk > 0) rrStr = (reward / risk).toFixed(1) + ":1";
        }

        if (t.type === 'Withdrawal') {
             tr.innerHTML = `...`; // (Κράτησε το ίδιο HTML για το withdrawal που είχες)
        } else {
            tr.innerHTML = `
                <td class="px-6 py-4 text-sm text-gray-900 dark:text-white whitespace-nowrap">${t.date}</td>
                <td class="px-6 py-4 text-sm font-bold text-gray-700 dark:text-gray-200">${t.symbol} <span class="text-xs font-normal text-gray-500">(${t.type})</span></td>
                <td class="px-6 py-4 text-sm text-right font-mono text-indigo-500 font-bold">${rrStr}</td>
                <td class="px-6 py-4 text-sm text-right font-bold ${t.pnl >= 0 ? 'text-green-500' : 'text-red-500'}">
                    ${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                </td>
                <td class="px-6 py-4 text-sm text-right relative">
                    <button onclick="window.toggleRowMenu('${t.id}')" class="text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-white p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
                    </button>
                    <div id="menu-${t.id}" class="hidden absolute right-10 top-2 z-50 w-36 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden text-left">
                        <button onclick="window.viewTrade('${t.id}')" class="block w-full text-left px-4 py-3 text-xs font-bold text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 flex items-center">
                            📂 View
                        </button>
                        <button onclick="window.editTrade('${t.id}')" class="block w-full text-left px-4 py-3 text-xs font-bold text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 flex items-center">
                            ✏️ Edit
                        </button>
                        <button onclick="window.deleteTrade('${t.id}')" class="block w-full text-left px-4 py-3 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center">
                            ✕ Delete
                        </button>
                    </div>
                </td>`;
        }
        l.appendChild(tr);
    });
}

window.handleAction = (el, id) => { 
    if (el.value === 'view') window.viewTrade(id); 
    if (el.value === 'edit') window.editTrade(id); 
    if (el.value === 'delete') window.deleteTrade(id); 
    el.value = 'action'; 
};

window.deleteTrade = async (id) => {
    if(!confirm("Are you sure?")) return;
    const docRef = doc(db, `users/${currentUserId}/accounts/${currentAccountId}/trades/${id}`);
    await deleteDoc(docRef); 
};

// ==========================================
// 📅 CALENDAR
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

    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div');
        div.className = "h-24 md:h-32 bg-gray-50 dark:bg-gray-800/50 rounded-lg";
        grid.appendChild(div);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dObj = new Date(year, month, day);
        const dStr = dObj.toLocaleDateString('en-CA');
        const data = dailyStats[dStr] || { pnl: 0, events: [], count: 0 };
        
        const cell = document.createElement('div');
        cell.className = `h-24 md:h-32 border dark:border-gray-700 rounded-lg p-2 flex flex-col justify-between transition hover:bg-gray-50 dark:hover:bg-gray-700/50 ${dStr === todayStr ? 'ring-2 ring-indigo-500' : ''} bg-white dark:bg-gray-800 cursor-pointer relative overflow-hidden group`;
        cell.onclick = () => window.openDayDetails(dStr);

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
// 🛠️ UTILITIES
// ==========================================

window.switchTab = (t) => {
    ['dashboard', 'accounts', 'settings', 'calendar'].forEach(i => document.getElementById(`tab-${i}`).classList.add('hidden'));
    document.getElementById(`tab-${t}`).classList.remove('hidden');
    document.getElementById('dropdown-content').classList.add('hidden');
    
    if (t === 'calendar' && currentAccountData) renderCalendar();
    
    // Εάν μεταβαίνουμε στις ρυθμίσεις, εμφανίζουμε by default το "Profile"
    if (t === 'settings') {
        window.showSettingsSection('settings-profile');
        // Επίσης, φορτώνουμε τη λίστα των λογαριασμών για το settings-accounts tab
        updateSettingsAccountsList();
    }
};

const fileInput = document.getElementById('t-img');
if (fileInput) {  // <--- ΑΥΤΗ Η ΓΡΑΜΜΗ ΣΩΖΕΙ ΤΟ ΚΡΑΣΑΡΙΣΜΑ
    fileInput.addEventListener('change', function() {
        const display = document.getElementById('file-name-display');
        if (display) {
            display.textContent = this.files[0] ? this.files[0].name : "Upload Screenshot";
        }
    });
}

const sl = document.getElementById('t-conf');
const out = document.getElementById('conf-val');
sl.oninput = function() { out.innerHTML = this.value; };

// app.js: Νέος Listener για Personal Info (settings-profile)
document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, "users", currentUserId), {
        firstName: document.getElementById('prof-fname').value,
        lastName: document.getElementById('prof-lname').value,
        dob: document.getElementById('prof-dob').value,
        bio: document.getElementById('prof-bio').value,
    });
    alert("Profile Saved!");
});

// app.js: Νέος Listener για Trader DNA (settings-dna)
document.getElementById('dna-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const strategies = Array.from(document.querySelectorAll('.strat-chk:checked')).map(c => c.value);
    await updateDoc(doc(db, "users", currentUserId), {
        experience: document.getElementById('prof-exp').value,
        strategies
    });
    alert("Trader DNA Saved!");
});

// Listener για το κουμπί αλλαγής κωδικού (Τώρα βρίσκεται στο Settings -> Security)
document.getElementById('prof-reset-pass').addEventListener('click', async () => {
    if (!auth.currentUser.email) return;
    try {
        await sendPasswordResetEmail(auth, auth.currentUser.email);
        alert("Password reset link sent to your email!");
    } catch (e) {
        alert("Error sending reset link: " + e.message);
    }
});

// Filtering
window.applyFilters = () => {
    const sym = document.getElementById('filter-symbol').value;
    const side = document.getElementById('filter-side').value;
    const res = document.getElementById('filter-result').value;

    let filtered = window.currentTrades.filter(t => {
        if (t.type === 'Withdrawal') return true; 
        
        const matchSym = sym === 'ALL' || t.symbol === sym;
        const matchSide = side === 'ALL' || t.type === side;
        let matchRes = true;
        
        if (res === 'Win') matchRes = t.pnl > 0;
        if (res === 'Loss') matchRes = t.pnl <= 0;
        
        return matchSym && matchSide && matchRes;
    });

    renderTrades([...filtered].reverse());
    calcMetrics(filtered, true);
};

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
    select.value = currentVal;
}

// UI & Theme
window.toggleMobileTradeForm = () => {
    const container = document.getElementById('trade-form-container');
    const icon = document.getElementById('trade-form-toggle-icon'); 
    
    // Έλεγχος αν υπάρχουν τα στοιχεία
    if (!container) {
        console.error("Δεν βρέθηκε το trade-form-container");
        return;
    }

    const isHidden = container.classList.toggle('hidden');
    
    // Αν υπάρχει το εικονίδιο, το περιστρέφουμε
    if (icon) {
        if (isHidden) {
            icon.classList.remove('rotate-180');
        } else {
            icon.classList.add('rotate-180');
        }
    }
};

window.toggleTheme = (e) => {
    if(e) e.stopPropagation(); 
    document.documentElement.classList.toggle('dark');
    
    if (document.documentElement.classList.contains('dark')) {
        localStorage.setItem('theme', 'dark');
    } else {
        localStorage.setItem('theme', 'light');
    }
    if (window.currentTrades && window.currentTrades.length > 0 && currentAccountData) {
        // Ξανατρέχουμε την calcMetrics (η οποία καλεί την updateAnalysisCharts)
        window.applyFilters(); 
    }
};

if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
} else {
    document.documentElement.classList.remove('dark');
}

window.viewTrade = async (id) => {
    const docRef = doc(db, `users/${currentUserId}/accounts/${currentAccountId}/trades/${id}`);
    const snap = await getDoc(docRef);
    
    if (snap.exists()) {
        const trade = snap.data();

        // Δεν αφαιρούμε fees από το PnL. Τα δείχνουμε χώρια.
        const rawFees = trade.fees || 0;
        const tradePnL = trade.pnl; 

        // Logic Χρωμάτων Fees
        let feeColorClass = 'text-gray-500'; // Αλλάξαμε το όνομα για ασφάλεια
        if (trade.fees > 0) feeColorClass = 'text-green-500'; 
        if (trade.fees < 0) feeColorClass = 'text-red-500';   

        const feeDisplay = `${trade.fees > 0 ? '+' : ''}${trade.fees.toFixed(2)}`;

        // R:R Logic
        let rrString = trade.rr ? parseFloat(trade.rr).toFixed(1) + ":1" : "-";
        if (!trade.rr && trade.sl && trade.entry && trade.tp) {
            const risk = Math.abs(trade.entry - trade.sl);
            const reward = Math.abs(trade.tp - trade.entry);
            if(risk > 0) rrString = (reward / risk).toFixed(1) + ":1";
        }

        const el = document.getElementById('modal-content');
        
        el.innerHTML = `
            <div class="grid grid-cols-2 gap-4 text-sm mb-4">
                <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl space-y-1">
                    <span class="text-xs text-gray-500 uppercase font-bold">Symbol & Type</span>
                    <p class="text-xl font-bold text-gray-900 dark:text-white">${trade.symbol} <span class="${trade.type === 'Long' ? 'text-green-500' : 'text-red-500'} text-base">(${trade.type})</span></p>
                </div>
                <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl space-y-1">
                    <span class="text-xs text-gray-500 uppercase font-bold">Trade Profit (PnL)</span>
                    <p class="text-xl font-bold ${tradePnL >= 0 ? 'text-green-500' : 'text-red-500'}">${tradePnL >= 0 ? '+' : ''}${tradePnL.toFixed(2)}</p>
                </div>
            </div>
            
            <div class="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800 mb-4">
                <div class="grid grid-cols-3 gap-4 text-center mb-3">
                    <div><span class="block text-xs text-gray-500 uppercase font-bold">Date</span><span class="font-mono font-bold dark:text-white text-sm">${trade.date}</span></div>
                    <div><span class="block text-xs text-gray-500 uppercase font-bold">Size</span><span class="font-mono font-bold dark:text-white">${trade.size || 0} Lots</span></div>
                    
                    <div><span class="block text-xs text-gray-500 uppercase font-bold">Fees</span><span class="font-mono font-bold ${feeColor} bg-white dark:bg-gray-800 px-2 py-0.5 rounded shadow-sm">${feeDisplay}</span></div>
                </div>
                
                <div class="grid grid-cols-3 gap-4 text-center border-t border-indigo-200 dark:border-indigo-700 pt-3">
                    <div><span class="block text-xs text-gray-500 uppercase font-bold">Entry</span><span class="font-mono font-bold dark:text-white">${trade.entry}</span></div>
                    <div><span class="block text-xs text-red-500 uppercase font-bold">Stop Loss</span><span class="font-mono font-bold dark:text-gray-300">${trade.sl}</span></div>
                    <div><span class="block text-xs text-green-500 uppercase font-bold">Take Profit</span><span class="font-mono font-bold dark:text-gray-300">${trade.tp || '-'}</span></div>
                </div>
                <div class="grid grid-cols-3 gap-4 text-center border-t border-indigo-200 dark:border-indigo-700 pt-3 mt-3">
                    <div><span class="block text-xs text-gray-500 uppercase font-bold">Exit Price</span><span class="font-mono font-bold dark:text-white">${trade.exit || '-'}</span></div>
                    <div><span class="block text-xs text-gray-500 uppercase font-bold">R:R</span><span class="font-mono font-bold dark:text-white">${rrString}</span></div>
                    <div><span class="block text-xs text-gray-500 uppercase font-bold">Confidence</span><span class="font-bold text-lg dark:text-white">${trade.confidence}/5</span></div>
                </div>
            </div>

            <div class="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-100 dark:border-gray-600">
                <span class="block text-xs text-gray-500 uppercase font-bold mb-2">Psychology / Mistake</span>
                <p class="text-sm font-semibold text-gray-700 dark:text-gray-300">${trade.mistake || 'None (Good Trade)'}</p>
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
window.editTrade = async (id) => {
    const trade = window.currentTrades.find(t => t.id === id);
    if (!trade) return;

    const container = document.getElementById('trade-form-container');
    if (container.classList.contains('hidden')) {
        window.toggleMobileTradeForm();
    }
    
    document.getElementById('edit-trade-id').value = id;
    document.getElementById('t-date').value = trade.date;
    document.getElementById('t-time').value = trade.time || ""; 
    document.getElementById('t-symbol').value = trade.symbol;
    document.getElementById('t-size').value = trade.size;
    document.getElementById('t-type').value = trade.type;
    document.getElementById('t-entry').value = trade.entry;
    document.getElementById('t-sl').value = trade.sl;
    document.getElementById('t-tp').value = trade.tp;
    document.getElementById('t-rr').value = trade.rr || "";
    document.getElementById('t-exit').value = trade.exit;
    document.getElementById('t-fees').value = trade.fees;
    document.getElementById('t-notes').value = trade.notes;
    document.getElementById('t-conf').value = trade.confidence;
    document.getElementById('t-mistake').value = trade.mistake || ""; 

    document.getElementById('add-trade-btn').textContent = "Update Trade";
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
    document.getElementById('conf-val').textContent = trade.confidence;
    
    document.getElementById('t-entry').dispatchEvent(new Event('input'));
    document.getElementById('trade-form').scrollIntoView({ behavior: 'smooth' });
};

// Analysis Charts
function updateAnalysisCharts(trades) {
    // 1. Existing Logic for Days/Hours
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayPnL = [0,0,0,0,0,0,0];
    const hours = Array.from({length: 24}, (_, i) => i + ':00');
    const hourPnL = new Array(24).fill(0);

    // 2. New Logic for Symbol Stats
    const symbolStats = {};

    trades.forEach(t => {
        if (t.type === 'Withdrawal') return;
        
        // Day & Hour Logic
        const d = new Date(t.date).getDay();
        dayPnL[d] += t.pnl;
        if (t.time) {
            const h = parseInt(t.time.split(':')[0]); 
            if (!isNaN(h)) hourPnL[h] += t.pnl;
        }

        // Symbol Logic
        if (!symbolStats[t.symbol]) symbolStats[t.symbol] = { wins: 0, total: 0 };
        symbolStats[t.symbol].total++;
        if (t.pnl > 0) symbolStats[t.symbol].wins++;
    });

    // --- CHART 1: Day Chart (Existing) ---
    const ctxDay = document.getElementById('dayChart');
    if (ctxDay) {
        if (dayChartInstance) dayChartInstance.destroy();
        dayChartInstance = new Chart(ctxDay.getContext('2d'), {
            type: 'bar',
            data: {
                labels: days,
                datasets: [{
                    label: 'PnL ($)',
                    data: dayPnL,
                    backgroundColor: dayPnL.map(v => v >= 0 ? '#10b981' : '#ef4444'),
                    borderRadius: 4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // --- CHART 2: Hour Chart (Existing) ---
    const ctxHour = document.getElementById('hourChart');
    if (ctxHour) {
        if (hourChartInstance) hourChartInstance.destroy();
        hourChartInstance = new Chart(ctxHour.getContext('2d'), {
            type: 'bar',
            data: {
                labels: hours,
                datasets: [{
                    label: 'PnL ($)',
                    data: hourPnL,
                    backgroundColor: hourPnL.map(v => v >= 0 ? '#6366f1' : '#ef4444'),
                    borderRadius: 2
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // --- CHART 3: Symbol Doughnut (NEW) ---
    const ctxSymbol = document.getElementById('symbolChart');
    if (ctxSymbol) {
        const labels = Object.keys(symbolStats);
        const dataTotal = labels.map(s => symbolStats[s].total);
        // Χρώματα για το γράφημα (παλέτα)
        const bgColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

        if (symbolChartInstance) symbolChartInstance.destroy();
        symbolChartInstance = new Chart(ctxSymbol.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: dataTotal,
                    backgroundColor: bgColors,
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%', // Κενό στη μέση
                plugins: {
                    legend: { position: 'right', labels: { usePointStyle: true, color: document.documentElement.classList.contains('dark') ? 'white' : 'black' } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const sym = context.label;
                                const stats = symbolStats[sym];
                                const winRate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(0) : 0;
                                return `${sym}: ${stats.total} Trades (WR: ${winRate}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

window.openDayDetails = (dateStr) => {
    const dayTrades = window.currentTrades.filter(t => t.date === dateStr);
    const dateObj = new Date(dateStr);
    document.getElementById('day-modal-title').textContent = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    let totalPnL = 0;
    dayTrades.forEach(t => totalPnL += t.pnl);
    
    const pnlClass = totalPnL >= 0 ? 'text-green-500' : 'text-red-500';
    document.getElementById('day-modal-stats').innerHTML = `
        Day Total: <span class="font-bold ${pnlClass}">$${totalPnL.toFixed(2)}</span> • ${dayTrades.length} Trades
    `;

    const content = document.getElementById('day-modal-content');
    content.innerHTML = '';

    if (dayTrades.length === 0) {
        content.innerHTML = '<p class="text-center text-gray-500 italic py-4">No trades logged for this day.</p>';
    } else {
        dayTrades.forEach(t => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer";
            div.onclick = () => {
                document.getElementById('day-details-modal').classList.add('hidden');
                window.viewTrade(t.id);
            };

            const isWin = t.pnl >= 0;
            div.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-2 h-10 rounded-full ${isWin ? 'bg-green-500' : 'bg-red-500'}"></div>
                    <div>
                        <p class="font-bold text-gray-900 dark:text-white text-sm">${t.symbol} <span class="text-xs font-normal text-gray-500">(${t.type})</span></p>
                        <p class="text-xs text-gray-400">${t.time || 'No Time'}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-bold font-mono ${isWin ? 'text-green-500' : 'text-red-500'}">${isWin ? '+' : ''}${t.pnl.toFixed(2)}</p>
                    <p class="text-xs text-gray-500">${t.size} Lots</p>
                </div>
            `;
            content.appendChild(div);
        });
    }

    document.getElementById('day-details-modal').classList.remove('hidden');
};
// ==========================================
// 🛠️ MENU & NAVIGATION LOGIC (CLEAN & FIXED)
// ==========================================

window.toggleRowMenu = (id) => {

    if (window.event) window.event.stopPropagation();

    document.querySelectorAll('[id^="menu-"]').forEach(el => {

        if (el.id !== `menu-${id}` && el.id !== 'menu-btn' && el.id !== 'menu-current-acc') {
            el.classList.add('hidden');
        }
    });

    const menu = document.getElementById(`menu-${id}`);
    if (menu) {
        menu.classList.toggle('hidden');
    }
};

const mb = document.getElementById('menu-btn');
const dc = document.getElementById('dropdown-content');

if (mb && dc) {
    mb.addEventListener('click', (e) => {
        e.stopPropagation(); // Σταματάμε το κλικ
        dc.classList.toggle('hidden'); // Απλό άνοιγμα/κλείσιμο
    });
}

document.addEventListener('click', (e) => {

    if (dc && mb && !dc.contains(e.target) && !mb.contains(e.target)) {
        dc.classList.add('hidden');
    }

    if (!e.target.closest('button[onclick^="window.toggleRowMenu"]') && !e.target.closest('[id^="menu-"]')) {
        document.querySelectorAll('[id^="menu-"]').forEach(el => {
            // ΕΛΕΓΧΟΣ ΑΣΦΑΛΕΙΑΣ:
            // Αν το στοιχείο είναι το κουμπί 'menu-btn' ή το 'menu-current-acc', ΜΗΝ το κρύψεις.
            if (el.id !== 'menu-btn' && el.id !== 'menu-current-acc') {
                el.classList.add('hidden');
            }
        });
    }
});

window.closeAllActionMenus = () => {
    document.querySelectorAll('[id^="menu-"]').forEach(el => {
        // Μην κρύβεις το κεντρικό κουμπί (menu-btn) ή το κείμενο λογαριασμού
        if (el.id !== 'menu-btn' && el.id !== 'menu-current-acc') {
            el.classList.add('hidden');
        }
    });
};
const origView = window.viewTrade;
window.viewTrade = (id) => { window.closeAllActionMenus(); if(origView) origView(id); };

const origEdit = window.editTrade;
window.editTrade = (id) => { window.closeAllActionMenus(); if(origEdit) origEdit(id); };

const origDel = window.deleteTrade;
window.deleteTrade = (id) => { window.closeAllActionMenus(); if(origDel) origDel(id); };

document.getElementById('t-mistake').addEventListener('change', (e) => {
    const otherInput = document.getElementById('t-mistake-other-container');
    if (e.target.value === 'Other') {
        otherInput.classList.remove('hidden');
    } else {
        otherInput.classList.add('hidden');
    }
});

// app.js: Νέα Συνάρτηση για εναλλαγή ενοτήτων Settings

window.showSettingsSection = (sectionId) => {
    // 1. Απόκρυψη όλων των ενοτήτων περιεχομένου
    document.querySelectorAll('.settings-content').forEach(el => {
        el.classList.add('hidden-step'); 
        el.classList.remove('fade-in');
    });

    // 2. Εμφάνιση της επιλεγμένης ενότητας
    const target = document.getElementById(sectionId);
    if(target) {
        target.classList.remove('hidden-step');
        target.classList.add('fade-in');
    }
    
    // 3. Ενημέρωση των κουμπιών πλοήγησης (χρώμα)
    document.querySelectorAll('.settings-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-md');
        btn.classList.add('hover:bg-gray-100', 'dark:hover:bg-gray-700', 'text-gray-700', 'dark:text-gray-300');
    });

    const activeBtn = document.getElementById(`btn-${sectionId}`);
    if(activeBtn) {
        activeBtn.classList.remove('hover:bg-gray-100', 'dark:hover:bg-gray-700', 'text-gray-700', 'dark:text-gray-300');
        activeBtn.classList.add('bg-indigo-600', 'text-white', 'shadow-md');
    }
};
