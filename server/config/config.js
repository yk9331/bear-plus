require('dotenv').config();

const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 5000,
  PORT_TEST: process.env.PORT_TEST || 5001,

  API_VERSION: process.env.API_VERSION,
  SERVER_URL: process.env.SERVER_URL,
  LOCAL_SERVER_URL: process.env.LOCAL_SERVER_URL,

  PRODUCTION_DB_URL: process.env.PRODUCTION_DB_URL,
  DEVELOPMENT_DB_URL: process.env.DEVELOPMENT_DB_URL,
  TEST_DB_URL: process.env.TEST_DB_URL,

  SESSION_NAME: process.env.SESSION_NAME,
  SESSION_SECRETE: process.env.SESSION_SECRETE,
  SESSION_LIFE: 14 * 24 * 60 * 60 * 1000,   // 14 Days

  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_ACCESS_KEY_SECRET: process.env.AWS_ACCESS_KEY_SECRET,
  AWS_REGION: process.env.AWS_REGION,

  S3_URL: process.env.S3_URL,
  S3_NOTE_IMAGE_PATH: 'note/image/',
  S3_USER_AVATAR_PATH: 'user/avatar/',

  FACEBOOK_ID: process.env.FACEBOOK_ID,
  FACEBOOK_SECRET: process.env.FACEBOOK_SECRET,

  NOTE_USER_COLORS: ['#8FBCBB', '#A3BE8C', '#88C0D0', '#D08770', '#81A1C1', '#BF616A', '#5E81AC', '#EBCB8B'],
  NOTE_MAX_STEP_HISTORY: 10000,
  NOTE_SAVE_INTERVAL: 1e4,

  PWD_SALT_ROUND: parseInt(process.env.PWD_SALT_ROUND)
};

module.exports = config;