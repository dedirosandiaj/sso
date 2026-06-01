require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: true, // SSL
  auth: {
    user: process.env.SMTP_USER || 'alert@ucentric.id',
    pass: process.env.SMTP_PASSWORD,
  },
});

// Test connection
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ SMTP connection failed:', error.message);
  } else {
    console.log('✅ SMTP server is ready to send emails');
  }
});

module.exports = transporter;
