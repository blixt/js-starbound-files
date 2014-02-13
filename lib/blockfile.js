var sbon = require('./sbon');

/**
 * Size of the initial metadata required to be able to read the rest of the
 * block file.
 */
var METADATA_SIZE = 32;

var fileReader = new FileReaderSync();

/**
 * Reads from the provided file entry and returns a block file API through a
 * callback once the file has been loaded.
 */
exports.open = function (file) {
  var buffer = fileReader.readAsArrayBuffer(file.slice(0, METADATA_SIZE));

  var reader = new sbon.Reader(buffer);

  if (reader.readByteString(6) != 'SBBF02') {
    throw new Error('Unsupported block file format');
  }

  var headerSize = reader.readInt32(),
      blockSize = reader.readInt32(),
      freeBlockIsDirty = reader.readBoolean(),
      freeBlock = reader.readInt32();

  var blockFile = Object.create(blockFileProto, {
    file: {value: file},
    headerSize: {value: headerSize},
    blockCount: {value: Math.floor((file.size - headerSize) / blockSize)},
    blockSize: {value: blockSize},
    freeBlock: {value: freeBlock, writable: true},
    freeBlockIsDirty: {value: freeBlockIsDirty, writable: true},
    _userHeader: {value: null, writable: true}
  });

  return blockFile;
};

// Functionality for block file objects.
var blockFileProto = {
  /**
   * Loads the data in a block and returns a wrapper for accessing it.
   */
  getBlock: function (index) {
    if (index < 0 || index >= this.blockCount) {
      throw new Error('Index out of bounds');
    }

    var start = this.headerSize + this.blockSize * index,
        end = start + this.blockSize;

    var buffer = fileReader.readAsArrayBuffer(this.file.slice(start, end));

    var typeData = new Uint8Array(buffer, 0, 2);
    var block = {
      type: String.fromCharCode(typeData[0], typeData[1]),
      buffer: buffer.slice(2)
    };

    return block;
  },

  getUserHeader: function () {
    if (this._userHeader) return this._userHeader;

    var start = METADATA_SIZE, end = this.headerSize;
    var buffer = fileReader.readAsArrayBuffer(this.file.slice(start, end));
    this._userHeader = buffer;
    return buffer;
  }
};
