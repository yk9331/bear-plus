const passportSocketIo = require('passport.socketio');
const cookieParser = require('cookie-parser');
const { SESSION_NAME, SESSION_SECRETE } = process.env;
const { Note, Tag, User } = require('../models');
const { startCollab, getCollab, postCollab, scheduleSave } = require('./collab_controller');
const realtime = {
  io: null,
};

const onAuthorizeSuccess = (data, accept) => {
  return accept();
};

const onAuthorizeFail = (data, message, error, accept) => {
  if (error) {
    console.log(error, message);
  }
  accept();
};

realtime.initSocket = (server, sessionStore) => {
	realtime.io = require('socket.io')(server);
	realtime.io.use(
		passportSocketIo.authorize({
			cookieParser: cookieParser,
			key: SESSION_NAME,
			secret: SESSION_SECRETE,
			store: sessionStore,
			success: onAuthorizeSuccess,
			fail: onAuthorizeFail
		})
	);
	realtime.io.sockets.on('connection', (socket) => {
		let currentNote = null;

		socket.on('open note', async ({ noteId }) => {
			socket.join(noteId);
      currentNote = noteId;
      await updateNoteInfo(noteId);
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
          scheduleSave(currentNote, updateNoteInfo);
				}
			} catch (e) {
				console.log(e);
				realtime.io.to(socket.id).emit('collab error', { status: e.status || 500, msg: e.toString() });
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
				realtime.io.to(socket.id).emit('collab error', { status: e.status || 500, msg: e.toString() });
			}
		});

		socket.on('close note', async ({ noteId }) => {
			currentNote = null;
			socket.leave(noteId);
    });
  });
  return realtime.io;
};

const updateNoteInfo = async (noteId) => {
  const note = await Note.findOne({ where: { id: noteId }, include: [{ model: Tag, attributes: ['id'] }, 'lastchangeuser'] });
  const lastChangeUser = User.getProfile(note.lastchangeuser);
  const onlineUserCount = realtime.io.sockets.adapter.rooms[noteId].length;
  realtime.io.to(noteId).emit('update note info', {note, lastChangeUser, onlineUserCount});
};

module.exports = realtime;
