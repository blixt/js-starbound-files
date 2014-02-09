var sha256 = require('sha256');

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
    this.get(INDEX_KEY, callback);
  }
};

exports.open = function (file, callback) {
  blockfile.open(file, function (blockFile) {
    btreedb.open(blockFile, function (db) {
      var package = Object.create(packageProto, {
        db: {value: db},
        _fileList: {value: null, writable: true}
      });
      callback(null, package);
    });
  });
};
