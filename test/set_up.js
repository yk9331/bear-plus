const app = require('../app');
const chai = require('chai');
const chaiHttp = require('chai-http');
const { NODE_ENV } = require('../server/config/config');
const { truncateFakeData, createFakeData, closeConnection } = require('./fake_data_generator');

chai.use(chaiHttp);
const expect = chai.expect;
const requester = chai.request(app).keepOpen();
const agent = chai.request.agent(app);

before(async () => {
  if (NODE_ENV !== 'test') { throw 'Not in test env';}
  await truncateFakeData();
  await createFakeData();
});

after(async () => {
  console.log('close');
  await closeConnection();
  requester.close();
  agent.close();
});

module.exports = {
  expect,
  requester,
  agent,
};