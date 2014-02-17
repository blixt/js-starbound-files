var util = require('util');

var BlockFile = require('./blockfile');
var SbonReader = require('./sbonreader');

module.exports = BTreeDB;

var BLOCK_INDEX = 'II';
var BLOCK_LEAF = 'LL';

function BTreeDB(blockFile, identifier, keySize) {
  this.blockFile = blockFile;
  this.identifier = identifier;
  this.keySize = keySize;

  this.alternateRootNode = false;
  this.rootNode = null;
  this.rootNodeIsLeaf = false;
}

BTreeDB.open = function (file) {
  var blockFile = BlockFile.open(file);

  var buffer = blockFile.getUserHeader();
  var reader = new SbonReader(buffer);

  if (reader.readFixedString(12) != 'BTreeDB4') {
    throw new Error('Unsupported database format');
  }

  var identifier = reader.readFixedString(12),
      keySize = reader.readInt32();

  var db = new BTreeDB(blockFile, identifier, keySize);

  // Whether we should be using the alternate root node reference.
  db.alternateRootNode = reader.readBoolean();

  // Skip ahead based on whether we're alternating references.
  reader.seek(db.alternateRootNode ? 9 : 1, true);

  db.rootNode = reader.readInt32();
  db.rootNodeIsLeaf = reader.readBoolean();

  return db;
};

BTreeDB.prototype.get = function (key) {
  if (key.length != this.keySize) {
    throw new Error('Provided key must be of the correct length');
  }

  return this.search(this.rootNode, key);
};

BTreeDB.prototype.getLeafValue = function (block, key) {
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

    // Only seek if this isn't the last block.
    if (i < keyCount - 1) {
      reader.seek(size, true);
    }
  }

  throw new Error('Key not found');
};

/**
 * Begin searching for a key at the given block id. Keep searching down the
 * indexes until a leaf is found and then return the value for the provided
 * key.
 */
BTreeDB.prototype.search = function (blockId, key, callback) {
  var block = this.blockFile.getBlock(blockId);

  // TODO: Cache index blocks.
  while (block.type == BLOCK_INDEX) {
    var nextBlockId = new Index(this.keySize, block).find(key);
    block = this.blockFile.getBlock(nextBlockId);
  }

  if (block.type != BLOCK_LEAF) {
    throw new Error('Did not reach leaf');
  }

  return this.getLeafValue(block, key);
};

/**
 * Wraps a block object to provide functionality for parsing and scanning an
 * index.
 */
function Index(keySize, block) {
  var reader = new SbonReader(block.buffer);

  this.level = reader.readUint8();

  // Number of keys in this index.
  this.keyCount = reader.readInt32();

  // The blocks that the keys point to. There will be one extra block in the
  // beginning of this list that points to the block to go to if the key being
  // searched for is left of the first key in this index.
  this.blockIds = new Int32Array(this.keyCount + 1);
  this.blockIds[0] = reader.readInt32();

  this.keys = [];

  // Load all key/block reference pairs.
  for (var i = 1; i <= this.keyCount; i++) {
    this.keys.push(reader.readByteString(keySize));
    this.blockIds[i] = reader.readInt32();
  }
}

/**
 * Searches this index for the specified key and returns the next block id to
 * search.
 */
Index.prototype.find = function (key) {
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
};

function LeafReader(blockFile, block) {
  SbonReader.call(this, block.buffer);
  this.blockFile = blockFile;
}
util.inherits(LeafReader, SbonReader);

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
    offset -= length;
    this.view = new DataView(this._getNextBlock().buffer);
    length = this.view.byteLength - 4;
  }

  this.offset = offset;
  return this;
};

LeafReader.prototype._getNextBlock = function () {
  var nextBlockId = this.view.getInt32(this.view.byteLength - 4);
  if (nextBlockId == -1) throw new Error('Tried to traverse to non-existent block');
  return this.blockFile.getBlock(nextBlockId);
};
