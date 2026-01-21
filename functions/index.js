const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

exports.logTrade = onRequest({ cors: true }, async (req, res) => {
    // Επιτρέπουμε αιτήματα από παντού (CORS)
    res.set('Access-Control-Allow-Origin', '*');
    
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const apiKey = req.body.apiKey;
    const accountId = req.body.accountId;
    const tradeData = req.body.trade;

    if (!apiKey || !accountId || !tradeData) {
        return res.status(400).send('Missing data (apiKey, accountId, or trade).');
    }

    try {
        const usersSnap = await db.collection('users').where('apiKey', '==', apiKey).limit(1).get();

        if (usersSnap.empty) {
            return res.status(401).send('Invalid API Key.');
        }

        const userId = usersSnap.docs[0].id;
        const accountRef = db.doc(`users/${userId}/accounts/${accountId}`);
        const accountSnap = await accountRef.get();

        if (!accountSnap.exists) {
            return res.status(404).send('Account ID not found for this user.');
        }

        const newTrade = {
            symbol: tradeData.symbol,
            type: tradeData.type,
            size: parseFloat(tradeData.size),
            entry: parseFloat(tradeData.entry),
            sl: parseFloat(tradeData.sl),
            tp: parseFloat(tradeData.tp),
            exit: parseFloat(tradeData.exit),
            pnl: parseFloat(tradeData.pnl),
            fees: parseFloat(tradeData.fees || 0),
            date: tradeData.date,
            time: tradeData.time,
            notes: "Auto-imported from MetaTrader",
            confidence: 5,
            image: null,
            createdAt: Date.now(),
            mt4Ticket: tradeData.ticket
        };

        const existingTrade = await accountRef.collection('trades')
            .where('mt4Ticket', '==', newTrade.mt4Ticket).get();

        if (!existingTrade.empty) {
            return res.status(200).send('Trade already exists.');
        }

        await accountRef.collection('trades').add(newTrade);
        return res.status(200).send('Trade logged successfully!');

    } catch (error) {
        console.error("Error logging trade:", error);
        return res.status(500).send('Internal Server Error');
    }
});