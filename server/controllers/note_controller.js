'use strict';

const _ = require('lodash');
const { Op } = require('sequelize');
const { Note, User, Tag } = require('../models');
const { updateNoteTags } = require('./tag_controller');

const uploadImage = async (req, res) => {
  const url = req.files.image[0].location;
  res.json({ url });
};

const createNewNote = async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(403).json({ error: 'Please sign in to create new note.' });
  }
  try {
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
    return res.status(200).json({ note });
  } catch (err) {
    return res.status(500).json({ error: 'System Error: failed to create new note.' });
  }
};

const updateNoteStatus = async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(403).json({ error: 'Please sign in to update note info.' });
  }
  const { action } = req.params;
  const { noteId } = req.body;
  try {
    const note = await Note.findByPk(noteId);
    if (!note) return res.status(400).json({ error: 'Note not found' });
    switch (action) {
      case 'pin':
      case 'unpin':
        await note.update({ pin: action == 'pin' });
        break;
      case 'restore':
        await note.update({ state: 'normal' });
        break;
      case 'trash':
        await note.update({ state: 'trash' });
        break;
      case 'archive':
        await note.update({ state: 'archive' });
        break;
      case 'delete':
        await note.destroy();
        break;
      default:
        return res.status(400).json({ error: 'Action not found' });
    }
    return res.status(204).send();
  } catch (err) {
    console.log('update note status error: ', err);
    return res.status(500).json({ error: 'System Error: failed to update note status.' });
  }
};

const updateNoteUrl = async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(403).json({ error: 'Please sign in to change note url.' });
  }
  const { noteId, noteUrl } = req.body;
  const tr = await Note.sequelize.transaction();
  try {
    const result = await Note.findOne({
      where: {
        owner_id: req.user.id,
        note_url: noteUrl
      },
      transaction: tr
    });
    if (result) {
      await tr.commit();
      return res.status(409).json({ error: 'duplicate' });
    } else {
      await Note.update({
        note_url: noteUrl
      }, {
        where: { id: noteId },
        transaction: tr
      });
      await tr.commit();
      const note = await Note.findByPk(noteId);
      req.io.to(noteId).emit('update note info', { note });
      return res.status(200).json({ noteId, noteUrl });
    }
  } catch (err) {
    await tr.rollback();
    console.log('update note url error: ', err);
    return res.status(500).json({ error: 'System Error: failed to update note url.' });
  }
};

const updateNotePermission = async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(403).json({ error: 'Please sign in to change note permission.' });
  }
  const { noteId, view, write } = req.body;
  try {
    await Note.update({
      view_permission: view,
      write_permission: write
    }, {
      where: {
        id: noteId
      }
    });
    const note = await Note.findByPk(noteId);
    req.io.to(noteId).emit('update note info', { note });
    res.status(200).json({ noteId, view, write });
  } catch (err) {
    console.log('update note permission error', err);
    res.status(500).json({ error: 'System Error: failed to update note permission.' });
  }
};

const getNotes = async (req, res) => {
  try {
    const profileUrl = req.query.profileUrl.replace('@', '');
    const userUrl = req.user ? req.user.user_url : null;
    let noteList = null;
    let whereStament = null;
    if (profileUrl == userUrl) {
      whereStament = {
        owner_id: req.user.id,
        state: req.query.type,
      };
      if (req.query.permission != '') whereStament.view_permission = req.query.permission;
    } else {
      const profileUser = await User.findOne({ where: { user_url: profileUrl } });
      whereStament = {
        owner_id: profileUser.id,
        state: 'normal',
        view_permission: 'public',
      };
    }
    if (req.query.keyword) whereStament.text_content = { [Op.substring]: req.query.keyword };
    if (req.query.tag != '') {
      noteList = await Note.findAll({
        where: whereStament,
        order: [
          ['pin', 'DESC'],
          ['updated_at', 'DESC'],
        ],
        include: [{
          model: Tag,
          where: {
            id: req.query.tag
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
    res.status(200).json({ noteList });
  } catch (err) {
    console.log('get notes error', err);
    res.status(500).json({ error: 'System Error: failed to get notes.' });
  }
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
  } catch (err) {
    console.log('save note error', err);
    return false;
  }
};

module.exports = {
  uploadImage,
  createNewNote,
  getNotes,
  updateNoteStatus,
  updateNoteUrl,
  updateNotePermission,
  saveNote,
};