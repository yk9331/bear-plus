const { SharedIniFileCredentials } = require("aws-sdk");

const uploadImage = async (req, res) => {
  const url = req.files.image[0].location;
  res.json({ url });
};

module.exports = {
  uploadImage
};