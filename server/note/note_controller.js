const { Note, User } = require('../models');
const response = require('../response');

const uploadImage = async (req, res) => {
  const url = req.files.image[0].location;
  res.json({ url });
};

const createNewNote = async (req, res) => {
  if (!req.isAuthenticated()) {
    return response.errorForbidden(req, res);
  }
  const permission = req.query.currentPermission == '' ? 'private' : req.query.currentPermission;
  const note = await Note.create({
    ownerId: req.user.id,
    content: '',
    view_permission: permission
  });
  let noteList;
  if (req.query.currentPermission == '') {
    noteList = await Note.findAll({
      where: {
        state: 'normal',
        ownerId: req.user.id
      },
      order: [
        ['pinned', 'DESC'],
        ['updatedAt', 'DESC'],
      ],
    });
  } else {
    noteList = await Note.findAll({
      where: {
        view_permission: req.query.currentPermission,
        state: 'normal',
        ownerId: req.user.id
      },
      order: [
        ['pinned', 'DESC'],
        ['updatedAt', 'DESC'],
      ],
    });
  }
  res.json({ noteId: note.id, noteUrl: note.shortid, noteList});
};

const updateNoteInfo = async (req, res) => {
  if (!req.isAuthenticated()) {
    return response.errorForbidden(req, res);
  }
  const { action } = req.params;
  const { noteId, currentType, currentPermission } = req.body;
  const userId = req.user.id;
  switch (action) {
    case 'pin':
    case 'unpin':
      await Note.update({ pinned: action == 'pin', }, {
        where: {
          id: noteId,
          ownerId: userId
        }
      });
      break;
    case 'restore':
      await Note.update({ state: 'normal', }, {
        where: {
          id: noteId,
          ownerId: userId
        }
      });
      break;
    case 'trash':
      await Note.update({ state: 'trash', }, {
        where: {
          id: noteId,
          ownerId: userId
        }
      });
      break;
    case 'archive':
      await Note.update({ state: 'archive', }, {
        where: {
          id: noteId,
          ownerId: userId
        }
      });
      break;
    case 'delete':
      await Note.destroy({
        where: {
          id: noteId,
          ownerId: userId
        }
      });
      break;
  }
  let noteList;
  if (currentPermission !== '') {
    noteList = await Note.findAll({
      where: {
        view_permission: currentPermission,
        state: currentType,
        ownerId: userId
      },
      order: [
        ['pinned', 'DESC'],
        ['updatedAt', 'DESC'],
      ],
    });
  } else {
    noteList = await Note.findAll({
      where: {
        state: currentType,
        ownerId: userId
      },
      order: [
        ['pinned', 'DESC'],
        ['updatedAt', 'DESC'],
      ],
    });
  }
  res.json({ noteList });
};

const updateNoteUrl = async (req, res) => {
  if (!req.isAuthenticated()) {
    return response.errorForbidden(req, res);
  }
  const { noteId, shortUrl } = req.body;
  const result = await Note.findOne({
    where: {
      ownerId: req.user.id,
      shortid: shortUrl
    }
  });
  if (result) {
    return res.status(400).json({ error: 'duplicate' });
  } else {
    await Note.update({
      shortid: shortUrl
    }, {
      where: {
        id: noteId
      }
    }
    );
    return res.status(200).json({ noteId, shortUrl });
  }
};

const updateNotePermission = async (req, res) => {
  if (!req.isAuthenticated()) {
    return response.errorForbidden(req, res);
  }
  const { noteId, view, write } = req.body;
  await Note.update({
    view_permission: view,
    write_permission: write
  }, {
    where: {
      id: noteId
    }
  });
  const note = await Note.findOne({ where: { id: noteId } });
  req.io.to(noteId).emit('update note info', note);
  res.status(200).json({ noteId, view, write });
};

const getNotes = async (req, res) => {
  const profileId = req.query.profileId.replace('@', '');
  const type = req.query.type || 'normal';
  const permission = req.query.permission;
  const userId = req.user ? req.user.userid : null;
  let noteList = null;
  if (profileId == userId) {
    if (permission != '') {
      noteList = await Note.findAll({
        where: {
          view_permission: permission,
          state: type,
          ownerId: req.user.id
        },
        order: [
          ['pinned', 'DESC'],
          ['updatedAt', 'DESC'],
        ],
      });
    } else {
      noteList = await Note.findAll({
        where: {
          state: type,
          ownerId: req.user.id
        },
        order: [
          ['pinned', 'DESC'],
          ['updatedAt', 'DESC'],
        ],
      });
    }
  } else {
    noteList = await Note.findAll({
      where: {
        view_permission: 'public',
        state: 'normal'
      },
      includes: [{
        model: User,
        where: {
          userid: profileId,
        }
      }],
      order: [
        ['pinned', 'DESC'],
        ['updatedAt', 'DESC'],
      ],
    });
  }
  res.json({ noteList });
};

module.exports = {
  uploadImage,
  createNewNote,
  getNotes,
  updateNoteInfo,
  updateNoteUrl,
  updateNotePermission
};