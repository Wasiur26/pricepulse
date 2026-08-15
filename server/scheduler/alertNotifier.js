const Alert = require("../models/Alert");

class AlertNotifier {
  constructor() {
    this.emailEnabled = process.env.EMAIL_NOTIFICATIONS_ENABLED === "true";
    this.webhookUrl = process.env.ALERT_WEBHOOK_URL || null;
    this.smtpHost = process.env.SMTP_HOST || null;
    this.sendgridApiKey = process.env.SENDGRID_API_KEY || null;
  }

  async dispatchNotification(alert, item, user) {
    const notifications = [];

    // 1. Console / System log notification
    console.log(
      `[ALERT TRIGGERED] Item: "${item.name}" | Price: ${alert.payload.currentPrice} ${item.currency || "USD"} (Target: ${item.targetPrice} ${item.currency || "USD"}) | User: ${user?.email || user?.name || "Unknown"}`,
    );

    // 2. Email notification handler (placeholder for SendGrid / SMTP / Resend)
    if (this.emailEnabled && user?.email) {
      notifications.push(this.sendEmailNotification(alert, item, user));
    }

    // 3. Webhook notification handler (placeholder for Discord / Slack / Webhook URL)
    if (this.webhookUrl) {
      notifications.push(this.sendWebhookNotification(alert, item, user));
    }

    await Promise.allSettled(notifications);

    // Update alert status as sent
    try {
      await Alert.updateOne(
        { _id: alert._id },
        { $set: { sentAt: new Date() } },
      );
    } catch (err) {
      console.error(`Failed to update alert ${alert._id} sentAt:`, err.message);
    }
  }

  async sendEmailNotification(alert, item, user) {
    try {
      // Placeholder for email delivery integration (e.g. Nodemailer, SendGrid, Resend)
      // When SMTP or SendGrid keys are configured in .env, connect to provider:
      if (this.sendgridApiKey) {
        // e.g. await sendgrid.send({ to: user.email, ... })
        console.log(`[Email Dispatched via SendGrid] To: ${user.email}`);
      } else if (this.smtpHost) {
        // e.g. await transporter.sendMail({ to: user.email, ... })
        console.log(`[Email Dispatched via SMTP] To: ${user.email}`);
      } else {
        console.log(
          `[Email Notification Placeholder] To: ${user.email} | Subject: Price Alert for ${item.name}`,
        );
      }
      return { success: true, channel: "email" };
    } catch (error) {
      console.error(`Failed to send email alert to ${user.email}:`, error.message);
      return { success: false, channel: "email", error: error.message };
    }
  }

  async sendWebhookNotification(alert, item, user) {
    try {
      if (!this.webhookUrl) return { success: false, reason: "No webhook URL" };

      const payload = {
        event: "price_alert",
        itemId: item._id,
        itemName: item.name,
        itemUrl: item.url,
        currentPrice: alert.payload.currentPrice,
        targetPrice: item.targetPrice,
        currency: item.currency || "USD",
        user: user?.email || user?.name || "User",
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      return { success: response.ok, channel: "webhook", status: response.status };
    } catch (error) {
      console.error("Failed to dispatch webhook alert:", error.message);
      return { success: false, channel: "webhook", error: error.message };
    }
  }
}

const alertNotifier = new AlertNotifier();

module.exports = {
  AlertNotifier,
  alertNotifier,
};
