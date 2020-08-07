const router = require('express').Router();
const { S3_NOTE_IMAGE_PATH, S3_USER_AVATAR_PATH } = require('../config/config');

// S3 image upload middleware
const { upload } = require('../util');
const imageS3Upload = upload(S3_NOTE_IMAGE_PATH);
const noteImageUpload = imageS3Upload.fields([{ name: 'image', maxCount: 1 }]);
const avatarS3Upload = upload(S3_USER_AVATAR_PATH);
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
  updateNoteInfo,
  updateNoteUrl,
  updateNotePermission } = require('../controllers/note_controller');

const {
  getTags } = require('../controllers/tag_controller');

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

// User
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
  .post(createNewNote);

router.route('/note/url')
  .patch(updateNoteUrl);

router.route('/note/permission')
  .patch(updateNotePermission);

router.route('/note/:action')
  .patch(updateNoteInfo);

// Editor
router.route('/editor/image')
  .post(noteImageUpload, uploadImage);

module.exports = router;