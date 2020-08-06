'use strict';

const {
  NODE_ENV, PORT, PORT_TEST, API_VERSION,
  SESSION_NAME, SESSION_SECRETE, SESSION_LIFE } = require('./server/config/config');
const port = NODE_ENV == 'test' ? PORT_TEST : PORT;

const path = require('path');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const passport = require('passport');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const ejs = require('ejs');

const models = require('./server/models');
const response = require('./server/response');
const realtime = require('./server/controllers/realtime_controller');

const express = require('express');
const app = express();
const server = require('http').createServer(app);

// Setup Session
var sessionStore = new SequelizeStore({
  db: models.sequelize
});
app.use(session({
  name: SESSION_NAME,
  secret: SESSION_SECRETE,
  resave: false,
  saveUninitialized: true,
  rolling: true,
  cookie: {
    maxAge: SESSION_LIFE
  },
  store: sessionStore
}));

// Setup Socket
const io = realtime.initSocket(server, sessionStore);
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(cookieParser());

// Front-End Assets
app.use('/build', express.static(path.join(__dirname, '/public/build')));
app.use('/img', express.static(path.join(__dirname, '/public/img')));

// Setup Passport
app.use(passport.initialize());
app.use(passport.session());

// Setup View Engine
app.set('views', './public/views');
app.engine('ejs', ejs.renderFile);
app.set('view engine', 'ejs');

// API Routes
app.use(`/api/${API_VERSION}`, require('./server/routes/api_route'));

// Main View Routes
app.use('/', require('./server/routes/view_route'));

// 404 Not Found
app.use((req, res, next) => {
  response.errorNotFound(req, res);
});

// Error Handler
app.use((err, req, res, next) => {
  console.log(err);
  response.errorInternalError(req, res);
});

// Server Listen
models.sequelize.sync().then(function () {
  server.listen(port, () => { console.log(`Listening on port: ${port}`); });
});