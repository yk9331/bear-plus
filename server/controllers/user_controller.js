'use strict';

const { User, Note } = require('../models');
const response = require('../response');

const renderUserPage = async (req, res, next) => {
  const { profileUrl, noteUrl } = req.params;
  const profileUser = await User.findOne({
    where: {
      user_url: profileUrl.replace('@', '')
    }
  });
  if (!profileUser) return response.errorNotFound(req, res);
  const profile = User.getProfile(profileUser);
  let userUrl = null;
  let userProfile = null;
  if (req.isAuthenticated()) {
    userUrl = '@' + req.user.user_url;
    userProfile = await User.getProfile(req.user);
  }
  let noteId = null;
  if (noteUrl) {
    const note = await Note.findOne({
      attributes: ['id'],
      where: {
        owner_id: profileUser.id,
        note_url: noteUrl
      }
    });
    noteId = note ? note.id : null;
    if (!noteId) return response.errorNotFound(req, res);
  }
  res.render('note', {
    title: 'bear+',
    profileUrl,
    profile: JSON.stringify(profile),
    userUrl,
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
      userUrl: req.user.user_url,
      profile: User.getProfile(req.user),
    });
  } else {
    res.json({
      id: req.user.id,
      provider: 'native',
      userUrl: req.user.user_url,
      profile: User.getProfile(req.user),
      email: req.user.email
    });
  }
};

const updateUserSetting = async (req, res) => {
  try{
    const resData = {};
    const { email, userUrl, username } = req.body;
    if (email) {
      const user = await User.findOne({ where: { email } });
      if (user) {
        resData.emailError = 'this email already in use.';
      } else {
        User.update({ email }, { where: { id: req.user.id } });
        resData.email = email;
      }
    }
    if (userUrl) {
      const user = await User.findOne({ where: { user_url: userUrl } });
      if (user) {
        resData.urlError = 'this url already in use, please try another one.';
      } else {
        User.update({ user_url: userUrl }, { where: { id: req.user.id } });
        resData.userUrl = userUrl;
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
    res.status(400).json({ error: 'update avatar failed, please try again later.' });
  }
};

module.exports = {
  renderUserPage,
  getUserSetting,
  updateUserSetting,
  updateUserPassword,
  updateUserAvatar
};