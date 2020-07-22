/* global app, $:true */
import 'bootstrap';

// Connect to Socket
var io = require('socket.io-client');
var socket = io();
app.view = null;


function pinNote(e) {
  updateNoteInfo(e, 'pin');
}
function unpinNote(e) {
  updateNoteInfo(e, 'unpin');
}
function restoreNote(e) {
  updateNoteInfo(e, 'restore');
}
function archiveNote(e) {
  updateNoteInfo(e, 'archive');
}
function trashNote(e) {
  updateNoteInfo(e, 'trash');
}
function deleteNote(e) {
  updateNoteInfo(e, 'delete');
}

function updateNoteInfo(e, action) {
  const noteId = $(e.target).parent().attr('noteid');
  const data = {
    noteId: noteId,
    currentType: app.currentType,
    currentPermission: app.currentPermission
  };
  fetch(`/api/1.0/note/${action}`, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      'content-type': 'application/json'
    },
  })
    .then(res => res.json())
    .then(({ noteList }) => {
      if (!noteList) return;
      createNotes(noteList, app.currentType);
    });
}

// Create New Note
$('#new-note').click(() => {
  fetch('/api/1.0/note')
    .then(res => res.json())
    .then(({ noteId, noteUrl, noteList }) => {
      $('.note-tab.current').removeClass('current');
      app.currentNote = noteId;
      createNotes(noteList, 'normal');
      if (app.view !== null) app.view.destroy();
      app.newEditor(noteUrl);
    });
});

$('#notes').click((e) => {
  if ($(e.target).is('span')) return;
  const tab = ($(e.target).attr('class') == 'note-tab' || $(e.target).attr('class') == 'note-tab current') ? $(e.target) : $(e.target).parent();
  const noteId = tab.attr('noteId');
  if (noteId == app.currentNote) return;
  $('.note-tab.current').removeClass('current');
  tab.addClass('current');
  if (app.view !== null) app.view.destroy();
  app.currentNote = noteId;
  app.newEditor(noteId);
  socket.emit('open note', { noteId });
});

function createNotes(noteList, type) {
  $('#notes').empty();
      let inList = false;
      switch (type) {
        case 'normal': {
          for (let i = 0; i < noteList.length; i++){
            let noteTab;
            if (app.profileId == app.userId) {
              const pinBtn = noteList[i].pinned ?
                $('<span>').text('push_pin').addClass('pinned material-icons-outlined').click(unpinNote) :
                $('<span>').text('push_pin').addClass('pin material-icons-outlined').click(pinNote);
              const deleteBtn = $('<span>').text('delete_outline').addClass('delete material-icons').click(trashNote);
              const archiveBtn = $('<span>').text('archive').addClass('archive material-icons-outlined').click(archiveNote);
              const info = $('<div>').addClass('info').text(noteList[i].shortid);
              noteTab = $('<div>').addClass('note-tab').attr('noteId', noteList[i].id).attr('noteUrl', noteList[i].shortid).append(pinBtn).append(info).append(deleteBtn).append(archiveBtn);
            } else {
              const info = $('<div>').addClass('info').text(noteList[i].shortid);
              noteTab = $('<div>').addClass('note-tab').attr('noteId', noteList[i].id).attr('noteUrl', noteList[i].shortid).append(info);
            }
            $('#notes').append(noteTab);
            // Set current note
            if (app.currentNote == noteList[i].id) {
              inList = true;
              noteTab.addClass('current');
            }
          }
          break;
        }
        case 'archive': {
          for (let i = 0; i < noteList.length; i++){
            const pinBtn = noteList[i].pinned ?
                $('<span>').text('push_pin').addClass('pinned material-icons-outlined').click(unpinNote) :
                $('<span>').text('push_pin').addClass('pin material-icons-outlined').click(pinNote);
            const deleteBtn = $('<span>').text('delete_outline').addClass('delete material-icons').click(trashNote);
            const archiveBtn = $('<span>').text('unarchive').addClass('archive material-icons-outlined').click(restoreNote);
            const info = $('<div>').addClass('info').text(noteList[i].shortid);
            const noteTab = $('<div>').addClass('note-tab').attr('noteId', noteList[i].id).attr('noteUrl', noteList[i].shortid).append(pinBtn).append(info).append(deleteBtn).append(archiveBtn);
            $('#notes').append(noteTab);
            // Set current note
            if (app.currentNote == noteList[i].id) {
              inList = true;
              noteTab.addClass('current');
            }
          }
          break;
        }
        case 'trash': {
          for (let i = 0; i < noteList.length; i++){
            const pinBtn = noteList[i].pinned ?
                $('<span>').text('push_pin').addClass('pinned material-icons-outlined').click(unpinNote) :
                $('<span>').text('push_pin').addClass('pin material-icons-outlined').click(pinNote);
            const deleteBtn = $('<span>').text('delete_forever').addClass('delete material-icons-outlined').click(deleteNote);
            const restoreBtn = $('<span>').text('restore_from_trash').addClass('archive material-icons-outlined').click(restoreNote);
            const info = $('<div>').addClass('info').text(noteList[i].shortid);
            const noteTab = $('<div>').addClass('note-tab').attr('noteId', noteList[i].id).attr('noteUrl', noteList[i].shortid).append(pinBtn).append(info).append(deleteBtn).append(restoreBtn);
            $('#notes').append(noteTab);
            // Set current note
            if (app.currentNote == noteList[i].id) {
              inList = true;
              noteTab.addClass('current');
            }
          }
          break;
        }
      }
      if (!inList && app.view != null) {
        app.currentNote = null;
        $('#button-container').css('display', 'none');
        $('#editor').css('background-image', "url('/img/note-background.png')");
        app.view.destroy();
      }
}

function fetchNotes(type, permission = '') {
  app.currentType = type;
  app.currentPermission = permission;
  $('.type.current').removeClass('current');
  $('.sub-type.current').removeClass('current');
  if (permission != '') {
    $(`#${permission}`).addClass('current');
  } else {
    $(`#${type}`).addClass('current');
  }
  fetch(`/api/1.0/notes?profileId=${app.profileId}&&type=${type}&&permission=${permission}`)
    .then(res => res.json())
    .then(({ noteList }) => {
      if (!noteList) return;
      createNotes(noteList, type);
    });
}

$('#normal').click((e) => {
  if (app.currentType == 'normal' && app.currentPermission == '') return;
  $('#new-note').attr('disabled', false);
  fetchNotes('normal');
});
$('#archive').click((e) => {
  if (app.currentType == 'archive') return;
  $('#new-note').attr('disabled', true);
  fetchNotes('archive');

});
$('#trash').click((e) => {
  if (app.currentType == 'trash') return;
  $('#new-note').attr('disabled', true);
  fetchNotes('trash');
});

$('#normal-dropdown').click(() => {
  if ($('#normal-dropdown').text() == 'chevron_right') {
    $('.normal-sub').css('display', 'flex');
    $('#normal-dropdown').text('expand_more');
  } else {
    $('.normal-sub').css('display', 'none');
    $('#normal-dropdown').text('chevron_right');
  }
});

$('#public').click(() => {
  if (app.currentType == 'normal' && app.currentPermission == 'public') return;
  $('#new-note').attr('disabled', false);
  fetchNotes('normal', 'public');
});

$('#private').click(() => {
  if (app.currentType == 'normal' && app.currentPermission == 'private') return;
  $('#new-note').attr('disabled', false);
  fetchNotes('normal', 'private');
});

$(document).ready(() => {
  fetchNotes('normal');
});
