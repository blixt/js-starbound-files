var sha256 = require('sha256');

var blockfile = require('./blockfile');
var btreedb = require('./btreedb');
var sbon = require('./sbon');

var DIGEST_KEY = '_digest';
var INDEX_KEY = '_index';

var packageProto = {
  get: function (key, callback) {
    key = sha256(key, {asString: true});
    this.db.get(key, callback);
  },

  getDigest: function (callback) {
    this.get(DIGEST_KEY, callback);
  },

  /**
   * Gets the list of files in this package.
   */
  getIndex: function (callback) {
    this.get(INDEX_KEY, function (err, buffer) {
      if (err) {
        callback(err);
        return;
      }

      var reader = sbon.getReader(buffer);
      callback(null, reader.readStringList());
    });
  }
};

exports.open = function (fileEntry, callback) {
  blockfile.open(fileEntry, function (err, blockFile) {
    if (err) {
      callback(err);
      return;
    }

    btreedb.open(blockFile, function (err, db) {
      if (err) {
        callback(err);
        return;
      }

      var package = Object.create(packageProto, {
        db: {value: db}
      });
      callback(null, package);
    });
  });
};
