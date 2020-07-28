/* global app, $:true */
import { buildInputRules, buildKeymap, buildMenuItems } from "prosemirror-example-setup";
import { Step } from "prosemirror-transform";
import 'prosemirror-replaceattrs';    //Registe replaceAttr Step
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history } from "prosemirror-history";
import { collab, receiveTransaction, sendableSteps, getVersion } from "prosemirror-collab";
import { MenuItem, menuBar} from "prosemirror-menu";
import { imageUploader } from 'prosemirror-image-uploader';
import { suggestionsPlugin, triggerCharacter } from "@quartzy/prosemirror-suggestions";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { baseKeymap } from "prosemirror-commands";

import { schema } from "./schema";
import { Reporter } from "./reporter";
import { commentPlugin, commentUI, addAnnotation, annotationIcon } from "./comment";

import { CodeBlockView, arrowHandler } from "./codeBlockView";
import { keymap } from 'prosemirror-keymap';

const report = new Reporter();

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
  constructor(report, url, editable) {
    this.report = report;
    this.url = url;
    this.state = new State(null, "start");
    this.request = null;
    this.backOff = 0;
    this.view = null;
    this.editable = editable;
    this.dispatch = this.dispatch.bind(this);
    this.hashtag = null;
    this.start();
  }

  // All state changes go through this
  dispatch(action) {
    let newEditState = null;
    if (action.type == "loaded") {
      let editState = EditorState.create({
        doc: action.doc,
        plugins: [
          suggestionsPlugin({
            debug: false,
            suggestionClass: 'hashtag',
            matcher: triggerCharacter("#", { allowSpaces: false }),
            onEnter({ view, range, text}) {
              console.log("start", view, range, text);
              if (text != '#') {
                view.state.doc.nodesBetween(range.from, range.to, (node, pos, parent, index) => {
                  if (node.type.name == 'text') {
                    app.connection.hashtag = node.marks[0].attrs;
                  }
                });
                var transaction = view.state.tr.removeMark(range.from, range.to, schema.marks.hashtag);
                app.connection.dispatch({ type: "transaction", transaction });
              }
              return false;
            },
            onChange({ view, range, text}) {
              console.log("change", view, range, text);
              return false;
            },
            onExit({ view ,range ,text}) {
              console.log("stop", app.connection.hashtag, view, range, text);
              // TODO: Add/Remove tag
              if ( !app.connection.hashtag || (app.connection.hashtag.href !== text && range.to - range.from > 1)) {
                const data = {
                  noteId: app.currentNote,
                  add: text.slice(1),
                };
                data.remove = app.connection.hashtag ? app.connection.hashtag.href.slice(1) : null;
                fetch('/api/1.0/editor/hashtag', {
                  method: 'POST',
                  body: JSON.stringify(data),
                  headers: {
                    'content-type': 'application/json'
                  },
                }).then(res => res.json())
                  .then(body => {
                    const attrs = {
                      href: text,
                      id:body.id,
                      class: 'hashtag'
                    };
                    var transaction = view.state.tr.addMark(range.from, range.to, schema.marks.hashtag.create(attrs));
                    app.connection.dispatch({ type: "transaction", transaction });
                  });
              } else if (range.to - range.from > 1){
                var transaction = view.state.tr.addMark(range.from, range.to, schema.marks.hashtag.create(app.connection.hashtag));
                app.connection.dispatch({ type: "transaction", transaction });
              }
              return false;
            },
            onKeyDown({ view, event }) {
              return false;
            }
          }),
          buildInputRules(schema),
          keymap(buildKeymap(schema, {})),
          keymap(baseKeymap),
          dropCursor(),
          gapCursor(),
          menuBar({floating: true, content: menu.fullMenu}),
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
        ],
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
          dispatchTransaction: transaction => this.dispatch({ type: "transaction", transaction }),
          editable: () => { return this.editable;}
        }));
    } else this.setView(null);
  }

  // Load the document from the server and start up
  start() {
    app.socket.emit('start collab', { noteId: app.currentNote });
  }

  // Send a request for events that have happened since the version
  // of the document that the client knows about. This request waits
  // for a new version of the document to be created if the client
  // is already up-to-date.
  poll() {
    app.socket.emit('get collab', {
      noteId: app.currentNote,
      version: getVersion(this.state.edit),
      commentVersion: commentPlugin.getState(this.state.edit).version
    });
  }

  sendable(editState) {
    let steps = sendableSteps(editState);
    let comments = commentPlugin.getState(editState).unsentEvents();
    if (steps || comments.length) return {steps, comments};
  }

  // Send the given steps to the server
  send(editState, { steps, comments }) {
    this.sent = null;
    this.sent = { steps, comments };
    app.socket.emit('post collab', {
      noteId: app.currentNote,
      version: getVersion(editState),
      commentVersion: commentPlugin.getState(this.state.edit).version,
      steps: steps ? steps.steps.map(s => s.toJSON()) : [],
      clientID: steps ? steps.clientID : 0,
      comment: comments || []
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

app.newEditor = function (noteId, editable) {
  if (app.connection) app.connection.close();
  app.socket.emit('open note', { noteId });
  $('#button-container').css('display', 'block');
  app.connection = new EditorConnection(report, "/api/1.0/" + noteId, editable);
  $('#editor').css('background-image', 'none');
  $('#sharing-status').css('display', 'none');
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

app.socket.on('collab started', (data) => {
  console.log('started', data);
  app.connection.report.success();
  app.connection.backOff = 0;
  app.connection.dispatch({
    type: "loaded",
    doc: schema.nodeFromJSON(data.doc),
    version: data.version,
    users: data.users,
    comments: { version: data.commentVersion, comments: data.comments }
  });
});

app.socket.on('collab posted', (data) => {
  console.log('posted', data);
  app.connection.report.success();
  app.connection.backOff = 0;
  const { steps, comments } = app.connection.sent;
  let tr = steps
      ? receiveTransaction(app.connection.state.edit, steps.steps, repeat(steps.clientID, steps.steps.length))
      : app.connection.state.edit.tr;
  tr.setMeta(commentPlugin, {type: "receive", version: data.commentVersion, events: [], sent: comments.length});
  app.connection.dispatch({ type: "transaction", transaction: tr, requestDone: true });
});

app.socket.on('collab updated', (data) => {
  console.log('updated', data);
  app.connection.report.success();
  app.connection.backOff = 0;
  if (data.steps && (data.steps.length || data.comment.length)) {
    let tr = receiveTransaction(app.connection.state.edit, data.steps.map(j => Step.fromJSON(schema, j)), data.clientIDs);
    tr.setMeta(commentPlugin, {type: "receive", version: data.commentVersion, events: data.comment, sent: 0});
    app.connection.dispatch({ type: "transaction", transaction: tr, requestDone: true });
    app.connection.view.focus();
  } else {
    app.connection.poll();
  }
});

function badVersion(err) {
  return err.status == 400 && /invalid version/i.test(err.msg);
}

app.socket.on('collab error', (error) => {
  console.log('collab error', error);
  if (error.status == 409) {
    // The client's document conflicts with the server's version.
    // Poll for changes and then try again.
    app.connection.backOff = 0;
    app.connection.dispatch({type: "poll"});
  } else if (error.status == 410 || badVersion(error)) {
    app.connection.report.failure(error);
    app.connection.dispatch({type: "restart"});
  } else {
    app.connection.dispatch({type: "recover", error: error});
  }
});

$('#menu-btn').click((e) => {
  console.log($(e.target).attr('opentab'));
  if ($(e.target).attr('opentab') == undefined || $(e.target).attr('opentab') == 'false') {
    $(e.target).attr('opentab', 'true');
    $('.ProseMirror-menubar').css('display', 'flex');
  } else {
    $(e.target).attr('opentab', 'false');
    $('.ProseMirror-menubar').css('display', 'none');
  }
});