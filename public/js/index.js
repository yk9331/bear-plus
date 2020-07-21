/* global app, $:true */
import 'bootstrap';

// Connect to Socket
var io = require('socket.io-client');
var socket = io();


app.view = null;
console.log(app);

// Create New Note
const newNoteBtn = $('#new-note');
newNoteBtn.click(() => {
  fetch('/api/1.0/note')
    .then(res => res.json())
    .then(body => {
      $('.note-tab.current').removeClass('current');
      $('#notes').prepend($('<div>').addClass('note-tab').addClass('current').attr('noteId', body.noteId).attr('noteUrl', body.noteUrl).text(body.noteUrl));
      if(app.view !== null) app.view.destroy();
      app.newEditor(body.noteUrl);
    });
});

$('#notes').click((e) => {
  $('.note-tab.current').removeClass('current');
  const noteId = $(e.target).attr('noteId');
  $(e.target).addClass('current');
  if(app.view !== null) app.view.destroy();
  app.newEditor(noteId);
});


$(document).ready(() => {
  const notes = JSON.parse(app.noteList);
  for (let i = 0; i < notes.length; i++){
    $('#notes').append($('<div>').addClass('note-tab').attr('noteId', notes[i].id).attr('noteUrl', notes[i].shortid).text(notes[i].shortid));
  }
});