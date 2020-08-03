const router = require('express').Router();
const { upload } = require('../util');
const s3Upload = upload('');
const noteImageUpload = s3Upload.fields([{ name: 'image', maxCount: 1 }]);
const avatarS3Upload = upload('avatar/');
const avatarImageUpload = avatarS3Upload.fields([{ name: 'avatar', maxCount: 1 }]);

const {
  register,
  emailAuthenticate,
  facebookSignin,
  facebookCallback,
  signinRedirect } = require('../controllers/auth_controller');

const {
  uploadImage,
  createNewNote,
  getNotes,
  getTags,
  updateNoteInfo,
  updateNoteUrl,
  updateNotePermission } = require('../controllers/note_controller');

const {
  getUserSetting,
  updateUserSetting,
  updateUserPassword,
  updateUserAvatar } = require('../controllers/user_controller');

// Auth
router.route('/register')
  .post(register, emailAuthenticate);

router.route('/signin')
  .post(emailAuthenticate);

router.route('/auth/facebook')
  .get(facebookSignin);

router.route('/auth/facebook/callback')
  .get(facebookCallback,signinRedirect);

router.route('/logout')
  .get((req, res) => {
    req.logOut();
    res.redirect('/');
  });


// User Setting
router.route('/user/setting')
  .get(getUserSetting)
  .post(updateUserSetting);

router.route('/user/password')
  .post(updateUserPassword);

router.route('/user/avatar')
  .post(avatarImageUpload, updateUserAvatar);

// Notes
router.route('/notes')
  .get(getNotes);

//Tags
router.route('/tags')
  .get(getTags);

// Note
router.route('/note')
  .get(createNewNote);

router.route('/note/url')
  .post(updateNoteUrl);

router.route('/note/permission')
  .post(updateNotePermission);

router.route('/note/:action')
  .post(updateNoteInfo);

// Editor
router.route('/editor/image')
  .post(noteImageUpload, uploadImage);

module.exports = router;