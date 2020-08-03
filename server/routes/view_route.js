const router = require('express').Router();
const { renderUserPage } = require('../controllers/user_controller');

const redirecUser = (req, res) => {
  if (req.user) {
    res.redirect(`/@${req.user.userid}`);
  }
  else {
    res.redirect('/home');
  }
};

router.route('/')
  .get(redirecUser);

router.route('/home')
  .get((req, res) => { res.render('home');});

router.route('/:profileId')
  .get(renderUserPage);

router.route('/:profileId/:noteUrl')
  .get(renderUserPage);

module.exports = router;