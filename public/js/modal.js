/* global app, $:true */
$('#signin-form').on('submit', (e) => {
  e.preventDefault();
  const data = {
    email: $('#signin-email').val(),
    password: $('#signin-password').val()
  };
  fetch('/api/1.0/signin', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      'content-type': 'application/json'
    },
    redirect: 'follow'
  }).then(res => res.json())
    .then(body => {
      if (body.error) {
        $('#signin-help').css('display', 'block').text(body.error);
      } else {
        document.location.href = `/@${body.userId}`;
      }
    });
});

$('#signup-form').on('submit', (e) => {
  e.preventDefault();
  const data = {
    username: $('#signup-username').val(),
    email: $('#signup-email').val(),
    password: $('#signup-password').val()
  };
  console.log(data);
  fetch('/api/1.0/register', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      'content-type': 'application/json'
    },
    redirect: 'follow'
  }).then(res => res.json())
    .then(body => {
      if (body.error) {
        $('#signup-help').css('display', 'block').text(body.error);
      } else {
        document.location.href = `/@${body.userId}`;
      }
    });
});

$('#setting-btn').click((e) => {
  fetch('/api/1.0/user/setting')
    .then(res => res.json())
    .then(body => {
      console.log(body);
      $('#userurlHelp').text('Short URL path for your profile. Allow a-Z, 0-9 and dash.').removeClass('error').addClass('text-muted');
      $('#emailHelp').text('');
      $('#avatareHelp').text('');
      $('#password-form').css('display', 'none');
      $('#setting-save').attr('disabled', true);
      if (body.provider == 'native') {
        $('#setting-username').attr('placeholder', decodeURIComponent(body.profile.name));
        $('#setting-userurl').attr('placeholder', body.userId);
        $('#setting-email').attr('placeholder', body.email);
        $('#setting-avatar').attr('src', body.profile.photo);
        $('#change-password').css('display', 'block');
        $('#password-msg').text('');
      } else {
        $('#setting-userurl').attr('placeholder', body.userId);
        $('#setting-username').attr('placeholder', decodeURIComponent(body.profile.name));
        $('#setting-avatar').attr('src', body.profile.biggerphoto);
        $('#email-group').css('display', 'none');
        $('#password-group').css('display', 'none');
      }
    });
});

$('#setting-userurl').on('input', () => {
  var regexp = new RegExp('[^a-zA-Z0-9-]', 'g');
  if ($('#setting-userurl').val().match(regexp)) {
    $('#userurlHelp').text('character not allow').removeClass('text-muted').addClass('error');
    $('#setting-save').attr('disabled', true);
  } else if (!$('#setting-userurl').val() && !$('#setting-username').val() && !$('#setting-email').val()) {
    $('#userurlHelp').text('Short URL path for your profile. Allow a-Z, 0-9 and dash.').removeClass('error').addClass('text-muted');
    $('#setting-save').attr('disabled', true);
  } else {
    $('#userurlHelp').text('Short URL path for your profile. Allow a-Z, 0-9 and dash.').removeClass('error').addClass('text-muted');
    $('#setting-save').attr('disabled', false);
  }
});

$('#setting-username').on('input', () => {
  if (!$('#setting-userurl').val() && !$('#setting-username').val() && !$('#setting-email').val()) {
    $('#setting-save').attr('disabled', true);
  } else {
    $('#setting-save').attr('disabled', false);
  }
});

$('#photo-input').on('change', (e) => {
  $('#avatareHelp').text('');
  const formData = new FormData();
  formData.append('avatar', e.target.files[0]);

  fetch('/api/1.0/user/avatar', {
    method: 'POST',
    body: formData
  })
    .then(res => res.json())
    .then(({ error, url }) => {
      if (error) $('#avatareHelp').text(error);
      $('#setting-avatar').attr('src', url);
      $('.user-icon').attr('src', url);
    });
});

$('#setting-save').click(() => {
  const username = $('#setting-username').val() ? $('#setting-username').val() : null;
  const shortUrl = $('#setting-userurl').val() ? $('#setting-userurl').val() : null;
  const email = $('#setting-email').val() ? $('#setting-email').val() : null;
  const data = { username, email, shortUrl };
  fetch('/api/1.0/user/setting', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      'content-type': 'application/json'
    },
  })
    .then(res => res.json())
    .then((body) => {
      if (body.urlError) {
        $('#userurlHelp').text(body.urlError).removeClass('text-muted').addClass('error');
      }
      if (body.emailError) {
        $('#emailHelp').text(body.urlError).removeClass('text-muted').addClass('error');
      }
      if (body.username) {
        $('.user-name').text(body.username);
      }
      if (body.shortUrl && !body.urlError && !body.emailError) {
        document.location.href = `@${shortUrl}`;
      } else if(!body.urlError && !body.emailError){
        $('#setting-modal').modal('toggle');
      }
    })
    .catch (error => console.error('Error:', error));
});

$('#change-password').click((e) => {
  $(e.target).css('display', 'none');
  $('#password-form').css('display', 'flex');
});

$('#password-form').on('submit', (e) => {
  e.preventDefault();
  const password = $('#curr-password').val();
  const newPassword = $('#new-password').val();
  fetch('/api/1.0/user/password', {
    method: 'POST',
    body: JSON.stringify({password,newPassword}),
    headers: {
      'content-type': 'application/json'
    },
  })
    .then(res => res.json())
    .then((body) => {
      if (body.error) {
        $('#curr-password').val('');
        $('#passwordHelp').text(body.error).removeClass('text-muted').addClass('error');
      } else {
        $('#change-password').css('display', 'flex');
        $('#password-form').css('display', 'none');
        $('#password-msg').text(body.msg);
      }
    })
    .catch (error => console.error('Error:', error));
});

$('#curr-password').on('input', (e) => {
  $('#passwordHelp').text('');
});

$('#confirm-password').on('input',(e) => {
  if ($(e.target).val() !== $('#new-password').val()) {
    $('#password-save').attr('disabled', true);
    $('#passwordHelp').text('Passwords do not match').removeClass('text-muted').addClass('error');
  } else {
    $('#password-save').attr('disabled', false);
    $('#passwordHelp').text('');
  }
});