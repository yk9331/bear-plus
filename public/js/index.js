import 'bootstrap';

// Connect to Socket
var io = require('socket.io-client');
var socket = io();

console.log(app);

// Create New Note
const newNoteBtn = $('#new-note');
newNoteBtn.click(() => {
  fetch('/api/1.0/note')
    .then(res => res.json())
    .then(body => {
      $('#notes').prepend($('<div>').addClass('note-tab').attr('noteId', body.noteId).attr('noteUrl', body.noteUrl).text(body.noteUrl).click(openNote(body.noteId)));
      console.log(body);
    });
});

const openNote = function (noteId) {
  
};

$(document).ready(() => {
  const notes = JSON.parse(app.noteList);
  for (let i = 0; i < notes.length; i++){
    $('#notes').append($('<div>').addClass('note-tab').attr('noteId', notes[i].id).attr('noteUrl', notes[i].shortid).text(notes[i].shortid).click(openNote(notes[i].id)));
  }
})