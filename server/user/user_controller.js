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

module.exports = {
  renderUserPage,
};