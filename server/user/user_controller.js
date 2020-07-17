const { User, Note } = require('../models');
const response = require('../response');

const renderUserPage = async (req, res, next) => {
  const { profileId } = req.params;
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
  const noteList = await Note.findAll({
    where: {
      ownerId: profileUser.id
    }
  });
  res.render('note', {
    title: 'bear+',
    profileId,
    profile: JSON.stringify(profile),
    userId,
    userProfile: JSON.stringify(userProfile) ,
    noteList: JSON.stringify(noteList),
    tagList: null
  });
};

module.exports = {
  renderUserPage,
};