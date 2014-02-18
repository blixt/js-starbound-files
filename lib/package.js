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
  var keyHash = sha256(key, {asString: true});
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
 * Gets the list of files in this package.
 */
Package.prototype.getIndex = function () {
  return new SbonReader(this.get(INDEX_KEY)).readStringList();
};
