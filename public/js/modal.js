/* global app, $:true */
$('#signin-form').on('submit', (e) => {
  e.preventDefault();
  const data = {
    email: $('#signin-email').val(),
    password: $('#signin-password').val()
  }
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
  fetch('/api/1.0/setting')
    .then(res => res.json())
    .then(body => {
      console.log(body);
    });
});