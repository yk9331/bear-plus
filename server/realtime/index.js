const realtime = {
  io: null,
  onAuthorizeSuccess: onAuthorizeSuccess,
  onAuthorizeFail: onAuthorizeFail,
  connection: connection,
};

function onAuthorizeSuccess (data, accept) {
  accept(null,true);
}

function onAuthorizeFail (data, message, error, accept) {
  accept(null,false); // accept whether authorize or not to allow anonymous usage
}

function connection(socket) {
  //queueForConnect(socket);
  console.log(socket.id + ' connected');
  console.log()
  // console.log(realtime.io.of('/'));
  // const noteId = socket.handshake.query.noteId || null;
  // console.log(noteId);

}

module.exports = realtime;