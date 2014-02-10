var sbon = require('./sbon');
var utils = require('./utils');

/**
 * Size of the initial metadata required to be able to read the rest of the
 * block file.
 */
var METADATA_SIZE = 32;

/**
 * Reads from the provided file entry and returns a block file API through a
 * callback once the file has been loaded.
 */
exports.open = function (fileEntry, callback) {
  fileEntry.file(function (file) {
    utils.getBufferFromFile(file, 0, METADATA_SIZE, function (err, buffer) {
      if (err) {
        callback(err);
        return;
      }

      var reader = sbon.getReader(buffer);

      if (reader.readByteString(6) != 'SBBF02') {
        callback(new Error('Unsupported block file format'));
        return;
      }

      var headerSize = reader.readInt32(),
          blockSize = reader.readInt32(),
          freeBlockIsDirty = reader.readBoolean(),
          freeBlock = reader.readInt32();

      var blockFile = Object.create(blockFileProto, {
        file: {value: file},
        headerSize: {value: headerSize},
        blockSize: {value: blockSize},
        freeBlock: {value: freeBlock, writable: true},
        freeBlockIsDirty: {value: freeBlockIsDirty, writable: true},
        _userHeader: {value: null, writable: true}
      });

      callback(null, blockFile);
    });
  }, function (err) {
    callback(err);
  });
};

// Functionality for block file objects.
var blockFileProto = {
  /**
   * Loads the data in a block and returns a wrapper for accessing it.
   */
  getBlock: function (index, callback) {
    var start = this.headerSize + this.blockSize * index,
        length = this.blockSize;
    utils.getBufferFromFile(this.file, start, start + length, function (err, buffer) {
      var view = new Uint8Array(buffer, 0, 2);
      var block = {
        type: String.fromCharCode(view[0], view[1]),
        buffer: buffer.slice(2)
      };
      callback(null, block);
    });
  },

  getUserHeader: function (callback) {
    if (this._userHeader) {
      callback(null, this._userHeader);
      return;
    }

    var self = this;
    var start = METADATA_SIZE, end = this.headerSize;
    utils.getBufferFromFile(this.file, start, end, function (err, buffer) {
      self._userHeader = buffer;
      callback(null, buffer);
    });
  }
};
