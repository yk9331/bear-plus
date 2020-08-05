'use strict';
require('dotenv').config();
const { PORT, API_VERSION, SESSION_NAME, SESSION_SECRETE} = process.env;
const config = require('./server/config/config');
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
  resave: false, // don't save session if unmodified
  saveUninitialized: true, // always create session to ensure the origin
  rolling: true, // reset maxAge on every response
  cookie: {
    maxAge: config.SESSION_LIFE
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
app.use('/', express.static(path.join(__dirname, '/public')));

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
  server.listen(PORT, () => { console.log(`Listening on port: ${PORT}`); });
});