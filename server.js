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

// Simple in-memory storage
const claimsStore = new Map();

// Function to send winner email
async function sendWinnerEmail(email, prize) {
    const isFreeShipping = prize.toUpperCase().includes('FREE SHIPPING');
    
    const prizeDisplay = isFreeShipping ? 'FREE SHIPPING' : prize;
    const description = isFreeShipping 
        ? 'Free shipping will be applied automatically at checkout on orders over $100.'
        : `You get ${prize} off your order subtotal automatically at checkout on orders over $100.`;

    try {
        await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: email,
            subject: `🎉 You Won ${prizeDisplay} at AWScales!`,
            html: `
                <!DOCTYPE html>
                <html>
                <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f4f4f4;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        
                        <div style="background: linear-gradient(135deg, #1a3a6e, #0d1f3c); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                            <h1 style="margin: 0; font-size: 32px;">🎉 Congratulations!</h1>
                            <p style="margin: 10px 0 0; opacity: 0.8;">You're a winner at AWScales Spin & Win!</p>
                        </div>

                        <div style="background: white; padding: 30px; text-align: center; border-left: 1px solid #e0e0e0; border-right: 1px solid #e0e0e0;">
                            <p style="color: #666; font-size: 16px; margin: 0 0 16px;">Your prize:</p>
                            <div style="background: linear-gradient(135deg, #c8a030, #e6b422); color: white; font-size: 36px; font-weight: bold; padding: 24px; border-radius: 12px; letter-spacing: 2px;">
                                ${prizeDisplay}
                            </div>
                            <p style="color: #444; font-size: 16px; margin: 20px 0 0; line-height: 1.6;">
                                ${description}
                            </p>
                        </div>

                        <div style="background: #f8f9ff; padding: 30px; border-left: 1px solid #e0e0e0; border-right: 1px solid #e0e0e0;">
                            <h3 style="color: #1a3a6e; margin: 0 0 16px;">✨ How to redeem:</h3>
                            <ol style="color: #444; line-height: 2; margin: 0; padding-left: 20px;">
                                <li>Visit <a href="${STORE_URL}" style="color: #c8a030;">AWScales Store</a></li>
                                <li>Add items worth <strong>$100 or more</strong> to your cart</li>
                                <li>Proceed to checkout</li>
                                <li>Your discount applies <strong>automatically!</strong></li>
                            </ol>
                        </div>

                        <div style="background: white; padding: 20px 30px; border-left: 1px solid #e0e0e0; border-right: 1px solid #e0e0e0;">
                            <h4 style="color: #666; margin: 0 0 10px; font-size: 14px;">Terms & Conditions:</h4>
                            <ul style="color: #999; font-size: 13px; line-height: 1.8; margin: 0; padding-left: 20px;">
                                <li>Minimum purchase: $100</li>
                                <li>Valid on B2C orders only</li>
                                <li>No expiry — valid until used</li>
                                <li>One prize per customer</li>
                            </ul>
                        </div>

                        <div style="background: white; padding: 20px 30px 30px; text-align: center; border-left: 1px solid #e0e0e0; border-right: 1px solid #e0e0e0; border-radius: 0 0 12px 12px; border-bottom: 1px solid #e0e0e0;">
                            <a href="${STORE_URL}" style="display: inline-block; background: linear-gradient(135deg, #1a3a6e, #0d1f3c); color: white; padding: 16px 40px; border-radius: 50px; text-decoration: none; font-size: 16px; font-weight: bold;">
                                🛍️ Shop Now & Save
                            </a>
                        </div>

                        <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
                            <p style="margin: 0;">© 2026 AWScales. All rights reserved.</p>
                            <p style="margin: 4px 0 0;">This is an automated message, please do not reply.</p>
                        </div>

                    </div>
                </body>
                </html>
            `
        });

        console.log(`✅ Winner email sent to: ${email}`);
        return true;
    } catch (error) {
        console.error('❌ Winner email error:', error);
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

// In-memory OTP store
const otpStore = new Map();

const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

app.post('/api/spin-wheel/send-otp', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    if (claimsStore.has(email)) {
        return res.status(400).json({
            success: false,
            message: 'This email has already claimed a prize.'
        });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    otpStore.set(email, { otp, expiresAt, verified: false });

    try {
        await resend.emails.send({
            from: 'onboarding@resend.dev', // ← sender (Resend test address)
            to: email,                      // ← recipient (user's email)
            subject: 'Your Verification Code - Spin & Win',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                    <div style="background: #1a3a6e; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="margin:0;">🎰 Spin & Win</h1>
                        <p>Email Verification</p>
                    </div>
                    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0;">
                        <p>Your verification code is:</p>
                        <div style="background: #1a3a6e; color: #c8a030; font-size: 36px; font-weight: bold; text-align: center; padding: 20px; border-radius: 10px; letter-spacing: 8px;">
                            ${otp}
                        </div>
                        <p style="color: #999; font-size: 12px; margin-top: 20px;">
                            This code expires in 10 minutes.
                        </p>
                    </div>
                </div>
            `
        });

        console.log(`✅ OTP sent to ${email}: ${otp}`);
        res.json({ success: true, message: 'Verification code sent to your email.' });

    } catch (error) {
        console.error('❌ Resend error:', error);
        res.status(500).json({ error: 'Failed to send verification email.' });
    }
});

// Verify OTP
app.post('/api/spin-wheel/verify-otp', async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const stored = otpStore.get(email);

    if (!stored) {
        return res.status(400).json({ error: 'No OTP found. Please request a new one.' });
    }

    if (Date.now() > stored.expiresAt) {
        otpStore.delete(email);
        return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    }

    if (stored.otp !== otp.toString()) {
        return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    }

    // Mark as verified
    otpStore.set(email, { ...stored, verified: true });
    console.log(`✅ Email verified: ${email}`);

    res.json({ success: true, message: 'Email verified successfully.' });
});


app.post('/api/spin-wheel/claim', async (req, res) => {
    const { email, prize } = req.body;

        // ✅ Check OTP verified
    const otpData = otpStore.get(email);
    if (!otpData || !otpData.verified) {
        return res.status(400).json({
            success: false,
            message: 'Email not verified. Please verify your email first.'
        });
    }

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

