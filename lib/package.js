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
    if (this._index) {
      callback(null, this._index);
      return;
    }

    var self = this;
    this.get(INDEX_KEY, function (err, buffer) {
      var reader = sbon.getReader(buffer);
      self._index = reader.readStringList();
      callback(null, self._index);
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
        db: {value: db},
        _index: {value: null, writable: true}
      });
      callback(null, package);
    });
  });
};
