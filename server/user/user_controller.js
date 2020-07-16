const { User } = require('../models');

const renderUserPage = async (req, res, next) => {
  const { profileId } = req.params;
  if (profileId.search(/^@/) === -1) return next();
  const profileUser = await User.findOne({
    where: {
      userid: profileId.replace('@', '')
    }
  });
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
    profile,
    userId,
    userProfile,
  });
};

module.exports = {
  renderUserPage,
};