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


// Helper function to get cart value
async function getCartValue(cartId, email = null) {
    try {
        // For guest carts, you need the cart ID from the frontend
        const cartUrl = `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v3/carts/${cartId}`;
        
        const cartRes = await axios.get(cartUrl, {
            headers: { 
                'X-Auth-Token': BC_API_TOKEN, 
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        const cart = cartRes.data.data;
        const subtotal = parseFloat(cart.base_amount);
        
        return {
            subtotal,
            cartId,
            itemCount: cart.line_items?.physical_items?.length || 0
        };
    } catch (error) {
        console.error('Error fetching cart:', error.response?.data || error.message);
        return null;
    }
}

// Check if customer is new (no completed orders)
async function isNewCustomer(email) {
    try {
        // Check if customer exists
        const customerRes = await axios.get(
            `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v3/customers?email:in=${encodeURIComponent(email)}`,
            { headers: { 'X-Auth-Token': BC_API_TOKEN, 'Accept': 'application/json' } }
        );

        const customers = customerRes.data.data;
        
        // If no customer found, they're new
        if (customers.length === 0) {
            return true;
        }
        
        // Check for completed orders
        const customerId = customers[0].id;
        const ordersRes = await axios.get(
            `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v2/orders?customer_id=${customerId}&status_id=10`,
            { headers: { 'X-Auth-Token': BC_API_TOKEN, 'Accept': 'application/json' } }
        );
        
        // No completed orders = new customer
        return ordersRes.data.length === 0;
        
    } catch (error) {
        console.error('Error checking customer:', error.message);
        return false;
    }
}

async function createCoupon(prize, email) {
    let discountValue = 0;
    let isShipping = false;

    if (prize.includes('FREE SHIPPING')) {
        isShipping = true;
    } else {
        const match = prize.match(/(\d+)%/);
        if (match) discountValue = parseInt(match[1]);
    }

    const code = 'SPIN-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    const promotionPayload = {
        name: `Spin Wheel - ${prize} for ${email}`,
        redemption_type: 'COUPON',
        status: 'ENABLED',
        max_uses: 1,
        rules: [
            {
                action: isShipping ? {
                    shipping: {
                        free_shipping: true
                    }
                } : {
                    cart_items: {
                        discount: {
                            percentage_amount: discountValue.toString()
                        },
                        as_total: false,
                        include_items_considered_by_condition: true,
                        exclude_items_on_sale: false,
                        items: {
                            categories: [],
                            brands: [],
                            products: [],
                            variants: []
                        }
                    }
                },
                conditions: [
                    {
                        cart: {
                            minimum_spend: '100.00'
                        }
                    }
                ],
                apply_once: true,
                stop: false
            }
        ],
        coupons: [
            {
                code: code,
                max_uses: 1,
                max_uses_per_customer: 1
            }
        ]
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

    console.log('✅ Promotion created:', response.data);
    return { code, promotionData: response.data };
}


app.post('/api/spin-wheel/claim', async (req, res) => {
    const { email, prize } = req.body;

    if (!email || !prize) {
        return res.status(400).json({ error: 'Email and prize required' });
    }

    try {
        // Check if new customer
        const customerRes = await axios.get(
            `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v3/customers?email:in=${email}`,
            { headers: { 'X-Auth-Token': BC_API_TOKEN, 'Accept': 'application/json' } }
        );

        const customers = customerRes.data.data;

        if (customers.length > 0) {
            const customerId = customers[0].id;
            const ordersRes = await axios.get(
                `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v2/orders?customer_id=${customerId}&status_id=10`,
                { headers: { 'X-Auth-Token': BC_API_TOKEN, 'Accept': 'application/json' } }
            );
            if (Array.isArray(ordersRes.data) && ordersRes.data.length > 0) {
                return res.json({ 
                    eligible: false, 
                    message: 'This offer is for new customers only.' 
                });
            }
        }

        // Create promotion with coupon
        const { code } = await createCoupon(prize, email);

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

// Route to claim prize after spinning
app.post('/api/spin-wheel/claim', async (req, res) => {
    const { email, prize } = req.body;

    if (!email || !prize) {
        return res.status(400).json({ error: 'Email and prize required' });
    }

    try {
        const customerRes = await axios.get(
            `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v3/customers?email:in=${email}`,
            { headers: { 'X-Auth-Token': BC_API_TOKEN, 'Accept': 'application/json' } }
        );

        const customers = customerRes.data.data;

        if (customers.length > 0) {
            const customerId = customers[0].id;
            const ordersRes = await axios.get(
                `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v2/orders?customer_id=${customerId}&status_id=10`,
                { headers: { 'X-Auth-Token': BC_API_TOKEN, 'Accept': 'application/json' } }
            );
            const orders = ordersRes.data;
            if (Array.isArray(orders) && orders.length > 0) {
                return res.json({ 
                    eligible: false, 
                    message: 'This offer is for new customers only.' 
                });
            }
        }

        // ✅ FIX #1: Generate coupon code first
        const code = `SPIN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        
        let discountValue = 0;
        let couponType = 'percentage_discount';

        if (prize.includes('FREE SHIPPING')) {
            couponType = 'free_shipping';
        } else {
            const match = prize.match(/(\d+)%/);
            if (match) discountValue = parseInt(match[1]);
        }

        // ✅ FIX #2: Use toUTCString() WITHOUT modification
        const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toUTCString();
        // This returns: "Tue, 14 Apr 2026 23:36:42 GMT" ✅ VALID RFC-2822

        // Build payload dynamically (free_shipping doesn't have amount)
        const couponPayload = {
            name: `Spin Wheel - ${prize}`,
            code: code,
            type: couponType,
            min_purchase: '100.00',
            enabled: true,
            max_uses: 1,
            expires: expiry,
            max_uses_per_customer: 1,
            applies_to: {
                entity: 'categories',
                ids: []
            }
        };

        // Only add amount for percentage discounts (not for free shipping)
        if (couponType !== 'free_shipping') {
            couponPayload.amount = discountValue.toString();
        }

        const couponResponse = await axios.post(
            `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v2/coupons`,
            couponPayload,
            { 
                headers: { 
                    'X-Auth-Token': BC_API_TOKEN, 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json' 
                } 
            }
        );

        console.log(`✅ Spin coupon created: ${code} for ${email} - ${prize}`);
        console.log(`Expiry date sent: ${expiry}`);
        
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