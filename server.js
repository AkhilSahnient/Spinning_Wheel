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

// Check if customer is new
async function isNewCustomer(email) {
    try {
        const customerRes = await axios.get(
            `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v3/customers?email:in=${encodeURIComponent(email)}`,
            { headers: { 'X-Auth-Token': BC_API_TOKEN, 'Accept': 'application/json' } }
        );

        const customers = customerRes.data.data;
        
        if (customers.length === 0) {
            return true;
        }
        
        const customerId = customers[0].id;
        const ordersRes = await axios.get(
            `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v2/orders?customer_id=${customerId}&status_id=10`,
            { headers: { 'X-Auth-Token': BC_API_TOKEN, 'Accept': 'application/json' } }
        );
        
        return ordersRes.data.length === 0;
        
    } catch (error) {
        console.error('Error checking customer:', error.message);
        return false;
    }
}

// Create promotion using Promotions API
async function createPromotion(prize, email) {
    let discountValue = 0;
    let actionType = 'PERCENT_DISCOUNT';
    
    if (prize.includes('FREE SHIPPING')) {
        actionType = 'FREE_SHIPPING';
    } else {
        const match = prize.match(/(\d+)%/);
        if (match) discountValue = parseInt(match[1]);
    }
    
    const code = `SPIN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    const endsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    const promotionPayload = {
        name: `Spin Wheel - ${prize} for ${email}`,
        redemption_type: 'COUPON',
        status: 'ENABLED',
        start_date: new Date().toISOString(),
        end_date: endsAt,
        max_uses: 1,
        customer_qualification: {
            minimum_order_count: 0
        },
        cart_qualification: {
            min_amount: 10000  // $100.00 in cents
        },
        action: actionType === 'FREE_SHIPPING' 
            ? { type: 'FREE_SHIPPING' }
            : { 
                type: 'PERCENT_DISCOUNT',
                value: discountValue
              },
        coupons: [{
            code: code,
            max_uses: 1,
            max_uses_per_customer: 1
        }]
    };
    
    const response = await axios.post(
        `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v3/promotions`,
        promotionPayload,
        {
            headers: {
                'X-Auth-Token': BC_API_TOKEN,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        }
    );
    
    return { code, promotionData: response.data };
}

// Single route for spin wheel claim - USING PROMOTIONS API
app.post('/api/spin-wheel/claim', async (req, res) => {
    const { email, prize } = req.body;

    if (!email || !prize) {
        return res.status(400).json({ error: 'Email and prize required' });
    }

    try {
        // Check if customer is new
        const isNew = await isNewCustomer(email);
        
        if (!isNew) {
            return res.json({ 
                eligible: false, 
                message: 'This offer is for new customers only.' 
            });
        }

        // Create promotion with coupon
        const { code } = await createPromotion(prize, email);

        console.log(`✅ Spin promotion created: ${code} for ${email} - ${prize}`);
        res.json({ 
            success: true, 
            eligible: true, 
            code: code, 
            prize: prize 
        });

    } catch (error) {
        console.error('Spin claim error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'running', 
        message: 'Spin Wheel Backend API' 
    });
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});