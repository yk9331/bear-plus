const redirectPage = (req, res) => {
  if (req.user) {
    res.redirect(`/@${req.user.userid}`);
  }
  else {
    res.redirect('/home');
  }
};

const renderHomepage = (req, res) => {
  res.render('home');
};

module.exports = {
  redirectPage,
  renderHomepage
};