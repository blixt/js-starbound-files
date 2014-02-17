var sha256 = require('starbound-sha256');

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
  key = sha256(key, {asString: true});
  return this.db.get(key);
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
