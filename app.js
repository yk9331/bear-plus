'use strict';
require('dotenv').config();
const path = require('path');
// const fs = require('fs');

const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const flash = require('connect-flash');
const passport = require('passport');
const passportSocketIo = require('passport.socketio');

const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const ejs = require('ejs');

const models = require('./server/models');
const config = require('./server/config');
const response = require('./server/response');
const realtime = require('./server/realtime/realtime_controller');

const express = require('express');
const app = express();
const server = require('http').createServer(app);
const port = 5000;

// Setup Socket
const io = require('socket.io')(server);
// io.engine.ws = new (require('ws').Server)({
//   noServer: true,
//   perMessageDeflate: false
// });
realtime.io = io;
app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(cookieParser());
app.use('/', express.static(path.join(__dirname, '/public')));

// Setup Session
var sessionStore = new SequelizeStore({
  db: models.sequelize
});
app.use(session({
  name: config.sessionName,
  secret: config.sessionSecret,
  resave: false, // don't save session if unmodified
  saveUninitialized: true, // always create session to ensure the origin
  rolling: true, // reset maxAge on every response
  cookie: {
    maxAge: config.sessionLife
  },
  store: sessionStore
}));

// Setup Passport
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

// Setup View Engine
app.set('views', './public/views');
app.engine('ejs', ejs.renderFile);
app.set('view engine', 'ejs');

// Set Generally Variables
app.locals.serverURL = config.serverURL;

// API Routes
app.use('/api/1.0', require('./server/routes/api_route'));

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

io.use(realtime.secure);
io.use(passportSocketIo.authorize({
  cookieParser: cookieParser,
  key: config.sessionName,
  secret: config.sessionSecret,
  store: sessionStore,
  success: realtime.onAuthorizeSuccess,
  fail: realtime.onAuthorizeFail
}));
io.sockets.on('connection', realtime.connection);

// Server Listen
models.sequelize.sync().then(function () {
  server.listen(port, () => { console.log(`Listening on port: ${port}`); });
});