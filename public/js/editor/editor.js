/* global app, $:true */
import { buildInputRules, buildKeymap } from 'prosemirror-example-setup';
import { Step } from 'prosemirror-transform';
import 'prosemirror-replaceattrs';    //Registe replaceAttr Step
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history } from 'prosemirror-history';
import { collab, receiveTransaction, sendableSteps, getVersion } from 'prosemirror-collab';
import { menuBar} from 'prosemirror-menu';
import { imageUploader } from 'prosemirror-image-uploader';
import { suggestionsPlugin } from '@quartzy/prosemirror-suggestions';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { baseKeymap } from 'prosemirror-commands';

import { schema } from './schema';
import { commentPlugin, commentUI } from './comment';
import { cursorsPlugin } from './cursor';

import { CodeBlockView, arrowHandler } from './codeBlockView';
import { keymap } from 'prosemirror-keymap';
const _ = require('lodash');
import { buildMenuItems } from './menu';
const menu = buildMenuItems(schema);
app.cursors = {};
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

function triggerCharacter(char, _ref) {
  var _ref$allowSpaces = _ref.allowSpaces,
      allowSpaces = _ref$allowSpaces === undefined ? false : _ref$allowSpaces;
  return function ($position) {
    if ($position.parent.type.name == 'heading') return false;
    // Matching expressions used for later
    const suffix = new RegExp('\\s' + char + '$');
    const regexp = allowSpaces ?
      new RegExp(char + '.*?(?=\\s' + char + '|$)', 'g') :
      new RegExp('(?:^)?' + char + '[\\w-]+', 'g');

    // Lookup the boundaries of the current node
    const textFrom = $position.before();
    const textTo = $position.end();
    const text = $position.doc.textBetween(textFrom, textTo, '\0', '\0');

    let match = null;
    while ((match = regexp.exec(text)) !== null) {
      // Javascript doesn't have lookbehinds; this hacks a check that first character is " " or the line beginning
      var prefix = match.input.slice(Math.max(0, match.index - 1), match.index);
      if (!/^[\s\0]?$/.test(prefix)) {
        continue;
      }
      // The absolute position of the match in the document
      const from = match.index + $position.start();
      let to = from + match[0].length;
      // Edge case handling; if spaces are allowed and we're directly in between two triggers
      if (allowSpaces && suffix.test(text.slice(to - 1, to + 1))) {
        match[0] += ' ';
        to++;
      }
      // If the $position is located within the matched substring, return that range
      if (from < $position.pos && to >= $position.pos) {
        return { range: { from: from, to: to }, text: match[0] };
      }
    }
  };
}

const insertText = function (text = '') {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const { pos } = $from.pos;

    dispatch(state.tr.insertText(text, pos));

    return true;
  };
};

class EditorConnection {
  constructor(editable) {
    this.state = new State(null, 'start');
    this.request = null;
    this.backOff = 0;
    this.view = null;
    this.editable = editable;
    this.dispatch = this.dispatch.bind(this);
    this.start();
  }
  // All state changes go through this
  dispatch(action) {
    let newEditState = null;
    if (action.type == 'loaded') {
      this.clientID = action.clientID;
      this.clientColor = action.clientColor;
      const editState = EditorState.create({
        doc: action.doc,
        plugins: [
          suggestionsPlugin({
            debug: false,
            suggestionClass: 'hashtag',
            matcher: triggerCharacter('#', { allowSpaces: false }),
            onEnter({ view, range, text}) {
              var transaction = view.state.tr.removeMark(range.from, range.to, schema.marks.hashtag);
              app.connection.dispatch({ type: 'transaction', transaction });
              return false;
            },
            onExit({ view ,range ,text}) {
              var transaction = view.state.tr.addMark(range.from, range.to, schema.marks.hashtag.create({href:text}));
              app.connection.dispatch({ type: 'transaction', transaction });
              return false;
            },
            onKeyDown({ view, event }) {
              return false;
            }
          }),
          buildInputRules(schema),
          keymap(buildKeymap(schema, {})),
          keymap(baseKeymap),
          keymap({Tab: insertText('    ')}),
          dropCursor({color:'rgb(205, 80, 70)'}),
          gapCursor(),
          menuBar({content: menu.fullMenu}),
          history({preserveItems: true}),
          collab({version: action.version, clientID: action.clientID}),
          commentPlugin,
          commentUI(transaction => this.dispatch({ type: 'transaction', transaction })),
          cursorsPlugin(action.clientID,action.clientColor),
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
                  }).catch(e =>{
                    console.log(e);
                  });
                return url;
              }
            }
          }),
        ],
        comments: action.comments
      });
      this.state = new State(editState, 'wait');
    } else if (action.type == 'restart') {
      this.state = new State(null, 'start');
      this.start();
    } else if (action.type == 'poll') {
      this.state = new State(this.state.edit, 'poll');
      this.poll();
    } else if (action.type == 'recover') {
      if (action.error.status && action.error.status < 500) {
        this.state = new State(null, null);
      } else {
        this.state = new State(this.state.edit, 'recover');
        this.recover(action.error);
      }
    } else if (action.type == 'transaction') {
      newEditState = this.state.edit.apply(action.transaction);
    }
    if (newEditState) {
      let sendable;
      if (newEditState.doc.content.size > 40000) {
        if (this.state.comm != 'detached') alert('Document too big. Detached.');
        this.state = new State(newEditState, 'detached');
      } else if ( this.state.comm == 'wait' && (sendable = this.sendable(newEditState))) {
        this.state = new State(newEditState, 'send');
        this.send(newEditState, sendable);
      } else if (action.requestDone) {
        this.state = new State(newEditState, 'wait');
      } else {
        this.state = new State(newEditState, this.state.comm);
      }
    }
    // Sync the editor with this.state.edit
    if (this.state.edit) {
      if (this.view)
        this.view.updateState(this.state.edit);
      else
        this.setView(new EditorView(document.querySelector('#editor'), {
          state: this.state.edit,
          nodeViews: { code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos) },
          dispatchTransaction: transaction => this.dispatch({ type: 'transaction', transaction }),
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
    const steps = sendableSteps(editState);
    const comments = commentPlugin.getState(editState).unsentEvents();
    if (steps || comments.length) return {steps, comments};
  }

  // Send the given steps to the server
  send(editState, { steps, comments }) {
    this.sent = null;
    this.sent = { steps, comments };
    const pos = {
      userId: this.clientID,
      profile: app.userProfile,
      color: this.clientColor,
      head: editState.selection.head,
      anchor: editState.selection.anchor,
    };
    app.socket.emit('post collab', {
      noteId: app.currentNote,
      version: getVersion(editState),
      commentVersion: commentPlugin.getState(this.state.edit).version,
      steps: steps ? steps.steps.map(s => s.toJSON()) : [],
      clientID: this.clientID,
      comment: comments || [],
      pos
    });
  }

  // Try to recover from an error
  recover(err) {
    const newBackOff = this.backOff ? Math.min(this.backOff * 2, 6e4) : 200;
    this.backOff = newBackOff;
    setTimeout(() => {
      if (this.state.comm == 'recover') this.dispatch({type: 'poll'});
    }, this.backOff);
  }

  close() {
    this.setView(null);
  }

  setView(view) {
    if (this.view) this.view.destroy();
    this.view = app.view = view;
  }
}

function repeat(val, n) {
  const result = [];
  for (let i = 0; i < n; i++) result.push(val);
  return result;
}

app.newEditor = function (noteId, editable) {
  if (app.connection) app.connection.close();
  app.socket.emit('open note', { noteId });
  $('#button-container').css('display', 'block');
  if (!editable) $('#menu-btn').css('display', 'none');
  app.connection = new EditorConnection(editable);
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
  const temp = $('<input>').val(`${document.location.hostname}/${app.profileUrl}/${url}`);
  $('body').append(temp);
  temp.select();
  document.execCommand('copy');
  temp.remove();
});

$('#note-shortUrl-save').click((e) => {
  e.preventDefault();
  const data = {
    noteId: app.currentNote,
    noteUrl: $('#note-shortUrl-input').val()
  };
  fetch('/api/1.0/note/url', {
    method: 'PATCH',
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
    method: 'PATCH',
    body: JSON.stringify(data),
    headers: {
      'content-type': 'application/json'
    },
  }).then(res => res.json())
    .then(({ error }) => {
      if (error) alert(error);
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

function setCounts(doc) {
  const words = _.difference(doc.textBetween(0, doc.content.size, ' ', '').split(' '),['']).length;
  const readtime = words / 200 < 1 ? (words*60/200).toFixed() + 's': (words / 200).toFixed() + 'm ' + ((words % 200)/200*60).toFixed() + 's';
  $('#words').children('.count').text(words);
  $('#characters').children('.count').text(doc.textContent.replace(' ', '').length);
  $('#readtime').children('.count').text(readtime);
  let p = 0;
  doc.forEach((n) => { if (n.textContent != '') p++; });
  $('#paragraphs').children('.count').text(p);
}

app.socket.on('update note info', ({ note, lastChangeUser, onlineUserCount }) => {
  if (note) {
    $('#note-shortUrl-input').attr('placeholder', note.note_url).attr('noteurl', note.note_url).val('');
    $('#permission-read').val(note.view_permission);
    $('#permission-write').val(note.write_permission);
    $('.note-tab.current').children('.info').children('.title').text(note.title);
    $('.note-tab.current').children('.info').children('.brief').text(note.brief);
    if (note.Tags != [] && app.currentTag != '') {
      let exist = false;
      for (const t of note.Tags) {
        if (t.id == app.currentTag) exist = true;
      }
      if (!exist) {
        app.fetchNotes('normal', '', '');
      }
    }
    app.fetchTags();
    const savedAt = note.saved_at ? new Date(note.saved_at) : new Date(note.created_at);
    const createdAt = new Date(note.created_at);
    const saveTime = savedAt.toLocaleString('default', { month: 'short', year: 'numeric' }).toUpperCase() + ' ' + ('0' + savedAt.getHours()).substr(-2) + ':' + ('0' + savedAt.getMinutes()).substr(-2);
    const createTime = createdAt.toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase() + ' AT ' + ('0' + createdAt.getHours()).substr(-2) + ':' + ('0' + createdAt.getMinutes()).substr(-2);
    $('#saved-at').children('.date').text(savedAt.getDate());
    $('#saved-at').children('.right').children('.time').text(saveTime);
    $('#created-at').children('.time').text(createTime);
    $('#collab-data').children('.count').text(onlineUserCount);
    if (lastChangeUser) $('#collab-data').children('.user').text(decodeURIComponent(lastChangeUser.name));
    if (app.view) setCounts(app.view.state.doc);
  }
});

app.socket.on('collab started', (data) => {
  app.connection.backOff = 0;
  app.connection.dispatch({
    type: 'loaded',
    doc: schema.nodeFromJSON(data.doc),
    version: data.version,
    comments: { version: data.commentVersion, comments: data.comments },
    clientID: data.clientID,
    clientColor: data.clientColor
  });
  app.connection.view.focus();
  setCounts(app.view.state.doc);
});

app.socket.on('collab posted', (data) => {
  if (app.connection.state.comm == 'send') {
    app.connection.backOff = 0;
    const { steps, comments } = app.connection.sent;
    const tr = steps
      ? receiveTransaction(app.connection.state.edit, steps.steps, repeat(steps.clientID, steps.steps.length))
      : app.connection.state.edit.tr;
    tr.setMeta(commentPlugin, { type: 'receive', version: data.commentVersion, events: [], sent: comments.length });
    app.connection.dispatch({ type: 'transaction', transaction: tr, requestDone: true });
  }
});

app.socket.on('collab updated', (data) => {
  if ((app.connection.state.comm == 'wait' || app.connection.state.comm == 'poll') && (data.version > getVersion(app.connection.state.edit))) {
    app.connection.backOff = 0;
    if (data.steps && (data.steps.length || data.comment.length)) {
      const tr = receiveTransaction(app.connection.state.edit, data.steps.map(j => Step.fromJSON(schema, j)), data.clientIDs);
      app.cursors[data.pos.userId] = data.pos;
      tr.setMeta(cursorsPlugin, Object.values(app.cursors));
      tr.setMeta(commentPlugin, { type: 'receive', version: data.commentVersion, events: data.comment, sent: 0 });
      app.connection.dispatch({ type: 'transaction', transaction: tr, requestDone: true });
      app.connection.view.focus();
    }
    // if (data.pos) {
    //   let tr = app.connection.state.edit.tr;
    //   app.connection.dispatch({ type: 'transaction', transaction: tr });
    //   app.connection.view.focus();
    // }
  }
});

app.socket.on('cursor updated', ({pos}) => {
  if (pos) {
    if (app.cursors[pos.userId] && app.cursors[pos.userId].head == pos.head) return;
    app.cursors[pos.userId] = pos;
    const tr = app.connection.state.edit.tr;
    tr.setMeta(cursorsPlugin, Object.values(app.cursors));
    app.connection.dispatch({ type: 'transaction', transaction: tr });
    app.connection.view.focus();
  }
});

app.socket.on('delete cursor', ({ userId }) => {
  if (userId) {
    delete app.cursors[userId];
    if (app.cursors) {
      const tr = app.connection.state.edit.tr;
      tr.setMeta(cursorsPlugin, Object.values(app.cursors));
      app.connection.dispatch({ type: 'transaction', transaction: tr });
      app.connection.view.focus();
    }
  }
});

function badVersion(err) {
  return err.status == 400 && /invalid version/i.test(err.msg);
}

app.socket.on('collab error', (error) => {
  if (error.status == 409) {
    // The client's document conflicts with the server's version.
    // Poll for changes and then try again.
    app.connection.backOff = 0;
    app.connection.dispatch({type: 'poll'});
  } else if (error.status == 410 || badVersion(error)) {
    app.connection.dispatch({type: 'restart'});
  } else {
    app.connection.dispatch({type: 'recover', error: error});
  }
});

$('#menu-btn').click((e) => {
  if ($(e.target).attr('opentab') == undefined || $(e.target).attr('opentab') == 'false') {
    $(e.target).attr('opentab', 'true');
    $('.ProseMirror-menubar').css('display', 'flex');
  } else {
    $(e.target).attr('opentab', 'false');
    $('.ProseMirror-menubar').css('display', 'none');
  }
});

$('#editor').click(() => {
  if (app.connection.view) {
    app.connection.view.focus();
  }
});