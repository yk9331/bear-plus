'use strict';

const { NOTE_USER_COLORS, NOTE_MAX_STEP_HISTORY, NOTE_SAVE_INTERVAL } = require('../config/config');

const { Step } = require('prosemirror-transform');
require('prosemirror-replaceattrs');  // Add replaceAttrStep
const { schema } = require('../../public/js/editor/schema');
const { Mapping } = require('prosemirror-transform');

const { Note, Tag, User, Author } = require('../models');
const { saveNote } = require('./note_controller');
const { Comment, Comments } = require('../utils/comment');

const instances = Object.create(null);

// A collaborative editing document instance.
class Instance {
  constructor(note) {
    this.id = note.id;
    this.doc = note.doc ? schema.nodeFromJSON(JSON.parse(note.doc)) : null;
    const comment = note.comment ? JSON.parse(note.comment).data : null;
    this.comments = comment ? new Comments(comment.map(c => Comment.fromJSON(c))) : new Comments;
    this.version = 0;
    this.steps = [];
    this.lastActive = Date.now();
    this.saveTimeout = null;
    this.note = note;
    this.lastUser = null;
    this.onlineUsers = {};
    this.authors = {};
    note.authors.forEach((a) => {
      this.authors[a.user_id] = a.color;
    });
  }

  // Check collab version is valid
  checkVersion(version) {
    if (version < 0 || version > this.version) {
      const err = new Error('Invalid version ' + version);
      err.status = 400;
      throw err;
    }
  }

  // Get events between a given document version and the current document version.
  getEvents(version, commentVersion) {
    this.checkVersion(version);
    const startIndex = this.steps.length - (this.version - version);
    if (startIndex < 0) return false;
    const commentStartIndex = this.comments.events.length - (this.comments.version - commentVersion);
    if (commentStartIndex < 0) return false;

    return {steps: this.steps.slice(startIndex),
            comment: this.comments.eventsAfter(commentStartIndex)};
  }

  // Add events to master document
  addEvents(version, steps, comments, clientID) {
    this.checkVersion(version);
    this.lastUser = clientID;
    if (this.version != version) return false;
    let doc = this.doc;
    const maps = [];
    for (let i = 0; i < steps.length; i++) {
      steps[i].clientID = clientID;
      const result = steps[i].apply(doc);
      doc = result.doc;
      maps.push(steps[i].getMap());
    }
    this.doc = doc;
    this.version += steps.length;
    this.steps = this.steps.concat(steps);
    if (this.steps.length > NOTE_MAX_STEP_HISTORY)
      this.steps = this.steps.slice(this.steps.length - NOTE_MAX_STEP_HISTORY);

    this.comments.mapThrough(new Mapping(maps));
    if (comments) for (let i = 0; i < comments.length; i++) {
      const event = comments[i];
      if (event.type == 'delete')
        this.comments.deleted(event.id);
      else
        this.comments.created(event);
    }
    this.lastActive = Date.now();
    return { version: this.version, commentVersion: this.comments.version };
  }

  async close() {
    try {
      await saveNote(this.id, this.doc, this.comments, this.lastActive, this.lastUser);
      if (this.setTimeout) clearTimeout(this.setTimeout);
      delete instances[this.id];
    } catch (err) {
      console.log('close instance error', err);
    }
  }
}

async function getInstance(noteId) {
  const inst = instances[noteId] || await newInstance(noteId);
  return inst;
}

async function newInstance(id) {
  const note = await Note.findOne({ where: { id }, include: ['authors'] });
  return instances[id] = new Instance(note);
}

async function getCollabInfo(noteId) {
  const note = await Note.findOne({ where: { id: noteId }, include: [{ model: Tag, attributes: ['id'] }, 'lastchange_user'] });
	const lastChangeUser = User.getProfile(note.lastchange_user);
  return { note, lastChangeUser };
}

const startCollab = async function (noteId, user) {
  const inst = await getInstance(noteId);
  let clientColor = null;
  if (user) {
    if (!inst.onlineUsers[user.id]) {
      // Get next color index
      const colorIndex = Object.keys(inst.onlineUsers).length > Object.keys(inst.authors).length ?
        (Object.keys(inst.onlineUsers).length + 1) % NOTE_USER_COLORS.length :
        (Object.keys(inst.authors).length + 1) % NOTE_USER_COLORS.length;
      clientColor = !inst.authors[user.id] ? NOTE_USER_COLORS[colorIndex] : inst.authors[user.id];
      inst.onlineUsers[user.id] = clientColor;
    } else {
      clientColor = inst.onlineUsers[user.id].color;
    }
  }
  return {
    doc: inst.doc.toJSON(),
    version: inst.version,
    comments: inst.comments.comments,
    commentVersion: inst.comments.version,
    clientID: user.id || null,
    clientColor,
  };
};

const getCollab = async function (data) {
  const inst = await getInstance(data.noteId);
  const resultData = inst.getEvents(data.version, data.commentVersion);
  if (resultData == false) {
    const err = new Error('History no longer available');
    err.status = 410;
    throw err;
  }
  if (resultData.steps.length || resultData.comment.length) {
    const result = {
      version: inst.version,
      commentVersion: inst.comments.version,
      steps: resultData.steps.map(s => s.toJSON()),
      clientIDs: resultData.steps.map(step => step.clientID),
      comment: resultData.comment,
    };
    return result;
  } else {
    return false;
  }
};

const postCollab = async function (data) {
  const steps = data.steps.map(s => Step.fromJSON(schema, s));
  const inst = await getInstance(data.noteId);
  if (!inst.authors[data.clientID]) {
    const color = inst.onlineUsers[data.clientID];
    await Author.findOrCreate({
      where: {
        note_id: data.noteId,
        user_id: data.clientID
      },
      defaults: {
        note_id: data.noteId,
        user_id: data.clientID,
        color: color
      }
      });
    inst.authors[data.clientID] = color;
  }
  const result = inst.addEvents(data.version, steps, data.comment, data.clientID);
  if (result == false) {
    const err = new Error('Version not current');
    err.status = 409;
    throw err;
  } else {
    return result;
  }
};

const leaveCollab = async function (noteId, clientID, close) {
  const inst = await getInstance(noteId);
  delete inst.onlineUsers[clientID];
  if (close) await inst.close();
};

const scheduleSave = async function (noteId, cb) {
  const inst = await getInstance(noteId);
  if (inst.saveTimeout != null) return;
  inst.saveTimeout = setTimeout(async () => {
    inst.saveTimeout = null;
    const saved = await saveNote(inst.id, inst.doc, inst.comments, inst.lastActive, inst.lastUser);
    if (saved) { cb(inst.id); }
  }, NOTE_SAVE_INTERVAL);
};

const deleteInstance = async function (noteId) {
  const inst = await getInstance(noteId);
  if (inst.setTimeout) clearTimeout(inst.setTimeout);
  delete instances[this.id];
};

module.exports = {
  getCollabInfo,
  startCollab,
  getCollab,
  postCollab,
  leaveCollab,
  scheduleSave,
  deleteInstance
};
