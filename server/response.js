function errorPrivateNote(req, res) {
  responseError(res, '403', 'Private Note', 'You are not allow to view this note.');
}

function errorForbidden(req, res) {
  responseError(res, '403', 'Forbidden', 'You are not allow to view this page.');
}

function errorNotFound (req, res) {
  responseError(res, '404', 'Not Found', 'We can\'t find the page you\'re looking for. You could head back to home.');
}

function errorBadRequest (req, res) {
  responseError(res, '400', 'Bad Request', 'Something not right.');
}

function errorInternalError (req, res) {
  responseError(res, '500', 'Internal Error', 'There are some problem with the server, please try again later.');
}

function facebookSigninError(req, res) {
  responseError(res, '500', 'Sign In Failed', 'Facebook sign-in is not available right now, please try to sign up with email.');
}

function errorServiceUnavailable (req, res) {
  res.status(503).send('I\'m busy right now, try again later.');
}

function responseError (res, code, detail, msg) {
  res.status(code).render('error.ejs', {
    title: code + ' ' + detail + ' ' + msg,
    code: code,
    detail: detail,
    msg: msg
  });
}

module.exports = {
  errorPrivateNote,
  errorForbidden,
  errorNotFound,
  errorBadRequest,
  facebookSigninError,
  errorInternalError,
  errorServiceUnavailable,
  responseError
};