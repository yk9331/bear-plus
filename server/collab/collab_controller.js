const { Step } = require("prosemirror-transform");
require('prosemirror-replaceattrs') ;
const { schema } = require("../../public/js/schema");
const { getInstance } = require("./instance");

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

const collabStart = function (req, res) {
  const { id } = req.params;
  let inst = getInstance(id, reqIP(req));
  return Output.json({
    doc: inst.doc.toJSON(),
    users: inst.userCount,
    version: inst.version,
    comments: inst.comments.comments,
    commentVersion: inst.comments.version
  }).resp(res);
};

const collabPoll = function (req, res) {
  const { id } = req.params;
  let version = nonNegInteger(req.query.version);
  let commentVersion = nonNegInteger(req.query.commentVersion);
  let inst = getInstance(id, reqIP(req));
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
};

const collabSend = function (req, res) {
  const { id } = req.params;
  const data = req.body;
  let version = nonNegInteger(data.version);
  console.log(data.steps);
  let steps = data.steps.map(s => Step.fromJSON(schema, s));
  // console.log(steps[0]);
  let result = getInstance(id, reqIP(req)).addEvents(version, steps, data.comment, data.clientID);
  if (!result)
    return new Output(409, "Version not current").resp(res);
  else
    return Output.json(result).resp(res);
};

module.exports = {
  collabStart,
  collabPoll,
  collabSend,
};
