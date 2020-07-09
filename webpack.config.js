const webpack = require('webpack');
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  name: 'app',

  entry: {
    font: path.join(__dirname, 'public/css/font.css'),
    emoji: path.join(__dirname, 'public/css/emoji.css'),
    note: [
      path.join(__dirname, 'public/js/note.js'),
    ],
    'note-style': [
      path.join(__dirname, 'public/css/font.css'),
      path.join(__dirname, 'node_modules/codemirror/theme/neo.css'),
      path.join(__dirname, 'public/css/note.css'),
    ],
  },

  output: {
    path: path.join(__dirname, 'public/build'),
    filename: '[name].bundle.js',
  },

  module: {
    rules: [
      {
        test: /\.(js)$/,
        exclude: [/(node_modules)/],
        use: [{
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        }],
      },
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
      $: 'jquery',
      jQuery: 'jquery',
      'window.jQuery': 'jquery',
    }),
    new HtmlWebpackPlugin({
      template: './public/views/note.ejs',
      filename: path.join(__dirname, 'public/views/build/note.ejs'),
      chunks: ['note', 'font', 'emoji', 'note-style'],
      chunksSortMode: 'manual',
    }),
    new HtmlWebpackPlugin({
      template: './public/views/404.ejs',
      filename: path.join(__dirname, 'public/views/build/404.ejs'),
      chunks: [],
      chunksSortMode: 'manual',
    }),
    new MiniCssExtractPlugin(),
  ],
};
