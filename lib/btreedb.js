var util = require('util');

var sbon = require('./sbon');

var BLOCK_INDEX = 'II';
var BLOCK_LEAF = 'LL';

exports.open = function (blockFile) {
  var buffer = blockFile.getUserHeader();

  var reader = new sbon.Reader(buffer);

  if (reader.readFixedString(12) != 'BTreeDB4') {
    throw new Error('Unsupported database format');
  }

  var identifier = reader.readFixedString(12);
  var keySize = reader.readInt32();

  // Whether we should be using the alternate root node reference.
  var alternate = reader.readBoolean();

  // Skip ahead based on whether we're alternating references.
  reader.seek(alternate ? 9 : 1, true);

  var rootNode = reader.readInt32(),
      rootNodeIsLeaf = reader.readBoolean();

  var database = Object.create(databaseProto, {
    identifier: {value: identifier},
    blockFile: {value: blockFile},
    keySize: {value: keySize},
    alternateRootNode: {value: alternate, writable: true},
    rootNode: {value: rootNode, writable: true},
    rootNodeIsLeaf: {value: rootNodeIsLeaf, writable: true}
  });

  return database;
};

var databaseProto = {
  get: function (key) {
    if (key.length != this.keySize) {
      throw new Error('Provided key must be of the correct length');
    }

    return this.search(this.rootNode, key);
  },

  getLeafValue: function (block, key) {
    if (block.type != BLOCK_LEAF) {
      throw new Error('Expected a leaf node');
    }

    var reader = new LeafReader(this.blockFile, block);
    var keyCount = reader.readInt32();

    for (var i = 0; i < keyCount; i++) {
      // Get the key to see if it's the one we're searching for.
      var curKey = reader.readByteString(this.keySize);

      var size = reader.readUintVar();
      if (key == curKey) {
        return reader.readBytes(size);
      }
      reader.seek(size, true);
    }

    throw new Error('Could not find key');
  },

  /**
   * Begin searching for a key at the given block id. Keep searching down the
   * indexes until a leaf is found and then return the value for the provided
   * key.
   */
  search: function (blockId, key, callback) {
    var block = this.blockFile.getBlock(blockId);

    // TODO: Cache index blocks.
    while (block.type == BLOCK_INDEX) {
      var nextBlockId = index(this.keySize, block).find(key);
      block = this.blockFile.getBlock(nextBlockId);
    }

    if (block.type != BLOCK_LEAF) {
      throw new Error('Did not reach leaf');
    }

    return this.getLeafValue(block, key);
  }
};

/**
 * Wraps a block object to provide functionality for parsing and scanning an
 * index.
 */
function index(keySize, block) {
  var reader = new sbon.Reader(block.buffer);

  var indexLevel = reader.readUint8();

  // Number of keys in this index.
  var keyCount = reader.readInt32();

  // The blocks that the keys point to. There will be one extra block in the
  // beginning of this list that points to the block to go to if the key being
  // searched for is left of the first key in this index.
  var blockIds = new Int32Array(keyCount + 1);
  blockIds[0] = reader.readInt32();

  var index = Object.create(indexProto, {
    level: {value: indexLevel},
    keyCount: {value: keyCount},
    keys: {value: []},
    blockIds: {value: blockIds}
  });

  // Load all key/block reference pairs.
  for (var i = 1; i <= keyCount; i++) {
    index.keys.push(reader.readByteString(keySize));
    blockIds[i] = reader.readInt32();
  }

  return index;
}

var indexProto = {
  /**
   * Searches this index for the specified key and returns the next block id to
   * search.
   */
  find: function (key) {
    // Maybe overkill considering that an index can't really contain more than
    // around 60 keys.
    var lo = 0, hi = this.keyCount, mid;
    while (lo < hi) {
      mid = (lo + hi) >> 1;
      if (key < this.keys[mid]) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }

    return this.blockIds[lo];
  }
};

function LeafReader(blockFile, block) {
  sbon.Reader.call(this, block.buffer);
  this.blockFile = blockFile;
}
util.inherits(LeafReader, sbon.Reader);

LeafReader.prototype.readBytes = function (count, opt_noCopy) {
  var buffer = this.view.buffer,
      start = this.view.byteOffset + this.offset,
      chunkLength = Math.min(count, buffer.byteLength - 4 - start);

  var range = new Uint8Array(buffer, start, chunkLength);
  if (opt_noCopy && chunkLength == count) {
    this.offset += chunkLength;
    return range;
  }

  var array = new Uint8Array(count), written = 0;
  while (true) {
    array.set(range, written);
    written += chunkLength;

    if (written == count) break;

    buffer = this._getNextBlock().buffer;
    this.view = new DataView(buffer);

    chunkLength = Math.min(count - written, buffer.byteLength - 4);
    range = new Uint8Array(buffer, 0, chunkLength);
  }

  this.offset = chunkLength;

  return array;
};

LeafReader.prototype.seek = function (offset, opt_relative) {
  var length = this.view.byteLength - 4;
  if (opt_relative) {
    offset = this.offset + offset;
  } else {
    if (offset < 0) {
      offset = length + offset;
    } else {
      offset = offset;
    }
  }

  if (offset < 0) {
    throw new Error('Out of bounds');
  }

  while (offset >= length) {
    offset -= length + 4;
    this.view = new DataView(this._getNextBlock().buffer);
    length = this.view.byteLength - 4;
  }

  this.offset = offset;
  return this;
};

LeafReader.prototype._getNextBlock = function () {
  return this.blockFile.getBlock(this.view.getInt32(this.view.byteLength - 4));
};
