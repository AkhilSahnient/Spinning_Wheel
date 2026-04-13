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

// Create coupon in BigCommerce
async function createCoupon(prize, email) {
    let discountValue = 0;
    let couponType = 'percentage_discount';
    
    if (prize.includes('FREE SHIPPING')) {
        couponType = 'free_shipping';
    } else {
        const match = prize.match(/(\d+)%/);
        if (match) discountValue = parseInt(match[1]);
    }
    
    const code = `SPIN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const couponData = {
        name: `Spin Wheel - ${prize} for ${email}`,
        code,
        type: couponType,
        enabled: true,
        max_uses: 1,
        max_uses_per_customer: 1,
        min_purchase: '100.00', // This ensures coupon only works on $100+ carts
        expires: expiry
    };
    
    if (couponType !== 'free_shipping') {
        couponData.amount = discountValue.toString();
    }
    
    const response = await axios.post(
        `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v2/coupons`,
        couponData,
        {
            headers: {
                'X-Auth-Token': BC_API_TOKEN,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        }
    );
    
    return { code, couponData: response.data };
}

app.post('/api/spin-wheel/validate-cart', async (req, res) => {
    const { cartId, email } = req.body;
    
    if (!cartId) {
        return res.status(400).json({ 
            eligible: false, 
            message: 'Cart ID is required' 
        });
    }
    
    try {
        // Get current cart value
        const cartInfo = await getCartValue(cartId, email);
        
        if (!cartInfo) {
            return res.status(404).json({ 
                eligible: false, 
                message: 'Cart not found' 
            });
        }
        
        // Check if cart meets minimum requirement
        const meetsMinimum = cartInfo.subtotal >= 100;
        
        // If email is provided, check if customer is new
        let isNew = true;
        if (email) {
            isNew = await isNewCustomer(email);
        }
        
        res.json({
            eligible: meetsMinimum && isNew,
            meetsMinimum,
            isNew,
            cartSubtotal: cartInfo.subtotal,
            requiredAmount: 100,
            remainingToQualify: Math.max(0, 100 - cartInfo.subtotal)
        });
        
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({ 
            eligible: false, 
            message: 'Error validating cart' 
        });
    }
});

// Route to claim prize after spinning
// ============ SPIN WHEEL CLAIM ============
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

        let discountValue = 0;
        let couponType = 'percentage_discount';

        if (prize.includes('FREE SHIPPING')) {
            couponType = 'free_shipping';
        } else {
            const match = prize.match(/(\d+)%/);
            if (match) discountValue = parseInt(match[1]);
        }

        const code = 'SPIN-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        await axios.post(
            `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v2/coupons`,
            {
                name: `Spin Wheel - ${prize}`,
                code: code,
                type: couponType,
                amount: discountValue.toString(),
                min_purchase: '100.00',
                enabled: true,
                max_uses: 1,
                max_uses_per_customer: 1,
                expires: expiry
            },
            { 
                headers: { 
                    'X-Auth-Token': BC_API_TOKEN, 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json' 
                } 
            }
        );

        console.log(`✅ Spin coupon created: ${code} for ${email} - ${prize}`);
        res.json({ success: true, eligible: true, code: code, prize: prize });

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