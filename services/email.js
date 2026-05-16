"use strict";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "";
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "Auto Concierge Jamaica";
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || "";
const RESEND_API_URL = "https://api.resend.com/emails";

const resendConfigured = Boolean(RESEND_API_KEY && EMAIL_FROM);

if (resendConfigured) {
  console.log("✅ Email service configured with Resend API");
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

function resolveFromAddress() {
  const from = String(EMAIL_FROM || "").trim();
  if (!from) return "";
  if (from.includes("<")) return from;
  return `${EMAIL_FROM_NAME} <${from}>`;
}

function normalizeRecipients(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function sendEmail({ to, subject, html, text, bcc }) {
  const from = resolveFromAddress();
  const toList = normalizeRecipients(to);
  const bccList = normalizeRecipients(bcc);

  if (!resendConfigured || !from || !toList.length) {
    console.log("📧 [EMAIL MOCK] Would send to:", toList.join(", ") || to);
    if (bccList.length) console.log("📧 [EMAIL MOCK] BCC:", bccList.join(", "));
    console.log("📧 [EMAIL MOCK] Subject:", subject);
    return { success: true, mock: true };
  }

  const payload = {
    from,
    to: toList,
    subject,
    html,
    text: text || subject,
  };
  if (bccList.length) payload.bcc = bccList;
  if (EMAIL_REPLY_TO) payload.reply_to = EMAIL_REPLY_TO;

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.message || data?.error || `Resend request failed (${response.status})`;
      console.error("📧 Email error:", message);
      return { success: false, error: message };
    }
    console.log("📧 Email sent:", data?.id || "ok");
    return { success: true, messageId: data?.id };
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

// 2b. Free-tier storefront lead — sales team (commission program)
async function sendFreeTierLeadToSalesTeam({
  salesTeamEmail,
  bccDealerEmail,
  dealerName,
  dealerId,
  request,
  vehicle,
}) {
  const requestTypeLabel = {
    whatsapp: "WhatsApp Chat",
    live_video: "Live Video Viewing",
    walk_in: "Walk-In Booking",
  }[request.type] || request.type;

  const subject = `🔔 Commission-tier lead — ${dealerName} (${dealerId})`;
  const content = `
    <h1>New lead (free / commission tier)</h1>
    <p>This request is from a dealer on the <strong>commission program</strong>. Route to Our Sales Team to qualify and close.</p>

    <div class="highlight">
      <h3 style="margin-top: 0;">Dealer</h3>
      <p><strong>Name:</strong> ${dealerName}</p>
      <p><strong>Dealer ID:</strong> ${dealerId}</p>
    </div>

    <div class="highlight">
      <h3 style="margin-top: 0;">Request</h3>
      <p><strong>Type:</strong> ${requestTypeLabel}</p>
      <p><strong>Vehicle:</strong> ${vehicle?.title || "N/A"} (${vehicle?.vehicle_id || "N/A"})</p>
      <p><strong>Price:</strong> $${vehicle?.price?.toLocaleString() || "N/A"}</p>
    </div>

    <div class="info-box">
      <h3 style="margin-top: 0;">Customer</h3>
      <p><strong>Name:</strong> ${request.name || "Not provided"}</p>
      <p><strong>Phone:</strong> ${request.phone || "Not provided"}</p>
      <p><strong>Email:</strong> ${request.email || "Not provided"}</p>
      ${request.preferred_date ? `<p><strong>Preferred Date:</strong> ${request.preferred_date}</p>` : ""}
      ${request.preferred_time ? `<p><strong>Preferred Time:</strong> ${request.preferred_time}</p>` : ""}
      ${request.notes ? `<p><strong>Notes:</strong> ${request.notes}</p>` : ""}
    </div>

    <a href="${APP_BASE_URL}/admin" class="button">Open admin →</a>
  `;

  const opts = {
    to: salesTeamEmail,
    subject,
    html: wrapEmail(content, subject),
    text: `Commission-tier lead for ${dealerName} (${dealerId}). ${requestTypeLabel}. Customer: ${request.name}, ${request.phone}`,
  };
  if (bccDealerEmail) opts.bcc = bccDealerEmail;
  return sendEmail(opts);
}

async function sendDealerApplicationNotification({ salesTeamEmail, businessName, email, whatsapp, notes }) {
  const subject = `📋 New dealer waitlist application — ${businessName}`;
  const content = `
    <h1>New dealer application</h1>
    <p>Someone applied for the <strong>free commission tier</strong> from the landing page.</p>
    <div class="info-box">
      <p><strong>Business:</strong> ${businessName}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>WhatsApp:</strong> ${whatsapp || "—"}</p>
      ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ""}
    </div>
    <p>Review in the admin portal under <strong>Applications</strong>, then create a dealer with plan <code>free</code> when approved.</p>
    <a href="${APP_BASE_URL}/admin" class="button">Open admin →</a>
  `;

  return sendEmail({
    to: salesTeamEmail,
    subject,
    html: wrapEmail(content, subject),
    text: `New dealer application: ${businessName}, ${email}, WhatsApp: ${whatsapp || "n/a"}`,
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
  const subject = `🚀 Unlock direct leads — upgrade to Paid ($98/mo)`;
  const content = `
    <h1>Hi ${dealerName},</h1>
    <p>${reason}</p>

    <div class="info-box">
      <h3 style="margin-top: 0;">Your activity</h3>
      ${stats.requests != null ? `<p><strong>Viewing requests (month):</strong> ${stats.requests}</p>` : ""}
      ${stats.vehicles != null ? `<p><strong>Vehicles:</strong> ${stats.vehicles}</p>` : ""}
      ${stats.sold != null ? `<p><strong>Vehicles sold:</strong> ${stats.sold}</p>` : ""}
    </div>

    <div class="highlight">
      <h3 style="margin-top: 0;">${suggestedPlan}</h3>
      <p>With the <strong>paid</strong> plan, storefront and WhatsApp leads go straight to <em>your</em> sales team. You see every request in the dealer portal and own the customer relationship.</p>
    </div>

    <a href="${APP_BASE_URL}/landing" class="button">View paid plan →</a>

    <p style="font-size: 13px; color: #666;">Current: ${currentPlan}</p>
  `;

  return sendEmail({
    to: dealerEmail,
    subject,
    html: wrapEmail(content, subject),
    text: `${reason} Upgrade from ${currentPlan} to ${suggestedPlan} at ${APP_BASE_URL}/landing`,
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

// Admin notice to dealer
async function sendDealerAdminNotice({ email, dealerName, dealerId, subject, message }) {
  const content = `
    <h1>${subject}</h1>
    <p>Hi ${dealerName || "there"},</p>
    <div style="white-space:pre-wrap;line-height:1.6">${message}</div>
    <div class="info-box" style="margin-top:20px">
      <p><strong>Dealer ID:</strong> ${dealerId}</p>
      <p><a href="${APP_BASE_URL}/dealer">Open your dealer portal →</a></p>
    </div>
  `;
  return sendEmail({
    to: email,
    subject,
    html: wrapEmail(content, subject),
    text: `${subject}\n\n${message}\n\nDealer portal: ${APP_BASE_URL}/dealer`,
  });
}

async function sendAdminPasscodeEmail({ email, dealerName, dealerId, passcode }) {
  const subject = "Your Auto Concierge dealer portal passcode";
  const content = `
    <h1>Your passcode was updated</h1>
    <p>Hi ${dealerName}, an administrator set a new passcode for your dealer account.</p>
    <div class="highlight">
      <p><strong>Dealer ID:</strong> ${dealerId}</p>
      <p><strong>Passcode:</strong> ${passcode}</p>
    </div>
    <a href="${APP_BASE_URL}/dealer" class="button">Sign in to dealer portal →</a>
    <p style="font-size:13px;color:#666">Keep this email private.</p>
  `;
  return sendEmail({
    to: email,
    subject,
    html: wrapEmail(content, subject),
    text: `Dealer ID: ${dealerId}, Passcode: ${passcode}. Sign in: ${APP_BASE_URL}/dealer`,
  });
}

async function sendDealerReportAlert({
  inbox,
  dealerId,
  dealerName,
  reason,
  details,
  reporterName,
  reporterEmail,
  reporterPhone,
}) {
  const subject = `Report: ${dealerName || dealerId}`;
  const detailsHtml = details ? `<p><strong>Details:</strong> ${details}</p>` : "";
  const content = `
    <h1>Dealer reported on storefront</h1>
    <div class="highlight">
      <p><strong>Dealer:</strong> ${dealerName || "—"} (${dealerId})</p>
      <p><strong>Reason:</strong> ${reason}</p>
      ${detailsHtml}
    </div>
    <div class="info-box">
      <p><strong>Reporter:</strong> ${reporterName || "Anonymous"}</p>
      <p><strong>Email:</strong> ${reporterEmail || "—"}</p>
      <p><strong>Phone:</strong> ${reporterPhone || "—"}</p>
    </div>
  `;
  return sendEmail({
    to: inbox,
    subject,
    html: wrapEmail(content, subject),
    text: `Report for ${dealerId}: ${reason}. ${details || ""}`,
  });
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendNewRequestAlert,
  sendFreeTierLeadToSalesTeam,
  sendDealerApplicationNotification,
  sendLowInventoryAlert,
  sendFailedPaymentEmail,
  sendUpgradePromptEmail,
  sendReferralInviteEmail,
  sendPasscodeResetEmail,
  sendSuspensionNoticeEmail,
  sendDealerAdminNotice,
  sendAdminPasscodeEmail,
  sendDealerReportAlert,
};
