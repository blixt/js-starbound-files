var SbonReader = require('./sbonreader');

module.exports = BlockFile;

/**
 * Size of the initial metadata required to be able to read the rest of the
 * block file.
 */
var METADATA_SIZE = 32;

var fileReader = new FileReaderSync();

function BlockFile(file, headerSize, blockSize) {
  this.file = file;
  this.headerSize = headerSize;
  this.blockSize = blockSize;

  // TODO: Make sure to recalculate this when necessary.
  this.blockCount = Math.floor((file.size - this.headerSize) / this.blockSize);

  this.freeBlockIsDirty = false;
  this.freeBlock = null;

  this._userHeader = null;
}

BlockFile.open = function (file) {
  var buffer = fileReader.readAsArrayBuffer(file.slice(0, METADATA_SIZE));

  var reader = new SbonReader(buffer);

  var header = reader.readByteString(6);
  if (header != 'SBBF02' && header != 'SBBF03') {
    throw new Error('Unsupported block file format');
  }

  var headerSize = reader.readInt32(),
      blockSize = reader.readInt32();

  var blockFile = new BlockFile(file, headerSize, blockSize);

  blockFile.freeBlockIsDirty = reader.readBoolean();
  blockFile.freeBlock = reader.readInt32();

  return blockFile;
};

/**
 * Loads the data in a block and returns a wrapper for accessing it.
 */
BlockFile.prototype.getBlock = function (index) {
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
};

BlockFile.prototype.getUserHeader = function () {
  if (this._userHeader) return this._userHeader;

  var start = METADATA_SIZE, end = this.headerSize;
  var buffer = fileReader.readAsArrayBuffer(this.file.slice(start, end));
  this._userHeader = buffer;
  return buffer;
};
