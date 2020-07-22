const { User, Note } = require('../models');
const response = require('../response');

const renderUserPage = async (req, res, next) => {
  const { profileId, noteUrl } = req.params;
  const noteId = null;  // TOOD: Get Id from database
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
  res.render('note', {
    title: 'bear+',
    profileId,
    profile: JSON.stringify(profile),
    userId,
    userProfile: JSON.stringify(userProfile),
    noteId,
  });
};

module.exports = {
  renderUserPage,
};