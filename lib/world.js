var zlib = require('zlib');

var blockfile = require('./blockfile');
var btreedb = require('./btreedb');
var sbon = require('./sbon');

var METADATA_KEY = '\x00\x00\x00\x00\x00';

function World(db) {
  this.db = db;
}

World.prototype.getMetadata = function () {
  var reader = new sbon.Reader(this.db.get(METADATA_KEY));

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
  return new sbon.Reader(buffer).readDocumentList();
};

exports.World = World;

exports.open = function (file) {
  var blockFile = blockfile.open(file);
  var db = btreedb.open(blockFile);

  return new World(db);
};
