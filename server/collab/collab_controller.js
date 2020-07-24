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
    this.users = Object.create(null);
    this.userCount = 0;
    this.waiting = [];
    this.collecting = null;
    this.setTimeout = null;
  }

  stop() {
    if (this.collecting != null) clearInterval(this.collecting);
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

    this.sendUpdates();
    this.scheduleSave();
    return {version: this.version, commentVersion: this.comments.version};
  }

  sendUpdates() {
    while (this.waiting.length) this.waiting.pop().finish();
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
            comment: this.comments.eventsAfter(commentStartIndex),
            users: this.userCount};
  }

  collectUsers() {
    const oldUserCount = this.userCount;
    this.users = Object.create(null);
    this.userCount = 0;
    this.collecting = null;
    for (let i = 0; i < this.waiting.length; i++)
      this._registerUser(this.waiting[i].ip);
    if (this.userCount != oldUserCount) this.sendUpdates();
  }

  registerUser(ip) {
    if (!(ip in this.users)) {
      this._registerUser(ip);
      this.sendUpdates();
    }
  }

  _registerUser(ip) {
    if (!(ip in this.users)) {
      this.users[ip] = true;
      this.userCount++;
      if (this.collecting == null)
        this.collecting = setTimeout(() => this.collectUsers(), 5000);
    }
  }

  scheduleSave() {
    if (this.saveTimeout != null) return;
    this.saveTimeout = setTimeout(this.doSave.bind(this), saveEvery);
  }

  doSave() {
    this.saveTimeout = null;
    const title = (this.doc && this.doc.toJSON().content[0].content) ? this.doc.toJSON().content[0].content.reduce((acc, cur) => acc + cur.text, '') : null;
    let text = '';
    if (this.doc) {
      const d = this.doc.toJSON().content;
      if (d.length > 1) {
        for (let i = 1; i < d.length; i++){
          text += d[i].content.reduce((acc, cur) => acc + cur.text, '');
          if (text.length > 200) break;
        }
      }
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

async function getInstance(id, ip) {
  let inst = instances[id] || await newInstance(id);
  if (ip) inst.registerUser(ip);
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

// Object that represents an HTTP response.
class Output {
  constructor(code, body, type) {
    this.code = code;
    this.body = body;
    this.type = type || "text/plain";
  }

  static json(data) {
    return new Output(200, JSON.stringify(data), "application/json");
  }

  // Write the response.
  resp(res) {
    res.set('Content-Type', this.type);
    res.status(this.code).send(this.body);
  }
}

function nonNegInteger(str) {
  let num = Number(str);
  if (!isNaN(num) && Math.floor(num) == num && num >= 0) return num;
  let err = new Error("Not a non-negative integer: " + str);
  err.status = 400;
  throw err;
}

// An object to assist in waiting for a collaborative editing
// instance to publish a new version before sending the version
// event data to the client.
class Waiting {
  constructor(resp, inst, ip, finish) {
    this.resp = resp;
    this.inst = inst;
    this.ip = ip;
    this.finish = finish;
    this.done = false;
    resp.setTimeout(1000 * 60 * 5, () => {
      this.abort();
      this.send(Output.json({}));
    });
  }

  abort() {
    let found = this.inst.waiting.indexOf(this);
    if (found > -1) this.inst.waiting.splice(found, 1);
  }

  send(output) {
    if (this.done) return;
    output.resp(this.resp);
    this.done = true;
  }
}

function outputEvents(inst, data) {
  return Output.json({
    version: inst.version,
    commentVersion: inst.comments.version,
    steps: data.steps.map(s => s.toJSON()),
    clientIDs: data.steps.map(step => step.clientID),
    comment: data.comment,
    users: data.users
  });
}

function reqIP(request) {
  return request.headers["x-forwarded-for"] || request.socket.remoteAddress;
}

const collabStart = async function (req, res) {
  const { id } = req.params;
  let inst = await getInstance(id, reqIP(req));
  return Output.json({
    doc: inst.doc.toJSON(),
    users: inst.userCount,
    version: inst.version,
    comments: inst.comments.comments,
    commentVersion: inst.comments.version
  }).resp(res);
};

const collabPoll = async function (req, res) {
  try {
    const { id } = req.params;
    let version = nonNegInteger(req.query.version);
    let commentVersion = nonNegInteger(req.query.commentVersion);
    let inst = await getInstance(id, reqIP(req));
    let data = inst.getEvents(version, commentVersion);
    if (data === false)
      return new Output(410, "History no longer available").resp(res);
    // If the server version is greater than the given version,
    // return the data immediately.
    if (data.steps.length || data.comment.length)
      return outputEvents(inst, data).resp(res);
    // If the server version matches the given version,
    // wait until a new version is published to return the event data.
    let wait = new Waiting(res, inst, reqIP(req), () => {
      wait.send(outputEvents(inst, inst.getEvents(version, commentVersion)));
    });
    inst.waiting.push(wait);
    res.on("close", () => wait.abort());
  } catch (e) {
    console.log(e);
    return new Output(e.status || 500, e.toString()).resp(res);
  }
};

const collabSend = async function (req, res) {
  try {
    const { id } = req.params;
    const data = req.body;
    let version = nonNegInteger(data.version);
    console.log(data.steps);
    let steps = data.steps.map(s => Step.fromJSON(schema, s));
    // console.log(steps[0]);
    const inst = await getInstance(id, reqIP(req));
    let result = inst.addEvents(version, steps, data.comment, data.clientID);
    if (!result)
      return new Output(409, "Version not current").resp(res);
    else
      return Output.json(result).resp(res);
  } catch (e) {
    console.log(e);
    return new Output(e.status || 500, e.toString()).resp(res);
  }
};

module.exports = {
  collabStart,
  collabPoll,
  collabSend,
};
