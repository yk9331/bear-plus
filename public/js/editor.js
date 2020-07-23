/* global app, $:true */
import { exampleSetup, buildMenuItems } from "prosemirror-example-setup";
import { Step } from "prosemirror-transform";
import 'prosemirror-replaceattrs';    //Registe replaceAttr Step
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history } from "prosemirror-history";
import { collab, receiveTransaction, sendableSteps, getVersion } from "prosemirror-collab";
import { MenuItem } from "prosemirror-menu";
import { imageUploader } from 'prosemirror-image-uploader';

import { schema } from "./schema";
import { GET, POST } from "./http";
import { Reporter } from "./reporter";
import { commentPlugin, commentUI, addAnnotation, annotationIcon } from "./comment";

import { CodeBlockView, arrowHandler } from "./codeBlockView";
import { keymap } from 'prosemirror-keymap';

const report = new Reporter();

function badVersion(err) {
  return err.status == 400 && /invalid version/i.test(err);
}

class State {
  constructor(edit, comm) {
    this.edit = edit;
    this.comm = comm;
  }
}

const arrowHandlers = keymap({
  ArrowLeft: arrowHandler('left'),
  ArrowRight: arrowHandler('right'),
  ArrowUp: arrowHandler('up'),
  ArrowDown: arrowHandler('down'),
});

class EditorConnection {
  constructor(report, url) {
    this.report = report;
    this.url = url;
    this.state = new State(null, "start");
    this.request = null;
    this.backOff = 0;
    this.view = null;
    this.dispatch = this.dispatch.bind(this);
    this.start();
  }

  // All state changes go through this
  dispatch(action) {
    let newEditState = null;
    if (action.type == "loaded") {
      //info.users.textContent = userString(action.users); // FIXME ewww
      let editState = EditorState.create({
        doc: action.doc,
        plugins: exampleSetup({schema, history: false, menuContent: menu.fullMenu}).concat([
          history({preserveItems: true}),
          collab({version: action.version}),
          commentPlugin,
          commentUI(transaction => this.dispatch({ type: "transaction", transaction })),
          arrowHandlers,
          imageUploader({
            async upload(fileOrUrl, view) {
              if (typeof fileOrUrl === 'string') {
                return fileOrUrl;
              } else {
                const formData = new FormData();
                formData.append('image', fileOrUrl);
                const url = fetch('/api/1.0/editor/image', {
                  method: 'POST',
                  body: formData
                })
                  .then(res => res.json())
                  .then(body => {
                    return (body.url);
                  });
                return url;
              }
            }
          }),
        ]),
        comments: action.comments
      });
      this.state = new State(editState, "poll");
      this.poll();
    } else if (action.type == "restart") {
      this.state = new State(null, "start");
      this.start();
    } else if (action.type == "poll") {
      this.state = new State(this.state.edit, "poll");
      this.poll();
    } else if (action.type == "recover") {
      if (action.error.status && action.error.status < 500) {
        this.report.failure(action.error);
        this.state = new State(null, null);
      } else {
        this.state = new State(this.state.edit, "recover");
        this.recover(action.error);
      }
    } else if (action.type == "transaction") {
      newEditState = this.state.edit.apply(action.transaction);
    }

    if (newEditState) {
      let sendable;
      if (newEditState.doc.content.size > 40000) {
        if (this.state.comm != "detached") this.report.failure("Document too big. Detached.");
        this.state = new State(newEditState, "detached");
      } else if ((this.state.comm == "poll" || action.requestDone) && (sendable = this.sendable(newEditState))) {
        this.closeRequest();
        this.state = new State(newEditState, "send");
        this.send(newEditState, sendable);
      } else if (action.requestDone) {
        this.state = new State(newEditState, "poll");
        this.poll();
      } else {
        this.state = new State(newEditState, this.state.comm);
      }
    }

    // Sync the editor with this.state.edit
    if (this.state.edit) {
      if (this.view)
        this.view.updateState(this.state.edit);
      else
        this.setView(new EditorView(document.querySelector("#editor"), {
          state: this.state.edit,
          nodeViews: { code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos) },
          dispatchTransaction: transaction => this.dispatch({type: "transaction", transaction})
        }));
    } else this.setView(null);
  }

  // Load the document from the server and start up
  start() {
    this.run(GET(this.url)).then(data => {
      data = JSON.parse(data);
      this.report.success();
      this.backOff = 0;
      this.dispatch({type: "loaded",
                     doc: schema.nodeFromJSON(data.doc),
                     version: data.version,
                     users: data.users,
                     comments: {version: data.commentVersion, comments: data.comments}});
    }, err => {
      this.report.failure(err);
    });
  }

  // Send a request for events that have happened since the version
  // of the document that the client knows about. This request waits
  // for a new version of the document to be created if the client
  // is already up-to-date.
  poll() {
    let query = "version=" + getVersion(this.state.edit) + "&commentVersion=" + commentPlugin.getState(this.state.edit).version;
    this.run(GET(this.url + "/events?" + query)).then(data => {
      this.report.success();
      data = JSON.parse(data);
      this.backOff = 0;
      if (data.steps && (data.steps.length || data.comment.length)) {
        let tr = receiveTransaction(this.state.edit, data.steps.map(j => Step.fromJSON(schema, j)), data.clientIDs);
        tr.setMeta(commentPlugin, {type: "receive", version: data.commentVersion, events: data.comment, sent: 0});
        this.dispatch({type: "transaction", transaction: tr, requestDone: true});
      } else {
        this.poll();
      }
      // info.users.textContent = userString(data.users);
    }, err => {
      if (err.status == 410 || badVersion(err)) {
        // Too far behind. Revert to server state
        this.report.failure(err);
        this.dispatch({type: "restart"});
      } else if (err) {
        this.dispatch({type: "recover", error: err});
      }
    });
  }

  sendable(editState) {
    let steps = sendableSteps(editState);
    let comments = commentPlugin.getState(editState).unsentEvents();
    if (steps || comments.length) return {steps, comments};
  }

  // Send the given steps to the server
  send(editState, {steps, comments}) {
    let json = JSON.stringify({version: getVersion(editState),
                               steps: steps ? steps.steps.map(s => s.toJSON()) : [],
                               clientID: steps ? steps.clientID : 0,
                               comment: comments || []});
    this.run(POST(this.url + "/events", json, "application/json")).then(data => {
      console.log(data);
      this.report.success();
      this.backOff = 0;
      let tr = steps
          ? receiveTransaction(this.state.edit, steps.steps, repeat(steps.clientID, steps.steps.length))
          : this.state.edit.tr;
      tr.setMeta(commentPlugin, {type: "receive", version: JSON.parse(data).commentVersion, events: [], sent: comments.length});
      this.dispatch({type: "transaction", transaction: tr, requestDone: true});
    }, err => {
      if (err.status == 409) {
        // The client's document conflicts with the server's version.
        // Poll for changes and then try again.
        this.backOff = 0;
        this.dispatch({type: "poll"});
      } else if (badVersion(err)) {
        this.report.failure(err);
        this.dispatch({type: "restart"});
      } else {
        this.dispatch({type: "recover", error: err});
      }
    });
  }

  // Try to recover from an error
  recover(err) {
    let newBackOff = this.backOff ? Math.min(this.backOff * 2, 6e4) : 200;
    if (newBackOff > 1000 && this.backOff < 1000) this.report.delay(err);
    this.backOff = newBackOff;
    setTimeout(() => {
      if (this.state.comm == "recover") this.dispatch({type: "poll"});
    }, this.backOff);
  }

  closeRequest() {
    if (this.request) {
      this.request.abort();
      this.request = null;
    }
  }

  run(request) {
    return this.request = request;
  }

  close() {
    this.closeRequest();
    this.setView(null);
  }

  setView(view) {
    if (this.view) this.view.destroy();
    this.view = app.view = view;
  }
}

function repeat(val, n) {
  let result = [];
  for (let i = 0; i < n; i++) result.push(val);
  return result;
}

const annotationMenuItem = new MenuItem({
  title: "Add an annotation",
  run: addAnnotation,
  select: state => addAnnotation(state),
  icon: annotationIcon
});

let menu = buildMenuItems(schema);
menu.fullMenu[0].push(annotationMenuItem);

app.newEditor = function (noteId) {
  $('#button-container').css('display', 'block');
  if (app.connection) app.connection.close();
  app.connection = new EditorConnection(report, "/api/1.0/" + noteId);
  app.connection.request.then(() => app.connection.view.focus());
  $('#editor').css('background-image', 'none');
  $('#sharing-status').css('display', 'none');
  app.socket.emit('open note', { noteId });
  return true;
};

$('#note-shortUrl-input').on('input',() => {
  $('#note-shortUrl-copy').css('display', 'none');
  $('#note-shortUrl-save').css('display', 'block');
  $('#sharing-status').css('display', 'block').text('Not saved').removeClass('success').addClass('error');
});

$('#note-shortUrl-copy').click((e) => {
  e.preventDefault();
  const url = $('#note-shortUrl-input').val() == '' ? $('#note-shortUrl-input').attr('noteUrl') : $('#note-shortUrl-input').val();
  const temp = $('<input>').val(`${document.location.hostname}/${app.profileId}/${url}`);
  $('body').append(temp);
  temp.select();
  document.execCommand('copy');
  temp.remove();
});

$('#note-shortUrl-save').click((e) => {
  e.preventDefault();
  const data = {
    noteId: app.currentNote,
    shortUrl: $('#note-shortUrl-input').val()
  };
  fetch('/api/1.0/note/url', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      'content-type': 'application/json'
    },
  }).then(res => res.json())
    .then(body => {
      if (body.error) {
        $('#sharing-msg').css('display', 'block').text('Already in use, please try another one.').addClass('error');
      } else {
        $('#note-shortUrl-copy').css('display', 'block');
        $('#note-shortUrl-save').css('display', 'none');
        $('#sharing-status').css('display', 'block').text('Saved').removeClass('error').addClass('success');
      }
    });
});

$(document).on('click', '.dropdown-menu', function (e) {
  e.stopPropagation();
});

function changeNotePermission(read, write) {
  const data = {
    noteId: app.currentNote,
    view: read,
    write
  };
  fetch('/api/1.0/note/permission', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      'content-type': 'application/json'
    },
  });
}

$('#permission-read').change((e) => {
  if ($(e.target).val() == 'private') {
    changeNotePermission('private', 'private');
    if (app.currentPermission == 'public') {
      app.currentPermission == '';
      app.fetchNotes('normal');
    }
  } else {
    changeNotePermission('public', $('#permission-write').val());
    if (app.currentPermission == 'private') {
      app.currentPermission == '';
      app.fetchNotes('normal');
    }
  }
});

$('#permission-write').change((e) => {
  if ($(e.target).val() == 'public') {
    changeNotePermission('public', 'public');
  } else {
    changeNotePermission($('#permission-read').val(), 'private');
  }
});

app.socket.on('update note info', (note) => {
  console.log(note);
  $('#note-shortUrl-input').attr("placeholder", note.shortid).attr("noteurl", note.shortid).val('');
  $('#permission-read').val(note.view_permission);
  $('#permission-write').val(note.write_permission);
});