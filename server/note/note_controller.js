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
  const note = await Note.create({
    ownerId: req.user.id,
    content: ''
  });
  const noteList = await Note.findAll({
    where: {
      state: 'normal',
      ownerId: req.user.id
    },
    order: [
      ['pinned', 'DESC'],
      ['updatedAt', 'DESC'],
    ],
  });
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
  console.log(noteList);
  res.json({ noteList });
};

module.exports = {
  uploadImage,
  createNewNote,
  getNotes,
  updateNoteInfo,
};