'use strict';

const passport = require('passport');
const validator = require('validator');
const LocalStrategy = require('passport-local').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const { NODE_ENV, API_VERSION, LOCAL_SERVER_URL, SERVER_URL, FACEBOOK_ID, FACEBOOK_SECRET } = require('../config/config');
const serverULR = NODE_ENV === 'development' ? LOCAL_SERVER_URL : SERVER_URL;
const { User } = require('../models');

passport.serializeUser(function (user, done) {
  return done(null, user.id);
});

passport.deserializeUser(async function (id, done) {
  try {
    const user = await User.findByPk(id);
    if (!user) {
      return done(null, false, { message: 'Invalid UserID' });
    } else {
      return done(null, user);
    }
  } catch (err) {
    return done(err, null);
  }
});

passport.use(new LocalStrategy({
  usernameField: 'email'
}, async function (email, password, done) {
  try {
    const user = await User.findOne({ where: { email: email } });
    if (!user) return done(null, false, 'Email not found, please try to sign up.');
    if (!await user.verifyPassword(password)) return done(null, false, 'Wrong password, please try again');
    return done(null, user);
  } catch (err) {
    return done(err, null);
  }
}));

const passportCallback = async (accessToken, refreshToken, profile, done) => {
  var stringifiedProfile = JSON.stringify(profile);
  try {
    const [user, created] = await User.findOrCreate({
      where: {
        profile_id: profile.id.toString()
      },
      defaults: {
        profile: stringifiedProfile,
        access_token: accessToken,
        refresh_token: refreshToken
      }
    });
    if (!created) {
      let needSave = false;
      if (user.profile.provider != 'updated' && user.profile !== stringifiedProfile) {
        user.profile = stringifiedProfile;
        needSave = true;
      }
      if (user.access_token !== accessToken) {
        user.access_token = accessToken;
        needSave = true;
      }
      if (user.refresh_token !== refreshToken) {
        user.refresh_token = refreshToken;
        needSave = true;
      }
      if (needSave) {
        await user.save();
        return done(null, user);
      }
    }
    return done(null, user);
  } catch (err) {
    return done(err, null);
  }
};

passport.use(new FacebookStrategy({
  clientID: FACEBOOK_ID,
  clientSecret: FACEBOOK_SECRET,
  callbackURL: `${serverULR}/api/${API_VERSION}/auth/facebook/callback`
}, passportCallback));

async function register(req, res, next) {
  if (!req.body.email || !req.body.password || !req.body.username) {
    return res.json({ error: 'Username, email and password are required.' });
  }
  if (!validator.isEmail(req.body.email)) return res.json({error: 'Email formate not correct.'});
  const profile = { username: encodeURIComponent(req.body.username) };
  try {
    const [user, created] = await User.findOrCreate({
      where: {
        email: req.body.email
      },
      defaults: {
        password: req.body.password,
        profile: JSON.stringify(profile)
      }
    });
    if (!user) {
      return res.json({ error: 'System error, please try again later.' });
    }
    if (created) {
      return next();
    } else {
      return res.json({ error: 'This email has been used, please try another one.' });
    }
  } catch (err) {
    console.log('register error:', err);
    return res.json({ error: 'System error, please try again later.' });
  }
}

function emailAuthenticate(req, res, next) {
  if (!req.body.email || !req.body.password) return res.json({error: 'Email and password are required.'});
  if (!validator.isEmail(req.body.email)) return res.json({error: 'Email format not correct.'});
  passport.authenticate('local',function(err, user, info) {
    if (err) return res.json({ error: 'System error, please try again later.' });
    if (!user) return res.json({ error: info });
    req.logIn(user, function(err) {
      if (err) { return res.json({ error: 'System error, please try again later.' });}
      return res.json({ userUrl: user.user_url });
    });
  })(req, res, next);
}

function facebookSignin(req, res, next) {
  passport.authenticate('facebook')(req, res, next);
}

function facebookCallback(req, res, next) {
  passport.authenticate('facebook', {
    failureRedirect: `/api/${API_VERSION}/auth/facebook/failed`
  })(req, res, next);
}

function signinRedirect(req, res) {
  res.redirect(`/@${req.user.user_url}`);
}

module.exports = {
  register,
  emailAuthenticate,
  signinRedirect,
  facebookSignin,
  facebookCallback,
};