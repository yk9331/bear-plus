const { Step } = require('prosemirror-transform');
require('prosemirror-replaceattrs');  // Add replaceAttrStep
const { schema } = require('../../public/js/editor/schema');
const { Mapping } = require('prosemirror-transform');
const { Note } = require('../models');
const { saveNote } = require('./note_controller');

const MAX_STEP_HISTORY = 10000;
const instances = Object.create(null);
const saveEvery = 1e4;

class Comment {
  constructor(from, to, text, id) {
    this.from = from;
    this.to = to;
    this.text = text;
    this.id = id;
  }

  static fromJSON(json) {
    return new Comment(json.from, json.to, json.text, json.id);
  }
}

class Comments {
  constructor(comments) {
    this.comments = comments || [];
    this.events = [];
    this.version = 0;
  }

  mapThrough(mapping) {
    for (let i = this.comments.length - 1; i >= 0; i--) {
      let comment = this.comments[i];
      let from = mapping.map(comment.from, 1), to = mapping.map(comment.to, -1);
      if (from >= to) {
        this.comments.splice(i, 1);
      } else {
        comment.from = from;
        comment.to = to;
      }
    }
  }

  created(data) {
    this.comments.push(new Comment(data.from, data.to, data.text, data.id));
    this.events.push({ type: 'create', id: data.id });
    this.version++;
  }

  index(id) {
    for (let i = 0; i < this.comments.length; i++)
      if (this.comments[i].id == id) return i;
  }

  deleted(id) {
    let found = this.index(id);
    if (found != null) {
      this.comments.splice(found, 1);
      this.version++;
      this.events.push({ type: 'delete', id: id });
      return;
    }
  }

  eventsAfter(startIndex) {
    let result = [];
    for (let i = startIndex; i < this.events.length; i++) {
      let event = this.events[i];
      if (event.type == 'delete') {
        result.push(event);
      } else {
        let found = this.index(event.id);
        if (found != null) {
          let comment = this.comments[found];
          result.push({
            type: 'create',
            id: event.id,
            text: comment.text,
            from: comment.from,
            to: comment.to
          });
        }
      }
    }
    return result;
  }
}

// A collaborative editing document instance.
class Instance {
  constructor(id, doc, comments) {
    this.id = id;
    this.doc = doc;
    this.comments = comments || new Comments;
    // The version number of the document instance.
    this.version = 0;
    this.steps = [];
    this.lastActive = Date.now();
    this.saveTimeout = null;
    this.users = {};
  }

  stop() {
    // TODO: stop instance on closed
  }

  addEvents(version, steps, comments, clientID) {
    if (!this.users[clientID]) this.users[clientID] = clientID;
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
    if (this.steps.length > MAX_STEP_HISTORY)
      this.steps = this.steps.slice(this.steps.length - MAX_STEP_HISTORY);

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

  // : (Number)
  // Check if a document version number relates to an existing
  // document version.
  checkVersion(version) {
    if (version < 0 || version > this.version) {
      let err = new Error('Invalid version ' + version);
      err.status = 400;
      throw err;
    }
  }

  // : (Number, Number)
  // Get events between a given document version and
  // the current document version.
  getEvents(version, commentVersion) {
    this.checkVersion(version);
    let startIndex = this.steps.length - (this.version - version);
    if (startIndex < 0) return false;
    let commentStartIndex = this.comments.events.length - (this.comments.version - commentVersion);
    if (commentStartIndex < 0) return false;

    return {steps: this.steps.slice(startIndex),
            comment: this.comments.eventsAfter(commentStartIndex)};
  }
}

async function getInstance(noteId) {
  let inst = instances[noteId] || await newInstance(noteId);
  return inst;
}

async function newInstance(id) {
  const note = await Note.findOne({ where: { id } });
  const doc = note.doc ? schema.nodeFromJSON(JSON.parse(note.doc)): null;
  const comment = note.comment ? JSON.parse(note.comment).data : null;
  const comments = comment ? new Comments(comment.map(c => Comment.fromJSON(c))) : null;
  return instances[id] = new Instance(id, doc, comments);
}

async function scheduleSave (noteId, cb) {
  const inst = await getInstance(noteId);
  if (inst.saveTimeout != null) return;
  inst.saveTimeout = setTimeout(async () => {
    try {
      inst.saveTimeout = null;
      const lastUser = inst.steps[inst.steps.length - 1].clientID;
      const authorship = JSON.stringify(inst.users);
      const saved = await saveNote(inst.id, inst.doc, inst.comments, inst.lastActive, lastUser, authorship);
      if (saved) {
        cb(inst.id);
      }
    } catch (e) {
      console.log(e);
    }
  }, saveEvery);
}

const startCollab = async function (noteId) {
  const inst = await getInstance(noteId);
  return {
    doc: inst.doc.toJSON(),
    version: inst.version,
    comments: inst.comments.comments,
    commentVersion: inst.comments.version
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
  const result = inst.addEvents(data.version, steps, data.comment, data.clientID);
  if (result == false) {
    const err = new Error('Version note current');
    err.status = 409;
    throw err;
  } else {
    return result;
  }
};

module.exports = {
  startCollab,
  getCollab,
  postCollab,
  scheduleSave
};
