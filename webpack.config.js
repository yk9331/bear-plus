const webpack = require('webpack');
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  name: 'app',

  entry: {
    font: path.join(__dirname, 'public/css/font.css'),
    emoji: path.join(__dirname, 'public/css/emoji.css'),
    home: [
      path.join(__dirname, 'public/js/home/home.js'),
      path.join(__dirname, 'public/js/includes/modal.js'),
    ],
    note: [
      path.join(__dirname, 'public/js/note/note.js'),
      path.join(__dirname, 'public/js/editor/editor.js'),
      path.join(__dirname, 'public/js/note/modal.js'),
      path.join(__dirname, 'public/js/includes/modal.js'),
    ],
    'home-style': [
      path.join(__dirname, 'node_modules/bootstrap/dist/css/bootstrap.min.css'),
      path.join(__dirname, 'public/css/modal.css'),
      path.join(__dirname, 'public/css/home.css'),
    ],
    'note-style': [
      path.join(__dirname, 'node_modules/bootstrap/dist/css/bootstrap.min.css'),
      path.join(__dirname, 'public/css/codeMirrorEditor.css'),
      path.join(__dirname, 'public/css/codeMirrorEditorEmbeded.css'),
      path.join(__dirname, 'public/css/proseMirror.css'),
      path.join(__dirname, 'public/css/modal.css'),
      path.join(__dirname, 'public/css/note.css'),
    ],
  },

  output: {
    path: path.join(__dirname, 'public/build'),
    publicPath: '/build/',
    filename: '[name].js',
  },

  module: {
    rules: [
      {
        test: /\.css$/i,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
        ],
      },
    ],
  },

  plugins: [
    new webpack.ProvidePlugin({
      //  _: 'lodash',
      $: 'jquery',
      jQuery: 'jquery',
      'window.jQuery': 'jquery',
    }),
    new HtmlWebpackPlugin({
      template: './public/views/includes/head.ejs',
      filename: path.join(__dirname, 'public/views/build/note-head.ejs'),
      chunks: ['font', 'emoji', 'note-style'],
      chunksSortMode: 'manual',
    }),
    new HtmlWebpackPlugin({
      template: './public/views/includes/head.ejs',
      filename: path.join(__dirname, 'public/views/build/home-head.ejs'),
      chunks: ['font', 'emoji', 'home-style'],
      chunksSortMode: 'manual',
    }),
    new HtmlWebpackPlugin({
      template: './public/views/includes/scripts.ejs',
      filename: path.join(__dirname, 'public/views/build/note-scripts.ejs'),
      chunks: [ 'note'],
      chunksSortMode: 'manual',
    }),
    new HtmlWebpackPlugin({
      template: './public/views/includes/scripts.ejs',
      filename: path.join(__dirname, 'public/views/build/home-scripts.ejs'),
      chunks: [ 'home'],
      chunksSortMode: 'manual',
    }),
    new MiniCssExtractPlugin(),
  ],
};
