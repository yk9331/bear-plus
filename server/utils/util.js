const aws = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { AWS_ACCESS_KEY_ID, AWS_ACCESS_KEY_SECRET, AWS_REGION } = require('../config/config');

aws.config.update({
  secretAccessKey: AWS_ACCESS_KEY_SECRET,
  accessKeyId: AWS_ACCESS_KEY_ID,
  region: AWS_REGION
});
const s3 = new aws.S3();

function getS3Storage (path) {
  return multerS3({
    s3: s3,
    bucket: 'bear-plus',
    key: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const fileName = uniqueSuffix + '.' + file.mimetype.split('/')[1];
      const fullPath = path + fileName;
      cb(null, fullPath);
    },
    acl: 'public-read'
  });
}

const upload = function (path) {
  return multer({ storage: getS3Storage(path) });
};

module.exports = {
  upload,
};