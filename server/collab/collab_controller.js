const { Step } = require("prosemirror-transform");
require('prosemirror-replaceattrs');
const { schema } = require("../../public/js/schema");
const { Mapping } = require("prosemirror-transform");
const { Comments, Comment } = require("./comments");

const { Note } = require('../models');

const MAX_STEP_HISTORY = 10000;
const instances = Object.create(null);
const saveEvery = 1e4;

// A collaborative editing document instance.
class Instance {
  constructor(id, doc, comments) {
    this.id = id;
    this.doc = doc || schema.node("doc", null, [schema.node("heading", { "attrs": { "level": 1 } }, [])]);
    this.comments = comments || new Comments;
    // The version number of the document instance.
    this.version = 0;
    this.steps = [];
    this.lastActive = Date.now();
    this.saveTimeout = null;
  }

  stop() {
    // stop instance
  }

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
    if (this.steps.length > MAX_STEP_HISTORY)
      this.steps = this.steps.slice(this.steps.length - MAX_STEP_HISTORY);

    this.comments.mapThrough(new Mapping(maps));
    if (comments) for (let i = 0; i < comments.length; i++) {
      let event = comments[i];
      if (event.type == "delete")
        this.comments.deleted(event.id);
      else
        this.comments.created(event);
    }

    this.scheduleSave();
    return {version: this.version, commentVersion: this.comments.version};
  }

  // : (Number)
  // Check if a document version number relates to an existing
  // document version.
  checkVersion(version) {
    if (version < 0 || version > this.version) {
      let err = new Error("Invalid version " + version);
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

  scheduleSave() {
    if (this.saveTimeout != null) return;
    this.saveTimeout = setTimeout(this.doSave.bind(this), saveEvery);
  }

  doSave() {
    this.saveTimeout = null;
    const title = (this.doc && this.doc.toJSON().content[0].content) ? this.doc.toJSON().content[0].content.reduce((acc, cur) => acc + cur.text, '') : null;
    let text = '';
    try {
      if (this.doc) {
        const d = this.doc.toJSON().content;
        for (let i = 1; i < d.length; i++){
          if (d[i].content) {
            text += d[i].content.reduce((acc, cur) => acc + cur.text, '');
            if (text.length > 200) break;
          }
        }
      }
    } catch (e) {
      console.log(e);
    }
    const brief = text == '' ? null : text;
    Note.update({
      title,
      brief,
      doc: JSON.stringify(this.doc.toJSON()),
      comment: JSON.stringify({ data: this.comments.comments }),
      savedAt: Date.now()
    }, {
      where: {
        id: this.id
      }
    });
  }
}

async function getInstance(noteId) {
  let inst = instances[noteId] || await newInstance(noteId);
  inst.lastActive = Date.now();
  return inst;
}

async function newInstance(id) {
  const note = await Note.findOne({ where: { id } });
  const doc = note.doc ? schema.nodeFromJSON(JSON.parse(note.doc)): null;
  const comment = note.comment ? JSON.parse(note.comment).data : null;
  const comments = comment ? new Comments(comment.map(c => Comment.fromJSON(c))) : null;
  return instances[id] = new Instance(id, doc, comments);
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
  postCollab
};
