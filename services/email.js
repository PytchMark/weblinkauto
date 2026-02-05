"use strict";

const nodemailer = require("nodemailer");

// Gmail SMTP Configuration
const GMAIL_USER = process.env.GMAIL_USER || "";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || "";
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "Auto Concierge Jamaica";

let transporter = null;

if (GMAIL_USER && GMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });
  console.log("✅ Email service configured with Gmail SMTP");
} else {
  console.warn("⚠️  Email service not configured - emails will be logged only");
}

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:8001";
const LOGO_URL = "https://res.cloudinary.com/dd8pjjxsm/image/upload/v1770298701/ChatGPT_Image_Sep_6_2025_08_27_53_AM_raorxf.png";

// Email templates
const emailStyles = `
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #DC143C; }
    .header img { max-width: 120px; height: auto; }
    .content { padding: 30px 20px; }
    .button { display: inline-block; background: #DC143C; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .button:hover { background: #B91C1C; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; border-top: 1px solid #eee; }
    .highlight { background: #FEF2F2; padding: 15px; border-radius: 8px; border-left: 4px solid #DC143C; margin: 20px 0; }
    .info-box { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; }
    h1 { color: #DC143C; margin-bottom: 10px; }
    h2 { color: #333; }
  </style>
`;

function wrapEmail(content, subject) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      ${emailStyles}
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="${LOGO_URL}" alt="Auto Concierge Jamaica" />
          <h2 style="margin: 10px 0 0; color: #333;">Auto Concierge Jamaica</h2>
        </div>
        <div class="content">
          ${content}
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Auto Concierge Jamaica. All rights reserved.</p>
          <p>This email was sent from an automated system. Please do not reply directly.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function sendEmail({ to, subject, html, text }) {
  const mailOptions = {
    from: `"${EMAIL_FROM_NAME}" <${GMAIL_USER}>`,
    to,
    subject,
    html,
    text: text || subject,
  };

  if (!transporter) {
    console.log("📧 [EMAIL MOCK] Would send to:", to);
    console.log("📧 [EMAIL MOCK] Subject:", subject);
    return { success: true, mock: true };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("📧 Email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("📧 Email error:", error.message);
    return { success: false, error: error.message };
  }
}

// ============ EMAIL TEMPLATES ============

// 1. Welcome Email (after successful signup)
async function sendWelcomeEmail({ email, dealerName, dealerId, passcode, plan }) {
  const subject = `Welcome to Auto Concierge Jamaica! 🚗`;
  const content = `
    <h1>Welcome aboard, ${dealerName}!</h1>
    <p>Your dealer account has been created successfully. You're now part of Jamaica's premier automotive sales platform.</p>
    
    <div class="highlight">
      <h3 style="margin-top: 0;">Your Login Credentials</h3>
      <p><strong>Dealer ID:</strong> ${dealerId}</p>
      <p><strong>Temporary Passcode:</strong> ${passcode}</p>
      <p><strong>Plan:</strong> ${plan}</p>
    </div>
    
    <p>🔐 <strong>Important:</strong> Please change your passcode after your first login for security.</p>
    
    <div class="info-box">
      <h3 style="margin-top: 0;">Quick Links</h3>
      <p>🏪 <strong>Your Storefront:</strong> <a href="${APP_BASE_URL}/${dealerId}">${APP_BASE_URL}/${dealerId}</a></p>
      <p>📊 <strong>Dealer Portal:</strong> <a href="${APP_BASE_URL}/dealer">${APP_BASE_URL}/dealer</a></p>
    </div>
    
    <h3>Next Steps:</h3>
    <ol>
      <li>Login to your Dealer Portal</li>
      <li>Add your first vehicles</li>
      <li>Upload photos and videos</li>
      <li>Share your storefront link!</li>
    </ol>
    
    <a href="${APP_BASE_URL}/dealer" class="button">Login to Dealer Portal →</a>
    
    <p>Need help? Reply to this email or check our FAQ.</p>
  `;
  
  return sendEmail({
    to: email,
    subject,
    html: wrapEmail(content, subject),
    text: `Welcome to Auto Concierge Jamaica! Your Dealer ID: ${dealerId}, Passcode: ${passcode}. Login at ${APP_BASE_URL}/dealer`,
  });
}

// 2. New Request Alert (when buyer requests viewing)
async function sendNewRequestAlert({ dealerEmail, dealerName, dealerId, request, vehicle }) {
  const subject = `🔔 New ${request.type} Request - ${vehicle?.title || 'Vehicle'}`;
  const requestTypeLabel = {
    whatsapp: "WhatsApp Chat",
    live_video: "Live Video Viewing",
    walk_in: "Walk-In Booking",
  }[request.type] || request.type;
  
  const content = `
    <h1>New Viewing Request!</h1>
    <p>Hi ${dealerName}, you have a new request from a potential buyer.</p>
    
    <div class="highlight">
      <h3 style="margin-top: 0;">Request Details</h3>
      <p><strong>Type:</strong> ${requestTypeLabel}</p>
      <p><strong>Vehicle:</strong> ${vehicle?.title || 'N/A'} (${vehicle?.vehicle_id || 'N/A'})</p>
      <p><strong>Price:</strong> $${vehicle?.price?.toLocaleString() || 'N/A'}</p>
    </div>
    
    <div class="info-box">
      <h3 style="margin-top: 0;">Customer Information</h3>
      <p><strong>Name:</strong> ${request.name || 'Not provided'}</p>
      <p><strong>Phone:</strong> ${request.phone || 'Not provided'}</p>
      <p><strong>Email:</strong> ${request.email || 'Not provided'}</p>
      ${request.preferred_date ? `<p><strong>Preferred Date:</strong> ${request.preferred_date}</p>` : ''}
      ${request.preferred_time ? `<p><strong>Preferred Time:</strong> ${request.preferred_time}</p>` : ''}
      ${request.notes ? `<p><strong>Notes:</strong> ${request.notes}</p>` : ''}
    </div>
    
    <a href="${APP_BASE_URL}/dealer" class="button">View in Dealer Portal →</a>
    
    <p style="font-size: 13px; color: #666;">⏰ Quick response times lead to more sales. Try to respond within 30 minutes!</p>
  `;
  
  return sendEmail({
    to: dealerEmail,
    subject,
    html: wrapEmail(content, subject),
    text: `New ${requestTypeLabel} request for ${vehicle?.title}. Customer: ${request.name}, Phone: ${request.phone}`,
  });
}

// 4. Low Inventory Alert
async function sendLowInventoryAlert({ dealerEmail, dealerName, dealerId, availableCount, threshold }) {
  const subject = `⚠️ Low Inventory Alert - Only ${availableCount} vehicles available`;
  const content = `
    <h1>Low Inventory Alert</h1>
    <p>Hi ${dealerName}, your available inventory is running low.</p>
    
    <div class="highlight">
      <h3 style="margin-top: 0;">Current Status</h3>
      <p><strong>Available Vehicles:</strong> ${availableCount}</p>
      <p><strong>Alert Threshold:</strong> ${threshold}</p>
    </div>
    
    <p>Consider adding more vehicles to keep your storefront active and attractive to buyers.</p>
    
    <a href="${APP_BASE_URL}/dealer" class="button">Add Vehicles →</a>
  `;
  
  return sendEmail({
    to: dealerEmail,
    subject,
    html: wrapEmail(content, subject),
    text: `Low inventory alert: Only ${availableCount} vehicles available. Add more at ${APP_BASE_URL}/dealer`,
  });
}

// 5. Failed Payment Recovery
async function sendFailedPaymentEmail({ dealerEmail, dealerName, dealerId, nextAttemptDate }) {
  const subject = `⚠️ Payment Failed - Action Required`;
  const content = `
    <h1>Payment Issue</h1>
    <p>Hi ${dealerName}, we were unable to process your subscription payment.</p>
    
    <div class="highlight">
      <h3 style="margin-top: 0;">What This Means</h3>
      <p>Your dealer account will remain active, but continued payment failures may result in service interruption.</p>
      ${nextAttemptDate ? `<p><strong>Next Payment Attempt:</strong> ${nextAttemptDate}</p>` : ''}
    </div>
    
    <h3>To Resolve This:</h3>
    <ol>
      <li>Check your payment method is valid</li>
      <li>Ensure sufficient funds are available</li>
      <li>Update your card if needed</li>
    </ol>
    
    <p>If you need assistance or want to change your plan, please contact us.</p>
    
    <a href="${APP_BASE_URL}/dealer" class="button">Update Payment →</a>
  `;
  
  return sendEmail({
    to: dealerEmail,
    subject,
    html: wrapEmail(content, subject),
    text: `Payment failed for your Auto Concierge subscription. Please update your payment method.`,
  });
}

// 6 & 7. Upgrade Prompt / Usage-Based Upsell
async function sendUpgradePromptEmail({ dealerEmail, dealerName, dealerId, currentPlan, suggestedPlan, reason, stats }) {
  const subject = `🚀 Time to Upgrade? You're Growing!`;
  const content = `
    <h1>You're Doing Great, ${dealerName}!</h1>
    <p>${reason}</p>
    
    <div class="info-box">
      <h3 style="margin-top: 0;">Your Stats This Month</h3>
      ${stats.requests ? `<p><strong>Viewing Requests:</strong> ${stats.requests}</p>` : ''}
      ${stats.vehicles ? `<p><strong>Active Vehicles:</strong> ${stats.vehicles}</p>` : ''}
      ${stats.sold ? `<p><strong>Vehicles Sold:</strong> ${stats.sold}</p>` : ''}
    </div>
    
    <div class="highlight">
      <h3 style="margin-top: 0;">Upgrade to ${suggestedPlan}</h3>
      <p>Get more listings, priority support, and advanced features to grow your sales even faster.</p>
    </div>
    
    <a href="${APP_BASE_URL}/landing" class="button">View Upgrade Options →</a>
    
    <p style="font-size: 13px; color: #666;">Current Plan: ${currentPlan}</p>
  `;
  
  return sendEmail({
    to: dealerEmail,
    subject,
    html: wrapEmail(content, subject),
    text: `You're growing! Consider upgrading from ${currentPlan} to ${suggestedPlan}. ${reason}`,
  });
}

// 8. Referral Program
async function sendReferralInviteEmail({ dealerEmail, dealerName, referralCode, referralLink }) {
  const subject = `🎁 Earn Free Months - Refer Fellow Dealers!`;
  const content = `
    <h1>Share & Earn, ${dealerName}!</h1>
    <p>Love Auto Concierge? Share it with fellow dealers and earn <strong>1 FREE month</strong> for each successful referral!</p>
    
    <div class="highlight">
      <h3 style="margin-top: 0;">Your Referral Code</h3>
      <p style="font-size: 24px; font-weight: bold; color: #DC143C;">${referralCode}</p>
      <p>Share this code or use your unique link below.</p>
    </div>
    
    <div class="info-box">
      <h3 style="margin-top: 0;">Your Referral Link</h3>
      <p><a href="${referralLink}">${referralLink}</a></p>
    </div>
    
    <h3>How It Works:</h3>
    <ol>
      <li>Share your code with other dealers</li>
      <li>They sign up using your code</li>
      <li>You both get 1 FREE month!</li>
    </ol>
    
    <a href="${referralLink}" class="button">Copy Referral Link →</a>
  `;
  
  return sendEmail({
    to: dealerEmail,
    subject,
    html: wrapEmail(content, subject),
    text: `Refer dealers to Auto Concierge and earn free months! Your referral code: ${referralCode}. Link: ${referralLink}`,
  });
}

// 9. Passcode Reset
async function sendPasscodeResetEmail({ dealerEmail, dealerName, resetToken, expiresAt }) {
  const resetLink = `${APP_BASE_URL}/dealer?reset=${resetToken}`;
  const subject = `🔐 Reset Your Passcode`;
  const content = `
    <h1>Passcode Reset Request</h1>
    <p>Hi ${dealerName}, we received a request to reset your dealer portal passcode.</p>
    
    <div class="highlight">
      <p>Click the button below to set a new passcode. This link expires in 1 hour.</p>
    </div>
    
    <a href="${resetLink}" class="button">Reset Passcode →</a>
    
    <p style="font-size: 13px; color: #666;">If you didn't request this reset, you can safely ignore this email. Your passcode will remain unchanged.</p>
    
    <p style="font-size: 12px; color: #999;">Link expires: ${expiresAt}</p>
  `;
  
  return sendEmail({
    to: dealerEmail,
    subject,
    html: wrapEmail(content, subject),
    text: `Reset your passcode at: ${resetLink}. Link expires in 1 hour.`,
  });
}

// 22. Dealer Suspension Notice
async function sendSuspensionNoticeEmail({ dealerEmail, dealerName, dealerId, reason, reactivateLink }) {
  const subject = `⚠️ Account Suspended - Action Required`;
  const content = `
    <h1>Account Suspended</h1>
    <p>Hi ${dealerName}, your dealer account has been temporarily suspended.</p>
    
    <div class="highlight">
      <h3 style="margin-top: 0;">Reason</h3>
      <p>${reason || 'Subscription payment failed after multiple attempts.'}</p>
    </div>
    
    <h3>What This Means:</h3>
    <ul>
      <li>Your storefront is temporarily hidden</li>
      <li>New viewing requests are paused</li>
      <li>Your data and settings are preserved</li>
    </ul>
    
    <p>To reactivate your account, please update your payment method or contact support.</p>
    
    <a href="${reactivateLink || APP_BASE_URL + '/landing'}" class="button">Reactivate Account →</a>
  `;
  
  return sendEmail({
    to: dealerEmail,
    subject,
    html: wrapEmail(content, subject),
    text: `Your Auto Concierge account has been suspended. Reason: ${reason}. Reactivate at ${reactivateLink || APP_BASE_URL}`,
  });
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendNewRequestAlert,
  sendLowInventoryAlert,
  sendFailedPaymentEmail,
  sendUpgradePromptEmail,
  sendReferralInviteEmail,
  sendPasscodeResetEmail,
  sendSuspensionNoticeEmail,
};
