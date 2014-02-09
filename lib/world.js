var blockfile = require('./blockfile');
var btreedb = require('./btreedb');
var sbon = require('./sbon');

var TILES_X = 32;
var TILES_Y = 32;
var TILES_PER_REGION = TILES_X * TILES_Y;

var METADATA_KEY = '\x00\x00\x00\x00\x00';

var worldProto = {
  getMetadata: function (callback) {
    if (this._metadata) {
      callback(this._metadata);
      return
    }

    this.db.get(METADATA_KEY, function (buffer) {
      var reader = sbon.getReader(buffer);

      // Skip some unknown bytes.
      reader.seek(8);

      var doc = reader.readDocument();
      if (doc.name != 'WorldMetadata') {
        throw new Error('Invalid world file');
      }

      this._metadata = doc.data;
      callback(doc.data);
    });
  }
};

exports.open = function (file, callback) {
  blockfile.open(file, function (blockFile) {
    btreedb.open(blockFile, function (db) {
      var world = Object.create(worldProto, {
        db: {value: db},
        _metadata: {value: null, writable: true}
      });
      callback(world);
    });
  });
};
