var sha256 = require('sha256');

var blockfile = require('./blockfile');
var btreedb = require('./btreedb');
var sbon = require('./sbon');

var DIGEST_KEY = '_digest';
var INDEX_KEY = '_index';

var packageProto = {
  get: function (key) {
    key = sha256(key, {asString: true});
    return this.db.get(key);
  },

  getDigest: function () {
    return this.get(DIGEST_KEY);
  },

  /**
   * Gets the list of files in this package.
   */
  getIndex: function () {
    return new sbon.Reader(this.get(INDEX_KEY)).readStringList();
  }
};

exports.open = function (file) {
  var blockFile = blockfile.open(file);
  var db = btreedb.open(blockFile);

  var package = Object.create(packageProto, {
    db: {value: db}
  });

  return package;
};
