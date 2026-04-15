const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, Accept'
    );

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    next();
});

app.use(express.json());

const { BC_STORE_HASH, BC_API_TOKEN } = process.env;
const PORT = process.env.PORT || 3001;

// BigCommerce API client
const bigcommerceApi = axios.create({
    baseURL: `https://api.bigcommerce.com/stores/${BC_STORE_HASH}`,
    headers: {
        'X-Auth-Token': BC_API_TOKEN,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

// Simple in-memory storage (use Redis/DB in production)
const claimsStore = new Map();

// Check if user has claimed before
async function checkUserClaimed(email) {
    // Check in-memory store
    if (claimsStore.has(email)) {
        return true;
    }
    
    // Optional: Check BigCommerce for existing claims
    try {
        const response = await bigcommerceApi.get('/v3/promotions/price-rules', {
            params: { name: `Spin Wheel Prize: %${email}%` }
        });
        
        return response.data.data.length > 0;
    } catch (error) {
        console.error('Error checking existing claims:', error.message);
        return false;
    }
}

// Store claim
async function storeClaim(email, prize, couponCode, ruleId) {
    claimsStore.set(email, {
        prize,
        couponCode,
        ruleId,
        claimedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
    
    // Optional: Store in your database here
    console.log(`Claim stored for ${email}: ${prize}, Code: ${couponCode}`);
    return true;
}

// Check if customer is new
async function isNewCustomer(email) {
    try {
        const response = await bigcommerceApi.get('/v3/customers', {
            params: { 'email:in': email }
        });

        const customers = response.data.data;
        
        if (customers.length === 0) {
            return true;
        }
        
        const customerId = customers[0].id;
        const ordersRes = await bigcommerceApi.get('/v2/orders', {
            params: { customer_id: customerId, status_id: 10 }
        });
        
        return ordersRes.data.length === 0;
        
    } catch (error) {
        console.error('Error checking customer:', error.message);
        return false;
    }
}

app.post('/api/spin-wheel/claim', async (req, res) => {
    const { email, prize } = req.body;
    
    // Parse percentage from prize
    const percentageMatch = prize.match(/(\d+)%/);
    if (!percentageMatch) {
        return res.status(400).json({ error: "Invalid prize format" });
    }
    
    const percentage = parseInt(percentageMatch[1]);
    
    // Check if user already claimed
    const hasClaimed = await checkUserClaimed(email);
    if (hasClaimed) {
        return res.status(429).json({ error: "User has already claimed a prize" });
    }
    
    // Create promotion - BigCommerce will handle the $100 condition automatically
 const promotionPayload = {
    name: `Spin Wheel Prize: ${prize} for ${email}`,
    redemption_type: "AUTOMATIC",
    status: "ENABLED",

    rules: [
        {
            apply_once: true,
            stop: false,

            action: {
                cart_value: {
                    discount: {
                        percentage_amount: percentage // ✅ THIS is correct key
                    }
                }
            },

            condition: {
                cart: {
                    minimum_spend: "100.00" // ✅ STRING, not number
                }
            }
        }
    ],

    start_date: new Date().toISOString(),
    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
};
    
    try {
        // Just create the promotion - no cart checking needed in your code
        const response = await bigcommerceApi.post('/v3/promotions', promotionPayload);
        
        // Store that user claimed
        await storeClaim(email, prize, response.data.id);
        
        res.json({
            success: true,
            discount: `${percentage}% OFF`,
            condition: "Minimum purchase of $100 (auto-checked at checkout)",
            expires_in: "7 days",
            message: "Promotion created! It will apply automatically when cart total reaches $100."
        });
        
    } catch (error) {
        console.error('Promotion creation error:', error.response?.data);
        res.status(422).json({
            error: "Something went wrong. Please try again.",
            details: error.response?.data
        });
    }
});

// Optional: Endpoint to check claim status
app.get('/api/spin-wheel/claim/:email', async (req, res) => {
    const { email } = req.params;
    
    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }
    
    const hasClaimed = await checkUserClaimed(email);
    const claim = claimsStore.get(email);
    
    res.json({
        has_claimed: hasClaimed,
        claim: claim || null
    });
});

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'running', 
        message: 'Spin Wheel Backend API (Promotions API)',
        endpoints: {
            claim: 'POST /api/spin-wheel/claim',
            checkClaim: 'GET /api/spin-wheel/claim/:email'
        }
    });
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ BigCommerce Store: ${BC_STORE_HASH}`);
    console.log(`✅ API endpoints ready`);
});
//latest