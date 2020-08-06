require('dotenv').config();

const config = {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  PORT_TEST: process.env.PORT_TEST,
  API_VERSION: '1.0',
  SESSION_NAME: process.env.SESSION_NAME,
  SESSION_SECRETE: process.env.SESSION_SECRETE,
  SESSION_LIFE: 14 * 24 * 60 * 60 * 1000,   // 14 Days

  S3_URL: 'https://bear-plus.s3.us-east-2.amazonaws.com',

  NOTE_USER_COLORS: ['#8FBCBB', '#A3BE8C', '#88C0D0', '#D08770', '#81A1C1', '#BF616A', '#5E81AC', '#EBCB8B'],
  NOTE_MAX_STEP_HISTORY: 10000,
  NOTE_SAVE_INTERVAL: 1e4,
};

module.exports = config;