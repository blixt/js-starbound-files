var sbon = require('./sbon');

var BLOCK_INDEX = 'II';
var BLOCK_LEAF = 'LL';

exports.open = function (blockFile, callback) {
  blockFile.getUserHeader(function (err, buffer) {
    if (err) {
      callback(err);
      return;
    }

    var reader = sbon.getReader(buffer);

    if (reader.readFixedString(12) != 'BTreeDB4') {
      callback(new Error('Unsupported database format'));
      return;
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

    callback(null, database);
  });
};

/**
 * Wraps a block object to provide functionality for parsing and scanning an
 * index.
 */
function index(keySize, block) {
  var reader = new sbon.getReader(block.buffer);

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

var databaseProto = {
  get: function (key, callback) {
    if (key.length != this.keySize) {
      callback(new Error('Provided key must be of the correct length'));
      return;
    }

    this.search(this.rootNode, key, callback);
  },

  getLeafValue: function (block, key, callback) {
    if (block.type != BLOCK_LEAF) {
      callback(new Error('Expected a leaf node'));
      return;
    }

    var reader = sbon.getReader(block.buffer);
    var keyCount = reader.readInt32();

    this._scanForKey(reader, key, keyCount, callback);
  },

  /**
   * Begin searching for a key at the given block id. Keep searching down the
   * indexes until a leaf is found and then return the value for the provided
   * key.
   */
  search: function (blockId, key, callback) {
    var self = this;
    this.blockFile.getBlock(blockId, function (err, block) {
      if (block.type == BLOCK_LEAF) {
        self.getLeafValue(block, key, callback);
        return;
      }

      if (block.type != BLOCK_INDEX) {
        callback(new Error('Expected an index block'));
        return;
      }

      // TODO: Cache index blocks.
      var nextBlockId = index(self.keySize, block).find(key);
      self.search(nextBlockId, key, callback);
    });
  },

  /**
   * Reads leaf data into an array, starting at the specified offset in the
   * block data.
   */
  _readLeafData: function (reader, dest, bytesWritten, callback) {
    // The number of bytes we could possibly read from the current block. The
    // last 4 bytes contain a reference to the next block, so are off limits.
    var blockDataEnd = reader.view.byteLength - 4;
    var potentialBytes = blockDataEnd - reader.offset;

    // Figure out how many bytes we can copy over and copy them.
    var bytesToSet = Math.min(potentialBytes, dest.length - bytesWritten);
    dest.set(reader.readBytes(bytesToSet, true), bytesWritten);
    bytesWritten += bytesToSet;

    // We still have more to go...
    if (bytesWritten < dest.length) {
      var self = this;

      // The last 4 bytes reference the next block to read from.
      this.blockFile.getBlock(reader.readInt32(), function (err, block) {
        if (err) {
          callback(err);
          return;
        }

        self._readLeafData(sbon.getReader(block.buffer), dest, bytesWritten, callback);
      });

      return;
    }

    callback(null, dest.buffer);
  },

  /**
   * Will read through one or more blocks to find the specified key. Assumes
   * that the provided reader is in a leaf block, aligned to the next key.
   */
  _scanForKey: function (reader, key, keysLeft, callback) {
    var curKey = reader.readByteString(this.keySize);
    var size = reader.readUintVar();

    if (key == curKey) {
      this._readLeafData(reader, new Uint8Array(size), 0, callback);
      return;
    }

    keysLeft--;
    if (!keysLeft) {
      callback(new Error('Could not find key'));
      return;
    }

    // If the next key is outside the current leaf, seek through blocks until
    // we get to it.
    var blockDataEnd = reader.view.byteLength - 4;
    if (reader.offset + size >= blockDataEnd) {
      var self = this;
      this._seekOverBlocks(reader, size, function (err, reader) {
        if (err) {
          callback(err);
          return;
        }

        self._scanForKey(reader, key, keysLeft, callback);
      });
      return;
    }

    this._scanForKey(reader, key, keysLeft, callback);
  },

  /**
   * Basically the same as _readLeafData, but without touching any more data
   * than necessary.
   *
   * See _readLeafData for an overview of how this works.
   */
  _seekOverBlocks: function (reader, totalBytes, callback) {
    var blockDataEnd = reader.view.byteLength - 4;
    var potentialBytes = blockDataEnd - reader.offset;
    var bytesToSeek = Math.min(potentialBytes, totalBytes);
    reader.seek(bytesToSeek, true);

    totalBytes -= bytesToSeek;
    if (totalBytes > 0) {
      var self = this;

      // The last 4 bytes reference the next block to read from.
      this.blockFile.getBlock(reader.readInt32(), function (err, block) {
        if (err) {
          callback(err);
          return;
        }

        self._seekOverBlocks(sbon.getReader(block.buffer), totalBytes, callback);
      });

      return;
    }

    callback(null, reader);
  }
};

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
