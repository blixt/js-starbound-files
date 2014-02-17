var zlib = require('zlib');

var BTreeDB = require('./btreedb');
var SbonReader = require('./sbonreader');

module.exports = World;

var METADATA_KEY = '\x00\x00\x00\x00\x00';

function World(database) {
  this.db = database;
}

World.open = function (file) {
  return new World(BTreeDB.open(file));
};

World.prototype.getMetadata = function () {
  var reader = new SbonReader(this.db.get(METADATA_KEY));

  // Skip some unknown bytes.
  reader.seek(8);

  var doc = reader.readDocument();
  if (doc.name != 'WorldMetadata') {
    throw new Error('Invalid world file');
  }

  return doc.data;
};

World.prototype.getRegionData = function (layer, x, y, callback) {
  var key = String.fromCharCode(layer, x >> 8, x & 255, y >> 8, y & 255);
  var buffer = this.db.get(key);
  var inflated = zlib.inflateSync(new Uint8Array(buffer));
  var array = new Uint8Array(inflated);
  return array.buffer;
};

World.prototype.getEntities = function (x, y) {
  var buffer = this.getRegionData(2, x, y);
  return new SbonReader(buffer).readDocumentList();
};
