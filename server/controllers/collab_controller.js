'use strict';

const { NOTE_USER_COLORS, NOTE_MAX_STEP_HISTORY, NOTE_SAVE_INTERVAL } = require('../config/config');

const { Step } = require('prosemirror-transform');
require('prosemirror-replaceattrs');  // Add replaceAttrStep
const { schema } = require('../../public/js/editor/schema');
const { Mapping } = require('prosemirror-transform');

const { Note, Author } = require('../models');
const { saveNote } = require('./note_controller');
const { Comments } = require('./comment_controller');

const instances = Object.create(null);

// A collaborative editing document instance.
class Instance {
  constructor(note) {
    const comment = note.comment ? JSON.parse(note.comment).data : null;
    this.id = note.id;
    this.doc = note.doc ? schema.nodeFromJSON(JSON.parse(note.doc)) : null;
    this.comments = comment ? new Comments(comment.map(c => Comment.fromJSON(c))) : new Comments;
    this.version = 0;
    this.steps = [];
    this.lastActive = Date.now();
    this.saveTimeout = null;
    this.note = note;
    this.onlineUsers = {};
    this.authors = {};
    note.authors.forEach((a) => {
      this.authors[a.userId] = a.color;
    });
    console.log(this.authors);
  }

  checkVersion(version) {
    if (version < 0 || version > this.version) {
      let err = new Error('Invalid version ' + version);
      err.status = 400;
      throw err;
    }
  }

  // Get events between a given document version and the current document version.
  getEvents(version, commentVersion) {
    this.checkVersion(version);
    let startIndex = this.steps.length - (this.version - version);
    if (startIndex < 0) return false;
    let commentStartIndex = this.comments.events.length - (this.comments.version - commentVersion);
    if (commentStartIndex < 0) return false;

    return {steps: this.steps.slice(startIndex),
            comment: this.comments.eventsAfter(commentStartIndex)};
  }

  // add events to master document
  addEvents(version, steps, comments, clientID) {
    this.checkVersion(version);
    if (this.version != version) return false;
    let doc = this.doc, maps = [];
    for (let i = 0; i < steps.length; i++) {
      steps[i].clientID = clientID;
      let result = steps[i].apply(doc);
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
      let event = comments[i];
      if (event.type == 'delete')
        this.comments.deleted(event.id);
      else
        this.comments.created(event);
    }
    this.lastActive = Date.now();
    return {version: this.version, commentVersion: this.comments.version};
  }

  async close() {
    const lastUser = this.steps.length > 0 ? this.steps[this.steps.length - 1].clientID: null;
    await saveNote(this.id, this.doc, this.comments, this.lastActive, lastUser);
    if (this.setTimeout) clearTimeout(this.setTimeout);
    delete instances[this.id];
  }
}

async function getInstance(noteId) {
  let inst = instances[noteId] || await newInstance(noteId);
  return inst;
}

async function newInstance(id) {
  const note = await Note.findOne({ where: { id }, include: ['authors'] });
  return instances[id] = new Instance(note);
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
        noteId: data.noteId,
        userId: data.clientID
      },
      defaults: {
        noteId: data.noteId,
        userId: data.clientID,
        color: color
      }
      });
    inst.authors[data.clientID] = color;
  }
  const result = inst.addEvents(data.version, steps, data.comment, data.clientID);
  if (result == false) {
    const err = new Error('Version note current');
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

async function scheduleSave (noteId, cb) {
  const inst = await getInstance(noteId);
  if (inst.saveTimeout != null) return;
  inst.saveTimeout = setTimeout(async () => {
    try {
      inst.saveTimeout = null;
      const lastUser = inst.steps[inst.steps.length - 1].clientID;
      const saved = await saveNote(inst.id, inst.doc, inst.comments, inst.lastActive, lastUser);
      if (saved) {
        cb(inst.id);
      }
    } catch (e) {
      console.log(e);
    }
  }, NOTE_SAVE_INTERVAL);
}

module.exports = {
  startCollab,
  getCollab,
  postCollab,
  leaveCollab,
  scheduleSave
};
