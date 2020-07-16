const redirectPage = (req, res) => {
  // TODO:
  // if (login) { redirect to user profile page}
  // else {
  res.redirect('/home');
  //}
};

const renderHomepage = (req, res) => {
  res.send('homepage');
};

module.exports = {
  redirectPage,
  renderHomepage
};