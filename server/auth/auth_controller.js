'use strict';

const passport = require('passport');
const validator = require('validator');
const LocalStrategy = require('passport-local').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const { NODE_ENV, SERVER_URL, FACEBOOK_ID, FACEBOOK_SECRET } = process.env;
const { User } = require('../models');
const response = require('../response');
const serverULR = NODE_ENV === 'development' ? '' : SERVER_URL;

const setReturnToFromReferer = function setReturnToFromReferer(req) {
  var referer = req.get('referer');
  console.log(referer);
  if (!req.session) req.session = {};
  req.session.returnTo = referer;
};

const passportGeneralCallback = function callback (accessToken, refreshToken, profile, done) {
  var stringifiedProfile = JSON.stringify(profile);
  User.findOrCreate({
    where: {
      profileid: profile.id.toString()
    },
    defaults: {
      userid: profile.id.toString(),
      profile: stringifiedProfile,
      accessToken: accessToken,
      refreshToken: refreshToken
    }
  }).then(function (result) {
    const [user, created] = result;
    if (user) {
      var needSave = false;
      if (user.profile !== stringifiedProfile) {
        user.profile = stringifiedProfile;
        needSave = true;
      }
      if (user.accessToken !== accessToken) {
        user.accessToken = accessToken;
        needSave = true;
      }
      if (user.refreshToken !== refreshToken) {
        user.refreshToken = refreshToken;
        needSave = true;
      }
      if (needSave) {
        user.save().then(function () {
          return done(null, user);
        });
      } else {
        return done(null, user);
      }
    }
  }).catch(function (err) {
    return done(err, null);
  });
};

passport.serializeUser(function (user, done) {
  return done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  User.findOne({
    where: {
      id: id
    }
  }).then(function (user) {
    // Don't die on non-existent user
    if (user == null) {
      return done(null, false, { message: 'Invalid UserID' });
    }
    return done(null, user);
  }).catch(function (err) {
    return done(err, null);
  });
});

passport.use(new LocalStrategy({
  usernameField: 'email'
}, async function (email, password, done) {
  if (!validator.isEmail(email)) return done(null, false);
  try {
    const user = await User.findOne({
      where: {
        email: email
      }
    });

    if (!user) return done(null, false);
    if (!await user.verifyPassword(password)) return done(null, false);
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.use(new FacebookStrategy({
  clientID: FACEBOOK_ID,
  clientSecret: FACEBOOK_SECRET,
  callbackURL: `${serverULR}/api/1.0/auth/facebook/callback`
}, passportGeneralCallback));

async function register(req, res, next) {
  console.log(req.body);
  if (!req.body.email || !req.body.password || !req.body.userId || !req.body.username ) return response.errorBadRequest(req, res);
  if (!validator.isEmail(req.body.email)) return response.errorBadRequest(req, res);
  const profile = {
    username: req.body.username
  };
  try {
    const [user, created] = await User.findOrCreate({
      where: {
        email: req.body.email
      },
      defaults: {
        password: req.body.password,
        userid: req.body.userId,
        profile: JSON.stringify(profile)
      }
    });

    if (!user) {
      req.flash('error', 'Failed to register your account, please try again.');
      return res.redirect('/');
    }

    if (created) {
      req.flash('info', 'You\'ve successfully registered, please signin.');
      return next();
    } else {
      req.flash('error', 'This email has been used, please try another one.');
      return res.redirect(`/`);
    }
  } catch (err) {
    console.log(err);
    return response.errorInternalError(req, res);
  }
}

function emailAuthenticate(req, res, next) {
  if (!req.body.email || !req.body.password) return response.errorBadRequest(req, res);
  if (!validator.isEmail(req.body.email)) return response.errorBadRequest(req, res);
  passport.authenticate('local', {
    failureRedirect: '/',
    failureFlash: 'Invalid email or password.'
  })(req, res, next);
}

function facebookSignin(req, res, next) {
  setReturnToFromReferer(req);
  passport.authenticate('facebook')(req, res, next);
}

function facebookCallback(req, res, next) {
  passport.authenticate('facebook', {
    failureRedirect: '/'
  })(req, res, next);
}

function googleSignin(req, res, next) {
  // TODO: Add Google Auth
}

function googleCallback(req, res, next) {
  // TODO: Add Google Auth
}

function signinRedirect(req, res, next) {
  res.redirect(`/@${req.user.userid}`);
}

module.exports = {
  register,
  emailAuthenticate,
  signinRedirect,
  facebookSignin,
  facebookCallback,
  googleSignin,
  googleCallback
};