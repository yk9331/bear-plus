const router = require('express').Router();
const { renderUserPage } = require('../controllers/user_controller');

const redirecUser = (req, res) => {
  if (req.user) {
    res.redirect(`/@${req.user.user_url}`);
  }
  else {
    res.redirect('/home');
  }
};

router.route('/')
  .get(redirecUser);

router.route('/home')
  .get((req, res) => { res.render('home');});

router.route('/:profileUrl')
  .get(renderUserPage);

router.route('/:profileUrl/:noteUrl')
  .get(renderUserPage);

module.exports = router;