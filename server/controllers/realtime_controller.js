'use strict';

const passportSocketIo = require('passport.socketio');
const cookieParser = require('cookie-parser');
const { SESSION_NAME, SESSION_SECRETE } = require('../config/config');
const { getCollabInfo, startCollab, getCollab, postCollab, leaveCollab, scheduleSave } = require('./collab_controller');
const realtime = {
	io: null,
};

const onAuthorizeSuccess = (data, accept) => {
  return accept();
};

const onAuthorizeFail = (data, msg, err, accept) => {
  if (err) console.log(err, msg);
  accept();
};

const updateNoteInfo = async (noteId) => {
	if (realtime.io.sockets.adapter.rooms[noteId]) {
		const info = await getCollabInfo(noteId);
		info.onlineUserCount = realtime.io.sockets.adapter.rooms[noteId].length;
		realtime.io.to(noteId).emit('update note info', info );
	}
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
				const data = await startCollab(noteId, socket.request.user);
				realtime.io.to(socket.id).emit('collab started', data);
			} catch (err) {
				console.log(err);
				realtime.io.to(socket.id).emit('collab error', err);
			}
		});

		socket.on('get collab', async (data) => {
			try {
				const result = await getCollab(data);
				if (result) {
					realtime.io.to(socket.id).emit('collab updated', result);
				}
			} catch (err) {
				console.log(err);
				realtime.io.to(socket.id).emit('collab error', { status: err.status || 500, msg: err.toString() });
			}
		});

		socket.on('post collab', async (data) => {
			try {
				const result = await postCollab(data);
				if (result) {
					realtime.io.to(socket.id).emit('collab posted', result);
					const updates = await getCollab(data);
					updates.pos = data.pos;
					socket.to(currentNote).emit('collab updated', updates);
					scheduleSave(currentNote, updateNoteInfo);
				}
			} catch (err) {
				console.log(err);
				realtime.io.to(socket.id).emit('collab error', { status: err.status || 500, msg: err.toString() });
			}
		});

		socket.on('update cursor', async ({ pos }) => {
			if (!socket.request.user) return;
			socket.to(currentNote).emit('cursor updated', { pos });
		});

		socket.on('close note', async ({ noteId }) => {
			if (currentNote == noteId) currentNote = null;
			if (socket.request.user && realtime.io.sockets.adapter.rooms[noteId]) {
				socket.to(noteId).emit('delete cursor', { userId: socket.request.user.id });
				// Close note if this user is the last user
				const closeNote = realtime.io.sockets.adapter.rooms[noteId].length == 1 ? true : false;
				await leaveCollab(noteId, socket.request.user.id, closeNote);
			}
			socket.leave(noteId);
		});

		socket.on('disconnect', async () => {
			if (socket.request.user && realtime.io.sockets.adapter.rooms[currentNote]) {
				socket.to(currentNote).emit('delete cursor', { userId: socket.request.user.id });
				// Close note if all users leave
				const closeNote = realtime.io.sockets.adapter.rooms[currentNote] ? false : true;
				await leaveCollab(currentNote, socket.request.user.id, closeNote);
			}
		});
  });
  return realtime.io;
};

module.exports = realtime;
