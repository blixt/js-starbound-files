var async = require('async');
var zlib = require('zlib');

var blockfile = require('./blockfile');
var btreedb = require('./btreedb');
var sbon = require('./sbon');

var TILES_X = 32;
var TILES_Y = 32;
var TILES_PER_REGION = TILES_X * TILES_Y;

var BYTES_PER_TILE = 23;
var BYTES_PER_ROW = BYTES_PER_TILE * TILES_X;
var BYTES_PER_REGION = BYTES_PER_TILE * TILES_PER_REGION;

var METADATA_KEY = '\x00\x00\x00\x00\x00';

var regionProto = {
  getBackground: function (x, y) {
    var offset = this.getTileOffset(x, y);
    return [
      // Material id
      this.tileView.getInt16(offset + 7),
      // Hue shift
      this.tileView.getUint8(offset + 9),
      // Variant?
      this.tileView.getUint8(offset + 10),
      // Mod
      this.tileView.getInt16(offset + 11),
      // Mod hue shift
      this.tileView.getUint8(offset + 13)
    ];
  },

  getForeground: function (x, y) {
    var offset = this.getTileOffset(x, y);
    return [
      // Material id
      this.tileView.getInt16(offset),
      // Hue shift
      this.tileView.getUint8(offset + 2),
      // Variant?
      this.tileView.getUint8(offset + 3),
      // Mod
      this.tileView.getInt16(offset + 4),
      // Mod hue shift
      this.tileView.getUint8(offset + 6)
    ];
  },

  getMetadata: function (x, y) {
    var offset = this.getTileOffset(x, y);
    return [
      // Liquid
      this.tileView.getUint8(offset + 14),
      // Liquid pressure
      this.tileView.getUint16(offset + 15),
      // Collision map
      this.tileView.getUint8(offset + 17),
      // ?
      this.tileView.getInt16(offset + 18),
      // Biome?
      this.tileView.getUint8(offset + 20),
      // Biome?
      this.tileView.getUint8(offset + 21),
      // Indestructible
      !!this.tileView.getUint8(offset + 22)
    ];
  },

  getTileOffset: function (x, y) {
    return BYTES_PER_REGION - BYTES_PER_ROW * (y + 1) + BYTES_PER_TILE * x;
  }
};

var worldProto = {
  getMetadata: function (callback) {
    if (this._metadata) {
      callback(null, this._metadata);
      return
    }

    this.db.get(METADATA_KEY, function (err, buffer) {
      var reader = sbon.getReader(buffer);

      // Skip some unknown bytes.
      reader.seek(8);

      var doc = reader.readDocument();
      if (doc.name != 'WorldMetadata') {
        callback(new Error('Invalid world file'));
        return;
      }

      this._metadata = doc.data;
      callback(null, doc.data);
    });
  },

  getRegion: function (x, y, callback) {
    var self = this;

    async.parallel([
      function (callback) {
        self.getRegionData(1, x, y, callback);
      },
      function (callback) {
        self.getEntities(x, y, callback);
      }
    ], function (err, results) {
      var region = Object.create(regionProto, {
        tileView: {value: new DataView(results[0], 3)},
        entities: {value: results[1]}
      });

      callback(null, region);
    });
  },

  getRegionData: function (layer, x, y, callback) {
    var key = String.fromCharCode(layer, x >> 8, x & 255, y >> 8, y & 255);
    this.db.get(key, function (err, buffer) {
      var inflated = zlib.inflateSync(new Uint8Array(buffer));
      var array = new Uint8Array(inflated);
      callback(null, array.buffer);
    });
  },

  getEntities: function (x, y, callback) {
    this.getRegionData(2, x, y, function (err, buffer) {
      var reader = sbon.getReader(buffer);
      callback(null, reader.readDocumentList());
    });
  }
};

exports.open = function (fileEntry, callback) {
  blockfile.open(fileEntry, function (err, blockFile) {
    btreedb.open(blockFile, function (err, db) {
      var world = Object.create(worldProto, {
        db: {value: db},
        _metadata: {value: null, writable: true}
      });
      callback(null, world);
    });
  });
};
