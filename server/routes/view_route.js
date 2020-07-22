const router = require('express').Router();
const { renderUserPage } = require('../user/user_controller');
const { redirectPage, renderHomepage } = require('../home/home_controller');

router.route('/')
  .get(redirectPage);

router.route('/home')
  .get(renderHomepage);

router.route('/:profileId')
  .get(renderUserPage);

router.route('/:profileId/:noteUrl')
  .get(renderUserPage);

module.exports = router;