'use strict';

const _ = require('lodash');
const { Op } = require('sequelize');
const { Note, User, Tag } = require('../models');
const { updateNoteTags } = require('./tag_controller');
const response = require('../response');

const uploadImage = async (req, res) => {
  const url = req.files.image[0].location;
  res.json({ url });
};

const createNewNote = async (req, res) => {
  if (!req.isAuthenticated()) {
    return response.errorForbidden(req, res);
  }
  const permission = req.body.currentPermission == '' ? 'private' : req.body.currentPermission;
  const tag = req.body.currentTag == '' ? null : await Tag.findByPk(req.body.currentTag);
  // Create default document
  const doc = tag ? {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { 'level': 1 } },
      {
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{ type: 'hashtag', attrs: { 'href': `#${tag.tag}` } }],
          text: `#${tag.tag}`
        }]
      }]
  } : {
    type: 'doc',
    content: [{ type: 'heading', attrs: { 'level': 1 } }]
  };
  const text = tag ? `#${tag.tag}` : null;
  const note = await Note.create({
    doc: JSON.stringify(doc),
    brief: text,
    content: text,
    owner_id: req.user.id,
    view_permission: permission
  });
  if (tag) await note.addTag(tag);
  res.status(200).json({ note });
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
      await Note.update({ pin: action == 'pin', }, {
        where: {
          id: noteId,
          owner_id: userId
        }
      });
      break;
    case 'restore':
      await Note.update({ state: 'normal', }, {
        where: {
          id: noteId,
          owner_id: userId
        }
      });
      break;
    case 'trash':
      await Note.update({ state: 'trash', }, {
        where: {
          id: noteId,
          owner_id: userId
        }
      });
      break;
    case 'archive':
      await Note.update({ state: 'archive', }, {
        where: {
          id: noteId,
          owner_id: userId
        }
      });
      break;
    case 'delete':
      await Note.destroy({
        where: {
          id: noteId,
          owner_id: userId
        }
      });
      break;
  }

  const whereStament = {
    state: currentType,
    owner_id: userId
  };
  if (currentPermission !== '') {
    whereStament.view_permission = currentPermission;
  }
  const noteList = await Note.findAll({
      where: whereStament,
      order: [
        ['pin', 'DESC'],
        ['updated_at', 'DESC'],
      ],
    });
  res.json({ noteList });
};

const updateNoteUrl = async (req, res) => {
  if (!req.isAuthenticated()) {
    return response.errorForbidden(req, res);
  }
  const { noteId, noteUrl } = req.body;
  const result = await Note.findOne({
    where: {
      owner_id: req.user.id,
      note_url: noteUrl
    }
  });
  if (result) {
    return res.status(400).json({ error: 'duplicate' });
  } else {
    await Note.update({
      note_url: noteUrl
    }, {
      where: {
        id: noteId
      }
    });
    return res.status(200).json({ noteId, noteUrl });
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
  req.io.to(noteId).emit('update note info', { note });
  res.status(200).json({ noteId, view, write });
};

const getNotes = async (req, res) => {
  const profileUrl = req.query.profileUrl.replace('@', '');
  const type = req.query.type || 'normal';
  const permission = req.query.permission;
  let tag = req.query.tag;
  const userUrl = req.user ? req.user.user_url : null;
  const keyword = req.query.keyword || null;
  let noteList = null;
  if (profileUrl == userUrl) {
    const whereStament = {
      owner_id: req.user.id,
      state: type,
    };
    if (permission != '') whereStament.view_permission = permission;
    if (keyword) whereStament.text_content = { [Op.substring]: keyword };
    if (tag != '') {
      noteList = await Note.findAll({
        where: whereStament,
        order: [
          ['pin', 'DESC'],
          ['updated_at', 'DESC'],
        ],
        include: [{
          model: Tag,
          where: {
            id: tag
          }
        }]
      });
    } else {
      noteList = await Note.findAll({
        where: whereStament,
        order: [
          ['pin', 'DESC'],
          ['updated_at', 'DESC'],
        ],
      });
    }
  } else {
    const profileUser = await User.findOne({ where: { user_url: profileUrl } });
    const whereStament = {
      view_permission: 'public',
      state: 'normal',
      owner_id: profileUser.id
    };
    if (keyword) whereStament.text_content = { [Op.substring]: keyword };
    if (tag != '') {
      const tagResult = await Tag.findByPk(tag);
      noteList = await tagResult.getNotes({
        where: whereStament,
        order: [
          ['pin', 'DESC'],
          ['updated_at', 'DESC'],
        ],
      });
    } else {
      noteList = await Note.findAll({
        where: whereStament,
        order: [
          ['pin', 'DESC'],
          ['updated_at', 'DESC'],
        ],
      });
    }
  }
  res.json({ noteList });
};



const saveNote = async (id, doc, comments, lastchangeAt, lastchangeUserId) => {
  try {
    if (doc) {
      const title = doc.firstChild.textContent != '' ? doc.firstChild.textContent : null;
      const brief = doc.textContent != '' ? doc.textContent.slice(doc.firstChild.textContent.length, 200) : null;
      const regexp = new RegExp('(?:^)?#[\\w-]+', 'g');
      let match = [];
      doc.forEach((node, offset, index) => {
        if (node.type.name == 'paragraph') {
          const t = node.textContent.match(regexp);
          if(t)
          match = match.concat(t);
        }
      });
      const tags =  _.uniq(match.map(t => t.slice(1)));
      await updateNoteTags(id, tags);
      const updateValue = {
        title,
        brief,
        text_content: doc.textContent,
        doc: JSON.stringify(doc.toJSON()),
        comment: JSON.stringify({ data: comments.comments }),
        lastchange_at: lastchangeAt,
        saved_at: Date.now()
      };
      if (lastchangeUserId) updateValue.lastchange_user_id = lastchangeUserId;
      await Note.update(updateValue, { where: { id } });
      return true;
    }
  } catch (e) {
    console.log(e);
    return false;
  }
};

module.exports = {
  uploadImage,
  createNewNote,
  getNotes,
  updateNoteInfo,
  updateNoteUrl,
  updateNotePermission,
  saveNote,
};