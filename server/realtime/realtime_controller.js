const cookie = require('cookie');
const cookieParser = require('cookie-parser');
const { Note } = require('../models');

const config = require('../config');

const realtime = {
  io: null,
  secure: secure,
  onAuthorizeSuccess: onAuthorizeSuccess,
  onAuthorizeFail: onAuthorizeFail,
  connection: connection,
};

function secure(socket, next) {
  try {
    var handshakeData = socket.request;
    if (handshakeData.headers.cookie) {
      handshakeData.cookie = cookie.parse(handshakeData.headers.cookie);
      handshakeData.sessionID = cookieParser.signedCookie(handshakeData.cookie[config.sessionName], config.sessionSecret);
      if (handshakeData.sessionID &&
        handshakeData.cookie[config.sessionName] &&
        handshakeData.cookie[config.sessionName] !== handshakeData.sessionID) {
        return next();
      } else {
        next(new Error('AUTH failed: Cookie is invalid.'));
      }
    } else {
      next(new Error('AUTH failed: No cookie transmitted.'));
    }
  } catch (ex) {
    next(new Error('AUTH failed:' + JSON.stringify(ex)));
  }
}

function onAuthorizeSuccess(data, accept) {
  accept();
}

function onAuthorizeFail(data, message, error, accept) {
  if (error) {
    accept(new Error(message));
  } else {
    accept();
  }
}

function connection(socket) {
  let currentNote = null;
  socket.on('open note', async ({ noteId }) => {
    socket.join(noteId);
    currentNote = noteId;
    const note = await Note.findOne({ where: { id: noteId } });
    realtime.io.to(noteId).emit('update note info', note);
  });

  socket.on('start collab', async ({ noteId }) => {
    
  });

  socket.on('close note', async ({ noteId }) => {
    currentNote = null;
    socket.leave(noteId);
  });
}

module.exports = realtime;