require('dotenv').config();
const sgMail = require('@sendgrid/mail');

/**
 * Ensures SendGrid is configured correctly before attempting to send.
 * @returns {Object} { canSend: boolean, sender: string }
 */
function checkConfiguration() {
  const apiKey = process.env.SENDGRID_API_KEY;
  const sender = process.env.ALERT_EMAIL_SENDER;

  if (!apiKey || !sender) {
    return { canSend: false, sender: null };
  }

  // Only set API key if not already set or if it's correct
  sgMail.setApiKey(apiKey);
  return { canSend: true, sender };
}

/**
 * Formats a number as Indian Rupee (INR).
 * @param {number} amount 
 * @returns {string} Formatted string
 */
function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'Unknown';
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Escapes special characters for safe HTML rendering.
 * @param {string} text 
 * @returns {string}
 */
function escapeHtml(text) {
  if (!text) return '';
  return text.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sends a price drop alert email via SendGrid.
 * Does not throw errors to prevent crashing the caller.
 * 
 * @param {Object} params
 * @param {string} params.recipient - Email address of the recipient
 * @param {string} params.productName
 * @param {string} params.productUrl
 * @param {number} params.oldPrice
 * @param {number} params.newPrice
 * @returns {Promise<Object>} { success: boolean, skipped?: boolean }
 */
async function sendPriceDropAlert({ recipient, productName, productUrl, oldPrice, newPrice }) {
  try {
    const config = checkConfiguration();
    if (!config.canSend) {
      console.warn('[alerts] Missing SendGrid configuration (API Key or Sender). Skipping price drop alert.');
      return { success: false, skipped: true };
    }

    if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient)) {
      console.warn(`[alerts] Missing or invalid recipient email for price drop alert. Skipping.`);
      return { success: false, skipped: true };
    }

    const savedAmount = oldPrice - newPrice;
    let dropPercentage = 0;
    if (oldPrice > 0) {
      dropPercentage = Math.round((savedAmount / oldPrice) * 100);
    }

    const safeProductName = escapeHtml(productName);
    const safeProductUrl = escapeHtml(productUrl);

    const subject = `Price Drop Alert: ${productName}`;
    const textBody = `
Price Drop Alert

Product: ${productName}

Previous Price: ${formatCurrency(oldPrice)}
New Price: ${formatCurrency(newPrice)}
You Save: ${formatCurrency(savedAmount)}
Drop: ${dropPercentage}%

View Product: ${productUrl}

You are receiving this because you enabled alerts for this product on Price Tracker.
    `.trim();

    const htmlBody = `
<div style="font-family: Arial, sans-serif; background-color: #f4f4f5; padding: 20px 0; margin: 0; color: #18181b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    
    <div style="background-color: #000000; color: #ffffff; padding: 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 700;">Price Tracker</h1>
    </div>
    
    <div style="padding: 30px 20px;">
      <h2 style="margin: 0 0 15px 0; font-size: 22px; color: #10b981;">Price Drop Alert!</h2>
      <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; color: #3f3f46;">
        Good news! The price has dropped for a product you are tracking.
      </p>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin-bottom: 25px;">
        <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #0f172a;">${safeProductName}</h3>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 5px 0; color: #64748b; font-size: 14px;">Previous Price:</td>
            <td style="padding: 5px 0; text-align: right; text-decoration: line-through; color: #94a3b8; font-size: 14px;">${escapeHtml(formatCurrency(oldPrice))}</td>
          </tr>
          <tr>
            <td style="padding: 5px 0; color: #64748b; font-size: 14px; font-weight: bold;">New Price:</td>
            <td style="padding: 5px 0; text-align: right; font-weight: bold; color: #10b981; font-size: 20px;">${escapeHtml(formatCurrency(newPrice))}</td>
          </tr>
          <tr>
            <td style="padding: 5px 0; color: #64748b; font-size: 14px;">You Save:</td>
            <td style="padding: 5px 0; text-align: right; color: #0f172a; font-size: 14px;">${escapeHtml(formatCurrency(savedAmount))} (${dropPercentage}%)</td>
          </tr>
        </table>
      </div>
      
      <div style="text-align: center;">
        <a href="${safeProductUrl}" style="display: inline-block; background-color: #000000; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 24px; border-radius: 6px; font-size: 16px;">
          View Product
        </a>
      </div>
    </div>
    
    <div style="background-color: #f8fafc; padding: 15px 20px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; font-size: 12px; color: #64748b;">
        You received this email because you enabled alerts for this product on Price Tracker.
      </p>
    </div>
    
  </div>
</div>
    `.trim();

    const msg = {
      to: recipient,
      from: config.sender,
      subject,
      text: textBody,
      html: htmlBody
    };

    await sgMail.send(msg);
    console.log(`[alerts] Successfully sent price drop email for: ${productName}`);
    return { success: true };

  } catch (error) {
    console.error(`[alerts] Failed to send price drop email for ${productName}:`, error.response?.body || error.message);
    return { success: false, skipped: true };
  }
}

/**
 * Sends a back-in-stock alert email via SendGrid.
 * Does not throw errors to prevent crashing the caller.
 * 
 * @param {Object} params
 * @param {string} params.recipient - Email address of the recipient
 * @param {string} params.productName
 * @param {string} params.productUrl
 * @param {number} [params.price]
 * @returns {Promise<Object>} { success: boolean, skipped?: boolean }
 */
async function sendBackInStockAlert({ recipient, productName, productUrl, price }) {
  try {
    const config = checkConfiguration();
    if (!config.canSend) {
      console.warn('[alerts] Missing SendGrid configuration (API Key or Sender). Skipping back in stock alert.');
      return { success: false, skipped: true };
    }

    if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient)) {
      console.warn(`[alerts] Missing or invalid recipient email for back-in-stock alert. Skipping.`);
      return { success: false, skipped: true };
    }

    const safeProductName = escapeHtml(productName);
    const safeProductUrl = escapeHtml(productUrl);
    const safePriceStr = price ? escapeHtml(formatCurrency(price)) : '';

    const subject = `Back in Stock Alert: ${productName}`;
    const textBody = `
Back in Stock Alert

Product: ${productName}

The product is available again.
${price ? `Current Price: ${formatCurrency(price)}\n` : ''}
View Product: ${productUrl}

You are receiving this because you enabled alerts for this product on Price Tracker.
    `.trim();

    const htmlBody = `
<div style="font-family: Arial, sans-serif; background-color: #f4f4f5; padding: 20px 0; margin: 0; color: #18181b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    
    <div style="background-color: #000000; color: #ffffff; padding: 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 700;">Price Tracker</h1>
    </div>
    
    <div style="padding: 30px 20px;">
      <h2 style="margin: 0 0 15px 0; font-size: 22px; color: #3b82f6;">Back in Stock!</h2>
      <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; color: #3f3f46;">
        Good news! A product you are tracking is now available again.
      </p>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin-bottom: 25px;">
        <h3 style="margin: 0 0 10px 0; font-size: 18px; color: #0f172a;">${safeProductName}</h3>
        
        ${price ? `
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 5px 0; color: #64748b; font-size: 14px; font-weight: bold;">Current Price:</td>
            <td style="padding: 5px 0; text-align: right; font-weight: bold; color: #0f172a; font-size: 18px;">${safePriceStr}</td>
          </tr>
        </table>
        ` : ''}
      </div>
      
      <div style="text-align: center;">
        <a href="${safeProductUrl}" style="display: inline-block; background-color: #000000; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 24px; border-radius: 6px; font-size: 16px;">
          View Product
        </a>
      </div>
    </div>
    
    <div style="background-color: #f8fafc; padding: 15px 20px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; font-size: 12px; color: #64748b;">
        You received this email because you enabled alerts for this product on Price Tracker.
      </p>
    </div>
    
  </div>
</div>
    `.trim();

    const msg = {
      to: recipient,
      from: config.sender,
      subject,
      text: textBody,
      html: htmlBody
    };

    await sgMail.send(msg);
    console.log(`[alerts] Successfully sent back-in-stock email for: ${productName}`);
    return { success: true };

  } catch (error) {
    console.error(`[alerts] Failed to send back-in-stock email for ${productName}:`, error.response?.body || error.message);
    return { success: false, skipped: true };
  }
}

module.exports = {
  sendPriceDropAlert,
  sendBackInStockAlert,
  formatCurrency // exported for testing
};
