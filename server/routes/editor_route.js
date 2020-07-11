const router = require('express').Router();
const { upload } = require('../util/util');

const s3Upload = upload('');
const noteImageUpload = s3Upload.fields([{ name: 'image', maxCount: 1}]);

const {
  uploadImage
} = require('../controller/editor_controller');

router.route('/editor/image')
  .post(noteImageUpload, uploadImage);

module.exports = router;