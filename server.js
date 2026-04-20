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

const { BC_STORE_HASH, BC_API_TOKEN, EMAIL_USER, EMAIL_PASS, STORE_URL } = process.env;
const PORT = process.env.PORT || 3001;

// Email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail', // or 'hotmail', 'outlook', 'yahoo'
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

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


// Function to send winner email
async function sendWinnerEmail(email, prize) {
    const isFreeShipping = prize.toUpperCase().includes('FREE SHIPPING');
    const discountAmount = isFreeShipping ? 'Free Shipping' : prize;
    
    const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>You Won! 🎉</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 30px;
                    text-align: center;
                    border-radius: 10px 10px 0 0;
                }
                .header h1 {
                    margin: 0;
                    font-size: 28px;
                }
                .content {
                    background: #f9f9f9;
                    padding: 30px;
                    border-radius: 0 0 10px 10px;
                    border: 1px solid #e0e0e0;
                    border-top: none;
                }
                .prize-box {
                    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                    color: white;
                    padding: 20px;
                    text-align: center;
                    border-radius: 10px;
                    margin: 20px 0;
                    font-size: 28px;
                    font-weight: bold;
                }
                .info-box {
                    background: #fff;
                    border: 2px solid #667eea;
                    padding: 20px;
                    border-radius: 10px;
                    margin: 20px 0;
                }
                .button {
                    display: inline-block;
                    background: #667eea;
                    color: white;
                    padding: 12px 30px;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 20px 0;
                }
                .button:hover {
                    background: #5a67d8;
                }
                .footer {
                    text-align: center;
                    margin-top: 20px;
                    font-size: 12px;
                    color: #999;
                }
                .terms {
                    font-size: 11px;
                    color: #999;
                    margin-top: 20px;
                    text-align: center;
                }
                .checkmark {
                    font-size: 50px;
                    text-align: center;
                    margin: 20px 0;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🎉 Congratulations! 🎉</h1>
                <p>You're a winner!</p>
            </div>
            <div class="content">
                <p>Dear Valued Customer,</p>
                
                <p>Great news! You've won an amazing prize from our Spin & Win game:</p>
                
                <div class="prize-box">
                    ${discountAmount}
                </div>
                
                <div class="info-box">
                    <h3 style="margin-top: 0;">✨ How to redeem:</h3>
                    <p>Your ${prize} discount has been automatically applied to your account!</p>
                    <p><strong>Simply:</strong></p>
                    <ol>
                        <li>Add items worth $100 or more to your cart</li>
                        <li>Proceed to checkout</li>
                        <li>Your discount will be applied automatically</li>
                    </ol>
                </div>
                
                <p><strong>Terms & Conditions:</strong></p>
                <ul>
                    <li>✓ Minimum purchase: $100</li>
                    <li>✓ No expiry date (valid until used)</li>
                    <li>✓ Works automatically when cart reaches $100+</li>
                    <li>✓ Valid for B2C orders only</li>
                    <li>✓ One-time use per customer</li>
                </ul>
                
                <div style="text-align: center;">
                    <a href="${STORE_URL}" class="button">🛍️ Shop Now & Save</a>
                </div>
                
                <p>Happy Shopping!<br><strong>Team Sahnient</strong></p>
            </div>
            <div class="footer">
                <p>This is an automated message, please do not reply.</p>
                <div class="terms">
                    *Terms apply. Cannot be combined with other offers. Valid for one-time use only.
                </div>
            </div>
        </body>
        </html>
    `;
    
    const emailText = `
        Congratulations! 🎉
        
        You won: ${prize}
        
        How to redeem:
        - Add items worth $100 or more to your cart
        - Proceed to checkout
        - Your discount will be applied automatically
        
        Terms:
        - Minimum purchase: $100
        - No expiry date
        - Valid for B2C orders only
        
        Shop now: ${STORE_URL}
        
        Thank you for playing!
        Team Sahnient
    `;
    
    const mailOptions = {
        from: `"Sahnient Store" <${EMAIL_USER}>`,
        to: email,
        subject: `🎉 You Won ${prize} at Sahnient! 🎉`,
        html: emailHtml,
        text: emailText
    };
    
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent to:', email, 'Message ID:', info.messageId);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}


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
async function storeClaim(email, prize, promotionId) {
    claimsStore.set(email, {
        prize,
        promotionId,
        claimedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
    
    console.log(`Claim stored for ${email}: ${prize}`);
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

app.post('/api/spin-wheel/claim', async (req, res) => {
    const { email, prize } = req.body;

    // ✅ FIXED: Check if email already exists in claimsStore
    if (claimsStore.has(email)) {
        return res.status(400).json({
            success: false,
            message: 'This email has already claimed a prize. Each email can only claim once.'
        });
    }

    // Also check BigCommerce for existing claims
    const hasClaimed = await checkUserClaimed(email);
    if (hasClaimed) {
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

    // Check if new customer (optional - remove if you don't want this restriction)
    const isNew = await isNewCustomer(email);
    if (!isNew) {
        return res.status(400).json({ 
            success: false,
            message: 'This offer is for new customers only.' 
        });
    }

    // Build action dynamically
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
    };

    try {
        const response = await bigcommerceApi.post('/v3/promotions', promotionPayload);

        await storeClaim(email, prize, response.data.data?.id);

        res.json({
            success: true,
            code: response.data.data?.id,
            reward: isFreeShipping ? "FREE SHIPPING" : `${percentage}% OFF`,
            message: isFreeShipping
                ? "Free shipping will be applied at checkout for orders above $100."
                : "Discount will auto-apply when cart reaches $100."
        });

    } catch (error) {
        console.error('Promotion creation error:', error.response?.data);
        res.status(422).json({
            success: false,
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