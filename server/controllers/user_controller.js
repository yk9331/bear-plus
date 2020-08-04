'use strict';

const { User, Note } = require('../models');
const response = require('../response');

const renderUserPage = async (req, res, next) => {
  const { profileId, noteUrl } = req.params;
  if (profileId.search(/^@/) === -1) return next();
  const profileUser = await User.findOne({
    where: {
      userid: profileId.replace('@', '')
    }
  });
  if (!profileUser) return response.errorNotFound(req, res);
  const profile = User.getProfile(profileUser);
  let userId = null;
  let userProfile = null;
  if (req.isAuthenticated()) {
    userId = '@' + req.user.userid;
    userProfile = await User.getProfile(req.user);
  }
  let noteId = null;
  if (noteUrl) {
    const note = await Note.findOne({
      attributes: ['id'],
      where: {
        ownerId: profileUser.id,
        shortid: noteUrl
      }
    });
    noteId = note ? note.id : null;
    if (!noteId) return response.errorNotFound(req, res);
  }
  res.render('note', {
    title: 'bear+',
    profileId,
    profile: JSON.stringify(profile),
    userId,
    userProfile: JSON.stringify(userProfile),
    noteId,
  });
};

const getUserSetting = (req, res) => {
  if (!req.isAuthenticated()) {
    return response.errorForbidden(req, res);
  }
  if (req.user.profileid) {
    res.json({
      id: req.user.id,
      provider: 'facebook',
      userId: req.user.userid,
      profile: User.getProfile(req.user),
    });
  } else {
    res.json({
      id: req.user.id,
      provider: 'native',
      userId: req.user.userid,
      profile: User.getProfile(req.user),
      email: req.user.email
    });
  }
};

const updateUserSetting = async (req, res) => {
  try{
    const resData = {};
    const { email, shortUrl, username } = req.body;
    if (email) {
      const user = await User.findOne({ where: { email } });
      if (user) {
        resData.emailError = 'this email already in use.';
      } else {
        User.update({ email }, { where: { id: req.user.id } });
        resData.email = email;
      }
    }
    if (shortUrl) {
      const user = await User.findOne({ where: { userid: shortUrl } });
      if (user) {
        resData.urlError = 'this url already in use, please try another one.';
      } else {
        User.update({ userid: shortUrl }, { where: { id: req.user.id } });
        resData.shortUrl = shortUrl;
      }
    }
    if (username) {
      const profile = User.getProfile(req.user);
      const newProfile = {
        provider: 'updated',
        username: username,
        photo: profile.biggerphoto,
      };
      await User.update({ profile: JSON.stringify(newProfile), }, {
        where: {
          id: req.user.id
        }
      });
      resData.username = username;
    }
      res.json(resData);
  } catch (e) {
    console.log(e);
    res.json({ error: 'Something go wrong, please try again later.' });
  }
};

const updateUserPassword = async (req, res) => {
  if (!await req.user.verifyPassword(req.body.password)) {
    return res.json({ error: 'Wrong password, please try again.' });
  }
  await req.user.update({ password: req.body.newPassword });
  res.json({msg: 'Success! Your Password has been changed!'});
};

const updateUserAvatar = async (req, res) => {
  try {
    const url = req.files.avatar[0].location;
    const profile = User.getProfile(req.user);
    const newProfile = {
      provider: 'updated',
      username: profile.name,
      photo: url
    };
    await req.user.update({ profile: JSON.stringify(newProfile)});
    res.json({ url });
  } catch (e) {
    console.log(e);
    res.status(400).json({ error: 'update avatar faild, please try again later.' });
  }
};

module.exports = {
  renderUserPage,
  getUserSetting,
  updateUserSetting,
  updateUserPassword,
  updateUserAvatar
};