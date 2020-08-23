const { NODE_ENV } = require('../server/config/config');
const { User, sequelize } = require('../server/models');
const {
  users
} = require('./fake_data');

async function createFakeUsers() {
  const userData = [];
  for (const u of users) {
    const hashPassword = await User.hashPassword(u.password);
    userData.push({
      email: u.email,
      password: hashPassword,
      profile: JSON.stringify({ username: u.username })
    });
  }
  await User.bulkCreate(userData);
}

async function createFakeData() {
  if (NODE_ENV !== 'test') {
    console.log('Not in test env');
    return;
  }
  try {
    await createFakeUsers();
  } catch (err) {
    console.log(err);
  }
}

async function truncateFakeData() {
  if (NODE_ENV !== 'test') {
    console.log('Not in test env');
    return;
  }
  console.log('truncate fake data');
  try {
    const tr = await sequelize.transaction();
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction: tr });
    await sequelize.truncate({ transaction: tr });
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction: tr });
    tr.commit();
    return;
  } catch (err) {
    console.log(err);
  }
}

function closeConnection() {
  return sequelize.close();
}

module.exports = {
  createFakeData,
  truncateFakeData,
  closeConnection
};
