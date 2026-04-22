const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

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
    service: 'gmail',
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

// Simple in-memory storage
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
                .footer {
                    text-align: center;
                    margin-top: 20px;
                    font-size: 12px;
                    color: #999;
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
                    <h3>✨ How to redeem:</h3>
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
                </ul>
                <div style="text-align: center;">
                    <a href="${STORE_URL}" class="button">🛍️ Shop Now & Save</a>
                </div>
                <p>Happy Shopping!<br><strong>Team Sahnient</strong></p>
            </div>
            <div class="footer">
                <p>This is an automated message, please do not reply.</p>
            </div>
        </body>
        </html>
    `;
    
    const mailOptions = {
        from: `"Sahnient Store" <${EMAIL_USER}>`,
        to: email,
        subject: `You Won ${prize} at Awscale!`,
        html: emailHtml
    };
    
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent to:', email);
        return true;
    } catch (error) {
        console.error('❌ Error sending email:', error.message);
        return false;
    }
}

// Check if user has claimed before
async function checkUserClaimed(email) {
    if (claimsStore.has(email)) {
        return true;
    }
    
    try {
        const response = await bigcommerceApi.get('/v3/promotions', {
            params: { name: `Spin Wheel Prize: %${email}%` }
        });
        
        return response.data.data && response.data.data.length > 0;
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
        claimedAt: new Date().toISOString()
    });
    
    console.log(`✅ Claim stored for ${email}: ${prize}`);
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
            params: { customer_id: customerId, status_id: 1 }
        });
        
        return ordersRes.data.length === 0;
        
    } catch (error) {
        console.error('Error checking customer:', error.message);
        return false;
    }
}

app.post('/api/spin-wheel/claim', async (req, res) => {
    const { email, prize } = req.body;

    console.log('📝 Claim request:', { email, prize });

    // Check if email already exists
    if (claimsStore.has(email)) {
        return res.status(400).json({
            success: false,
            message: 'This email has already claimed a prize. Each email can only claim once.'
        });
    }

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

    // Check if new customer (COMMENTED FOR TESTING - UNCOMMENT IF NEEDED)
    const isNew = await isNewCustomer(email);
    if (!isNew) {
        return res.status(400).json({ 
            success: false,
            message: 'This offer is for new customers only.' 
        });
    }

    // Build promotion payload - CORRECTED STRUCTURE
    let promotionPayload;
    
    if (isFreeShipping) {
        // Correct free shipping payload
        promotionPayload = {
            name: `Spin Wheel Prize: FREE SHIPPING for ${email}`,
            redemption_type: "AUTOMATIC",
            status: "ENABLED",
            rules: [
                {
                    action: {
                        shipping: {
                            free_shipping: true,
                            zone_ids: "*"  // "*" means all shipping zones
                        }
                    },
                    condition: {
                        cart: {
                            minimum_spend: "100.00"
                        }
                    },
                    apply_once: true,
                    stop: false
                }
            ]
        };
    } else {
        // Correct percentage discount payload
        promotionPayload = {
            name: `Spin Wheel Prize: ${prize} for ${email}`,
            redemption_type: "AUTOMATIC",
            status: "ENABLED",
             rules: [
                  {
               action: {
                cart_value: {
                    discount: {
                        percentage_amount: Number(percentage)
                    }
                }
        },

    condition: {
            cart: {
                minimum_spend: "100.00"
            }
        },
            apply_once: true,
            stop: false
        }
    ]
        };
    }

    console.log('Sending promotion payload:', JSON.stringify(promotionPayload, null, 2));

    try {
        const response = await bigcommerceApi.post('/v3/promotions', promotionPayload);
        console.log('✅ Promotion created:', response.data);
        
        const promotionId = response.data.data?.id;
        
        await storeClaim(email, prize, promotionId);
        
        // SEND EMAIL TO WINNER
        const emailSent = await sendWinnerEmail(email, prize);
        
        res.json({
            success: true,
            promotion_id: promotionId,
            reward: isFreeShipping ? "FREE SHIPPING" : `${percentage}% OFF`,
            email_sent: emailSent,
            message: isFreeShipping
                ? "Free shipping will be available at checkout for orders over $100! A confirmation email has been sent."
                : `Your ${prize} discount will auto-apply when cart reaches $100. A confirmation email has been sent!`
        });

    } catch (error) {
        console.error('❌ Promotion creation error:', error.response?.data || error.message);
        res.status(422).json({
            success: false,
            error: "Something went wrong",
            details: error.response?.data || error.message
        });
    }
});

// Endpoint to check claim status
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
        message: 'Spin Wheel Backend API',
        endpoints: {
            claim: 'POST /api/spin-wheel/claim',
            checkClaim: 'GET /api/spin-wheel/claim/:email'
        }
    });
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ BigCommerce Store: ${BC_STORE_HASH}`);
    console.log(`✅ Email service ready`);
});