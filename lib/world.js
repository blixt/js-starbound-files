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
  getMetadata: function () {
    if (this._metadata) return this._metadata;

    var reader = new sbon.Reader(this.db.get(METADATA_KEY));

    // Skip some unknown bytes.
    reader.seek(8);

    var doc = reader.readDocument();
    if (doc.name != 'WorldMetadata') {
      throw new Error('Invalid world file');
    }

    this._metadata = doc.data;
    return doc.data;
  },

  getRegion: function (x, y) {
    var region = Object.create(regionProto, {
      tileView: {value: new DataView(this.getRegionData(1, x, y), 3)},
      entities: {value: this.getEntities(x, y)}
    });

    return region;
  },

  getRegionData: function (layer, x, y, callback) {
    var key = String.fromCharCode(layer, x >> 8, x & 255, y >> 8, y & 255);
    var buffer = this.db.get(key);
    var inflated = zlib.inflateSync(new Uint8Array(buffer));
    var array = new Uint8Array(inflated);
    return array.buffer;
  },

  getEntities: function (x, y) {
    var buffer = this.getRegionData(2, x, y);
    return new sbon.Reader(buffer).readDocumentList();
  }
};

exports.open = function (file) {
  var blockFile = blockfile.open(file);
  var db = btreedb.open(blockFile);

  var world = Object.create(worldProto, {
    db: {value: db},
    _metadata: {value: null, writable: true}
  });

  return world;
};
