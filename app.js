import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, deleteUser, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, setDoc, doc, getDoc, updateDoc, deleteDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// FIREBASE CONFIG (YOUR KEYS)
const firebaseConfig = {
  apiKey: "AIzaSyDLqWiGvAMwzjhAZCfrqMVQz2_4F4s7nAc",
  authDomain: "trading-journal-db-eb6e1.firebaseapp.com",
  projectId: "trading-journal-db-eb6e1",
  storageBucket: "trading-journal-db-eb6e1.firebasestorage.app",
  messagingSenderId: "672967817566",
  appId: "1:672967817566:web:10c873bf5726f3424cf7cf",
  measurementId: "G-HXR6WEYN7P"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// GLOBAL BINDINGS (CRITICAL FOR ONCLICK)
window.auth = auth;
window.logout = async () => { await signOut(auth); window.location.reload(); };
window.deleteUserProfile = async () => { if(confirm("DANGER: Delete Profile?")) { await deleteDoc(doc(db,"users",auth.currentUser.uid)); await deleteUser(auth.currentUser); window.location.reload(); } };
window.togglePass = (id) => { const input = document.getElementById(id); input.type = input.type === "password" ? "text" : "password"; };

let currentUserId=null, currentAccountId=null, currentAccountData=null, tradeUnsubscribe=null, chartInstance=null, latestBalance=0;
let wizMarketType='', wizAccountType='Live';

// ==========================================
// 🔐 AUTHENTICATION (FIXED)
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

// Switch Forms
document.getElementById('go-to-register').addEventListener('click', () => { hideAllForms(); registerForm.classList.remove('hidden'); });
document.getElementById('go-to-login').addEventListener('click', () => { hideAllForms(); loginForm.classList.remove('hidden'); });
document.getElementById('forgot-pass-link').addEventListener('click', () => { hideAllForms(); forgotForm.classList.remove('hidden'); });
document.getElementById('back-from-forgot').addEventListener('click', () => { hideAllForms(); loginForm.classList.remove('hidden'); });

// LOGIN
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    try { await signInWithEmailAndPassword(auth, email, pass); } 
    catch (err) { loginError.textContent = "Login Failed: " + err.message; loginError.classList.remove('hidden'); }
});

// REGISTER
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    regError.classList.add('hidden');
    const fname = document.getElementById('reg-fname').value;
    const lname = document.getElementById('reg-lname').value;
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    if(pass !== confirm) { regError.textContent = "Passwords do not match!"; regError.classList.remove('hidden'); return; }
    // Regex: 1 Capital, 1 Number
    const strongRegex = /^(?=.*[A-Z])(?=.*\d).{6,}$/;
    if(!strongRegex.test(pass)) { regError.textContent = "Password must have 1 Capital, 1 Number, 6+ chars."; regError.classList.remove('hidden'); return; }

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "users", cred.user.uid), {
            firstName: fname, lastName: lname, username: username, email: email, onboardingComplete: false, createdAt: Date.now()
        });
    } catch (err) { regError.textContent = err.message; regError.classList.remove('hidden'); }
});

// FORGOT PASSWORD
forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value;
    try { await sendPasswordResetEmail(auth, email); forgotMsg.textContent = "Reset link sent!"; forgotMsg.className="text-center text-sm font-bold text-green-500 p-2"; forgotMsg.classList.remove('hidden'); }
    catch(err) { forgotMsg.textContent = err.message; forgotMsg.className="text-center text-sm font-bold text-red-500 p-2"; forgotMsg.classList.remove('hidden'); }
});

// AUTH LISTENER
onAuthStateChanged(auth, async (u) => {
    if(u) {
        currentUserId = u.uid; 
        document.getElementById('auth-container').classList.add('hidden'); 
        document.getElementById('app-layout').classList.remove('hidden');
        
        // Reset forms
        loginForm.reset(); registerForm.reset();
        
        const d = await getDoc(doc(db,"users",currentUserId));
        if(d.exists()){
            const data = d.data(); 
            document.getElementById('header-name').textContent = data.username || "Trader";
            if(!data.onboardingComplete) document.getElementById('persona-wizard').classList.remove('hidden');
            
            // Profile Fill
            document.getElementById('prof-fname').value = data.firstName||""; 
            document.getElementById('prof-lname').value = data.lastName||""; 
            document.getElementById('prof-email').value = data.email||""; 
            document.getElementById('prof-dob').value = data.dob||""; 
            document.getElementById('prof-bio').value = data.bio||""; 
            document.getElementById('prof-exp').value = data.experience||"0-1";
            (data.markets||[]).forEach(v=>{const el=document.querySelector(`.market-chk[value="${v}"]`);if(el)el.checked=true;});
            (data.strategies||[]).forEach(v=>{const el=document.querySelector(`.strat-chk[value="${v}"]`);if(el)el.checked=true;});
        }
        loadAccountsList();
    } else { 
        currentUserId = null; 
        document.getElementById('auth-container').classList.remove('hidden'); 
        document.getElementById('app-layout').classList.add('hidden'); 
    }
});

// ==========================================
// 🚀 WIZARDS
// ==========================================
window.nextPersonaStep = (s) => { 
    for(let i=1;i<=4;i++)document.getElementById(`p-step-${i}`).classList.add('hidden-step'); 
    document.getElementById(`p-step-${s}`).classList.remove('hidden-step'); 
    for(let i=2;i<=s;i++)document.getElementById(`prog-${i}`).classList.add('bg-indigo-600'); 
};

document.getElementById('persona-form').addEventListener('submit', async(e)=>{ 
    e.preventDefault(); 
    const exp = document.querySelector('input[name="exp"]:checked')?.value;
    const markets = Array.from(document.querySelectorAll('.p-chk:checked')).map(c=>c.value);
    const strategies = Array.from(document.querySelectorAll('.s-chk:checked')).map(c=>c.value);
    let reason = document.querySelector('input[name="why"]:checked')?.value;
    if(reason==='other') reason = document.getElementById('why-other-text').value;
    
    await updateDoc(doc(db,"users",currentUserId),{ experience: exp, markets, strategies, reason, onboardingComplete: true });
    document.getElementById('persona-wizard').classList.add('hidden'); 
    setTimeout(window.openAccountWizard, 500); 
});

window.openAccountWizard=()=>{document.getElementById('account-wizard').classList.remove('hidden'); document.getElementById('aw-step-1').classList.remove('hidden-step'); document.getElementById('aw-step-2').classList.add('hidden-step');};
window.closeAccountWizard=()=>{document.getElementById('account-wizard').classList.add('hidden');};
window.selectMarketType=(t)=>{wizMarketType=t; document.getElementById('aw-step-1').classList.add('hidden-step'); document.getElementById('aw-step-2').classList.remove('hidden-step'); const fb=document.getElementById('type-funded'); if(t==='Crypto'){fb.style.display='none';window.setWizType('Live');}else{fb.style.display='block';window.setWizType('Live');}};
window.setWizType=(t)=>{wizAccountType=t; const l=document.getElementById('type-live'), f=document.getElementById('type-funded'); if(t==='Live'){l.className='flex-1 py-2 rounded bg-indigo-600 text-white'; f.className='flex-1 py-2 rounded text-gray-500'; document.getElementById('wiz-funded-opts').classList.add('hidden-step');}else{f.className='flex-1 py-2 rounded bg-indigo-600 text-white'; l.className='flex-1 py-2 rounded text-gray-500'; document.getElementById('wiz-funded-opts').classList.remove('hidden-step');}};
window.togglePhaseInputs=()=>{ const t=document.getElementById('wiz-challenge-type').value; const p2=document.getElementById('wiz-target-p2'); if(t==='1step'){p2.classList.add('hidden'); p2.value='';}else p2.classList.remove('hidden'); };

document.getElementById('wiz-form').addEventListener('submit', async(e)=>{
    e.preventDefault();
    const d = {name:document.getElementById('wiz-name').value, type:wizAccountType, marketType:wizMarketType, initialBalance:parseFloat(document.getElementById('wiz-balance').value), createdAt:Date.now()};
    if(wizAccountType==='Funded'){
        d.propFirm=document.getElementById('wiz-prop').value; d.challengeType=document.getElementById('wiz-challenge-type').value;
        d.targetP1=parseFloat(document.getElementById('wiz-target-p1').value)||0; d.targetP2=parseFloat(document.getElementById('wiz-target-p2').value)||0;
        d.dailyDD=parseFloat(document.getElementById('wiz-daily-dd').value)||0; d.totalDD=parseFloat(document.getElementById('wiz-total-dd').value)||0;
        d.status='Phase 1';
    }
    const ref = await addDoc(collection(db,`users/${currentUserId}/accounts`),d);
    window.closeAccountWizard(); document.getElementById('wiz-form').reset(); loadAccountsList(); window.selectAccount(ref.id);
});

// ==========================================
// 📊 CORE LOGIC & CHARTS
// ==========================================
async function loadAccountsList() {
    const q = query(collection(db,`users/${currentUserId}/accounts`),orderBy('createdAt','desc'));
    const s = await getDocs(q); const l=document.getElementById('accounts-list'); l.innerHTML='';
    if(s.empty){document.getElementById('no-accounts-msg').classList.remove('hidden'); document.getElementById('dashboard-content').classList.add('hidden'); return;}
    document.getElementById('no-accounts-msg').classList.add('hidden');
    s.forEach(d=>{
        const a=d.data(); const div=document.createElement('div'); div.className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow flex justify-between items-center";
        div.innerHTML=`<div><h4 class="font-bold dark:text-white text-lg">${a.name}</h4><p class="text-xs text-gray-500">${a.marketType} • ${a.type} • ${a.status||'Active'}</p></div><div class="flex gap-2"><button onclick="window.selectAccount('${d.id}')" class="bg-indigo-600 text-white px-4 py-2 rounded font-bold">Open</button><button onclick="window.deleteAccount('${d.id}')" class="text-red-500 px-3 py-2">Delete</button></div>`;
        l.appendChild(div);
    });
    if(!currentAccountId && s.docs.length>0) window.selectAccount(s.docs[0].id);
}

window.selectAccount = async(id) => {
    // 1. Unsubscribe from previous listener to avoid mixing data
    if (tradeUnsubscribe) {
        tradeUnsubscribe();
        tradeUnsubscribe = null;
    }

    currentAccountId = id; 
    
    // 2. Fetch fresh account data
    const snap = await getDoc(doc(db, `users/${currentUserId}/accounts/${id}`));
    
    if(snap.exists()){
        currentAccountData = snap.data(); 
        
        // 3. UI Updates
        document.getElementById('menu-current-acc').textContent = currentAccountData.name;
        document.getElementById('dash-acc-name').textContent = currentAccountData.name;
        document.getElementById('dash-prop-name').textContent = currentAccountData.type === 'Funded' ? currentAccountData.propFirm : 'Live';
        document.getElementById('dashboard-content').classList.remove('hidden');
        
        // 4. Destroy Chart to prevent "ghost" lines from previous account
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }

        // 5. Setup Funded UI
        if(currentAccountData.type === 'Funded'){
            document.getElementById('funded-stats-container').classList.remove('hidden');
            
            const initBal = currentAccountData.initialBalance;
            const maxDDVal = initBal * (currentAccountData.totalDD / 100);
            const dailyDDVal = initBal * (currentAccountData.dailyDD / 100);
            
            document.getElementById('mdd-val').textContent = `$${maxDDVal.toFixed(0)}`;
            document.getElementById('ddd-val').textContent = `$${dailyDDVal.toFixed(0)}`;
            
            // Visual reset until trades load
            document.getElementById('bar-mdd').style.width = '0%';
            document.getElementById('bar-ddd').style.width = '0%';
            document.getElementById('bar-target').style.width = '0%';
            
            const status = currentAccountData.status || 'Phase 1';
            const badge = document.getElementById('dash-phase');
            badge.textContent = status;
            
            if(status.includes('CANCELLED') || status.includes('FAILED')) 
                badge.className = 'bg-red-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg text-white';
            else if(status.includes('FUNDED')) 
                badge.className = 'bg-green-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg text-white';
            else 
                badge.className = 'bg-indigo-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg text-white';

        } else {
            document.getElementById('funded-stats-container').classList.add('hidden');
        }
        
        window.switchTab('dashboard'); 
        // 6. Start listening for THIS account's trades
        setupTradeListener(id);
    }
};

window.deleteAccount = async(id)=>{ if(confirm("DELETE ACCOUNT?")) { await deleteDoc(doc(db,`users/${currentUserId}/accounts/${id}`)); loadAccountsList(); } };

function setupTradeListener(accId) { if(tradeUnsubscribe) tradeUnsubscribe(); const q=query(collection(db,`users/${currentUserId}/accounts/${accId}/trades`),orderBy('date','asc')); tradeUnsubscribe=onSnapshot(q,(s)=>{ const trades=s.docs.map(d=>({id:d.id,...d.data()})); renderTrades([...trades].reverse()); calcMetrics(trades); }); }

async function calcMetrics(trades) {
    const offset = currentAccountData.pnlOffset || 0; 
    const initBal = currentAccountData.initialBalance;
    
    let netPnL = 0;   // Cumulative PnL (Since day 1)
    let wins = 0;
    let tradeCount = 0;
    
    const today = new Date().toISOString().split('T')[0];
    let todayPnL = 0; // Daily PnL reset

    // CHART DATA: Start fresh from Initial Balance
    const labels = ['Start'];
    const data = [initBal]; 

    trades.forEach(t => {
        netPnL += t.pnl; // Accumulate Total PnL
        
        if (t.type !== 'Withdrawal') {
            if (t.pnl > 0) wins++;
            if (t.date === today) todayPnL += t.pnl;
            tradeCount++;
        }
        
        labels.push(t.date); 
        
        // --- KEY FIX: CHART RESET LOGIC ---
        // We subtract the 'offset' (profit from prev phases) from the NetPnL.
        // Formula: InitialBalance + (TotalProfit - PreviousPhaseProfit)
        // This makes the line drop back to InitialBalance when a new phase starts.
        const phaseAdjustedBalance = initBal + (netPnL - offset);
        data.push(phaseAdjustedBalance); 
    });

    // Active Balance for current phase view
    const activeBal = initBal + (netPnL - offset);
    
    // Profit specifically for this phase (for Targets)
    let currentPhaseProfit = netPnL - offset; 
    
    latestBalance = activeBal;

    // --- FUNDED LOGIC ENGINE ---
    if (currentAccountData.type === 'Funded') {
        const totalDDLimit = initBal * (currentAccountData.totalDD / 100);
        const dailyDDLimit = initBal * (currentAccountData.dailyDD / 100);
        
        let status = currentAccountData.status || 'Phase 1';
        let badgeColor = 'bg-indigo-600';

        // A. FAILURE CHECK
        const breachedTotal = activeBal <= (initBal - totalDDLimit);
        const breachedDaily = todayPnL <= -dailyDDLimit;

        if (!status.includes('CANCELLED') && (breachedTotal || breachedDaily)) {
            status = 'CANCELLED';
            if(breachedTotal) status += ' (Max DD)';
            if(breachedDaily) status += ' (Daily DD)';
            await updateDoc(doc(db, `users/${currentUserId}/accounts/${currentAccountId}`), { status: status });
            currentAccountData.status = status;
        }
        
        // B. SUCCESS CHECK (Phase Progression)
        else if (!status.includes('CANCELLED') && !status.includes('FUNDED')) {
            const t1Amt = initBal * (currentAccountData.targetP1 / 100);
            const t2Amt = initBal * (currentAccountData.targetP2 / 100);

            if (status === 'Phase 1' && currentPhaseProfit >= t1Amt) {
                const next = currentAccountData.challengeType === '2step' ? 'Phase 2' : 'FUNDED';
                // BANK THE PROFIT (Offset = Total Net PnL so far)
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

        // C. UI UPDATES
        const badge = document.getElementById('dash-phase');
        badge.textContent = status;
        
        if (status.includes('CANCELLED')) badgeColor = 'bg-red-600';
        else if (status.includes('FUNDED')) badgeColor = 'bg-green-600';
        
        badge.className = `${badgeColor} px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg text-white transition-all`;

        // D. BARS
        if (status.includes('Phase')) {
            const target = status === 'Phase 1' ? currentAccountData.targetP1 : currentAccountData.targetP2;
            const targetAmt = initBal * (target / 100);
            document.getElementById('target-val').textContent = `$${targetAmt.toFixed(0)}`;
            document.getElementById('bar-target').style.width = `${Math.min((Math.max(0, currentPhaseProfit)/targetAmt)*100, 100)}%`;
            
            // Ensure HTML is correct if returning from Funded
            if(document.getElementById('target-val').parentElement.innerHTML.includes('Payout')) {
                 window.location.reload(); // Quick fix to restore bar layout
            }

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

        // DD Bars
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

    // --- CHART UPDATE ---
    updateChart(document.getElementById('growthChart').getContext('2d'), labels, data, document.documentElement.classList.contains('dark'));

    // Metric Balance: Shows the "Reset" balance (Init + PhaseProfit)
    document.getElementById('metric-balance').textContent = `$${activeBal.toFixed(2)}`;
    
    // Metric PnL: Shows Profit for THIS PHASE only (Visual Reset)
    const displayPnL = (currentAccountData.type==='Funded' && !currentAccountData.status.includes('FUNDED')) ? currentPhaseProfit : (netPnL - offset);
    
    document.getElementById('metric-pnl').textContent = `$${displayPnL.toFixed(2)}`; 
    document.getElementById('metric-pnl').className = `text-2xl font-extrabold mt-1 ${displayPnL>=0?'text-emerald-400':'text-rose-400'}`;
    
    const tradeOnly = trades.filter(t => t.type !== 'Withdrawal');
    document.getElementById('metric-trades').textContent = tradeOnly.length;
    document.getElementById('metric-winrate').textContent = tradeOnly.length ? ((wins/tradeOnly.length)*100).toFixed(0)+'%' : '0%';
}   

// CHART FUNCTION (Stepped + Target Line)
function updateChart(ctx, labels, data, isDark) {
    const zoom = parseFloat(document.getElementById('chart-zoom-level').value)||0.1;
    const currentBal = data[data.length-1];
    
    const datasets = [{
        label: 'Balance', data: data, 
        borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.1)', 
        stepped: 'middle', // SQUARE EDGES
        fill: true, pointRadius: 0
    }];

    // Target Line
    if (currentAccountData.type === 'Funded' && !currentAccountData.status.includes('FUNDED') && !currentAccountData.status.includes('CANCELLED')) {
        const ph = currentAccountData.status || 'Phase 1';
        const tp = ph.includes('1') ? currentAccountData.targetP1 : currentAccountData.targetP2;
        const targetVal = currentAccountData.initialBalance * (1+(tp/100));
        datasets.push({label:'Target', data:Array(data.length).fill(targetVal), borderColor:'#10b981', borderDash:[5,5], pointRadius:0, borderWidth:1});
    }

    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, { 
        type:'line', data:{labels, datasets}, 
        options:{
            responsive:true, maintainAspectRatio:false, 
            plugins:{legend:{display:false}, zoom:{pan:{enabled:true,mode:'x'},zoom:{wheel:{enabled:true},mode:'x'}}}, 
            scales:{x:{display:false}, y:{suggestedMin:currentBal*(1-zoom), suggestedMax:currentBal*(1+zoom), grid:{color:isDark?'#374151':'#e5e7eb'}, ticks:{color:isDark?'#9ca3af':'#4b5563'}}} 
        } 
    });
}

// --- WITHDRAWAL LOGIC ---
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
    
    if(amount > max) return alert("Cannot withdraw more than available profit (Balance must stay above Initial).");
    
    // Create Withdrawal "Trade"
    await addDoc(collection(db,`users/${currentUserId}/accounts/${currentAccountId}/trades`),{
        date: new Date().toISOString().split('T')[0],
        symbol: 'WITHDRAWAL',
        type: 'Withdrawal',
        entry: 0, sl: 0, tp: 0, exit: 0,
        pnl: -amount, // Negative PnL reduces balance
        notes: `Payout of $${amount}`,
        confidence: 0,
        createdAt: Date.now()
    });
    
    document.getElementById('withdraw-modal').classList.add('hidden');
    document.getElementById('withdraw-form').reset();
});

document.querySelectorAll('.calc-trigger').forEach(el=>el.addEventListener('input', calculateMath));
// NEW MT5-STYLE CALCULATOR (Lots Based)
// NEW MT5 CALCULATOR (Volume Based)
function calculateMath() {
    // 1. Get Values (default to 0 to avoid NaN)
    const entry = parseFloat(document.getElementById('t-entry').value) || 0;
    const sl = parseFloat(document.getElementById('t-sl').value) || 0;
    const tp = parseFloat(document.getElementById('t-tp').value) || 0;
    const exit = parseFloat(document.getElementById('t-exit').value) || 0;
    
    // User inputs LOTS directly now
    const lots = parseFloat(document.getElementById('t-size').value) || 0; 
    const fees = parseFloat(document.getElementById('t-fees').value) || 0;
    
    const type = document.getElementById('t-type').value;

    if(entry && sl) {
        // Calculate Risk in Pips
        const riskDist = Math.abs(entry - sl);
        document.getElementById('disp-risk-pips').textContent = `Risk: ${(riskDist * 10000).toFixed(1)} pips`;

        // Calculate R:R based on TP (Reward / Risk)
        if(tp) {
            const rewardDist = Math.abs(tp - entry);
            const rr = riskDist > 0 ? (rewardDist / riskDist) : 0;
            const rrStr = Number.isInteger(rr) ? rr.toFixed(0) : rr.toFixed(2);
            document.getElementById('disp-r-multiple').textContent = `${rrStr}:1`;
        } else {
            document.getElementById('disp-r-multiple').textContent = "--";
        }

        // Calculate PnL ONLY if Exit Price & Lots are provided
        if(exit && lots > 0) {
            // Price Difference based on direction
            // Long: Exit - Entry | Short: Entry - Exit
            const priceDiff = type === 'Long' ? (exit - entry) : (entry - exit);
            
            // FORMULA: PriceDiff * Lots * ContractSize (100,000 for Forex)
            // Example: (1.0550 - 1.0500) * 1.0 * 100,000 = $500
            const grossPnL = priceDiff * lots * 100000;

            // Net PnL = Gross + Fees (Fees usually negative e.g. -5.00)
            const netPnL = grossPnL + fees;
            
            // Update UI
            const netEl = document.getElementById('t-net-pnl');
            netEl.value = netPnL.toFixed(2);
            
            // Color feedback
            if(netPnL >= 0) {
                netEl.className = "w-full rounded-lg bg-green-900/30 border border-green-600 text-green-400 p-2.5 font-mono text-center font-bold text-lg";
            } else {
                netEl.className = "w-full rounded-lg bg-red-900/30 border border-red-600 text-red-400 p-2.5 font-mono text-center font-bold text-lg";
            }
        }
    }
}

// --- UNIFIED SUBMIT HANDLER (ONLY ONE ALLOWED) ---
document.getElementById('trade-form').addEventListener('submit', async(e)=>{
    e.preventDefault();
    
    // Check Status
    if(currentAccountData.status && currentAccountData.status.includes('CANCELLED')) {
        alert("⛔ ACCOUNT CANCELLED. You cannot place new trades."); return;
    }

    const file = document.getElementById('t-img').files[0];
    let b64 = null; 
    if(file){
        const r = new FileReader(); 
        b64 = await new Promise(res=>{ r.onload=()=>res(r.result); r.readAsDataURL(file); });
    }
    
    // Get the CALCULATED Net PnL
    const finalPnL = parseFloat(document.getElementById('t-net-pnl').value) || 0;

    await addDoc(collection(db,`users/${currentUserId}/accounts/${currentAccountId}/trades`),{
        date: document.getElementById('t-date').value, 
        symbol: document.getElementById('t-symbol').value.toUpperCase(), 
        type: document.getElementById('t-type').value, 
        
        // Manual Lots
        size: parseFloat(document.getElementById('t-size').value) || 0,
        
        entry: parseFloat(document.getElementById('t-entry').value), 
        sl: parseFloat(document.getElementById('t-sl').value), 
        tp: parseFloat(document.getElementById('t-tp').value), 
        exit: parseFloat(document.getElementById('t-exit').value),
        
        // Fees
        fees: parseFloat(document.getElementById('t-fees').value) || 0,
        
        // FINAL PNL (This is what matters for the chart)
        pnl: finalPnL, 
        
        notes: document.getElementById('t-notes').value, 
        confidence: document.getElementById('t-conf').value, 
        image: b64, 
        createdAt: Date.now()
    });
    
    document.getElementById('trade-form').reset(); 
    document.getElementById('conf-val').textContent='5'; 
    document.getElementById('file-name-display').textContent='Upload Screenshot';
    // Reset Color
    document.getElementById('t-net-pnl').className = "w-full rounded-lg bg-gray-900 border border-gray-600 text-white p-2.5 font-mono cursor-not-allowed text-center font-bold text-lg";
});

function renderTrades(trades) {
    const l = document.getElementById('trade-list'); 
    l.innerHTML = '';
    trades.forEach(t => {
        const tr = document.createElement('tr'); 
        tr.className = "border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition";
        
        let rrStr = "-"; 
        if(t.entry && t.sl && t.tp && t.type !== 'Withdrawal') {
            const risk = Math.abs(t.entry - t.sl); 
            const reward = Math.abs(t.tp - t.entry); 
            if(risk > 0) {
                const rr = reward / risk;
                rrStr = (Number.isInteger(rr) ? rr.toFixed(0) : rr.toFixed(1)) + ":1";
            }
        }

        if(t.type === 'Withdrawal') {
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
                    <select onchange="window.handleAction(this, '${t.id}')" 
                            class="bg-gray-700 border border-gray-600 text-white text-xs rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block w-full p-1.5 outline-none cursor-pointer hover:bg-gray-600 transition shadow-sm">
                        <option value="action" disabled selected>•••</option>
                        <option value="view" class="bg-gray-700 text-white">📂 View</option>
                        <option value="delete" class="bg-gray-700 text-white">✕ Delete</option>
                    </select>
                </td>`;
        }
        tr.dataset.trade = JSON.stringify(t); 
        l.appendChild(tr);
    });
}

// Βεβαιώσου ότι υπάρχει και αυτή η μικρή συνάρτηση κάπου από κάτω στο app.js (αν δεν υπάρχει, βάλτην):
window.handleAction = (el, id) => { 
    if(el.value === 'view') window.viewTrade(id); 
    if(el.value === 'delete') window.deleteTrade(id); 
    el.value = 'action'; // Επαναφορά στο default
};
window.deleteTrade=async(id)=>await deleteDoc(doc(db,`users/${currentUserId}/accounts/${currentAccountId}/trades/${id}`));
window.viewTrade = async (id) => {
    const docRef = doc(db, `users/${currentUserId}/accounts/${currentAccountId}/trades/${id}`);
    const snap = await getDoc(docRef);
    
    if (snap.exists()) {
        const trade = snap.data();
        
        // R:R Logic based on TP
        let rrString = "-";
        if (trade.sl && trade.entry && trade.tp) {
            const risk = Math.abs(trade.entry - trade.sl);
            const reward = Math.abs(trade.tp - trade.entry);
            if(risk > 0) {
                const rr = reward / risk;
                rrString = (Number.isInteger(rr) ? rr.toFixed(0) : rr.toFixed(1)) + ":1";
            }
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
                <div class="border-t border-indigo-200 dark:border-indigo-800 my-3"></div>
                <div class="grid grid-cols-2 gap-4 text-center">
                    <div><span class="block text-xs text-gray-500 uppercase font-bold">Exit Price</span><span class="font-mono font-bold dark:text-white">${trade.exit}</span></div>
                    <div><span class="block text-xs text-indigo-500 uppercase font-bold">Planned R:R</span><span class="font-bold dark:text-white">${rrString}</span></div>
                </div>
            </div>

            <div class="mb-4">
                <span class="block text-xs text-gray-500 uppercase font-bold mb-2">Notes</span>
                <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl text-gray-700 dark:text-gray-300 italic border border-gray-100 dark:border-gray-600">
                    "${trade.notes || 'No notes added.'}"
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4 text-center">
                <div><span class="block text-xs text-orange-500 uppercase font-bold">Fees</span><span class="font-bold dark:text-white">${(trade.fees || 0).toFixed(2)}</span></div>
                <div><span class="block text-xs text-gray-500 uppercase font-bold">Confidence</span><span class="font-bold text-yellow-500">${trade.confidence}/5</span></div>
            </div>

            ${trade.image ? `<div><span class="block text-xs text-gray-500 uppercase font-bold mb-2 mt-4">Screenshot</span><img src="${trade.image}" class="w-full rounded-xl border dark:border-gray-600 shadow-sm"></div>` : ''}
        `;
        
        document.getElementById('details-modal').classList.remove('hidden');
    } else {
        alert("Error loading trade details.");
    }
};
// UTILS
window.switchTab=(t)=>{['dashboard','accounts','profile'].forEach(i=>document.getElementById(`tab-${i}`).classList.add('hidden')); document.getElementById(`tab-${t}`).classList.remove('hidden'); document.getElementById('dropdown-content').classList.add('hidden-menu'); document.getElementById('dropdown-content').classList.remove('visible-menu');};
const mb=document.getElementById('menu-btn'), dc=document.getElementById('dropdown-content'); mb.addEventListener('click',(e)=>{e.stopPropagation(); if(dc.classList.contains('visible-menu')){dc.classList.remove('visible-menu');dc.classList.add('hidden-menu');}else{dc.classList.remove('hidden-menu');dc.classList.add('visible-menu');}}); document.addEventListener('click',()=>{dc.classList.remove('visible-menu');dc.classList.add('hidden-menu');});
document.getElementById('theme-toggle').addEventListener('click',()=>{document.documentElement.classList.toggle('dark');});
document.getElementById('t-img').addEventListener('change',function(){document.getElementById('file-name-display').textContent=this.files[0]?this.files[0].name:"Upload Screenshot";});
const sl=document.getElementById('t-conf'), out=document.getElementById('conf-val'); sl.oninput=function(){out.innerHTML=this.value;};
window.togglePass=(id)=>{const i=document.getElementById(id); i.type=i.type==='password'?'text':'password';};
document.getElementById('profile-form').addEventListener('submit', async (e) => { e.preventDefault(); const m=Array.from(document.querySelectorAll('.market-chk:checked')).map(c=>c.value); const s=Array.from(document.querySelectorAll('.strat-chk:checked')).map(c=>c.value); await updateDoc(doc(db,"users",currentUserId),{firstName:document.getElementById('prof-fname').value, lastName:document.getElementById('prof-lname').value, dob:document.getElementById('prof-dob').value, bio:document.getElementById('prof-bio').value, experience:document.getElementById('prof-exp').value, markets:m, strategies:s}); alert("Saved!"); });
document.getElementById('chart-zoom-level').addEventListener('change', () => { if(currentAccountId) setupTradeListener(currentAccountId); });