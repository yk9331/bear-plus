'use strict';

const { User, Note } = require('../models');
const response = require('../utils/response');

const renderUserPage = async (req, res, next) => {
  try {
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
      if (note.view_permission == 'private') return response.errorPrivateNote(req, res);
    }
    res.render('note', {
      title: 'bear+',
      profileUrl,
      profile: JSON.stringify(profile),
      userUrl,
      userProfile: JSON.stringify(userProfile),
      noteId,
    });
  } catch (err) {
    console.log('render user page error:', err);
    response.errorInternalError(req, res);
  }
};

const getUserSetting = (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(403).json({ error: 'Please sign in to view the setting' });
  }
  if (req.user.profileid) {
    res.status(200).json({
      id: req.user.id,
      provider: 'facebook',
      userUrl: req.user.user_url,
      profile: User.getProfile(req.user),
    });
  } else {
    res.status(200).json({
      id: req.user.id,
      provider: 'native',
      userUrl: req.user.user_url,
      profile: User.getProfile(req.user),
      email: req.user.email
    });
  }
};

const updateUserSetting = async (req, res) => {
  const resData = {};
  const { email, userUrl, username } = req.body;
  const tr = await User.sequelize.transaction();
  try {
    if (userUrl) {
      const urlUser = await User.findOne({ where: { user_url: userUrl }, transaction: tr });
      if (urlUser) {
        resData.urlError = 'This url already in use, please try another one.';
      } else {
        await req.user.update({ user_url: userUrl }, { transaction: tr });
        resData.userUrl = userUrl;
      }
    }
    if (email) {
      const emailUser = await User.findOne({ where: { email }, transaction: tr });
        if (emailUser) {
          resData.emailError = 'This email already in use.';
        } else {
          await req.user.update({ email }, { transaction: tr });
          resData.email = email;
        }
    }
    if (resData.emailError || resData.urlError) {
      await tr.rollback();
      return res.status(409).json(resData);
    }
    if (username) {
      const profile = User.getProfile(req.user);
      const newProfile = {
        provider: 'updated',
        username: username,
        photo: profile.biggerphoto,
      };
      await req.user.update({ profile: JSON.stringify(newProfile) }, { transaction: tr });
      resData.username = username;
    }
    await tr.commit();
    return res.status(200).json(resData);
  } catch (err) {
    await tr.rollback();
    return res.status(500).json({ error: 'System Error: failed to update user setting.' });
  }
};

const updateUserPassword = async (req, res) => {
  try {
    if (!await req.user.verifyPassword(req.body.password)) {
      return res.status(403).json({ error: 'Wrong password, please try again.' });
    }
    await req.user.update({ password: req.body.newPassword });
    res.status(200).json({ msg: 'Success! Your Password has been changed!' });
  } catch (err) {
    console.log('update user password error', err);
    res.status(500).json({ error: 'System Error: failed to update user password' });
  }
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
    res.status(200).json({ url });
  } catch (err) {
    console.log('update user avatar error', err);
    res.status(500).json({ error: 'System Error: failed to update user avatar.' });
  }
};

module.exports = {
  renderUserPage,
  getUserSetting,
  updateUserSetting,
  updateUserPassword,
  updateUserAvatar
};