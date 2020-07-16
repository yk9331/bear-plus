import 'bootstrap';

const app = {
  currentNoteId: null,
  profileId: document.location.pathname.split('/')[1],
  profile: null,
  noteList: null,
  tagList: null,
  user: null
};

console.log(app.profileId);

// Connect to Socket
var io = require('socket.io-client');
var socket = io({
  path: app.currentNoteId ? '/socket.io/' + app.currentNoteId : '',
  query: {
    noteId: app.currentNoteId
  },
});

// Create New Note
const newNoteBtn = $('#new-note');
newNoteBtn.click(() => {
  fetch('/api/1.0/note')
    .then(res => res.json())
    .then(body => console.log(body));
});
