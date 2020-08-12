const {
  SESSION_NAME } = require('../server/config/config');
const { expect, requester, agent} = require('./set_up');
const { User } = require('../server/models');
const registerUser = {
  username: 'Yen Chen Kuo',
  email: 'yk@mail.com',
  password: 'password'
};
const { users } = require('./fake_data');

describe('User', async () => {
  it('POST /register success', async () => {
    const res = await requester
      .post('/api/1.0/register')
      .send(registerUser);
    const createdUser = await User.findOne({ where: { email: registerUser.email } });

    expect(res).to.have.status(200);
    expect(res).to.have.cookie(SESSION_NAME);
    expect(res).to.be.json;
    expect(res.body.userUrl).to.equal(createdUser.user_url);
  });

  it('POST /register without email, username or password', async () => {
    const user1 = {
      username: registerUser.username,
      email: registerUser.email,
    };

    const res1 = await requester
      .post('/api/1.0/register')
      .send(user1);
    expect(res1).to.have.status(400);
    expect(res1.body.error).to.equal('Username, email and password are required.');

    const user2 = {
      email: registerUser.email,
      password: registerUser.password,
    };

    const res2 = await requester
      .post('/api/1.0/register')
      .send(user2);
    expect(res2).to.have.status(400);
    expect(res2.body.error).to.equal('Username, email and password are required.');

    const user3 = {
      username: registerUser.username,
      password: registerUser.password,
    };

    const res3 = await requester
      .post('/api/1.0/register')
      .send(user3);
    expect(res3).to.have.status(400);
    expect(res2.body.error).to.equal('Username, email and password are required.');
  });

  it('POST /register email format not correct', async () => {
    const user = {
      username: registerUser.username,
      email: 'yk.mail.com',
      password: registerUser.password,
    };

    const res = await requester
      .post('/api/1.0/register')
      .send(user);

    expect(res).to.have.status(400);
    expect(res.body.error).to.equal('Email format not correct.');
  });

  it('POST /register duplicate', async () => {
    const res = await requester
      .post('/api/1.0/register')
      .send(users[0]);
    expect(res).to.have.status(409);
    expect(res.body.error).to.equal('This email has been used, please try another one.');
  });

  it('POST /signin success', async () => {
    const userData = {
      email: users[0].email,
      password: users[0].password
    };
    const res = await requester
      .post('/api/1.0/signin')
      .send(userData);
    const signinUser = await User.findOne({ where: { email: users[0].email } });

    expect(res).to.have.status(200);
    expect(res).to.have.cookie(SESSION_NAME);
    expect(res).to.be.json;
    expect(res.body.userUrl).to.equal(signinUser.user_url);
  });

  it('POST /signin without email or password', async () => {
    const user1 = {
      email: users[0].email,
    };

    const res1 = await requester
      .post('/api/1.0/signin')
      .send(user1);
    expect(res1).to.have.status(400);
    expect(res1.body.error).to.equal('Email and password are required.');

    const user2 = {
      password: users[0].password,
    };

    const res2 = await requester
      .post('/api/1.0/signin')
      .send(user2);
    expect(res2).to.have.status(400);
    expect(res2.body.error).to.equal('Email and password are required.');
  });

  it('POST /signin email format not correct', async () => {
    const user = {
      email: 'test.mail.com',
      password: users[0].password
    };

    const res = await requester
      .post('/api/1.0/signin')
      .send(user);

    expect(res).to.have.status(400);
    expect(res.body.error).to.equal('Email format not correct.');
  });

  it('POST /signin wrong email', async () => {
    const userData = {
      email: 'worong@mail.com',
      password: users[0].password
    };
    const res = await requester
      .post('/api/1.0/signin')
      .send(userData);

    expect(res).to.have.status(400);
    expect(res.body.error).to.equal('Email not found, please try to sign up.');
  });

  it('POST /signin wrong password', async () => {
    const userData = {
      email: users[0].email,
      password: 'wrong password'
    };
    const res = await requester
      .post('/api/1.0/signin')
      .send(userData);

    expect(res).to.have.status(400);
    expect(res.body.error).to.equal('Wrong password, please try again');
  });

  before(async () => {
    const userData = {
      email: users[0].email,
      password: users[0].password
    };
    await agent
      .post('/api/1.0/signin')
      .send(userData);
  });

  it('GET /logout success', async () => {
    const logoutRes = await agent
      .get('/api/1.0/logout');
    expect(logoutRes).to.redirect;
  });
});