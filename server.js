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

function formatDate(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}
const startDate = formatDate(new Date());

app.post('/api/spin-wheel/claim', async (req, res) => {
    const { email, prize } = req.body;

     // Check if email already exists in database
        const existingUser = await db.query(
            'SELECT * FROM coupons WHERE email = ?',
            [email]
        );
        
        if (existingUser.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'This email has already claimed a prize. Each email can only claim once.'
            });
        }
    // Detect prize type
    const isFreeShipping = prize.toUpperCase().includes('FREE SHIPPING');

    let percentage = 0;
    if (!isFreeShipping) {
        const match = prize.match(/(\d+)%/);
        if (!match) {
            return res.status(400).json({ error: "Invalid prize format" });
        }
        percentage = parseInt(match[1]);
    }

    const hasClaimed = await checkUserClaimed(email);
    if (hasClaimed) {
        return res.status(429).json({ error: "User has already claimed a prize" });
    }
    const isNew = await isNewCustomer(email);
        if (!isNew) {
            return res.json({ 
                eligible: false, 
                message: 'This offer is for new customers only.' 
            });
        }

    // ✅ Build action dynamically
    let action;

    if (isFreeShipping) {
        action = {
            shipping: {
                free_shipping: true
            }
        };
    } else {
        action = {
            cart_value: {
                discount: {
                    percentage_amount: percentage
                }
            }
        };
    }

    const promotionPayload = {
        name: `Spin Wheel Prize: ${prize} for ${email}`,
        redemption_type: "AUTOMATIC",
        status: "ENABLED",

        rules: [
            {
                apply_once: true,
                stop: false,

                action: action,

                condition: {
                    cart: {
                        minimum_spend: "100.00"
                    }
                }
            }
        ],

        start_date: formatDate(new Date())
        // ❌ No end_date = valid until manually disabled
    };

    try {
        const response = await bigcommerceApi.post('/v3/promotions', promotionPayload);

        await storeClaim(email, prize, response.data.data?.id);

        res.json({
            success: true,
            reward: isFreeShipping ? "FREE SHIPPING" : `${percentage}% OFF`,
            message: isFreeShipping
                ? "Free shipping will be applied at checkout for orders above $100."
                : "Discount will auto-apply when cart reaches $100."
        });

    } catch (error) {
        console.error('Promotion creation error:', error.response?.data);
        res.status(422).json({
            error: "Something went wrong",
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