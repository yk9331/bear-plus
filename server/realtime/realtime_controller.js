const { Note } = require('../models');
const { startCollab, getCollab, postCollab } = require('../collab/collab_controller');

const realtime = {
  io: null,
  onAuthorizeSuccess: onAuthorizeSuccess,
  onAuthorizeFail: onAuthorizeFail,
  connection: connection,
};

function onAuthorizeSuccess(data, accept) {
  return accept();
}

function onAuthorizeFail(data, message, error, accept) {
  if (error) {
    console.log(error, message);
  }
  accept();
}

function connection(socket) {
  let currentNote = null;

  socket.on('open note', async ({ noteId }) => {
    socket.join(noteId);
    currentNote = noteId;
    const note = await Note.findOne({ where: { id: noteId } });
    realtime.io.to(socket.id).emit('update note info', note);
  });

  socket.on('start collab', async ({ noteId }) => {
    if (noteId !== currentNote) return;
    try {
      const data = await startCollab(noteId);
      realtime.io.to(socket.id).emit('collab started', data);
    } catch (e) {
      realtime.io.to(socket.id).emit('collab error', e);
    }
  });

  socket.on('post collab', async (data) => {
    try {
      const result = await postCollab(data);
      if (result) {
        realtime.io.to(socket.id).emit('collab posted', result);
        const updates = await getCollab(data);
        socket.to(currentNote).emit('collab updated', updates);
      }
    } catch (e) {
      console.log(e);
      realtime.io.to(socket.id).emit('collab error', {status: e.status || 500 , msg: e.toString()});
    }
  });

  socket.on('get collab', async (data) => {
    try {
      const result = await getCollab(data);
      if (result) {
        realtime.io.to(socket.id).emit('collab updated', result);
      }
    } catch (e) {
      console.log(e);
      realtime.io.to(socket.id).emit('collab error', {status: e.status || 500 , msg: e.toString()});
    }
  });

  socket.on('close note', async ({ noteId }) => {
    currentNote = null;
    socket.leave(noteId);
  });
}

module.exports = realtime;