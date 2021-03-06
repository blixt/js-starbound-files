var sha256 = require('sha256');
var sha256starbound = require('starbound-sha256');

var BlockFile = require('./blockfile');
var BTreeDB = require('./btreedb');
var SbonReader = require('./sbonreader');

module.exports = Package;

var DIGEST_KEY = '_digest';
var INDEX_KEY = '_index';

function Package(database) {
  this.db = database;
}

Package.open = function (file) {
  return new Package(BTreeDB.open(file));
};

Package.prototype.get = function (key) {
  var keyHash = sha256(key.toLowerCase(), {asString: true});
  try {
    return this.db.get(keyHash);
  } catch (e) {
    // Older versions of Starbound had a buggy hash implementation. Try to use
    // it, since we could be reading an old package file.
    if (key.length == 55) {
      keyHash = sha256starbound(key, {asString: true});
      return this.db.get(keyHash);
    }

    throw e;
  }
};

Package.prototype.getDigest = function () {
  return this.get(DIGEST_KEY);
};

/**
 * Gets the paths and keys of the files in this package.
 */
Package.prototype.getIndex = function () {
  var reader = new SbonReader(this.get(INDEX_KEY));
  switch (this.db.identifier) {
    case 'Assets1':
      var paths = reader.readStringList(), map = {};
      for (var i = 0; i < paths.length; i++) {
        map[paths[i]] = null;
      }
      return map;
    case 'Assets2':
      return reader.readStringDigestMap();
    default:
      throw new Error('Unsupported package type ' + this.identifier);
  }
};
