require('dotenv').config();
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const ejs = require('ejs');

const app = express();
const port = 5000;

// Setup view engine
app.set('views', './public/views/build');
app.engine('ejs', ejs.renderFile);
app.set('view engine', 'ejs');

app.use('/', express.static(path.join(__dirname, '/public')));

// Parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));
// Parse application/json
app.use(bodyParser.json());
app.use(cookieParser());

app.get('/', (req, res) => {
  res.render('note');
});

app.use((req, res, next) => {
  res.status(404).render('404.ejs');
});

app.use((err, req, res, next) => {
  console.log(err);
  res.status(500).send('Internal Server Error');
});

app.listen(port, () => { console.log(`Listening on port: ${port}`); });
