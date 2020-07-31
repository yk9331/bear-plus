const { Note, User, Tag } = require('../models');
const response = require('../response');
const _ = require('lodash');

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
  let tag = req.query.tag;
  const userId = req.user ? req.user.userid : null;
  let noteList = null;
  if (profileId == userId) {
    if (tag != '') {
      noteList = await Note.findAll({
        where: {
          state: type,
          ownerId: req.user.id
        },
        order: [
          ['pinned', 'DESC'],
          ['updatedAt', 'DESC'],
        ],
        include: [{
          model: Tag,
          where: {
            id: tag
          }
        }]
      });
    } else if (permission != '') {
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
    if (tag != '') {
      const tagResult = await Tag.findByPk(tag);
      const userId = await User.findOne({ where: { userid: profileId } });
      noteList = await tagResult.getNotes({
        where: {
          view_permission: 'public',
          state: 'normal',
          ownerId: userId.id
        },
        order: [
          ['pinned', 'DESC'],
          ['updatedAt', 'DESC'],
        ],
      });
    } else {
      const userId = await User.findOne({ where: { userid: profileId } });
      noteList = await Note.findAll({
        where: {
          view_permission: 'public',
          state: 'normal',
          ownerId: userId.id
        },
        order: [
          ['pinned', 'DESC'],
          ['updatedAt', 'DESC'],
        ],
      });
    }
  }
  res.json({ noteList });
};

const getTags = async (req, res) => {
  const profileId = req.query.profileId.replace('@', '');
  const userId = req.user ? req.user.userid : null;
  let tagList = null;
  if (profileId == userId) {
    tagList = await Tag.findAll({
      include: [{
        model: Note,
        where: {
          ownerId: req.user.id,
          state: 'normal'
        }
      }],
      order: [
        ['tag', 'ASC']
      ]
    });
  } else {
    const userId = await User.findOne({ where: { userid: profileId } });
    tagList = await Tag.findAll({
      include: [{
        model: Note,
        where: {
          ownerId: userId.id,
          view_permission: 'public',
          state: 'normal'
        }
      }],
      order: [
        ['tag', 'ASC']
      ]
    });
  }
  res.json({ tagList });
};

const saveNote = async (id, doc, comments, lastchangeAt, lastchangeuser, authorship) => {
  try {
    if (doc) {
      const title = doc.firstChild.textContent != '' ? doc.firstChild.textContent : null;
      const brief = doc.textContent != '' ? doc.textContent.slice(doc.firstChild.textContent.length, 200) : null;
      const regexp = new RegExp('(?:^)?#[\\w-]+', 'g');
      const match = doc.toString().match(regexp);
      const tags = match ? _.uniq(match.map(t => t.slice(1))) : [];
      const user = await User.findOne({ where: { userid: lastchangeuser.slice(1) } });
      const lastchangeuserId = user ? user.id : null;
      await updateNoteTags(id, tags);
      await Note.update({
        title,
        brief,
        doc: JSON.stringify(doc.toJSON()),
        comment: JSON.stringify({ data: comments.comments }),
        lastchangeAt,
        lastchangeuserId,
        authorship,
        savedAt: Date.now()
      }, {
        where: {
          id
        }
      });
      return true;
    }
  } catch (e) {
    console.log(e);
    return false;
  }
};

const updateNoteTags = async (id, tags) => {
  const note = await Note.findOne({ where: { id } });
  const newList = [];
  for (let t of tags) {
    const [tag, created] = await Tag.findOrCreate({ where: { tag: t } });
    newList.push(tag);
  }
  const oldList = await note.getTags();
  const del = _.differenceBy(oldList, newList, 'id');
  const add = _.differenceBy(newList, oldList, 'id');
  if (del != []) await note.removeTags(del);
  if (add != []) await note.addTags(add);
  return newList;
};

module.exports = {
  uploadImage,
  createNewNote,
  getNotes,
  getTags,
  updateNoteInfo,
  updateNoteUrl,
  updateNotePermission,
  saveNote,
};